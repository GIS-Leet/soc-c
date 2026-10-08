// 수업 자료 앱의 비공개 설치 파일 — KV 의 ota/<비밀 폴더>/<파일>. 폴더 이름을 아는 사람만 받는다(이름은 이 저장소에 없다).
// KV 값은 25MB 까지라 그보다 큰 설치 파일은 조각(<파일>.part0, .part1 …)으로 나눠 두고 이어 붙여 내보낸다. 올리는 쪽은 수업 자료 앱 저장소의 게시 도구
const PATH = /^\/ota\/([A-Za-z0-9_-]{20,64})\/([A-Za-z0-9._-]{1,80})$/;
const HEADERS = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow", "Accept-Ranges": "bytes" };

/** Range 머리말 → { start, end }(끝 포함). 없거나 여러 구간이면 null(전체를 보냄), 범위를 벗어나면 "unsatisfiable" */
export function byteRange(header, size) {
  const match = /^bytes=(\d*)-(\d*)$/.exec((header || "").trim());
  if (!match || (!match[1] && !match[2])) return null;
  let start, end;
  if (!match[1]) { const tail = Number(match[2]); if (!tail) return "unsatisfiable"; start = Math.max(0, size - tail); end = size - 1; }
  else { start = Number(match[1]); end = match[2] ? Math.min(Number(match[2]), size - 1) : size - 1; }
  return start >= size || start > end ? "unsatisfiable" : { start, end };
}

export async function serveOta(request, kv, pathname) {
  const match = PATH.exec(pathname);
  if (!match || !["GET", "HEAD"].includes(request.method)) return new Response("Not found", { status: 404, headers: HEADERS });
  const key = `ota/${match[1]}/${match[2]}`;
  const { value, metadata } = await kv.getWithMetadata(key, "arrayBuffer");
  if (value === null) return new Response("Not found", { status: 404, headers: HEADERS });
  const parts = metadata?.parts || 0, part = metadata?.part || 0, size = parts ? metadata.size : value.byteLength;
  const range = byteRange(request.headers.get("Range"), size);
  if (range === "unsatisfiable") return new Response(null, { status: 416, headers: { ...HEADERS, "Content-Range": `bytes */${size}` } });
  const { start, end } = range || { start: 0, end: size - 1 }, length = end - start + 1;
  const headers = { ...HEADERS, "Content-Type": metadata?.mime || "application/octet-stream", "Content-Length": String(length), ...(range ? { "Content-Range": `bytes ${start}-${end}/${size}` } : {}) };
  const status = range ? 206 : 200;
  if (request.method === "HEAD") return new Response(null, { status, headers });
  if (!parts) return new Response(value.slice(start, end + 1), { status, headers });
  // 조각을 하나씩 읽어 흘려보낸다 — 한 번에 메모리에 드는 것은 조각 하나
  const first = Math.floor(start / part), last = Math.floor(end / part);
  let index = first;
  const body = new ReadableStream({
    async pull(controller) {
      if (index > last) return controller.close();
      const bytes = await kv.get(`${key}.part${index}`, "arrayBuffer");
      if (!bytes) return controller.error(new Error("missing part"));
      const from = index === first ? start - first * part : 0, to = index === last ? end - last * part + 1 : bytes.byteLength;
      controller.enqueue(new Uint8Array(bytes, from, to - from));
      index++;
    },
  });
  // Workers 는 길이를 아는 흐름이어야 Content-Length 를 붙인다(설치기가 진행률 · 이어받기에 씀)
  if (typeof FixedLengthStream === "undefined") return new Response(body, { status, headers });
  const fixed = new FixedLengthStream(length);
  body.pipeTo(fixed.writable).catch(() => {});
  return new Response(fixed.readable, { status, headers });
}

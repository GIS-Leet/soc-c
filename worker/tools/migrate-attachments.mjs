// Firebase Storage 의 게시판 첨부(board-private/)를 Workers KV 에 넣을 묶음 파일로 내려받는다. 키는 Storage 경로 그대로.
// (images/ 의 예전 그림 30개는 2026-10-08 현재 어느 글에서도 쓰이지 않아 옮기지 않는다 — 글의 그림은 모두 board-private 로 옮겨져 있음)
// 쓰기: node worker/tools/migrate-attachments.mjs <서비스 계정 키.json> [--list] [--out <폴더>]
//   --list 는 내려받지 않고 개수 · 용량만 센다. 만들어진 묶음은 wrangler kv bulk put <파일> --binding FILES --remote 로 올린다(README)
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { createCredential } from "../src/google.mjs";

const BUCKET = "soc-c-qna.firebasestorage.app";
const PREFIXES = ["board-private/"];
const VALUE_LIMIT = 25 * 1024 * 1024, BUNDLE_LIMIT = 20 * 1024 * 1024;

const args = process.argv.slice(2), listOnly = args.includes("--list");
const out = args.includes("--out") ? args[args.indexOf("--out") + 1] : "kv-bundles";
const keyFile = args.find((a) => a.endsWith(".json"));
if (!keyFile) { console.error("서비스 계정 키 파일 경로가 필요합니다."); process.exit(1); }
const credential = createCredential(await readFile(keyFile, "utf8"), { scope: "https://www.googleapis.com/auth/devstorage.read_only" });
const authorized = async (url) => {
  const response = await fetch(url, { headers: { Authorization: `Bearer ${(await credential.getAccessToken()).access_token}` } });
  if (!response.ok) throw new Error(`${response.status} ${url.split("?")[0]}`);
  return response;
};
async function list(prefix) {
  const items = [];
  for (let page = ""; ;) {
    const body = await (await authorized(`https://storage.googleapis.com/storage/v1/b/${BUCKET}/o?prefix=${encodeURIComponent(prefix)}&fields=nextPageToken,items(name,size,contentType)${page && `&pageToken=${page}`}`)).json();
    items.push(...(body.items || []));
    if (!(page = body.nextPageToken || "")) return items;
  }
}

let bundle = [], bundleBytes = 0, bundles = 0;
async function flush() {
  if (!bundle.length) return;
  await mkdir(out, { recursive: true });
  await writeFile(join(out, `bundle-${String(++bundles).padStart(2, "0")}.json`), JSON.stringify(bundle));
  bundle = []; bundleBytes = 0;
}
for (const prefix of PREFIXES) {
  const items = (await list(prefix)).filter((item) => !item.name.endsWith("/"));
  const total = items.reduce((sum, item) => sum + Number(item.size), 0);
  console.log(`${prefix} ${items.length}개 · ${(total / 1048576).toFixed(1)}MB`);
  if (listOnly) continue;
  for (const item of items) {
    if (Number(item.size) > VALUE_LIMIT) { console.log(`  건너뜀(25MB 초과) ${item.name}`); continue; }
    const bytes = Buffer.from(await (await authorized(`https://storage.googleapis.com/storage/v1/b/${BUCKET}/o/${encodeURIComponent(item.name)}?alt=media`)).arrayBuffer());
    if (bundleBytes + bytes.length > BUNDLE_LIMIT) await flush();
    bundle.push({ key: item.name, value: bytes.toString("base64"), base64: true, metadata: { mime: item.contentType || "application/octet-stream" } });
    bundleBytes += bytes.length;
  }
}
await flush();
if (!listOnly) console.log(`묶음 ${bundles}개 → ${out}/`);

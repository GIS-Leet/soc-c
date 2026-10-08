// APNs 전송을 fetch 로 — functions/desk-push.mjs 의 createApnsSender 에 request · sign 을 바꿔 끼운다(원래는 node:http2 · node:crypto)
import { Buffer } from "node:buffer";
import { createApnsSender } from "../../functions/desk-push.mjs";
import { pemBytes } from "./google.mjs";

export async function requestApns({ origin, path, headers, payload, timeoutMs = 25000, fetcher = fetch }) {
  const response = await fetcher(origin + path, { method: "POST", headers, body: JSON.stringify(payload), signal: AbortSignal.timeout(timeoutMs) });
  let reason = "";   // 성공(200)은 본문이 없다 — 실패일 때만 사유를 읽는다
  if (!response.ok) try { const text = await response.text(); reason = text ? JSON.parse(text).reason || "" : ""; } catch { reason = "InvalidResponse"; }
  else await response.body?.cancel().catch(() => {});
  return { status: response.status, reason };
}

/** createApnsSender 는 서명을 동기로 부르는데 WebCrypto 는 비동기 — 공급자 토큰(ES256)의 서명을 미리 만들어 끼운다.
 *  머리 · 주장은 createApnsSender 가 만드는 것과 글자까지 같아야 하므로 같은 순서 · 같은 시각으로 만든다 */
export async function createWorkerApnsSender(credentialJSON, { now = Date.now, request = requestApns } = {}) {
  const config = JSON.parse(credentialJSON), issuedAt = now();
  const part = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const input = `${part({ alg: "ES256", kid: config.keyId })}.${part({ iss: config.teamId, iat: Math.floor(issuedAt / 1000) })}`;
  const key = await crypto.subtle.importKey("pkcs8", pemBytes(config.key), { name: "ECDSA", namedCurve: "P-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, key, new TextEncoder().encode(input)));
  return createApnsSender({ credential: credentialJSON, request, sign: () => signature, now: () => issuedAt });
}

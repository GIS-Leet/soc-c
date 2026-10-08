// 구글 쪽 인증 두 가지 — ① 서비스 계정으로 액세스 토큰(RTDB REST · 계정 조회용) ② 학생 · 교사의 Firebase ID 토큰 검증.
// firebase-admin 이 Workers 에서 돌지 않아 WebCrypto 로 같은 일을 한다. 비밀키는 env(secret)에서만 읽는다
const enc = new TextEncoder();
const b64u = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64uText = (text) => b64u(enc.encode(text));
const fromB64u = (text) => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
export const pemBytes = (pem) => Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "")), (c) => c.charCodeAt(0));

const SCOPES = "https://www.googleapis.com/auth/firebase.database https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/identitytoolkit";
let cachedToken = { value: "", until: 0 };
/** 서비스 계정 액세스 토큰 — 55분 동안 인스턴스 메모리에 둔다 */
export function createCredential(serviceAccountJSON, { now = Date.now, fetcher = fetch, scope = SCOPES } = {}) {
  return {
    async getAccessToken() {
      if (cachedToken.value && cachedToken.until > now()) return { access_token: cachedToken.value };
      const account = JSON.parse(serviceAccountJSON), seconds = Math.floor(now() / 1000);
      const input = b64uText(JSON.stringify({ alg: "RS256", typ: "JWT" })) + "." +
        b64uText(JSON.stringify({ iss: account.client_email, scope, aud: "https://oauth2.googleapis.com/token", iat: seconds, exp: seconds + 3600 }));
      const key = await crypto.subtle.importKey("pkcs8", pemBytes(account.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
      const signature = b64u(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(input)));
      const response = await fetcher("https://oauth2.googleapis.com/token", {
        method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" },
        body: `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${input}.${signature}`,
        signal: AbortSignal.timeout(10000),
      });
      const body = await response.json();
      if (!response.ok || !body.access_token) throw new Error("Service account token unavailable");
      cachedToken = { value: body.access_token, until: now() + 55 * 60000 };
      return { access_token: body.access_token };
    },
  };
}

let cachedKeys = { keys: {}, until: 0 };
async function signingKey(kid, { now, fetcher }) {
  if (!cachedKeys.keys[kid] || cachedKeys.until <= now()) {
    const response = await fetcher("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com", { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error("Signing keys unavailable");
    const maxAge = Number(/max-age=(\d+)/.exec(response.headers.get("cache-control") || "")?.[1] || 3600);
    const keys = {};
    for (const jwk of (await response.json()).keys || [])
      keys[jwk.kid] = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    cachedKeys = { keys, until: now() + maxAge * 1000 };
  }
  return cachedKeys.keys[kid];
}
/** Firebase ID 토큰 검증(firebase-admin verifyIdToken(token, true) 와 같은 검사 — 서명 · 대상 · 만료 · 폐기 · 정지). 실패하면 던진다 */
export async function verifyIdToken(token, { projectId, credential, now = Date.now, fetcher = fetch }) {
  const parts = String(token).split(".");
  if (parts.length !== 3) throw new Error("malformed");
  const header = JSON.parse(new TextDecoder().decode(fromB64u(parts[0]))), claims = JSON.parse(new TextDecoder().decode(fromB64u(parts[1])));
  const seconds = Math.floor(now() / 1000);
  if (header.alg !== "RS256" || !header.kid) throw new Error("algorithm");
  if (claims.aud !== projectId || claims.iss !== `https://securetoken.google.com/${projectId}`) throw new Error("audience");
  if (typeof claims.sub !== "string" || !claims.sub || claims.sub.length > 128) throw new Error("subject");
  if (!(claims.exp > seconds) || !(claims.iat <= seconds + 300) || !(claims.auth_time <= seconds + 300)) throw new Error("expired");
  const key = await signingKey(header.kid, { now, fetcher });
  if (!key || !(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, fromB64u(parts[2]), enc.encode(parts[0] + "." + parts[1])))) throw new Error("signature");
  // 폐기 · 정지 확인 — 계정의 validSince 뒤에 로그인한 토큰만
  const access = (await credential.getAccessToken()).access_token;
  const lookup = await fetcher(`https://identitytoolkit.googleapis.com/v1/projects/${projectId}/accounts:lookup`, {
    method: "POST", headers: { Authorization: `Bearer ${access}`, "content-type": "application/json" },
    body: JSON.stringify({ localId: [claims.sub] }), signal: AbortSignal.timeout(10000),
  });
  if (!lookup.ok) throw new Error("lookup");
  const user = (await lookup.json()).users?.[0];
  if (!user || user.disabled) throw new Error("disabled");
  if (user.validSince && claims.auth_time < Number(user.validSince)) throw new Error("revoked");
  return { ...claims, uid: claims.sub };
}

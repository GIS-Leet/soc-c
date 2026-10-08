// node:http2 자리 — Workers 에서는 쓰지 않는다(APNs 는 src/apns.mjs 가 fetch 로 보냄)
export function connect() { throw new Error("node:http2 is unavailable on Workers"); }

// 글에 저장된 첨부 주소(imageUrl)의 호스트를 함수에서 Worker 로 바꾼다 — desk.html · Desk 앱은 저장된 주소를 그대로 읽기 때문.
// (게시판 API 의 응답은 attachmentId 로 주소를 새로 만들므로 이 작업과 무관하다.) 함수를 지우기 전에 한 번만 한다.
// 쓰기: node worker/tools/rewrite-stored-urls.mjs <서비스 계정 키.json> <Worker 주소(https://…workers.dev)> [--apply]   — --apply 가 없으면 세기만 한다
import { readFile } from "node:fs/promises";
import { createCredential } from "../src/google.mjs";

const DATABASE = "https://soc-c-qna-default-rtdb.firebaseio.com";
const OLD = "https://us-central1-soc-c-qna.cloudfunctions.net/boardAttachment?";
const [keyFile, target] = process.argv.slice(2).filter((a) => !a.startsWith("--")), apply = process.argv.includes("--apply");
if (!keyFile || !/^https:\/\/[a-z0-9.-]+$/.test(target || "")) { console.error("키 파일과 Worker 주소(https://… , 끝에 / 없이)가 필요합니다."); process.exit(1); }
const credential = createCredential(await readFile(keyFile, "utf8"));
const call = async (method, path, body) => {
  const response = await fetch(`${DATABASE}/${path}.json`, { method, headers: { Authorization: `Bearer ${(await credential.getAccessToken()).access_token}`, "Content-Type": "application/json" }, ...(body ? { body: JSON.stringify(body) } : {}) });
  if (!response.ok) throw new Error(`${method} ${path} ${response.status}`);
  return response.json();
};
const changes = {};
const walk = (node, path) => {
  if (!node || typeof node !== "object") return;
  if (typeof node.imageUrl === "string" && node.imageUrl.startsWith(OLD)) changes[`${path}/imageUrl`] = `${target}/boardAttachment?${node.imageUrl.slice(OLD.length)}`;
  for (const child of ["replies", "subReplies"]) for (const [key, value] of Object.entries(node[child] || {})) walk(value, `${path}/${child}/${key}`);
};
for (const board of ["questions", "feedback", "support"]) {
  for (const [id, post] of Object.entries((await call("GET", board)) || {})) walk(post, `${board}/${id}`);
}
console.log(`바꿀 주소 ${Object.keys(changes).length}개`);
if (apply && Object.keys(changes).length) { await call("PATCH", "", changes); console.log("바꿈"); }

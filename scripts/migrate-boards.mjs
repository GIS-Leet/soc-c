// 기본은 읽기 전용 집계이며 명시한 경우에만 암호·첨부를 서버 전용 저장소로 이관한다.
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";
import {
  BOARDS,
  hashPassword,
  digest,
  imageBytes,
  key,
  BoardError,
} from "../functions/board-security.mjs";
import { requireMigrationRules } from "./migration-rules.mjs";
import { migrationRestStore } from "./migration-rest-store.mjs";
import { createFirebaseStore } from "../functions/firebase-store.mjs";
const require = createRequire(
  new URL("../functions/package.json", import.meta.url),
);
const BUCKET = "soc-c-qna.firebasestorage.app";
function imageNodes(post) {
  const nodes = [["", post]];
  for (const [rid, r] of Object.entries(post.replies || {})) {
    key(rid);
    nodes.push([`replies/${rid}`, r]);
    for (const [sid, s] of Object.entries(r.subReplies || {})) {
      key(sid);
      nodes.push([`replies/${rid}/subReplies/${sid}`, s]);
    }
  }
  return nodes;
}
function sourcePath(value) {
  try {
    const u = new URL(value);
    if (
      u.protocol !== "https:" ||
      u.hostname !== "firebasestorage.googleapis.com" ||
      !u.pathname.startsWith(`/v0/b/${BUCKET}/o/`)
    )
      return null;
    return decodeURIComponent(u.pathname.slice(`/v0/b/${BUCKET}/o/`.length));
  } catch {
    return null;
  }
}
export async function migrateRecord({
  board,
  id,
  post,
  apply = false,
  migrateAttachments = false,
  store,
  bucket,
  now = Date.now,
  attachmentBase = "https://us-central1-soc-c-qna.cloudfunctions.net/boardAttachment",
}) {
  if (!BOARDS.has(board)) throw new BoardError("invalid-argument");
  key(id);
  const counts = {
    records: 1,
    passwords: 0,
    missingPassword: 0,
    attachments: 0,
    migratedAttachments: 0,
    unsupportedAttachments: 0,
  };
  const credentialPath = `boardCredentials/${board}/${id}`,
    old = await store.get(credentialPath);
  if (typeof post.password === "string" && post.password.length) {
    counts.passwords++;
    if (apply) {
      const credential = old || {
        ...(await hashPassword(post.password)),
        createdAt: now(),
      };
      await store.update({
        [credentialPath]: credential,
        [`${board}/${id}/password`]: null,
      });
    }
  } else if (!old && !post._board?.ownerUid) counts.missingPassword++;
  for (const [path, node] of imageNodes(post)) {
    if (node.attachmentId) {
      if (apply && migrateAttachments) {
        const meta = await store.get(`boardAttachments/${node.attachmentId}`);
        if (meta?.legacyPath && !meta.legacyTokenRevoked) {
          await store.update({
            [`boardAttachments/${node.attachmentId}/state`]: "claimed",
          });
          await bucket
            .file(meta.legacyPath)
            .setMetadata({ metadata: { firebaseStorageDownloadTokens: null } });
          await store.update({
            [`boardAttachments/${node.attachmentId}/legacyTokenRevoked`]: true,
          });
        }
      }
      continue;
    }
    if (!node.imageUrl) continue;
    counts.attachments++;
    const legacyPath = sourcePath(node.imageUrl);
    if (!legacyPath) {
      counts.unsupportedAttachments++;
      continue;
    }
    if (!apply || !migrateAttachments) continue;
    const oldFile = bucket.file(legacyPath),
      [metadata] = await oldFile.getMetadata();
    if (Number(metadata.size) > 5 * 1024 * 1024)
      throw new BoardError("failed-precondition", "Legacy image exceeds limit");
    const [bytes] = await oldFile.download();
    imageBytes(bytes.toString("base64"), metadata.contentType);
    const attachmentId =
        "legacy_" + digest(`${board}/${id}/${path}`).slice(0, 40),
      storagePath = `board-private/${board}/legacy/${attachmentId}`;
    const metadataPath = `boardAttachments/${attachmentId}`;
    await store.update({
      [metadataPath]: {
        board,
        postId: id,
        uid: "legacy",
        state: "uploading",
        storagePath,
        mime: metadata.contentType,
        size: bytes.length,
        createdAt: now(),
        legacyPath,
        legacyTokenRevoked: false,
      },
    });
    await bucket
      .file(storagePath)
      .save(bytes, {
        resumable: false,
        metadata: {
          contentType: metadata.contentType,
          cacheControl: "private, no-store",
        },
      });
    const imageUrl = `${attachmentBase}?board=${board}&id=${id}&attachmentId=${attachmentId}`;
    await store.transaction(`${board}/${id}`, (current) => {
      if (!current)
        throw new BoardError("not-found", "Post deleted during migration");
      const next = structuredClone(current);
      let target = next;
      for (const segment of path.split("/").filter(Boolean))
        target = target?.[segment];
      if (!target || target.imageUrl !== node.imageUrl)
        throw new BoardError("aborted", "Attachment changed during migration");
      target.attachmentId = attachmentId;
      target.imageUrl = imageUrl;
      return next;
    });
    await store.update({ [`${metadataPath}/state`]: "claimed" });
    await oldFile.setMetadata({
      metadata: { firebaseStorageDownloadTokens: null },
    });
    await store.update({
      [`boardAttachments/${attachmentId}/legacyTokenRevoked`]: true,
    });
    counts.migratedAttachments++;
  }
  return counts;
}
async function cliCredential() {
  const config = JSON.parse(
    await readFile(
      `${homedir()}/.config/configstore/firebase-tools.json`,
      "utf8",
    ),
  );
  let cached = {
    access_token: config.tokens?.access_token,
    expires_at: config.tokens?.expires_at,
  };
  const toolsDir=process.env.FIREBASE_TOOLS_DIR || "/tmp/nyuheatgis-firebase-readiness-tools/node_modules/firebase-tools";
  const api=require(toolsDir+"/lib/api.js");
  const {OAuth2Client}=require("google-auth-library"),{Storage}=require("@google-cloud/storage");
  const authClient=new OAuth2Client(api.clientId(),api.clientSecret());
  authClient.setCredentials({refresh_token:config.tokens.refresh_token,access_token:cached.access_token,expiry_date:cached.expires_at});
  return {
    storageBucket: new Storage({projectId:"soc-c-qna",authClient}).bucket(BUCKET),
    async getAccessToken() {
      if (cached.access_token && cached.expires_at > Date.now() + 60000)
        return {
          access_token: cached.access_token,
          expires_in: Math.floor((cached.expires_at - Date.now()) / 1000),
        };
      const toolsDir =
        process.env.FIREBASE_TOOLS_DIR ||
        "/tmp/nyuheatgis-firebase-readiness-tools/node_modules/firebase-tools";
      const api = require(toolsDir + "/lib/api.js");
      const response = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        body: new URLSearchParams({
          grant_type: "refresh_token",
          refresh_token: config.tokens.refresh_token,
          client_id: api.clientId(),
          client_secret: api.clientSecret(),
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        throw new BoardError(
          "unauthenticated",
          "Firebase CLI credential renewal failed",
        );
      const token = await response.json();
      cached = {
        access_token: token.access_token,
        expires_at: Date.now() + token.expires_in * 1000,
      };
      return { access_token: token.access_token, expires_in: token.expires_in };
    },
  };
}
async function main() {
  const args = new Set(process.argv.slice(2));
  if (
    [...args].some(
      (a) =>
        ![
          "--apply",
          "--migrate-attachments",
          "--use-firebase-cli",
          "--help",
        ].includes(a),
    )
  )
    throw new BoardError("invalid-argument", "Unknown option");
  if (args.has("--help")) {
    console.log(
      "Usage: node scripts/migrate-boards.mjs [--apply] [--migrate-attachments] [--use-firebase-cli]\nDefault: dry-run counts only. Apply after legacy writes are closed. Migrate attachments only after native authenticated image loader is deployed. No record bodies or secrets are logged.",
    );
    return;
  }
  if (args.has("--migrate-attachments") && !args.has("--apply"))
    throw new BoardError(
      "invalid-argument",
      "Attachment migration requires --apply",
    );
  const {
      initializeApp,
      applicationDefault,
      deleteApp,
    } = require("firebase-admin/app"),
    { getDatabase } = require("firebase-admin/database"),
    { getStorage } = require("firebase-admin/storage");
  const credential = args.has("--use-firebase-cli")
      ? await cliCredential()
      : applicationDefault(),
    databaseURL = "https://soc-c-qna-default-rtdb.firebaseio.com";
  const app = initializeApp(
    { credential, projectId: "soc-c-qna", databaseURL, storageBucket: BUCKET },
    "board-migration",
  );
  try {
    if (args.has("--apply")) {
      const response = await fetch(databaseURL + "/.settings/rules.json", {
        headers: {Authorization: "Bearer " + (await credential.getAccessToken()).access_token},
        signal: AbortSignal.timeout(30000),
      });
      if (!response.ok) throw new BoardError("failed-precondition", "Unable to verify closed legacy writes");
      requireMigrationRules(await response.json());
    }
    const store = args.has("--use-firebase-cli") ? migrationRestStore({credential,databaseURL}) : createFirebaseStore({
        database: getDatabase(app),
        credential,
        databaseURL,
      }),
      bucket = credential.storageBucket || getStorage(app).bucket();
    const totals = {
      records: 0,
      passwords: 0,
      missingPassword: 0,
      attachments: 0,
      migratedAttachments: 0,
      unsupportedAttachments: 0,
      failures: 0,
    };
    for (const board of BOARDS) {
      let after = "";
      while (true) {
        const page = await store.page(board, { after, limit: 50 });
        if (!page.length) break;
        for (const [id, post] of page) {
          try {
            const result = await migrateRecord({
              board,
              id,
              post,
              apply: args.has("--apply"),
              migrateAttachments: args.has("--migrate-attachments"),
              store,
              bucket,
            });
            for (const [k, v] of Object.entries(result)) totals[k] += v;
          } catch {
            totals.failures++;
          }
        }
        after = page.at(-1)[0];
      }
    }
    console.log(
      JSON.stringify({
        mode: args.has("--apply") ? "apply" : "dry-run",
        ...totals,
      }),
    );
    if (totals.failures) process.exitCode = 1;
  } finally {
    await deleteApp(app);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(
      JSON.stringify({
        error: error instanceof BoardError ? error.code : "migration-failed",
        category: String(error?.code || error?.name || "unknown").replace(/[^a-zA-Z0-9_/-]/g, "").slice(0,80),
        message: "Migration stopped; no private record or credential output.",
      }),
    );
    process.exitCode = 1;
  });

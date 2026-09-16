// 학생 게시판 API와 인증된 첨부 읽기·명시적 유지보수 진입점을 제공한다.
import { initializeApp, applicationDefault } from "firebase-admin/app";
import { getDatabase } from "firebase-admin/database";
import { getStorage } from "firebase-admin/storage";
import { getAuth } from "firebase-admin/auth";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { onValueCreated } from "firebase-functions/v2/database";
import { defineSecret } from "firebase-functions/params";
import { scheduledMaintenance } from "./board-schedule.mjs";
import { onCall, onRequest, HttpsError } from "firebase-functions/v2/https";
import { createFirebaseStore, createBucketStorage } from "./firebase-store.mjs";
import { createBoardService } from "./board-service.mjs";
import { createMaintenance } from "./board-maintenance.mjs";
import { BoardError, isTeacher, fields } from "./board-security.mjs";
import {
  createApnsSender,
  createDatabaseEventHandler,
  createDeskPushService,
} from "./desk-push.mjs";
const projectId = process.env.GCLOUD_PROJECT || "soc-c-qna";
const databaseURL =
  process.env.BOARD_DATABASE_URL ||
  `https://${projectId}-default-rtdb.firebaseio.com`;
const credential = applicationDefault();
const app = initializeApp({
  credential,
  projectId,
  databaseURL,
  storageBucket: "soc-c-qna.firebasestorage.app",
});
const store = createFirebaseStore({
  database: getDatabase(app),
  credential,
  databaseURL,
});
const storage = createBucketStorage(getStorage(app).bucket());
const attachmentBase =
  process.env.FUNCTIONS_EMULATOR === "true"
    ? `http://127.0.0.1:5001/${projectId}/us-central1/boardAttachment`
    : `https://us-central1-${projectId}.cloudfunctions.net/boardAttachment`;
const service = createBoardService({ store, storage, attachmentBase });
const maintenance = createMaintenance({
  store,
  storage,
  containsAttachment: service.containsAttachment,
});
const deskApnsCredential = defineSecret("DESK_APNS_CREDENTIAL");
function deskPushService() {
  return createDeskPushService({
    store,
    send: createApnsSender({ credential: deskApnsCredential.value() }),
  });
}
const deskPushOptions = {
  ref: "/questions/{qid}",
  instance: "soc-c-qna-default-rtdb",
  region: "us-central1",
  maxInstances: 5,
  timeoutSeconds: 120,
  retry: true,
  secrets: [deskApnsCredential],
};
const options = {
  region: "us-central1",
  maxInstances: 5,
  timeoutSeconds: 120,
  memory: "512MiB",
  cors: true,
};
function callableError(error) {
  if (error instanceof BoardError)
    return new HttpsError(error.code, error.message);
  return new HttpsError(
    "internal",
    "Server operation failed. Retry with the same requestId.",
  );
}
export const boardApi = onCall(options, async (request) => {
  try {
    return await service.call(request.data, request.auth, {
      ip: request.rawRequest.ip,
    });
  } catch (error) {
    throw callableError(error);
  }
});
export const boardAttachment = onRequest(
  { ...options, timeoutSeconds: 60 },
  async (req, res) => {
    res.set("Cache-Control", "private, no-store");
    res.set("X-Content-Type-Options", "nosniff");
    if (req.method !== "GET") {
      res.status(405).end();
      return;
    }
    try {
      let auth = null;
      const bearer = req.get("Authorization");
      if (bearer) {
        if (!bearer.startsWith("Bearer "))
          throw new BoardError("unauthenticated");
        try {
          const token = await getAuth(app).verifyIdToken(bearer.slice(7), true);
          auth = { uid: token.uid, token };
        } catch {
          throw new BoardError("unauthenticated");
        }
      }
      const result = await service.attachment(
        {
          board: req.query.board,
          id: req.query.id,
          attachmentId: req.query.attachmentId,
        },
        auth,
      );
      res.type(result.mime).send(result.bytes);
    } catch (error) {
      const code = error?.code;
      res
        .status(
          code === "not-found"
            ? 404
            : code === "unauthenticated"
              ? 401
              : code === "permission-denied"
                ? 403
                : code === "invalid-argument"
                  ? 400
                  : 500,
        )
        .json({
          error:
            code instanceof String
              ? String(code)
              : typeof code === "string"
                ? code
                : "internal",
        });
    }
  },
);
async function notificationSender() {
  if (process.env.BOARD_NOTIFICATIONS_ENABLED !== "true") return null;
  const token = (await credential.getAccessToken()).access_token;
  const response = await fetch(
    `https://secretmanager.googleapis.com/v1/projects/${projectId}/secrets/board-notification-webhook/versions/latest:access`,
    {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(10000),
    },
  );
  if (!response.ok)
    throw new BoardError(
      "failed-precondition",
      "Notification secret unavailable",
    );
  const secret = await response.json(),
    webhook = Buffer.from(secret.payload?.data || "", "base64")
      .toString("utf8")
      .trim();
  let parsed;
  try {
    parsed = new URL(webhook);
  } catch {
    throw new BoardError("failed-precondition", "Invalid notification secret");
  }
  if (
    parsed.origin !== "https://discord.com" ||
    !/^\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+$/.test(parsed.pathname) ||
    parsed.search
  )
    throw new BoardError("failed-precondition", "Invalid notification secret");
  return async (payload) => {
    const sent = await fetch(webhook, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(10000),
    });
    if (!sent.ok)
      throw new BoardError("unavailable", "Notification delivery failed");
  };
}
export const boardMaintenance = onCall(
  { ...options, timeoutSeconds: 300 },
  async (request) => {
    try {
      if (!isTeacher(request.auth)) throw new BoardError("permission-denied");
      fields(request.data || {}, ["limit", "cursors"]);
      const send = await notificationSender();
      return await maintenance.run({
        ...request.data,
        notificationsEnabled: !!send,
        send,
      });
    } catch (error) {
      throw callableError(error);
    }
  },
);

// 매 10분마다 유한한 페이지를 처리하고 다음 실행에서 진행점을 이어감.
export const boardScheduledMaintenance = onSchedule(
  {region:'us-central1',schedule:'every 10 minutes',timeZone:'Asia/Seoul',timeoutSeconds:300,memory:'512MiB',maxInstances:1,retryCount:2},
  async()=>scheduledMaintenance({store,run:maintenance.run,send:await notificationSender()}),
);

// 새 질문은 Mac의 전원 상태와 무관하게 RTDB 생성 이벤트에서 즉시 APNs로 보낸다.
export const deskQuestionPush = onValueCreated(deskPushOptions, (event) =>
  createDatabaseEventHandler({
    kind: "question",
    service: deskPushService(),
  })(event),
);

export const deskStudentFollowupPush = onValueCreated(
  {
    ...deskPushOptions,
    ref: "/questions/{qid}/replies/{rid}/subReplies/{sid}",
  },
  (event) =>
    createDatabaseEventHandler({
      kind: "subreply",
      service: deskPushService(),
    })(event),
);

// APNs의 일시 오류는 1분마다 같은 기기별 사건을 다시 점유해 전송한다.
export const deskPushRetry = onSchedule(
  {
    region: "us-central1",
    schedule: "every 1 minutes",
    timeZone: "Asia/Seoul",
    timeoutSeconds: 120,
    memory: "256MiB",
    maxInstances: 1,
    retryCount: 2,
    secrets: [deskApnsCredential],
  },
  async () => deskPushService().retryPending(),
);

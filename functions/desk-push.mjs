// Desk 질문 알림을 기기별로 원자 점유해 즉시 전송하고 실패는 재시도 상태로 남긴다.
import { createHash, randomUUID, sign as cryptoSign } from "node:crypto";
import { connect as http2Connect } from "node:http2";

const PERMANENT = new Set(["410:Unregistered", "400:BadDeviceToken"]);
const emptyCounts = () => ({ accepted: 0, retry: 0, invalid: 0 });

function base64url(value) {
  return Buffer.from(value).toString("base64url");
}

function parseCredential(raw) {
  let value;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error("Invalid APNs credential");
  }
  if (
    typeof value.key !== "string" ||
    !value.key.includes("BEGIN PRIVATE KEY") ||
    !/^[A-Z0-9]{10}$/.test(value.keyId || "") ||
    !/^[A-Z0-9]{10}$/.test(value.teamId || "") ||
    !/^[A-Za-z0-9.-]+$/.test(value.topic || "")
  )
    throw new Error("Invalid APNs credential");
  return value;
}

export function requestApns({
  origin,
  path,
  headers,
  payload,
  timeoutMs = 25_000,
}) {
  return new Promise((resolve, reject) => {
    const client = http2Connect(origin);
    let settled = false;
    const stop = (callback, value) => {
      if (settled) return;
      settled = true;
      client.close();
      callback(value);
    };
    client.once("error", (error) => stop(reject, error));
    const stream = client.request({
      ":method": "POST",
      ":path": path,
      ...headers,
    });
    let status = 0,
      response = "";
    stream.setEncoding("utf8");
    stream.on("response", (incoming) => {
      status = Number(incoming[":status"]) || 0;
    });
    stream.on("data", (chunk) => {
      response += chunk;
    });
    stream.setTimeout(timeoutMs, () => {
      stream.close();
      stop(reject, new Error("APNs request timed out"));
    });
    stream.once("error", (error) => stop(reject, error));
    stream.on("end", () => {
      let reason = "";
      try {
        reason = response ? JSON.parse(response).reason || "" : "";
      } catch {
        reason = "InvalidResponse";
      }
      stop(resolve, { status, reason });
    });
    stream.end(JSON.stringify(payload));
  });
}

export function createApnsSender({
  credential,
  request = requestApns,
  sign = (data, key) =>
    cryptoSign("sha256", data, { key, dsaEncoding: "ieee-p1363" }),
  now = Date.now,
}) {
  const config = parseCredential(credential);
  return async (token, event, delivery) => {
    if (!/^[A-Fa-f0-9]+$/.test(token))
      return { status: 400, reason: "BadDeviceToken" };
    const header = base64url(
        JSON.stringify({ alg: "ES256", kid: config.keyId }),
      ),
      claims = base64url(
        JSON.stringify({ iss: config.teamId, iat: Math.floor(now() / 1000) }),
      ),
      input = `${header}.${claims}`,
      signature = Buffer.from(sign(Buffer.from(input), config.key)).toString(
        "base64url",
      ),
      tokenValue = `${input}.${signature}`;
    return request({
      origin:
        delivery?.env === "production"
          ? "https://api.push.apple.com"
          : "https://api.sandbox.push.apple.com",
      path: `/3/device/${token}`,
      headers: {
        authorization: `bearer ${tokenValue}`,
        "apns-topic": config.topic,
        "apns-push-type": "alert",
        "apns-priority": "10",
        "content-type": "application/json",
      },
      payload: {
        aps: {
          alert: { title: event.title, body: event.body },
          sound: "default",
          badge: event.badge || 1,
          "thread-id": "qna",
        },
        qa: true,
      },
    });
  };
}

export function eventId(...parts) {
  return createHash("sha256").update(parts.join("/")).digest("hex");
}

function deviceRecords(tokens) {
  return Object.fromEntries(
    Object.entries(tokens || {})
      .filter(([, value]) => value && typeof value === "object")
      .map(([token, value]) => [
        token,
        {
          state: "pending",
          registeredAt: value.at,
          env: value.env === "production" ? "production" : "development",
        },
      ]),
  );
}

export function createPushEvent({ kind, params, value, tokens, now }) {
  if (kind === "subreply" && value?.isTeacher) return null;
  if (!params?.qid || (kind === "subreply" && (!params.rid || !params.sid)))
    return null;
  const question = kind === "question";
  return {
    title: question ? "새 학생 질문" : "학생의 추가 질문",
    body: question
      ? "Desk에서 질문을 확인하세요."
      : "Desk에서 이어진 질문을 확인하세요.",
    badge: 1,
    createdAt: now,
    devices: deviceRecords(tokens),
  };
}

function claim(value, owner, nowSeconds) {
  if (!value || ["accepted", "invalid"].includes(value.state)) return value;
  if ((value.leaseUntil || 0) > nowSeconds || (value.retryAt || 0) > nowSeconds)
    return value;
  return {
    ...value,
    state: "sending",
    owner,
    leaseUntil: nowSeconds + 120,
    attempts: (value.attempts || 0) + 1,
  };
}

function finish(value, owner, status, reason, nowSeconds) {
  if (!value || value.owner !== owner) return value;
  const state =
    status === 200
      ? "accepted"
      : PERMANENT.has(`${status}:${reason}`)
        ? "invalid"
        : "retry";
  const delay = Math.min(3600, 30 * 2 ** Math.min(value.attempts || 1, 7));
  return {
    ...value,
    state,
    status,
    reason: String(reason || "").slice(0, 80),
    leaseUntil: 0,
    retryAt: state === "retry" ? nowSeconds + delay : 0,
    updatedAt: nowSeconds,
  };
}

export function createDeskPushService({
  store,
  send,
  now = Date.now,
  owner = randomUUID,
}) {
  async function deliver(id, event) {
    const counts = emptyCounts();
    const worker = owner();
    for (const [token, delivery] of Object.entries(event?.devices || {})) {
      const path = `desk/push/events/${id}/devices/${token}`;
      const seconds = Math.floor(now() / 1000);
      const acquired = await store.transaction(path, (current) =>
        claim(current, worker, seconds),
      );
      const item = acquired.value;
      if (!item || item.owner !== worker || item.state !== "sending") continue;
      let result;
      try {
        result = await send(token, event, item);
      } catch {
        result = { status: 0, reason: "TransportError" };
      }
      const completed = await store.transaction(path, (current) =>
        finish(
          current,
          worker,
          Number(result?.status) || 0,
          result?.reason || "InvalidResponse",
          Math.floor(now() / 1000),
        ),
      );
      if (completed.value?.owner !== worker) continue;
      const state = completed.value.state;
      if (!(state in counts)) continue;
      counts[state]++;
      if (state === "invalid") {
        await store.transaction(`desk/push/tokens/${token}`, (current) =>
          current && current.at === delivery.registeredAt ? null : current,
        );
      }
    }
    return counts;
  }

  async function created({ kind, params, value }) {
    const tokens = (await store.get("desk/push/tokens")) || {};
    const event = createPushEvent({
      kind,
      params,
      value,
      tokens,
      now: now(),
    });
    if (!event) return emptyCounts();
    const id =
      kind === "question"
        ? eventId("question", params.qid)
        : eventId("reply", params.qid, params.rid, params.sid);
    const stored = await store.transaction(
      `desk/push/events/${id}`,
      (current) => current || event,
    );
    return deliver(id, stored.value);
  }

  async function retryPending() {
    const events = (await store.get("desk/push/events")) || {};
    const totals = emptyCounts();
    for (const [id, event] of Object.entries(events)) {
      const counts = await deliver(id, event);
      for (const key of Object.keys(totals)) totals[key] += counts[key];
    }
    return totals;
  }

  return { created, retryPending };
}

export function createDatabaseEventHandler({ kind, service }) {
  return async (event) =>
    service.created({
      kind,
      params: event.params,
      value: event.data.val(),
    });
}

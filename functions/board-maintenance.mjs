// 유한한 페이지 단위로 고아 첨부와 만료 상태를 정리하고 알림을 재시도한다.
import { digest, fail, fields, key, pushKey } from "./board-security.mjs";
export function createMaintenance({
  store,
  storage,
  containsAttachment,
  now = Date.now,
}) {
  async function run({
    limit = 50,
    cursors = {},
    notificationsEnabled = false,
    send,
  } = {}) {
    if (!Number.isInteger(limit) || limit < 1 || limit > 100)
      fail("invalid-argument", "Invalid maintenance limit");
    fields(cursors, [
      "attachments",
      "outbox",
      "rate",
      "requests",
      "grants",
      "cleanup",
      "credentials-questions",
      "credentials-feedback",
      "credentials-support",
    ]);
    for (const c of Object.values(cursors)) if (c !== null) key(c, "cursor");
    const result = { removed: 0, sent: 0, failed: 0, cursors: {} };
    async function each(label, path, fn) {
      const rows = await store.page(path, {
        after: cursors[label] || "",
        limit: limit + 1,
      });
      for (const [k, v] of rows.slice(0, limit)) await fn(k, v);
      result.cursors[label] = rows.length > limit ? rows[limit - 1][0] : null;
    }
    await each("attachments", "boardAttachments", async (id, a) => {
      if (
        !a ||
        (Math.max(a.createdAt || 0, a.claimedAt || 0) + 86400000 > now() &&
          a.state !== "deleting")
      )
        return;
      const post = a.postId ? await store.get(`${a.board}/${a.postId}`) : null;
      if (post && containsAttachment(post, id)) return;
      const lease = pushKey(now());
      const tx = await store.transaction(
        `boardAttachments/${id}`,
        (current) => {
          if (
            !current ||
            current.leaseUntil > now() ||
            (current.state !== "deleting" &&
              Math.max(current.createdAt || 0, current.claimedAt || 0) +
                86400000 >
                now())
          )
            return undefined;
          return {
            ...current,
            state: "deleting",
            lease,
            leaseUntil: now() + 120000,
          };
        },
      );
      if (!tx.committed) return;
      try {
        const latest = a.postId
          ? await store.get(`${a.board}/${a.postId}`)
          : null;
        if (latest && containsAttachment(latest, id)) {
          await store.transaction(`boardAttachments/${id}`, (current) =>
            current?.lease === lease
              ? {
                  ...current,
                  state: "claimed",
                  leaseUntil: 0,
                  claimedAt: now(),
                }
              : undefined,
          );
          return;
        }
        await storage.delete(a.storagePath);
        await store.transaction(`boardAttachments/${id}`, (current) =>
          current?.lease === lease ? null : undefined,
        );
        result.removed++;
      } catch {
        result.failed++;
        await store.transaction(`boardAttachments/${id}`, (current) =>
          current?.lease === lease ? { ...current, leaseUntil: 0 } : undefined,
        );
      }
    });
    await each("outbox", "boardOutbox", async (id, event) => {
      if (event.state === "sent") {
        if (event.sentAt + 30 * 86400000 < now())
          await store.set(`boardOutbox/${id}`, null);
        return;
      }
      if (
        !notificationsEnabled ||
        typeof send !== "function" ||
        event.nextAttemptAt > now() ||
        event.leaseUntil > now()
      )
        return;
      const lease = pushKey(now());
      const tx = await store.transaction(`boardOutbox/${id}`, (current) => {
        if (
          !current ||
          current.state === "sent" ||
          current.leaseUntil > now() ||
          current.nextAttemptAt > now()
        )
          return undefined;
        return {
          ...current,
          state: "sending",
          lease,
          leaseUntil: now() + 120000,
        };
      });
      if (!tx.committed) return;
      const payload = {
        content: `새 게시판 알림 (${event.board})\nhttps://nyuheatgis.com/desk.html#qa=${encodeURIComponent(event.postId)}`,
        allowed_mentions: { parse: [] },
      };
      try {
        await send(payload);
        await store.transaction(`boardOutbox/${id}`, (current) =>
          current?.lease === lease
            ? { ...current, state: "sent", sentAt: now(), leaseUntil: 0 }
            : undefined,
        );
        result.sent++;
      } catch {
        result.failed++;
        await store.transaction(`boardOutbox/${id}`, (current) =>
          current?.lease === lease
            ? {
                ...current,
                state: "pending",
                attempts: (current.attempts || 0) + 1,
                leaseUntil: 0,
                nextAttemptAt:
                  now() +
                  Math.min(
                    3600000,
                    30000 * 2 ** Math.min(7, current.attempts || 0),
                  ),
              }
            : undefined,
        );
      }
    });
    for (const [label, path, field] of [
      ["rate", "boardRate", "until"],
      ["requests", "boardRequests", "expiresAt"],
      ["grants", "boardGrants", "expiresAt"],
    ])
      await each(label, path, async (id, v) => {
        if (v?.[field] && v[field] < now() && !(v.leaseUntil > now())) {
          await store.transaction(`${path}/${id}`, (current) =>
            current?.[field] < now() && !(current.leaseUntil > now())
              ? null
              : undefined,
          );
        }
      });
    await each("cleanup", "boardCleanup", async (id, v) => {
      if (v.createdAt + 30 * 86400000 < now())
        await store.set(`boardCleanup/${id}`, null);
    });
    for (const board of ["questions", "feedback", "support"])
      await each(
        `credentials-${board}`,
        `boardCredentials/${board}`,
        async (id, v) => {
          if (
            !(await store.get(`${board}/${id}`)) &&
            v.createdAt &&
            v.createdAt + 86400000 < now()
          )
            await store.set(`boardCredentials/${board}/${id}`, null);
        },
      );
    return result;
  }
  return { run };
}

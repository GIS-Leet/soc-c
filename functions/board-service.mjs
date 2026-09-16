// 게시판 원본 경로를 보존하면서 서버 권한·직렬화·원자적 변경을 적용한다.
import {
  BOARDS,
  BoardError,
  fail,
  isTeacher,
  key,
  text,
  password,
  fields,
  digest,
  stableJSON,
  hashPassword,
  verifyPassword,
  imageBytes,
  pushKey,
  timeString,
  legacyTime,
} from "./board-security.mjs";
const GRANT_MS = 30 * 60 * 1000;
const REQUEST_MS = 7 * 86400000;
const MAX_THREAD_BYTES = 1024 * 1024;
const MAX_PAGE_BYTES = 4 * 1024 * 1024 - 1024;
function boundedThread(value) {
  if (Buffer.byteLength(JSON.stringify(value)) > MAX_THREAD_BYTES)
    fail(
      "resource-exhausted",
      "Thread exceeds the safe size limit; teacher review is required",
    );
  return value;
}
const SAFE = Object.freeze({
  list: ["cursor", "limit"],
  read: ["id"],
  unlock: ["id", "password"],
  create: [
    "requestId",
    "title",
    "text",
    "author",
    "password",
    "isSecret",
    "attachmentIds",
  ],
  update: ["id", "requestId", "title", "text"],
  delete: ["id", "requestId"],
  "reply.create": ["id", "requestId", "text", "attachmentIds"],
  "reply.update": ["id", "replyId", "requestId", "text"],
  "reply.delete": ["id", "replyId", "requestId"],
  "subreply.create": [
    "id",
    "replyId",
    "requestId",
    "text",
    "author",
    "attachmentIds",
  ],
  "subreply.delete": ["id", "replyId", "subreplyId", "requestId"],
  "read.mark": ["id", "requestId"],
  "attachment.upload": ["requestId", "mime", "base64"],
});
const obj = (x) => (x && typeof x === "object" && !Array.isArray(x) ? x : {});
const string = (x) => (typeof x === "string" ? x : "");
const number = (x) => (Number.isFinite(x) ? x : 0);
export function createBoardService({
  store,
  storage,
  now = Date.now,
  attachmentBase,
}) {
  const postPath = (board, id) => `${board}/${id}`;
  const url = (board, id, attachmentId) =>
    `${attachmentBase}?board=${board}&id=${id}&attachmentId=${attachmentId}`;
  async function rate(bucket, limit, windowMs) {
    let blocked = false;
    await store.transaction(`boardRate/${digest(bucket)}`, (old) => {
      const active =
        old && old.until > now() ? old : { count: 0, until: now() + windowMs };
      if (active.count >= limit) {
        blocked = true;
        return undefined;
      }
      blocked = false;
      return { ...active, count: active.count + 1 };
    });
    if (blocked) fail("resource-exhausted", "Try again later");
  }
  async function permission(board, id, post, auth) {
    const owner = !!auth?.uid && post?._board?.ownerUid === auth.uid,
      teacher = isTeacher(auth);
    const grant = auth?.uid
      ? await store.get(`boardGrants/${digest(`${auth.uid}/${board}/${id}`)}`)
      : null;
    const credentialVersion = post?._board?.credentialVersion || 1;
    const granted =
      !!grant && grant.expiresAt > now() && grant.version === credentialVersion;
    return {
      read: post?.isSecret !== true || owner || teacher || granted,
      write: owner || teacher || granted,
      owner: owner || granted,
      teacher,
      ...(granted ? { expiresAt: grant.expiresAt } : {}),
    };
  }
  function safeImage(node, board, id, privatePost) {
    if (node?.attachmentId) return url(board, id, node.attachmentId);
    if (privatePost) return "";
    const u = string(node?.imageUrl);
    try {
      const parsed = new URL(u);
      return parsed.protocol === "https:" &&
        parsed.hostname === "firebasestorage.googleapis.com" &&
        parsed.pathname.startsWith("/v0/b/soc-c-qna.firebasestorage.app/o/")
        ? u
        : "";
    } catch {
      return "";
    }
  }
  function summary(post) {
    const replies = Object.values(obj(post.replies)),
      answerCount = replies.length;
    const lastAnswerAt = replies.reduce(
      (latest, r) =>
        r?.isTeacher === true
          ? Math.max(latest, number(r.timestamp) || legacyTime(r.time))
          : latest,
      0,
    );
    const followup = replies.some((r) => {
      const s = Object.entries(obj(r?.subReplies))
        .sort(([a], [b]) => (a < b ? -1 : 1))
        .at(-1)?.[1];
      return (
        s &&
        !s.isTeacher &&
        (number(s.timestamp) || legacyTime(s.time)) >
          number(post.followUpResolvedAt)
      );
    });
    return {
      answerCount,
      state: followup ? "followup" : answerCount ? "answered" : "open",
      lastAnswerAt,
    };
  }
  async function serialize(board, id, post, auth) {
    const access = await permission(board, id, post, auth),
      meta = summary(post),
      secret = post.isSecret === true;
    if (!access.read)
      return {
        id,
        title: "비밀글",
        author: "",
        text: "",
        time: timeString(
          number(post.timestamp) || legacyTime(post.time) || now(),
        ),
        timestamp: number(post.timestamp) || legacyTime(post.time),
        isSecret: true,
        imageUrl: "",
        replies: {},
        readAt: 0,
        followUpResolvedAt: 0,
        _access: access,
        _summary: meta,
      };
    const replies = {};
    for (const [rid, r] of Object.entries(obj(post.replies))) {
      if (
        ["__proto__", "prototype", "constructor"].includes(rid) ||
        !/^[A-Za-z0-9_-]{1,128}$/.test(rid) ||
        !r ||
        typeof r !== "object"
      )
        continue;
      const subReplies = {};
      for (const [sid, s] of Object.entries(obj(r?.subReplies))) {
        if (
          ["__proto__", "prototype", "constructor"].includes(sid) ||
          !/^[A-Za-z0-9_-]{1,128}$/.test(sid) ||
          !s ||
          typeof s !== "object"
        )
          continue;
        subReplies[sid] = {
          author: string(s.author),
          text: string(s.text),
          time: string(s.time),
          timestamp: number(s.timestamp),
          isTeacher: s.isTeacher === true,
          imageUrl: safeImage(s, board, id, secret),
        };
      }
      replies[rid] = {
        text: string(r.text),
        time: string(r.time),
        timestamp: number(r.timestamp),
        isTeacher: r.isTeacher === true,
        imageUrl: safeImage(r, board, id, secret),
        subReplies,
      };
    }
    return boundedThread({
      id,
      title: string(post.title),
      text: string(post.text),
      author: string(post.author),
      time: string(post.time),
      timestamp: number(post.timestamp) || legacyTime(post.time),
      isSecret: secret,
      imageUrl: safeImage(post, board, id, secret),
      replies,
      readAt: number(post.readAt),
      followUpResolvedAt: number(post.followUpResolvedAt),
      _access: access,
      _summary: meta,
    });
  }
  async function existing(board, id) {
    const p = await store.get(postPath(board, id));
    if (!p || typeof p !== "object") fail("not-found", "Post not found");
    return p;
  }
  async function migrateCredential(board, id, post) {
    const path = `boardCredentials/${board}/${id}`;
    let credential = await store.get(path);
    if (
      !credential &&
      typeof post.password === "string" &&
      post.password.length
    ) {
      const hashed = await hashPassword(post.password);
      const result = await store.transaction(
        path,
        (old) => old || { ...hashed, createdAt: now() },
      );
      credential = result.value;
    }
    if (credential && Object.hasOwn(post, "password"))
      await store.transaction(postPath(board, id), (current) => {
        if (!current || current.password !== post.password) return undefined;
        const next = { ...current };
        delete next.password;
        return next;
      });
    return credential;
  }
  async function unlock(data, auth, context) {
    password(data.password);
    await rate(`unlock:record:${data.board}:${data.id}`, 20, 15 * 60000);
    await rate(
      `unlock:ip:${context.ip || auth.uid}:${data.board}:${data.id}`,
      5,
      15 * 60000,
    );
    await rate(`unlock:uid:${auth.uid}`, 15, 15 * 60000);
    const post = await store.get(postPath(data.board, data.id));
    const credential = post
      ? await migrateCredential(data.board, data.id, post)
      : null;
    if (!post || !(await verifyPassword(data.password, credential)))
      fail("permission-denied", "Password or post unavailable");
    const expiresAt = now() + GRANT_MS;
    await store.set(
      `boardGrants/${digest(`${auth.uid}/${data.board}/${data.id}`)}`,
      { expiresAt, version: credential.version || 1 },
    );
    return {
      item: await serialize(
        data.board,
        data.id,
        await existing(data.board, data.id),
        auth,
      ),
    };
  }
  async function request(data, auth, work) {
    key(data.requestId, "requestId");
    if (data.requestId.length < 8)
      fail("invalid-argument", "requestId too short");
    const hash = digest(stableJSON(data)),
      path = `boardRequests/${digest(`${auth.uid}/${data.requestId}`)}`,
      lease = pushKey(now());
    let receipt;
    const tx = await store.transaction(path, (old) => {
      if (old && old.hash !== hash)
        fail("already-exists", "requestId already used");
      if (old?.state === "done") {
        receipt = old;
        return undefined;
      }
      if (old?.leaseUntil > now()) fail("aborted", "Request is in progress");
      return {
        ...(old || {
          hash,
          entityId: pushKey(now()),
          createdAt: now(),
          expiresAt: now() + REQUEST_MS,
        }),
        state: "pending",
        lease,
        leaseUntil: now() + 120000,
      };
    });
    if (!tx.committed) {
      const result = receipt?.result;
      if (!result) fail("aborted", "Retry request");
      if (result.deleted || result.attachmentId) return result;
      return {
        ...result,
        item: await serialize(
          data.board,
          result.postId || result.id,
          await existing(data.board, result.postId || result.id),
          auth,
        ),
      };
    }
    receipt = tx.value;
    try {
      const result = await work(receipt);
      const saved = { ...result };
      delete saved.item;
      await store.transaction(path, (current) =>
        current?.lease === lease
          ? { ...current, state: "done", leaseUntil: 0, result: saved }
          : undefined,
      );
      return result;
    } catch (error) {
      await store.transaction(path, (current) =>
        current?.lease === lease ? { ...current, leaseUntil: 0 } : undefined,
      );
      throw error;
    }
  }
  function attachmentIds(data) {
    if (data.attachmentIds === undefined) return [];
    if (!Array.isArray(data.attachmentIds) || data.attachmentIds.length > 1)
      fail("invalid-argument", "Only one image per entry");
    return data.attachmentIds.map((id) => key(id, "attachmentId"));
  }
  async function claimAttachments(ids, board, id, auth) {
    for (const attachmentId of ids) {
      await store.transaction(`boardAttachments/${attachmentId}`, (a) => {
        if (!a || a.uid !== auth.uid || a.board !== board)
          fail("permission-denied", "Attachment unavailable");
        if (
          !["pending", "claimed"].includes(a.state) ||
          (a.postId && a.postId !== id)
        )
          fail("failed-precondition", "Attachment already used");
        if (a.createdAt + 86400000 < now() && !a.postId)
          fail("failed-precondition", "Attachment expired");
        return { ...a, postId: id, state: "claimed", claimedAt: now() };
      });
    }
  }
  function attach(node, ids, board, id) {
    if (ids.length) {
      node.attachmentId = ids[0];
      node.imageUrl = url(board, id, ids[0]);
    } else node.imageUrl = "";
    return node;
  }
  async function outbox(board, id, eventId) {
    const path = `boardOutbox/${digest(`${board}/${id}/${eventId}`)}`;
    await store.transaction(
      path,
      (old) =>
        old || {
          board,
          postId: id,
          eventId,
          createdAt: now(),
          state: "pending",
          attempts: 0,
          nextAttemptAt: now(),
        },
    );
  }
  async function mutate(data, auth, receipt) {
    const { board, action } = data,
      id = action === "create" ? receipt.entityId : data.id,
      operation = digest(`${auth.uid}:${data.requestId}`),
      ids = attachmentIds(data);
    if (action === "create") {
      text(data.title, "title", 160);
      text(data.text, "text", 20000);
      text(data.author, "author", 80, { empty: true });
      password(data.password);
      if (typeof data.isSecret !== "boolean")
        fail("invalid-argument", "isSecret required");
      if (await store.get(`boardTombstones/${board}/${id}`))
        fail("failed-precondition", "Post was deleted");
      const credentialPath = `boardCredentials/${board}/${id}`;
      if (!(await store.get(credentialPath))) {
        const h = await hashPassword(data.password);
        await store.transaction(
          credentialPath,
          (old) => old || { ...h, createdAt: now() },
        );
      }
      await claimAttachments(ids, board, id, auth);
      // Canonical creation and its durable receipt marker are one RTDB update.
      // A retry after native deletion must not recreate the old question.
      let created = await store.get(postPath(board, id));
      if (created) {
        if (created._board?.operations?.[operation] !== receipt.hash)
          fail("already-exists", "Post already exists");
      } else {
        if (receipt.created)
          fail("failed-precondition", "Post was deleted after creation");
        created = attach(
          {
            title: data.title,
            text: data.text,
            author: data.author || "익명",
            isSecret: data.isSecret,
            time: timeString(now()),
            timestamp: now(),
            _board: {
              ownerUid: auth.uid,
              credentialVersion: 1,
              schemaVersion: 2,
              operations: { [operation]: receipt.hash },
            },
          },
          ids,
          board,
          id,
        );
        await store.update({
          [postPath(board, id)]: boundedThread(created),
          [`boardRequests/${digest(`${auth.uid}/${data.requestId}`)}/created`]: true,
        });
      }
      await outbox(board, id, operation);
      return { id, item: await serialize(board, id, created, auth) };
    }
    if (action === "delete" && !(await store.get(postPath(board, id)))) {
      const tombstone = await store.get(`boardTombstones/${board}/${id}`);
      if (tombstone?.operation === operation && tombstone?.uid === auth.uid) {
        await store.set(`boardCleanup/${digest(`${board}/${id}`)}`, {
          board,
          postId: id,
          createdAt: now(),
          state: "pending",
        });
        await store.set(`boardCredentials/${board}/${id}`, null);
        return { id, deleted: true };
      }
    }
    let post = await existing(board, id),
      access = await permission(board, id, post, auth);
    if (action.startsWith("reply.") && !isTeacher(auth))
      fail("permission-denied");
    if (["update", "delete"].includes(action) && !access.write)
      fail("permission-denied");
    if (action === "read.mark" && (!access.owner || isTeacher(auth)))
      fail("permission-denied");
    if (action.startsWith("subreply.") && !access.read)
      fail("permission-denied");
    if (action === "update") {
      text(data.title, "title", 160);
      text(data.text, "text", 20000);
    }
    if (["reply.create", "reply.update", "subreply.create"].includes(action)) {
      text(data.text, "text", 20000, { empty: ids.length > 0 });
      if (action === "subreply.create")
        text(data.author, "author", 80, { empty: true });
    }
    if (action === "delete") {
      await store.set(`boardTombstones/${board}/${id}`, {
        at: now(),
        operation,
        uid: auth.uid,
      });
      const tx = await store.transaction(postPath(board, id), (current) => {
        if (!current) return null;
        if (
          !isTeacher(auth) &&
          current._board?.ownerUid !== auth.uid &&
          !(access.expiresAt > now())
        )
          fail("permission-denied");
        return null;
      });
      await store.set(`boardCleanup/${digest(`${board}/${id}`)}`, {
        board,
        postId: id,
        createdAt: now(),
        state: "pending",
      });
      await store.set(`boardCredentials/${board}/${id}`, null);
      return { id, deleted: true };
    }
    await claimAttachments(ids, board, id, auth);
    let resultId = id;
    const tx = await store.transaction(postPath(board, id), (current) => {
      if (!current) fail("not-found", "Parent post deleted");
      if (current._board?.operations?.[operation]) {
        if (current._board.operations[operation] !== receipt.hash)
          fail("already-exists");
        resultId = ["reply.create", "subreply.create"].includes(action)
          ? receipt.entityId
          : id;
        return current;
      }
      const granted = !!access.expiresAt && access.expiresAt > now();
      const owner = current._board?.ownerUid === auth.uid;
      const currentRead =
        current.isSecret !== true || owner || isTeacher(auth) || granted;
      if (action === "update" && !owner && !isTeacher(auth) && !granted)
        fail("permission-denied");
      if (action === "read.mark" && ((!owner && !granted) || isTeacher(auth)))
        fail("permission-denied");
      if (action.startsWith("subreply.") && !currentRead)
        fail("permission-denied");
      const p = structuredClone(current);
      p._board ??= {};
      p._board.operations ??= {};
      if (action === "update") {
        p.title = data.title;
        p.text = data.text;
      } else if (action === "read.mark") p.readAt = now();
      else if (action === "reply.create") {
        p.replies ??= {};
        resultId = receipt.entityId;
        p.replies[resultId] = attach(
          {
            text: data.text,
            time: timeString(now()),
            timestamp: now(),
            isTeacher: true,
          },
          ids,
          board,
          id,
        );
      } else {
        const reply = p.replies?.[data.replyId];
        if (!reply) fail("not-found", "Parent reply deleted");
        if (action === "reply.update") reply.text = data.text;
        else if (action === "reply.delete") delete p.replies[data.replyId];
        else if (action === "subreply.create") {
          reply.subReplies ??= {};
          resultId = receipt.entityId;
          reply.subReplies[resultId] = attach(
            {
              author: isTeacher(auth) ? "관리자" : data.author || "익명",
              text: data.text,
              time: timeString(now()),
              timestamp: now(),
              isTeacher: isTeacher(auth),
              authorUid: auth.uid,
            },
            ids,
            board,
            id,
          );
        } else if (action === "subreply.delete") {
          const sub = reply.subReplies?.[data.subreplyId];
          if (!sub) fail("not-found");
          if (!isTeacher(auth) && sub.authorUid !== auth.uid)
            fail("permission-denied");
          delete reply.subReplies[data.subreplyId];
        }
      }
      p._board.operations[operation] = receipt.hash;
      return boundedThread(p);
    });
    if (action === "subreply.create") await outbox(board, id, operation);
    if (action.endsWith(".delete"))
      await store.set(`boardCleanup/${digest(`${board}/${id}/${operation}`)}`, {
        board,
        postId: id,
        createdAt: now(),
        state: "pending",
      });
    return {
      id: resultId,
      ...(resultId !== id ? { postId: id } : {}),
      item: await serialize(board, id, tx.value, auth),
    };
  }
  async function upload(data, auth, receipt) {
    const bytes = imageBytes(data.base64, data.mime),
      attachmentId = receipt.entityId;
    const storagePath = `board-private/${data.board}/${auth.uid}/${attachmentId}`;
    const metadataPath = `boardAttachments/${attachmentId}`;
    await store.transaction(
      metadataPath,
      (old) =>
        old || {
          uid: auth.uid,
          board: data.board,
          storagePath,
          mime: data.mime,
          size: bytes.length,
          createdAt: now(),
          state: "uploading",
        },
    );
    await storage.put(storagePath, bytes, data.mime);
    await store.transaction(metadataPath, (old) => {
      if (!old || old.uid !== auth.uid || old.state === "deleting")
        fail("failed-precondition", "Upload expired");
      return { ...old, state: old.state === "claimed" ? "claimed" : "pending" };
    });
    return { attachmentId };
  }
  async function call(data, auth, context = {}) {
    if (!auth?.uid) fail("unauthenticated");
    key(auth.uid, "uid");
    if (!BOARDS.has(data?.board) || !SAFE[data?.action])
      fail("invalid-argument", "Unsupported board or action");
    fields(data, ["action", "board", ...SAFE[data.action]]);
    for (const name of ["id", "replyId", "subreplyId"])
      if (SAFE[data.action].includes(name)) key(data[name], name);
    if (data.action.startsWith("subreply.") && data.board !== "questions")
      fail("invalid-argument");
    await rate(`api:${auth.uid}`, 240, 60000);
    if (data.action === "list") {
      const limit = data.limit ?? 50;
      if (!Number.isInteger(limit) || limit < 1 || limit > 50)
        fail("invalid-argument", "Invalid limit");
      const after = data.cursor === undefined ? "" : key(data.cursor, "cursor");
      const rows = await store.page(data.board, { after, limit: limit + 1 });
      const selected = rows.slice(0, limit),
        items = [];
      let bytes = 0,
        consumed = 0,
        lastConsumed = after;
      for (const [id, post] of selected) {
        if (post && typeof post === "object") {
          const item = await serialize(data.board, id, post, auth);
          const size = Buffer.byteLength(JSON.stringify(item)) + 1;
          if (items.length && bytes + size > MAX_PAGE_BYTES) break;
          items.push(item);
          bytes += size;
        }
        consumed++;
        lastConsumed = id;
      }
      const hasMore = rows.length > limit || consumed < selected.length;
      return { items, cursor: hasMore ? lastConsumed : null, hasMore };
    }
    if (data.action === "read") {
      const p = await existing(data.board, data.id);
      if (!(await permission(data.board, data.id, p, auth)).read)
        fail("permission-denied");
      return { item: await serialize(data.board, data.id, p, auth) };
    }
    if (data.action === "unlock") return unlock(data, auth, context);
    return request(data, auth, (receipt) =>
      data.action === "attachment.upload"
        ? upload(data, auth, receipt)
        : mutate(data, auth, receipt),
    );
  }
  function containsAttachment(post, attachmentId) {
    if (post?.attachmentId === attachmentId) return true;
    return Object.values(obj(post?.replies)).some(
      (r) =>
        r?.attachmentId === attachmentId ||
        Object.values(obj(r?.subReplies)).some(
          (s) => s?.attachmentId === attachmentId,
        ),
    );
  }
  async function attachment(data, auth) {
    fields(data, ["board", "id", "attachmentId"]);
    if (!BOARDS.has(data.board)) fail("invalid-argument");
    key(data.id);
    key(data.attachmentId);
    const p = await existing(data.board, data.id);
    if (!(await permission(data.board, data.id, p, auth)).read)
      fail("permission-denied");
    if (!containsAttachment(p, data.attachmentId)) fail("not-found");
    const a = await store.get(`boardAttachments/${data.attachmentId}`);
    if (
      !a ||
      a.board !== data.board ||
      a.postId !== data.id ||
      a.state !== "claimed"
    )
      fail("not-found");
    const object = await storage.get(a.storagePath);
    if (!object) fail("not-found");
    return object;
  }
  return { call, attachment, serialize, containsAttachment, migrateCredential };
}

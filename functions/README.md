# 게시판 서버

The canonical `questions`, `feedback`, and `support` paths remain compatible with verified teacher Desk REST/SSE access. Student reads and mutations use the callable API; never restore public canonical rules as a fallback.

## Deployed exports

- `boardApi`, callable, `us-central1`. All calls require a Firebase user (anonymous is sufficient). Input has `action` and `board` plus the fields below.
- `boardAttachment`, HTTP GET. Query: `board`, `id` (post ID), `attachmentId`. Private access requires `Authorization: Bearer <Firebase ID token>`; public images may be read anonymously. No tokens in URLs. Response is `private, no-store` and `nosniff`.
- `boardMaintenance`, callable, verified teacher only. Input `{limit?: 1..100, cursors?: object}`. Run until all returned cursors are null, then repeat regularly for retention/notification retries. This manual endpoint is separate from the automatic boardScheduledMaintenance function below.

All teacher privileges require the configured exact teacher email AND a verified email claim. The browser's teacher flag is never accepted.

## API fields

| Action | Additional fields | Result |
|---|---|---|
| list | limit? (1..50), cursor? | `{items,cursor,hasMore}` |
| read | id | `{item}` |
| unlock | id, password | `{item}`; 30-minute UID grant, no ownership transfer |
| create | requestId, title, text, author, password, isSecret, attachmentIds? | `{id,item}` |
| update | requestId, id, title, text | `{id,item}` |
| delete | requestId, id | `{id,deleted:true}` |
| reply.create | requestId, id, text, attachmentIds? | `{id,postId,item}`; id is reply ID |
| reply.update | requestId, id, replyId, text | `{id,item}` |
| reply.delete | requestId, id, replyId | `{id,item}` |
| subreply.create | requestId, id, replyId, text, author, attachmentIds? | `{id,postId,item}`; id is subreply ID |
| subreply.delete | requestId, id, replyId, subreplyId | `{id,item}` |
| read.mark | requestId, id | `{id,item}`; post author/grant, not teacher |
| attachment.upload | requestId, mime, base64 | `{attachmentId}` |

`id` always identifies the post in requests. Mutations use a stable requestId (8..128 safe-key characters; UUID is valid) per logical submission. A changed payload requires a new ID. Requests are retained for seven days; callers must not retry old submissions after that retention window. `attachmentIds` contains at most one returned attachment ID per post/reply/subreply. MIME is JPEG/PNG/WebP; decoded bytes must have the matching signature and be <=5 MiB. Images are metadata-reserved before object upload and must become ready before claim.

Client time, timestamp, imageUrl, isTeacher, authorUid, ownerUid and arbitrary slash-key updates are not accepted. The server derives them. First-level reply actions require teacher; subreply creates require current thread access and deletes require teacher or stored new subreply author UID. Legacy subreplies without an author UID remain teacher-managed.

Responses serialize allowlisted fields. `_access` is `{read,write,owner,teacher,expiresAt?}`; a valid password grant counts as owner capability until expiry. `_summary` is `{answerCount,state:'open'|'answered'|'followup',lastAnswerAt}`. Locked private items have generic title, empty author/text/imageUrl/replies. Current owner/grant/teacher list results are hydrated. Never store private API responses in public caches or carry them across auth changes.

Pages are bounded by both item count and roughly 4 MiB. Continue until `hasMore=false`; a full-public-body client search is complete only after all pages. Threads have a 1 MiB ceiling for safe serialization/new mutations. Oversized legacy threads return explicit `resource-exhausted`, not silent omission; teacher review/migration is needed. Private legacy image URLs are suppressed until explicit attachment migration. Public legacy images are limited to the configured Firebase bucket URL.

## State and concurrency

Credentials are separate salted scrypt verifiers. Grants, request receipts, rate windows, attachments, outbox, cleanup queue and tombstones are server-only. Grants/requests use hashed composite keys for bounded maintenance paging. Canonical `_board` contains ownership and applied-operation digests, ignored by existing native models and never serialized to students.

Updates/replies use RTDB REST ETag compare-and-set on a post, including current parent and privacy checks. Create uses one atomic multi-location update for the canonical post plus a durable created-once request marker. A retry cannot resurrect a question directly deleted by native Desk after an interrupted create. Attachment references are claimed separately with readiness/ownership checks. Deletion is idempotent even if cleanup fails after canonical removal. Maintenance leases attachments, honors fresh claims and rechecks canonical membership before deletion.

## Migration and deployment

1. Deploy/test functions and API clients first; verify production Firebase auth/IAM separately. No cloud resources are enabled by this code.
2. Close legacy public RTDB/Storage writers with the merged rules. The 11 unrelated RTDB rule branches are copied unchanged from the authenticated production rules snapshot of 2026-09-16. Canonical boards become verified-teacher-only; auxiliary paths are denied to clients. Storage permits verified teacher management only; uploads use the server.
3. `node scripts/migrate-boards.mjs` is aggregate-count dry-run by default. Authenticate with ADC or explicitly `--use-firebase-cli` for the existing local CLI account; its refresh token is read in memory, never logged. Optional `FIREBASE_TOOLS_DIR` points to an isolated installed firebase-tools package for public OAuth client metadata.
4. `node scripts/migrate-boards.mjs --apply` atomically writes each verifier and removes the canonical plaintext password. Missing/empty legacy passwords need teacher recovery. IDs, bodies, replies, old time strings and other canonical fields are preserved.
5. Only after the native authenticated image loader is ready: `node scripts/migrate-boards.mjs --apply --migrate-attachments`. This reserves/copies private objects, conditionally swaps current canonical references and removes the old Firebase download token. It does not delete posts or original objects. A concurrent native deletion cannot recreate a parent. Failures count without printing record contents; rerun resumes token revocation/reference finalization.
6. Verify production with authorized synthetic posts/accounts; code/emulator tests are not deployment proof. Preserve security boundaries during rollback.

## Notifications and maintenance

Delivery is OFF unless `BOARD_NOTIFICATIONS_ENABLED=true` is explicitly configured for the runtime. When enabled, `boardMaintenance` reads Secret Manager secret `board-notification-webhook` using runtime credentials; provision only a newly rotated webhook and grant that runtime service account secret access. No secret value belongs in the repository or browser. Missing/invalid secret fails clearly. Outbox payload is generic board/event metadata plus teacher Desk URL and disables Discord mentions; it never includes title, author, body or images.

Outbox covers API-created posts and student/teacher API subreplies, not native direct-write triggers. It leases events and retries failures with backoff. A crash after an external send but before marking sent can duplicate the generic notice (at-least-once, not exactly-once).

Pending/unreferenced attachment retention is 24 hours; freshly claimed objects are protected for the same interval. Request receipts expire after seven days, grants after 30 minutes, sent outbox/cleanup markers after 30 days. The scheduled function drains persisted cursors every 10 minutes; this manual endpoint can also be invoked by a verified teacher. Native direct deletions are recognized by the canonical-membership sweep even without a delete trigger. Server tombstones deliberately remain to prevent resurrection.

## Verification

```
node --test tests/board-server*.test.mjs
PATH=/path/to/jdk21/bin:$PATH firebase emulators:exec --project demo-soc-c --only database,storage,auth 'node --test tests/board-server-rules.test.mjs tests/board-server-store.test.mjs'
```

No test uses production student records. Emulator-only tests skip without emulator environment variables. The deployment runtime is Node.js 22; the current local test runtime was Node.js 24.18.0 (npm reports the expected local engine mismatch). Exact dependency versions and lockfile are committed.

### Automatic maintenance
`boardScheduledMaintenance` uses Cloud Scheduler every 10 minutes. Each run processes at most 50 entries per category, persists cursors under server-only `boardMaintenanceState/scheduled`, and resumes them next run. A six-minute lease prevents overlapping work; function timeout is five minutes. Failures preserve cursors for retry. Notifications remain disabled unless explicitly configured above. Deploying this function provisions the Scheduler job; verify its last execution after deployment.

# soc-c-api — 게시판 서버를 Cloudflare Workers 로

Firebase 함수(`functions/`)가 하던 일을 Cloudflare Workers 무료 요금제에서 그대로 한다. 함수는 응답을 내보낼 때마다 전송료가 붙고 무료 구간이 없어서, 이쪽으로 옮기고 Firebase 는 무료 요금제(Spark)로 내리는 것이 목적이다.

게시판 · 푸시 로직은 `functions/` 의 모듈을 그대로 불러 쓴다. 이 폴더에는 플랫폼에 맞춘 껍데기만 있다.

| 함수 | Worker |
| --- | --- |
| `boardApi` · `boardMaintenance` (onCall) | `POST /boardApi` · `POST /boardMaintenance` — 요청 · 응답 모양 같음 |
| `boardAttachment` | `GET /boardAttachment` — 그림은 Storage 대신 KV |
| `boardVersion*` (DB 쓰기 트리거) | 글을 바꾸는 호출 직후에 올림. DB 에 직접 쓰는 쪽은 `POST /boardTouch` (교사만) |
| `deskQuestionPush` · `deskStudentFollowupPush` (DB 생성 트리거) | 질문 · 이어진 질문이 만들어진 직후에 보냄 |
| `deskPushRetry` (매분) · `boardScheduledMaintenance` (10분) | Cron `* * * * *` 하나 |

## 확인된 것 (2026-10-08, 로컬 workerd)

- 운영 함수와 같은 요청을 보내 응답 비교 — 목록 3개 판 · 잘못된 요청 · 없는 글 · 같은 판 번호 · 글 읽기 · 로그인 없음, 9개 모두 같음.
- Storage 의 첨부 31개(25.1MB)를 로컬 KV 로 옮긴 뒤, 공개 글의 그림 22개가 함수와 같은 바이트로 나옴.
- `npm test` 의 `tests/worker.test.mjs` 7개 통과.

## 아직 확인하지 못한 것

- **APNs.** 로컬 workerd 에서는 애플 서버 연결이 끊긴다(HTTP/2). Cloudflare 에 올린 뒤 실제 푸시로 확인해야 한다. 안 되면 푸시만 FCM 으로 돌린다.
- **비밀글 암호(scrypt).** 한 번에 CPU 약 25ms 로 무료 요금제 기준(10ms)을 넘는다. 올린 뒤 비밀글 쓰기 · 열기가 오류 없이 되는지 본다.
- 학교망에서 `workers.dev` 주소가 열리는지.

## 올리기

Cloudflare 계정(무료, 카드 없음)이 있어야 한다.

```sh
cd worker
npx wrangler login
npx wrangler kv namespace create FILES          # 나온 id 를 wrangler.toml 에
npx wrangler secret put GOOGLE_SERVICE_ACCOUNT  # 서비스 계정 키 JSON 전체를 붙여 넣음
npx wrangler secret put DESK_APNS_CREDENTIAL    # 함수의 같은 이름 비밀값
npx wrangler deploy                             # https://soc-c-api.<계정>.workers.dev
```

비밀값은 파일 · 로그 · 커밋에 남기지 않는다. 로컬 실행용 `.dev.vars` 는 `.gitignore` 에 있다.

## 갈아타기

함수는 지우기 전까지 그대로 돌므로 언제든 2번을 되돌리면 원래대로다.

1. 첨부 옮기기.
   `node worker/tools/migrate-attachments.mjs <키.json> --out <임시 폴더>` 로 묶음을 만들고, 묶음마다 `npx wrangler kv bulk put <묶음> --binding FILES --remote`. 끝나면 임시 폴더를 지운다(학생이 올린 그림).
2. 학생 화면 전환. `assets/board-client.mjs` 의 `API` · `IMAGE` 두 줄을 Worker 주소로 바꾸고 `node scripts/stamp-assets.mjs`.
3. Desk 앱. `Study/Data/BoardAttachmentPolicy.swift` 가 Worker 주소도 받게 하고 배포.
4. 저장된 그림 주소 바꾸기. `desk.html` 과 Desk 앱은 글에 저장된 주소를 그대로 읽는다(31개).
   `node worker/tools/rewrite-stored-urls.mjs <키.json> https://soc-c-api.<계정>.workers.dev` 로 세어 보고 `--apply`. 3번의 앱이 깔린 뒤에 한다.
5. Desk 가 DB 에 직접 쓴 뒤(답변 · 삭제) `/boardTouch` 를 부르게 한다 — `desk.html` 과 Desk 앱. 안 하면 학생 화면에 답변이 최대 10분 늦게 뜬다.
6. 며칠 같이 돌려 본 뒤 함수를 지우고 Spark 로 내린다.

## Spark 로 내리기 전에 남는 것

- `desk.html` 의 노트 그림 올리기가 Storage 를 직접 쓴다(`desk-images/`, 지금 3개). Worker 로 올리게 바꾸거나 그림을 다른 곳에 둔다.
- 수업 자료 앱의 설치 파일(`private-ota/`, 585MB)이 Storage 에 있다. 파일 하나가 60MB 라 KV(25MB)에 못 넣는다. 비공개 GitHub 릴리스 + Worker 중계나 TestFlight 로 옮긴다.
- Storage 의 `images/` 30개(26MB)는 어느 글에서도 쓰이지 않는다. 옮기지 않았다.

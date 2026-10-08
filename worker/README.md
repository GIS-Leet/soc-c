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

## 지금 상태 (2026-10-08)

`https://soc-c-api.nyuheatgis.workers.dev` 에 올라가 있고, 학생 게시판(24907b4) · Desk 웹(8086100) · Desk 앱(1.2 빌드 331)이 모두 이쪽을 쓴다. 함수는 되돌릴 때를 위해 아직 살아 있다. 남은 것은 갈아타기 6번과 맨 아래 두 가지.

배포된 Worker 로 확인한 것.

- 운영 함수와 응답 비교 — 학생 화면이 실제로 쓰는 50개짜리 목록 전 쪽(질문 8쪽 · 건의 · 지원), 잘못된 요청, 없는 글, 같은 판 번호, 글 읽기, 로그인 없음. 모두 같음.
- 첨부 31개(25.1MB)를 KV 로 옮김. 공개 글의 그림 22개가 함수와 같은 바이트.
- 비밀글 — 쓰기, 다른 사람이 암호로 열기, 틀린 암호 거부, 남에게 본문 가려짐, 지우기. CPU 는 55~80ms 로 무료 기준(10ms)을 넘지만 거절되지 않았다. 비밀글이 몰리면 다시 볼 것.
- Desk 푸시 — 시험 질문을 만들자 Worker 가 등록된 기기 3대에 보냈고 애플이 받았다(200). 판 번호도 올라감.
- 응답 시간(한국에서, 가운데값) — 50개 목록 약 0.75초(함수 0.6초), 변화 없음 폴링 0.45초(0.3초), 글 읽기 0.6초(0.3초).

겪은 것 두 가지.

- Worker 를 기본값대로 두면 한국에서 돌아 DB(미국 중부)를 여러 번 오가느라 목록 한 번에 5.8초가 걸린다. `[placement]` 로 DB 옆에서 돌린다.
- 무료 요금제는 요청 하나가 밖으로 부르는 횟수가 50번까지다. 목록이 글마다 열람 허가를 하나씩 읽어 50개 목록이 실패했다 → `withGrantSnapshot`.

학교망에서 `workers.dev` 주소가 열리는 것, 시험 푸시가 기기에 뜨는 것은 사용자가 확인했다.

## 올리기

KV 와 비밀값 두 개(`GOOGLE_SERVICE_ACCOUNT` · `DESK_APNS_CREDENTIAL`)는 계정에 들어 있다. 코드를 고친 뒤에는 이것만 하면 된다.

```sh
cd worker
npx wrangler login     # 처음 한 번
npx wrangler deploy
```

비밀값은 파일 · 로그 · 커밋에 남기지 않는다. 로컬 실행용 `.dev.vars` 는 `.gitignore` 에 있다.

## 갈아타기

함수는 지우기 전까지 그대로 돌므로 언제든 2번을 되돌리면 원래대로다.

1. 첨부 옮기기 — 2026-10-08 에 함. 그 뒤 함수로 올라온 그림이 있으면 2번 직전에 한 번 더 한다.
   `node worker/tools/migrate-attachments.mjs <키.json> --out <임시 폴더>` 로 묶음을 만들고, 묶음마다 `npx wrangler kv bulk put <묶음> --binding FILES --remote`. 끝나면 임시 폴더를 지운다(학생이 올린 그림).
2. 학생 화면 전환 — 함. `assets/board-client.mjs` 의 `API` · `IMAGE` 두 줄을 Worker 주소로 바꾸고 `node scripts/stamp-assets.mjs`. 되돌릴 때도 이 두 줄.
3. Desk 앱 — 함(1.2 빌드 331). `Study/Data/BoardAttachmentPolicy.swift` 가 Worker 주소를 받고, 글에 저장된 옛 함수 주소는 호스트만 바꿔 읽는다.
4. 저장된 그림 주소 바꾸기 — 하지 않아도 된다. Desk 앱과 `desk.html` 이 옛 주소를 읽을 때 바꿔 읽기 때문이다. DB 를 깨끗이 하고 싶으면 `node worker/tools/rewrite-stored-urls.mjs <키.json> https://soc-c-api.nyuheatgis.workers.dev` 로 세어 보고 `--apply`(31개). 331보다 오래된 Desk 앱은 바꾼 주소를 받지 않는다.
5. Desk 가 DB 에 직접 쓴 뒤 `/boardTouch` 부르기 — 함(`desk.html` 의 `touchBoard`, 앱의 `BoardTouch`).
6. 며칠 같이 돌려 본 뒤 함수를 지우고 Spark 로 내린다. 지우기 전에 Cloudflare 대시보드에서 오류 · 하루 요청 수(무료 10만)를 본다.

## Spark 로 내리기 전에 남는 것

- `desk.html` 의 노트 그림 올리기가 Storage 를 직접 쓴다(`desk-images/`, 지금 3개). Worker 로 올리게 바꾸거나 그림을 다른 곳에 둔다.
- 수업 자료 앱의 설치 파일(`private-ota/`, 585MB)이 Storage 에 있다. 파일 하나가 60MB 라 KV(25MB)에 못 넣는다. 비공개 GitHub 릴리스 + Worker 중계나 TestFlight 로 옮긴다.
- Storage 의 `images/` 30개(26MB)는 어느 글에서도 쓰이지 않는다. 옮기지 않았다.

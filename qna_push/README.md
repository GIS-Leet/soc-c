# qna_push — Q&A 새 질문·학생 대댓글을 Desk 앱 푸시로

Mac LaunchAgent(2분마다) + (선택) GitHub Actions(5분마다). 둘 다 `desk/push/lastCheck` 를 공유해 중복 없음.

## 준비(한 번)
1. https://developer.apple.com/account/resources/authkeys/list → `+` → 이름 아무거나, **Apple Push Notifications service (APNs)** 체크 → 등록 → `.p8` 내려받기(한 번만 받을 수 있음), **Key ID** 10자 메모.
2. `.p8` 을 `~/project/qna_push/` 에 두고 `config.json.example` 을 `config.json` 으로 복사해 경로·Key ID 채우기.
3. 앱은 이미 기기 토큰을 `desk/push/tokens` 에 올리므로 할 일 없음(앱 한 번 열기).
4. 첫 실행은 기준 시각만 저장. 그 뒤부터 새 질문·학생 대댓글이 오면 폰에 배너.

## 24시간 커버(Mac 꺼져 있을 때)
`github-workflow.yml` 을 soc-c 저장소에 `.github/workflows/qna-push.yml` 로 추가하고, `qna_push.py` 를 `tools/qna_push.py` 로 올린 뒤 Settings → Secrets 에 APNS_KEY(.p8 내용)·APNS_KEY_ID·APNS_TEAM_ID·FIREBASE_SA(JSON 내용) 등록.

로그: `~/Library/Logs/qna-push.log`

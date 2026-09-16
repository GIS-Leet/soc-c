# desk_requests — Desk 앱 제작 요청 인박스

앱 노트 메뉴 「학습지/슬라이드 만들기 요청」 → `desk/requests`(pending) → 이 스크립트(5분마다)가 `inbox/{id}-{type}-{제목}.md` 로 내려받고 macOS 알림 + status=received.

**제작(Claude 세션에서)**: inbox 파일을 읽고 지침(학습지 `docs/TEXTBOOK_SYSTEM.md` 압축 포맷, 슬라이드 `docs/SLIDE_SYSTEM.md` v4)대로 HTML 을 만들어 자료실 `GIS-Leet/soc-c-private` 수업 폴더에 올린 뒤
`python3 ~/project/desk_requests/desk_requests.py done <id> '수업/파일명.html'` — 앱의 「더보기 › 제작 요청」에 완료로 표시되고 파일은 done/ 로 이동.

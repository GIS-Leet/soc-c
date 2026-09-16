#!/bin/zsh
# 프로젝트 생성: GoogleService-Info.plist 의 REVERSED_CLIENT_ID 를 URL 스킴에 넣고 XcodeGen 으로 Desk.xcodeproj 생성
set -e
cd "$(dirname "$0")"
XG="${XCODEGEN:-$(command -v xcodegen || echo "$(cd "$(dirname "$0")/.." && pwd)/bin/xcodegen")}"   # PATH → ~/project/bin/xcodegen
if ! "$XG" --version >/dev/null 2>&1; then echo "xcodegen 을 찾을 수 없습니다: $XG (XCODEGEN=경로 로 지정)" >&2; exit 1; fi
PLIST=Study/GoogleService-Info.plist
if [ -f "$PLIST" ]; then
  RID=$(/usr/libexec/PlistBuddy -c "Print :REVERSED_CLIENT_ID" "$PLIST")
  python3 - "$RID" <<'PY'
import sys, re
from pathlib import Path
rid = sys.argv[1]; p = Path('project.yml'); s = p.read_text()
s = re.sub(r"- CFBundleURLSchemes: \[study(?:, [^\]]*)?\]", f"- CFBundleURLSchemes: [study, {rid}]", s)
p.write_text(s); print("URL 스킴:", rid)
PY
else
  echo "(GoogleService-Info.plist 없음 — Google 로그인은 파일을 넣은 뒤 다시 ./setup.sh)"
fi
# 일반 프로젝트 생성은 버전을 보존하고 배포할 때만 단조 증가 빌드를 예약한다.
if [[ "${1:-}" == "--release" ]]; then
  BUILD_NUMBER=$(python3 scripts/bump-release.py --minimum "${DESK_RELEASE_MINIMUM:-0}")
  echo "배포 빌드 예약: $BUILD_NUMBER"
fi
# 버전을 project.yml 에 넣은 뒤 프로젝트 생성 (Info.plist 의 CFBundleVersion = $(CURRENT_PROJECT_VERSION))
"$XG" generate --spec project.yml
echo "Desk.xcodeproj 생성 완료"
mkdir -p Study/Resources
cat > Study/Resources/BuildInfo.plist <<EOP
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>commit</key><string>$(git rev-parse --short HEAD 2>/dev/null || echo -)</string>
  <key>date</key><string>$(date "+%Y-%m-%d %H:%M")</string>
  <key>branch</key><string>$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo -)</string>
</dict></plist>
EOP
git log -40 --format="%h %ad %s" --date=short -- . > Study/Resources/CHANGELOG.txt 2>/dev/null || true
"$XG" generate --spec project.yml >/dev/null

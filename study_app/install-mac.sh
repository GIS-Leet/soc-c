#!/bin/zsh
# Mac용 Desk 빌드·설치 — Catalyst Release 빌드를 자동 서명(팀 JUD3Y3XYZ7)으로 만들어 /Applications 에 넣는다.
# 전제: Xcode → 설정 → 계정에 Apple ID 로그인(Mac Catalyst 개발 프로파일은 이때 자동 생성). 사용: ./install-mac.sh
set -e
cd "$(dirname "$0")"
./setup.sh --release >/dev/null
DD="${TMPDIR:-/tmp}/desk-mac-dd"
xcodebuild build -project Desk.xcodeproj -scheme Desk -configuration Release \
  -destination "platform=macOS,variant=Mac Catalyst" -derivedDataPath "$DD" -allowProvisioningUpdates -quiet
APP="$DD/Build/Products/Release-maccatalyst/Desk.app"
[ -d "$APP" ] || { echo "빌드 산출물이 없습니다: $APP" >&2; exit 1; }
python3 scripts/verify-release.py "$APP"
STAGE="/Applications/.Desk-staging-$$.app"
BACKUPS="$HOME/Library/Application Support/Desk Release Backups"
mkdir -p "$BACKUPS"
PREVIOUS="$BACKUPS/Desk-previous-$(date +%Y%m%d-%H%M%S).app"
trap 'if [ -d "$STAGE" ]; then rm -rf "$STAGE"; fi' EXIT
# 기존 앱을 닫기 전에 새 사본의 복사와 서명 검증을 완료한다.
ditto "$APP" "$STAGE"
python3 scripts/verify-release.py "$STAGE"
pkill -x Desk 2>/dev/null || true
if [ -d /Applications/Desk.app ]; then mv /Applications/Desk.app "$PREVIOUS"; fi
if ! mv "$STAGE" /Applications/Desk.app; then
  if [ -d "$PREVIOUS" ]; then mv "$PREVIOUS" /Applications/Desk.app; fi
  echo "설치 실패 — 기존 앱 복구" >&2; exit 1
fi
# 응용 프로그램 화면이 빌드 산출물(iOS·시뮬 사본, 금지 표시)을 대신 보여 주던 문제(2026-09-14): 임시 빌드 등록을 지우고 /Applications 사본만 등록
LSREG=/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister
"$LSREG" -u "$APP" >/dev/null 2>&1 || true
if [ -d "$PREVIOUS" ]; then "$LSREG" -u "$PREVIOUS" >/dev/null 2>&1 || true; fi
"$LSREG" -f /Applications/Desk.app >/dev/null 2>&1 || true
echo "설치 완료: /Applications/Desk.app ($(plutil -extract CFBundleVersion raw /Applications/Desk.app/Contents/Info.plist))"
open /Applications/Desk.app

#!/bin/zsh
# 실기기 설치: ./install.sh <팀ID> [기기UDID]  — 팀ID를 project.yml에 넣고 프로젝트 생성 → 자동 서명 빌드 → 연결된 iPhone에 설치·실행
set -e
set -o pipefail
cd "$(dirname "$0")"
TEAM="$1"; DEV="$2"
[ -z "$TEAM" ] && { echo "사용법: ./install.sh <Apple 팀ID 10자리> [기기UDID]"; exit 1; }
XG="${XCODEGEN:-$(command -v xcodegen || echo /Users/leet/project/bin/xcodegen)}"
sed -i '' "s/DEVELOPMENT_TEAM: \"[A-Z0-9]*\"/DEVELOPMENT_TEAM: \"$TEAM\"/" project.yml
XCODEGEN="$XG" ./setup.sh --release
if [ -z "$DEV" ]; then
  DEV=$(xcrun devicectl list devices 2>/dev/null | awk '/available/ && /iPhone/ {print $(NF-2)}' | head -1)
  [ -z "$DEV" ] && { echo "연결된 iPhone을 찾지 못했습니다. 케이블 연결·신뢰 확인"; exit 1; }
fi
echo "기기: $DEV"
BUILD_LOG=$(mktemp -t desk-install-build)
if ! xcodebuild build -project Desk.xcodeproj -scheme Desk -destination "platform=iOS,id=$DEV" -derivedDataPath DerivedData -allowProvisioningUpdates -allowProvisioningDeviceRegistration >"$BUILD_LOG" 2>&1; then
  tail -40 "$BUILD_LOG"; echo "빌드 실패 — 설치 중단"; exit 1
fi
APP=$(find DerivedData/Build/Products -name "Desk.app" -path "*iphoneos*" | head -1)
[ -z "$APP" ] && { echo "빌드 산출물 없음"; exit 1; }
python3 scripts/verify-release.py "$APP"
xcrun devicectl device install app --device "$DEV" "$APP"
xcrun devicectl device process launch --device "$DEV" nyuheatgis || true
# 폰 설치가 끝난 iOS 산출물은 지운다 — 남겨 두면 Mac 응용 프로그램 화면이 이 사본을 골라 「Mac에서 지원되지 않음」(금지 표시)으로 뜬다(2026-09-14)
/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister -u "$PWD/$APP" >/dev/null 2>&1 || true
rm -rf "$APP" DerivedData/Build/Products/Debug-iphonesimulator/Desk.app
echo "설치 완료 — 폰에서 Desk 앱을 여세요. 처음이면 설정 → 일반 → VPN 및 기기 관리 → 개발자 앱 신뢰."

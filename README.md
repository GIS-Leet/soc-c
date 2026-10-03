# soc-c

## Geographia Lab — 지리 시뮬레이터

승인된 개편본을 공개 `main`에 반영했습니다. GitHub Pages가 `main`의 루트에서 배포합니다. [시뮬레이터 열기](https://nyuheatgis.com/simulators.html)

승인된 칼데라 장면을 기준으로 7개 실험과 탐색 화면에 STRATUM 디자인과 장면 개편을 적용했습니다. [변경 범위·과학적 가정·스크린샷](docs/simulator-scene-review.md)을 확인할 수 있습니다.

- 7개 실험과 탐색 화면, 사진 기반 지형 재질과 NASA 지표 영상
- 시뮬레이션 조작과 관찰 정보에 집중한 화면. 탐구 기록·노트·보고서 기능 제거
- 결정론적 지형·실행 취소·등고선·단면·사면 완화
- 계산식 검증, 수치와 개념 모형의 구분, 접근성·성능 검사

[교실 활용 안내](docs/simulator-classroom.md) · [모형 명세](docs/simulator-models.md) · [연구 평가 계획](docs/simulator-research-protocol.md) · [검증 기록](docs/simulator-validation.md)

### 미리보기

이 작업 폴더에서 `python -m http.server 8770 --bind 127.0.0.1`을 실행한 뒤 <http://127.0.0.1:8770/simulators.html>을 엽니다. 외부 배포 없이 이 컴퓨터에서만 열립니다.

### 검증

```text
npm ci
npm ci --prefix functions --ignore-scripts
npx playwright install chromium
npm run test:models
npm run test:simulators
npm run stamp
npm test
```

로컬 미리보기 서버가 실행 중일 때 `npm run test:accessibility`, `node scripts/check-simulator-performance.mjs`, `node scripts/check-simulator-reliability.cjs`도 실행합니다. 다른 포트를 쓰면 `SIM_URL` 환경 변수로 지정합니다. Windows PowerShell의 실행 정책으로 npm.ps1을 실행할 수 없다면 `npm.cmd`와 `npx.cmd`를 사용합니다. 자동 검사만으로 실제 학생 대상 학습 효과나 모든 보조 기술의 사용성이 입증되는 것은 아닙니다.

# 시뮬레이터 장면 개편 검토

2026-10-04 · `simulator-redesign-draft` · 공개 홈페이지에 미게시

사용자가 승인한 지형 장면의 재질과 STRATUM 디자인을 7개 실험 및 목록 페이지로 확장했다. 사용자가 불필요하다고 지정한 하단 탐구 기록, 메모, 조건 저장·복원, 파일 입출력 UI는 제거했다. 수업에 필요한 조건 조작, 단면, 수치, 계산 근거는 유지한다. 이전 브라우저 기록은 삭제하거나 덮어쓰지 않는다.

## 화면별 변경

| 화면          | 적용한 변경                                                                                                      |
| ------------- | ---------------------------------------------------------------------------------------------------------------- |
| 세계 지형     | 모든 시나리오의 암석·지표 사진 재질, 빙하 얼음과 절단면, 해안 수면의 깊이 표현, 현무암 색·질감, 지형 음영과 라벨 |
| 지각 작용     | 지층을 읽을 수 있는 암석 재질, 단층 양쪽을 분리한 닫힌 블록, 중립 배경과 조명                                    |
| 지형 실험실   | 경사에 따른 암석·지표 재질, 차분한 수면, 실제 고도대로 오인할 수 있는 색 띠 제거                                 |
| 공전과 계절   | NASA Blue Marble 지구, 얇은 대기 표현, 태양 방향에 맞는 낮·밤, 지구 확대/공전 궤도 시점                          |
| 적도 수렴대   | NASA 지표 배경과 모식 구름 띠, 위도 눈금, 바람 수렴과 상승의 별도 단면                                           |
| 태양 고도     | 두께가 있는 사면, 평행광과 면적 변화, 법선·입사각, 사진 기반 지표 표현                                           |
| 서울 대도시권 | 배경 지도 채도 조절, 단계·신도시·교통 개념도의 정보 위계, 라벨 겹침 완화                                         |
| 실험 목록     | 장식용 대형 상단 영역을 줄이고 실제 실험 화면으로 미리보기 교체                                                  |

밝은 화면과 어두운 화면은 동일한 토큰 체계를 사용한다. 모바일에서는 장면과 조건을 세로로 배치한다. `수업 화면`은 관찰 영역을 확대하며, 화질 선택은 수치 계산을 바꾸지 않는다.

## 과학적 해석의 범위

사진 재질, 물결, 구름 음영은 형태를 읽기 위한 시각 표현이다. 수치 계산에 넣는 관측 자료가 아니다. 지질 장면은 절차적 개념 모형이며 특정 지역의 DEM, 암석 응력, 빙하 유동이나 침식률을 재현하지 않는다. 단면과 표면은 같은 높이 계산을 사용하지만 해식 노치의 안쪽 벽은 별도 메시라서 상부 높이 단면에 포함되지 않는다.

지구 표면 영상은 NASA Blue Marble의 2004년 6월 자료이며 월 슬라이더에 따라 식생·적설이 변하는 자료가 아니다. ITCZ 구름 띠는 강수 관측 영상이 아니다. 지구와 태양의 크기·거리, 지질 단계의 시간은 실제 축척이 아니다. 서울의 범위 원과 연결선은 행정 경계나 실제 철도 노선·개통 현황이 아니다. 각 화면에서 관련 가정과 한계를 읽을 수 있다.

- [모형 명세](simulator-models.md)
- [사진 재질과 NASA 영상 출처](../assets/sim-textures/README.md)
- [검증 기록](simulator-validation.md)

## 검토 화면

| 화면          | 밝은 테마                                           | 어두운 테마                                        | 모바일                                               |
| ------------- | --------------------------------------------------- | -------------------------------------------------- | ---------------------------------------------------- |
| 세계 지형     | [보기](previews/redesign/world_landforms-light.png) | [보기](previews/redesign/world_landforms-dark.png) | [보기](previews/redesign/world_landforms-mobile.png) |
| 지각 작용     | [보기](previews/redesign/dynamic_earth-light.png)   | [보기](previews/redesign/dynamic_earth-dark.png)   | [보기](previews/redesign/dynamic_earth-mobile.png)   |
| 지형 실험실   | [보기](previews/redesign/terrain-light.png)         | [보기](previews/redesign/terrain-dark.png)         | [보기](previews/redesign/terrain-mobile.png)         |
| 공전과 계절   | [보기](previews/redesign/climate_3d-light.png)      | [보기](previews/redesign/climate_3d-dark.png)      | [보기](previews/redesign/climate_3d-mobile.png)      |
| 적도 수렴대   | [보기](previews/redesign/climate_itcz-light.png)    | [보기](previews/redesign/climate_itcz-dark.png)    | [보기](previews/redesign/climate_itcz-mobile.png)    |
| 태양 고도     | [보기](previews/redesign/climate_solar-light.png)   | [보기](previews/redesign/climate_solar-dark.png)   | [보기](previews/redesign/climate_solar-mobile.png)   |
| 서울 대도시권 | [보기](previews/redesign/seoul-light.png)           | [보기](previews/redesign/seoul-dark.png)           | [보기](previews/redesign/seoul-mobile.png)           |
| 목록          | [보기](previews/redesign/simulators-light.png)      | [보기](previews/redesign/simulators-dark.png)      | [보기](previews/redesign/simulators-mobile.png)      |

자동 검사는 계산과 동작의 확인이며 미적 완성도 또는 실제 학습 효과의 증명이 아니다. 학생 연구와 교사 전문가 평정은 아직 수행하지 않았다.

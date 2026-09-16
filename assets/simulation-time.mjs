// 화면 주사율과 탭 복귀에 영향을 받지 않는 시뮬레이션 시간이다.
export function createElapsedClock({maxGapMs = 250} = {}) {
  let previous = null;
  return { tick(timestamp, active = true) {
    if (!active || !Number.isFinite(timestamp)) { previous = null; return 0; }
    const elapsed = previous === null ? 0 : timestamp - previous;
    previous = timestamp;
    return elapsed > 0 && elapsed <= maxGapMs ? elapsed / 1000 : 0;
  }};
}
export function advancePhase(value, rate, seconds, min, max) {
  const span = max - min;
  return min + (((value - min + rate * seconds) % span) + span) % span;
}
export function approach(value, target, frameFactor, seconds) {
  return value + (target - value) * (1 - Math.pow(1 - frameFactor, seconds * 60));
}

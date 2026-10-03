export const RECORD_VERSION = 2;
export const PAGE_IDS = [
  "climate_solar",
  "climate_3d",
  "climate_itcz",
  "terrain",
  "dynamic_earth",
  "world_landforms",
  "seoul",
];
export function encodeGrid(values) {
  const buffer = new ArrayBuffer(values.length * 4),
    view = new DataView(buffer);
  values.forEach((value, i) => view.setFloat32(i * 4, value, true));
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
export function decodeGrid(encoded, count) {
  if (
    typeof encoded !== "string" ||
    encoded.length !== Math.ceil((count * 4) / 3) * 4 ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded)
  )
    throw new Error("격자 데이터 크기가 올바르지 않습니다.");
  const binary = atob(encoded);
  if (binary.length !== count * 4)
    throw new Error("격자 데이터 길이가 올바르지 않습니다.");
  const view = new DataView(
    Uint8Array.from(binary, (ch) => ch.charCodeAt(0)).buffer,
  );
  return Array.from({ length: count }, (_, i) => view.getFloat32(i * 4, true));
}
const plain = (x) =>
  x &&
  typeof x === "object" &&
  !Array.isArray(x) &&
  Object.keys(x).every(
    (k) => !["__proto__", "constructor", "prototype"].includes(k),
  );
export function validateState(state, fields, extraValidator = () => true) {
  if (!plain(state) || !plain(state.inputs) || !plain(state.choices))
    throw new Error("실험 조건 형식이 올바르지 않습니다.");
  for (const [id, value] of Object.entries(state.inputs)) {
    const field = fields[id];
    if (!field) throw new Error("이 실험에서 지원하지 않는 조건입니다: " + id);
    if (field.type === "checkbox") {
      if (typeof value !== "boolean")
        throw new Error("선택 조건이 올바르지 않습니다.");
    } else if (field.options) {
      if (!field.options.includes(String(value)))
        throw new Error("선택 범위를 벗어났습니다.");
    } else {
      const n = Number(value);
      if (
        typeof value !== "string" ||
        !Number.isFinite(n) ||
        n < field.min ||
        n > field.max
      )
        throw new Error("수치 조건이 범위를 벗어났습니다.");
    }
  }
  if (Object.keys(state.inputs).length !== Object.keys(fields).length)
    throw new Error("실험 조건이 빠져 있습니다.");
  for (const [key, value] of Object.entries(state.choices))
    if (
      !["scenario", "step", "tilt"].includes(key) ||
      !["string", "number"].includes(typeof value) ||
      String(value).length > 60
    )
      throw new Error("단계 조건이 올바르지 않습니다.");
  if (!extraValidator(state.extra))
    throw new Error("지형 또는 모형 데이터가 올바르지 않습니다.");
  return state;
}
export function parseNotebook(text, page) {
  if (text.length > 4_000_000)
    throw new Error("기록 파일은 4MB 이하여야 합니다.");
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error("JSON 기록 파일을 읽을 수 없습니다.");
  }
  if (
    !plain(data) ||
    data.version !== RECORD_VERSION ||
    data.page !== page ||
    !PAGE_IDS.includes(page) ||
    !Array.isArray(data.records) ||
    data.records.length > 8
  )
    throw new Error("현재 실험의 v2 기록 파일을 선택해 주세요.");
  for (const row of data.records)
    if (
      !plain(row) ||
      !plain(row.state) ||
      !plain(row.metrics) ||
      Object.keys(row.metrics).length > 40 ||
      Object.entries(row.metrics).some(
        ([k, v]) =>
          k.length > 80 ||
          !["string", "number"].includes(typeof v) ||
          String(v).length > 250,
      )
    )
      throw new Error("비교 기록의 형식이 올바르지 않습니다.");
  if (
    data.notes !== undefined &&
    (!plain(data.notes) ||
      Object.entries(data.notes).some(
        ([k, v]) =>
          !["predict", "observe", "explain"].includes(k) ||
          typeof v !== "string" ||
          v.length > 6000,
      ))
  )
    throw new Error("관찰 노트의 형식이 올바르지 않습니다.");
  if (
    typeof data.task !== "number" ||
    !Number.isInteger(data.task) ||
    data.task < 0 ||
    data.task > 20
  )
    throw new Error("탐구 과제 번호가 올바르지 않습니다.");
  return data;
}
export function csvCell(value) {
  const s = String(value ?? "");
  const safe =
    typeof value === "string" && /^[\s]*[=+@-]/.test(s) ? "'" + s : s;
  return '"' + safe.replaceAll('"', '""') + '"';
}
export function recordsCSV(records) {
  const keys = [...new Set(records.flatMap((r) => Object.keys(r.metrics)))];
  return (
    "\uFEFF" +
    [
      ["실험 번호", ...keys, "재현 조건 JSON"],
      ...records.map((r, i) => [
        i + 1,
        ...keys.map((k) => r.metrics[k] ?? ""),
        JSON.stringify(r.state),
      ]),
    ]
      .map((row) => row.map(csvCell).join(","))
      .join("\r\n")
  );
}

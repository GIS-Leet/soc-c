import { curriculum } from "./sim-curriculum.mjs?v=6025bf3a";
import { MODEL_VERSION as DEFAULT_MODEL_VERSION } from "./sim-models.mjs?v=a32b816f";
import {
  RECORD_VERSION,
  validateState,
  parseNotebook,
  recordsCSV,
} from "./sim-records.mjs?v=c4583f9f";
import { fitCanvas, line, text } from "./sim-canvas.mjs?v=31de4804";

const page = document.body.dataset.lab,
  config = curriculum[page];
const $ = (id) => document.getElementById(id);
const create = (tag, content, cls) => {
  const el = document.createElement(tag);
  if (content !== undefined) el.textContent = content;
  if (cls) el.className = cls;
  return el;
};
const saveFile = (name, content, type) => {
  const url = URL.createObjectURL(new Blob([content], { type })),
    a = create("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
};
if (config) {
  if (document.body.dataset.ready === "true") init();
  else document.addEventListener("lab:ready", init, { once: true });
}
function init() {
  const model = Lab.model || {},
    MODEL_VERSION = model.version || DEFAULT_MODEL_VERSION,
    fields = {},
    inputs = [
      ...document.querySelectorAll(
        ".lab-controls input[id],.lab-controls select[id]",
      ),
    ];
  for (const el of inputs) {
    if (el.type === "checkbox") fields[el.id] = { type: "checkbox" };
    else if (el.tagName === "SELECT")
      fields[el.id] = { options: [...el.options].map((o) => o.value) };
    else if (["range", "number"].includes(el.type))
      fields[el.id] = { min: Number(el.min), max: Number(el.max) };
  }
  const notebookKey =
    "geographia-notebook-v2-" +
    page +
    (model.version ? "-" + model.version : "");
  let records = [],
    task = 0,
    refreshTimer;
  const oldNote = $("observationNote")?.value || "";
  $("captureState")?.closest(".control-panel")?.remove();
  const bottom = document.querySelector(".lab-bottom");
  bottom.className = "research-workbench";
  bottom.replaceChildren();
  bottom.id = "researchWorkbench";
  const toolbar = create("div", undefined, "experiment-actions");
  toolbar.innerHTML =
    '<button class="primary-btn" id="recordTrial">＋ 현재 조건 기록</button><button class="secondary-btn" id="presentationMode" aria-pressed="false">수업 화면</button><label class="quality-control" for="renderQuality">화질 <select id="renderQuality"><option value="balanced">균형</option><option value="eco">절전</option><option value="high">선명</option></select></label><a href="#researchWorkbench">탐구 기록으로 ↓</a>';
  document.querySelector(".stage").after(toolbar);
  bottom.innerHTML = `<div class="workbench-heading"><div><div class="eyebrow">PREDICT · EXPERIMENT · EXPLAIN</div><h2>관찰을 근거로, 나만의 설명을.</h2></div><span class="model-kind"></span></div>
  <div class="inquiry-layout"><section class="inquiry-task"><label for="inquiryTask">오늘의 탐구</label><select id="inquiryTask"></select><h3 id="taskQuestion"></h3><ol id="taskSteps"></ol><p class="variable-guide"></p><details class="teacher-guide"><summary>교사용 발문과 해설</summary><p id="taskExpected"></p><h4>짚어 볼 오개념</h4><p id="taskMisconception"></p><p>권장 흐름: 예측 2분 → 비교 실험 5분 → 근거로 설명 3분. 결과가 예상과 다르면 통제한 조건부터 확인하세요.</p></details></section>
  <section class="inquiry-notes" aria-label="탐구 노트"><label for="predictionNote"><span>01 / 예측</span>바꾸기 전에, 어떻게 될 것 같나요?</label><textarea id="predictionNote" maxlength="6000" placeholder="만약 …을 바꾸면 …일 것이다. 그 이유는…"></textarea><label for="evidenceNote"><span>02 / 관찰</span>어떤 조건에서 무엇을 측정했나요?</label><textarea id="evidenceNote" maxlength="6000" placeholder="실험 1과 2에서 …은 같게 두고 …만 바꾸었다. 측정값은…"></textarea><label for="explanationNote"><span>03 / 설명</span>근거와 개념을 연결해 설명해 보세요.</label><textarea id="explanationNote" maxlength="6000" placeholder="측정 결과 …이므로 …라고 설명할 수 있다. 이 모형으로 알 수 없는 것은…"></textarea><p class="note-caption">이름·학번 입력 없이 이 브라우저에만 보관됩니다. 서버로 전송하지 않습니다.</p></section></div>
  <section class="evidence-section" aria-labelledby="evidenceHeading"><div class="evidence-heading"><h3 id="evidenceHeading">실험 조건과 측정값 비교 <span id="trialCount">0 / 8</span></h3><button class="secondary-btn" id="recordTrialBottom">＋ 기록 추가</button></div><div class="comparison-scroll" tabindex="0" role="region" aria-label="실험 비교 표"><table class="evidence-table" id="evidenceTable"></table></div><p id="emptyEvidence">조건을 바꾸고 ‘현재 조건 기록’을 눌러 보세요. 기록한 조건은 언제든 다시 불러올 수 있습니다.</p><div class="report-actions"><button id="downloadCSV" class="secondary-btn">비교 표 CSV</button><button id="downloadJSON" class="secondary-btn">실험 파일 저장</button><label class="secondary-btn file-button" for="importJSON">실험 파일 열기<input id="importJSON" type="file" accept="application/json,.json"></label><button id="shareConditions" class="secondary-btn">현재 조건 링크 복사</button><button id="printReport" class="secondary-btn">탐구 보고서 인쇄</button></div><p id="workbenchStatus" role="status" class="workbench-status">기록 파일에는 선택한 조건·측정값·작성한 노트가 포함됩니다.</p></section>
  <details class="model-details" id="modelDetails"><summary>이 모형으로 알 수 있는 것과 없는 것</summary><h3>계산과 표현</h3><p id="modelFormula"></p><h3>모형의 범위</h3><p id="modelLimits"></p><h3>근거 자료</h3><ul id="modelSources"></ul><p>계산식의 일관성과 화면 동작을 검증한 교육용 모형입니다. 학습 효과는 실제 수업 자료와 학생 면담으로 별도로 평가해야 합니다.</p></details>`;
  document.querySelector(".model-kind").textContent = config.kind;
  document.querySelector(".variable-guide").textContent = config.variables;
  $("modelFormula").textContent = config.formula;
  $("modelLimits").textContent = config.limits;
  for (const [title, url] of config.sources) {
    const li = create("li"),
      a = create("a", title);
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener";
    li.append(a);
    $("modelSources").append(li);
  }
  config.tasks.forEach((t, i) => {
    const opt = create(
      "option",
      `${String(i + 1).padStart(2, "0")} · ${t.title}`,
    );
    opt.value = i;
    $("inquiryTask").append(opt);
  });
  const notes = {
    predict: $("predictionNote"),
    observe: $("evidenceNote"),
    explain: $("explanationNote"),
  };
  notes.explain.value = oldNote;
  const status = (message) => ($("workbenchStatus").textContent = message);
  const metrics = () =>
    model.measure?.() ||
    Object.fromEntries(
      [...document.querySelectorAll("[data-reading]")].map((el) => [
        el.dataset.reading,
        el.textContent.trim(),
      ]),
    );
  function readState() {
    const state = { inputs: {}, choices: {} };
    for (const id of Object.keys(fields)) {
      const el = $(id);
      state.inputs[id] = el.type === "checkbox" ? el.checked : el.value;
    }
    const scenario = document.querySelector(
        '[data-scenario][aria-pressed="true"]',
      ),
      step = document.querySelector('[data-step][aria-pressed="true"]'),
      tilt = document.querySelector('[data-tilt][aria-pressed="true"]');
    if (scenario) state.choices.scenario = scenario.dataset.scenario;
    if (step) state.choices.step = Number(step.dataset.step);
    if (tilt) state.choices.tilt = Number(tilt.dataset.tilt);
    if (model.serialize) state.extra = model.serialize();
    model.normalizeState?.(state);
    return state;
  }
  function validate(state) {
    validateState(state, fields, model.validate);
    if (
      state.choices.scenario !== undefined &&
      !document.querySelector(
        `[data-scenario="${CSS.escape(String(state.choices.scenario))}"]`,
      )
    )
      throw new Error("알 수 없는 지형 유형입니다.");
    if (
      state.choices.step !== undefined &&
      (!Number.isInteger(state.choices.step) ||
        state.choices.step < 0 ||
        state.choices.step > 8)
    )
      throw new Error("단계가 범위를 벗어났습니다.");
    if (
      state.choices.tilt !== undefined &&
      ![0, 23.5].includes(state.choices.tilt)
    )
      throw new Error("자전축 조건이 올바르지 않습니다.");
    if (model.validateChoices && !model.validateChoices(state.choices))
      throw new Error("현재 지형의 단계가 아닙니다.");
  }
  function restore(state) {
    validate(state);
    model.pause?.();
    const choices = state.choices;
    if (choices.scenario !== undefined)
      document
        .querySelector(`[data-scenario="${CSS.escape(choices.scenario)}"]`)
        .click();
    if (choices.step !== undefined)
      document.querySelector(`[data-step="${choices.step}"]`)?.click();
    if (choices.tilt !== undefined)
      document.querySelector(`[data-tilt="${choices.tilt}"]`).click();
    for (const [id, value] of Object.entries(state.inputs)) {
      const el = $(id);
      if (el.type === "checkbox") {
        el.checked = value;
        el.dispatchEvent(new Event("change", { bubbles: true }));
      } else {
        el.value = value;
        el.dispatchEvent(new Event("input", { bubbles: true }));
        if (el.tagName === "SELECT")
          el.dispatchEvent(new Event("change", { bubbles: true }));
      }
    }
    model.restore?.(state.extra);
    Lab.invalidate?.();
    status("기록한 조건을 다시 불러왔습니다.");
  }
  function documentData() {
    return {
      version: RECORD_VERSION,
      modelVersion: MODEL_VERSION,
      page,
      task,
      records,
      notes: Object.fromEntries(
        Object.entries(notes).map(([k, el]) => [k, el.value]),
      ),
      exportedAt: new Date().toISOString(),
    };
  }
  function persist() {
    try {
      localStorage.setItem(notebookKey, JSON.stringify(documentData()));
      status(
        "이 브라우저에 저장했습니다. 공유 기기에서는 실험 파일로 별도 보관하세요.",
      );
    } catch {
      status(
        "브라우저 저장 공간이 부족합니다. 실험 파일 저장 버튼으로 보관해 주세요.",
      );
    }
  }
  function showTask() {
    const t = config.tasks[task];
    $("inquiryTask").value = task;
    $("taskQuestion").textContent = t.question;
    $("taskSteps").replaceChildren(
      ...t.steps.map((step) => create("li", step)),
    );
    $("taskExpected").textContent = t.expected;
    $("taskMisconception").textContent = t.misconception;
  }
  function showRecords() {
    const table = $("evidenceTable");
    table.replaceChildren();
    $("emptyEvidence").hidden = records.length > 0;
    $("trialCount").textContent = `${records.length} / 8`;
    if (!records.length) return;
    const caption = create(
      "caption",
      "조건을 다시 불러와 실험을 재현할 수 있습니다.",
    );
    table.append(caption);
    const head = create("thead"),
      row = create("tr");
    row.append(create("th", "측정 항목"));
    records.forEach((r, i) => {
      const th = create("th");
      th.scope = "col";
      th.append(create("b", `실험 ${i + 1}`));
      const restoreButton = create("button", "불러오기", "text-btn");
      restoreButton.addEventListener("click", () => {
        try {
          restore(r.state);
        } catch (e) {
          status(e.message);
        }
      });
      const remove = create("button", "삭제", "text-btn");
      remove.setAttribute("aria-label", `실험 ${i + 1} 삭제`);
      remove.onclick = () => {
        records.splice(i, 1);
        showRecords();
        persist();
      };
      th.append(restoreButton, remove);
      row.append(th);
    });
    head.append(row);
    table.append(head);
    const tbody = create("tbody"),
      keys = [...new Set(records.flatMap((r) => Object.keys(r.metrics)))];
    for (const key of keys) {
      const tr = create("tr"),
        th = create("th", key);
      th.scope = "row";
      tr.append(th);
      for (const r of records)
        tr.append(create("td", String(r.metrics[key] ?? "—")));
      tbody.append(tr);
    }
    table.append(tbody);
  }
  function record() {
    if (records.length >= 8) {
      status(
        "한 노트에는 8개 조건까지 기록합니다. 파일로 저장하거나 기록 하나를 삭제해 주세요.",
      );
      return;
    }
    const state = readState();
    try {
      validate(state);
    } catch (error) {
      status(error.message);
      return;
    }
    records.push({ state, metrics: metrics() });
    showRecords();
    persist();
    status(
      `실험 ${records.length}을 기록했습니다. 다음 조건을 바꾸어 비교해 보세요.`,
    );
  }
  $("recordTrial").onclick = record;
  $("recordTrialBottom").onclick = record;
  const figureButton = create(
    "button",
    page === "seoul" ? "개념도 SVG 저장" : "실험 그림 PNG 저장",
    "secondary-btn",
  );
  figureButton.id = "exportFigure";
  document.querySelector(".report-actions").prepend(figureButton);
  figureButton.onclick = () => {
    model.pause?.();
    if (model.figure) {
      saveFile(`${page}-figure.svg`, model.figure(), "image/svg+xml");
      status("현재 조건의 개념도를 저장했습니다.");
      return;
    }
    const canvas = Lab.snapshot?.() || document.querySelector(".stage canvas");
    if (!canvas) {
      status("현재 화면에서는 그림 저장을 지원하지 않습니다.");
      return;
    }
    try {
      canvas.toBlob((blob) => {
        if (!blob) {
          status("그림을 저장하지 못했습니다.");
          return;
        }
        const url = URL.createObjectURL(blob),
          link = create("a");
        link.download = `${page}-figure.png`;
        link.href = url;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        status(
          "현재 실험 그림을 저장했습니다. 해석에는 모형의 가정과 출처를 함께 제시하세요.",
        );
      }, "image/png");
    } catch {
      status(
        "그림 저장을 지원하지 않는 환경입니다. 실험 파일로 조건을 보관해 주세요.",
      );
    }
  };
  $("inquiryTask").onchange = () => {
    task = Number($("inquiryTask").value);
    showTask();
    persist();
  };
  for (const el of Object.values(notes))
    el.addEventListener("input", () => {
      clearTimeout(refreshTimer);
      refreshTimer = setTimeout(persist, 300);
    });
  $("downloadCSV").onclick = () => {
    saveFile(
      `${page}-comparison.csv`,
      recordsCSV(records),
      "text/csv;charset=utf-8",
    );
    status("비교 표와 재현 조건을 CSV로 저장했습니다.");
  };
  $("downloadJSON").onclick = () =>
    saveFile(
      `${page}-experiment.json`,
      JSON.stringify(documentData(), null, 2),
      "application/json",
    );
  $("importJSON").onchange = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      if (file.size > 4_000_000)
        throw new Error("4MB 이하의 실험 파일을 선택해 주세요.");
      const data = parseNotebook(await file.text(), page);
      if (data.modelVersion !== MODEL_VERSION)
        throw new Error(
          "모형 버전이 다른 기록입니다. 원래 버전에서 열어 주세요.",
        );
      for (const r of data.records) validate(r.state);
      if (data.task >= config.tasks.length)
        throw new Error("현재 실험에 없는 과제입니다.");
      if (
        records.length ||
        Object.values(notes).some((el) => el.value.trim())
      ) {
        saveFile(
          `${page}-before-import.json`,
          JSON.stringify(documentData(), null, 2),
          "application/json",
        );
      }
      records = data.records;
      task = data.task;
      for (const [key, el] of Object.entries(notes))
        el.value = data.notes?.[key] || "";
      showTask();
      showRecords();
      persist();
      status(
        "실험 파일을 열었습니다. 기존 기록이 있으면 백업 파일도 저장했습니다.",
      );
    } catch (error) {
      status(error.message);
    }
    event.target.value = "";
  };
  $("shareConditions").onclick = async () => {
    const state = readState();
    if (model.shareState) state.extra = model.shareState(state.extra);
    const url = new URL(location.href);
    url.hash =
      "lab=" +
      encodeURIComponent(
        JSON.stringify({
          version: RECORD_VERSION,
          modelVersion: MODEL_VERSION,
          page,
          state,
        }),
      );
    if (url.href.length > 7500) {
      status(
        "이 지형에는 직접 수정한 격자가 포함되어 있습니다. 실험 파일로 저장해 공유하세요.",
      );
      return;
    }
    try {
      await navigator.clipboard.writeText(url.href);
      status(
        "현재 조건 링크를 복사했습니다. 작성한 노트와 비교 기록은 포함되지 않습니다.",
      );
    } catch {
      status(
        "링크 복사를 지원하지 않는 환경입니다. 실험 파일을 저장해 공유해 주세요.",
      );
    }
  };
  $("presentationMode").onclick = () => {
    const active = document.body.classList.toggle("presentation-mode");
    $("presentationMode").setAttribute("aria-pressed", String(active));
    $("presentationMode").textContent = active ? "탐구 화면으로" : "수업 화면";
    window.dispatchEvent(new Event("resize"));
  };
  $("renderQuality").onchange = () => {
    Lab.quality = $("renderQuality").value;
    document.dispatchEvent(new CustomEvent("lab:quality"));
  };
  const preparePrint = () => {
    document.querySelectorAll(".printed-note").forEach((el) => el.remove());
    for (const el of Object.values(notes)) {
      const prose = create(
        "div",
        el.value || "아직 작성하지 않았습니다.",
        "printed-note",
      );
      el.after(prose);
    }
    document.body.classList.add("printing-report");
  };
  window.addEventListener("beforeprint", preparePrint);
  $("printReport").onclick = () => {
    preparePrint();
    window.print();
  };
  window.addEventListener("afterprint", () =>
    document.body.classList.remove("printing-report"),
  );
  if (document.body.dataset.design === "stratum") {
    document.querySelector(".workbench-heading h2").textContent = "탐구 기록";
    $("recordTrial").textContent = "조건 기록";
    $("recordTrialBottom").textContent = "기록 추가";
    $("exportFigure").textContent = "그림 저장";
    document.querySelector(".experiment-actions>a").textContent = "탐구 기록";
  }
  showTask();
  try {
    const saved = localStorage.getItem(notebookKey);
    if (saved) {
      const data = parseNotebook(saved, page);
      if (data.modelVersion !== MODEL_VERSION)
        throw new Error("이전 버전의 기록은 실험 파일을 통해 확인해 주세요.");
      data.records.forEach((r) => validate(r.state));
      records = data.records;
      task = Math.min(data.task, config.tasks.length - 1);
      Object.entries(notes).forEach(
        ([key, el]) => (el.value = data.notes?.[key] || ""),
      );
      showTask();
    }
  } catch {
    status("저장된 기록을 읽지 못했습니다. 새 노트로 시작합니다.");
  }
  showRecords();
  if (location.hash.startsWith("#lab=")) {
    try {
      const raw = decodeURIComponent(location.hash.slice(5));
      if (raw.length > 4_000_000) throw new Error("조건 링크가 너무 깁니다.");
      const shared = JSON.parse(raw);
      if (
        shared.version !== RECORD_VERSION ||
        shared.modelVersion !== MODEL_VERSION ||
        shared.page !== page
      )
        throw new Error("현재 실험의 조건 링크가 아닙니다.");
      restore(shared.state);
    } catch (error) {
      status(error.message);
    }
  }
  Lab.workbench = { readState, restore, record, documentData };
  if (model.profile) {
    const section = create("section", undefined, "profile-lab");
    section.innerHTML =
      '<div class="panel-heading"><h2>중앙 기준선의 표면 단면</h2><span>모형 단위</span></div><canvas id="processProfile" role="img" aria-label="현재 단계와 첫 단계의 중앙 단면 비교"></canvas><p>실선: 현재 단계 · 점선: 첫 단계. 변형 전 기준 위치에 대응하는 표면 높이입니다. 축척과 실제 형성 시간은 재현하지 않습니다.</p><details><summary>단면 수치 표</summary><div class="comparison-scroll"><table id="profileData"></table></div></details>';
    if (document.body.dataset.design === "stratum")
      section.querySelector("p").textContent =
        "실선: 현재 단계 · 점선: 첫 단계. 중앙 기준선의 지표·암석 상단 높이입니다. 수면과 해식 노치의 안쪽 벽은 이 높이 곡선에 포함하지 않습니다.";
    document.querySelector(".lab-visual").append(section);
    const render = fitCanvas($("processProfile"), (ctx, w, h) => {
      const profile = model.profile(),
        ys = [...profile.y, ...profile.baseline];
      let min = Math.min(...ys),
        max = Math.max(...ys);
      if (max - min < 1) max = min + 1;
      const pad = 36,
        gap = 12,
        x = (v) => pad + (v / (profile.y.length - 1)) * (w - pad - gap),
        y = (v) => h - 28 - ((v - min) / (max - min)) * (h - 48);
      ctx.clearRect(0, 0, w, h);
      line(ctx, pad, 12, pad, h - 28, "#8a9a8a");
      line(ctx, pad, h - 28, w - gap, h - 28, "#8a9a8a");
      for (const [values, color, dash] of [
        [profile.baseline, "#8b9b88", [4, 4]],
        [profile.y, "#b85635", []],
      ]) {
        for (let i = 1; i < values.length; i++)
          line(
            ctx,
            x(i - 1),
            y(values[i - 1]),
            x(i),
            y(values[i]),
            color,
            2,
            dash,
          );
      }
      text(ctx, max.toFixed(0), pad - 6, 18, 10, "#738073", "right");
      text(ctx, min.toFixed(0), pad - 6, h - 26, 10, "#738073", "right");
      text(ctx, String(profile.x[0]), pad, h - 7, 10, "#738073");
      text(
        ctx,
        String(profile.x.at(-1)),
        w - gap,
        h - 7,
        10,
        "#738073",
        "right",
      );
    });
    const update = () => {
      render();
      const p = model.profile(),
        table = $("profileData");
      table.replaceChildren();
      const row = create("tr");
      ["위치", "첫 단계", "현재 단계"].forEach((t) =>
        row.append(create("th", t)),
      );
      table.append(row);
      for (let i = 0; i < p.y.length; i += 5) {
        const r = create("tr");
        [p.x[i], p.baseline[i].toFixed(2), p.y[i].toFixed(2)].forEach((v) =>
          r.append(create("td", String(v))),
        );
        table.append(r);
      }
    };
    document.addEventListener("lab:change", update);
    update();
  }
  document.body.dataset.workbench = "ready";
}

import { curriculum } from "./sim-curriculum.mjs?v=6025bf3a";
import { fitCanvas, line, text } from "./sim-canvas.mjs?v=0a622b13";
// Observation tools only. No notebook, record collection or storage writes.
const $ = (id) => document.getElementById(id);
const create = (tag, content, cls) => {
  const el = document.createElement(tag);
  if (content !== undefined) el.textContent = content;
  if (cls) el.className = cls;
  return el;
};
function init() {
  const model = Lab.model || {},
    config = curriculum[document.body.dataset.lab];
  const toolbar = create("div", undefined, "experiment-actions");
  toolbar.innerHTML =
    '<button class="secondary-btn" id="presentationMode" aria-pressed="false">수업 화면</button><label class="quality-control" for="renderQuality">화질 <select id="renderQuality"><option value="balanced">균형</option><option value="eco">절전</option><option value="high">선명</option></select></label>';
  document.querySelector(".stage").after(toolbar);
  $("presentationMode").onclick = () => {
    const active = document.body.classList.toggle("presentation-mode");
    $("presentationMode").setAttribute("aria-pressed", String(active));
    $("presentationMode").textContent = active ? "기본 화면" : "수업 화면";
    window.dispatchEvent(new Event("resize"));
  };
  $("renderQuality").onchange = () => {
    Lab.quality = $("renderQuality").value;
    document.dispatchEvent(new CustomEvent("lab:quality"));
  };
  if (config) {
    const details = create("details", undefined, "model-details");
    details.innerHTML =
      '<summary>모형의 범위와 근거</summary><h3>계산과 표현</h3><p class="model-formula"></p><h3>표현의 한계</h3><p class="model-limits"></p><h3>근거 자료</h3><ul class="model-sources"></ul>';
    details.querySelector(".model-formula").textContent = config.formula;
    details.querySelector(".model-limits").textContent = config.limits;
    for (const [title, url] of config.sources) {
      const li = create("li"),
        a = create("a", title);
      a.href = url;
      a.target = "_blank";
      a.rel = "noopener";
      li.append(a);
      details.querySelector("ul").append(li);
    }
    document.querySelector(".lab-visual").append(details);
  }
  if (model.profile) {
    const section = create("section", undefined, "profile-lab");
    section.innerHTML =
      '<div class="panel-heading"><h2>중앙 기준선의 표면 단면</h2><span>모형 단위</span></div><canvas id="processProfile" role="img" aria-label="현재 단계와 첫 단계의 중앙 단면 비교"></canvas><p>실선: 현재 단계 · 점선: 첫 단계. 변형 전 기준 위치에 대응하는 표면 높이입니다. 축척과 실제 형성 시간은 재현하지 않습니다.</p><details><summary>단면 수치 표</summary><div class="comparison-scroll"><table id="profileData"></table></div></details>';
    if (document.body.dataset.lab === "world_landforms")
      section.querySelector("p").textContent =
        "실선: 현재 단계 · 점선: 첫 단계. 중앙 기준선의 지표·암석 상단 높이입니다. 수면과 해식 노치의 안쪽 벽은 이 높이 곡선에 포함하지 않습니다.";
    document.querySelector(".lab-visual").append(section);
    const render = fitCanvas($("processProfile"), (ctx, w, h) => {
      const style = getComputedStyle(document.documentElement),
        axis = style.getPropertyValue("--st-label-3").trim(),
        muted = style.getPropertyValue("--st-label-2").trim(),
        accent = style.getPropertyValue("--st-accent-ink").trim(),
        profile = model.profile(),
        ys = [...profile.y, ...profile.baseline];
      let min = Math.min(...ys),
        max = Math.max(...ys);
      if (max - min < 1) max = min + 1;
      const pad = 36,
        gap = 12,
        x = (v) => pad + (v / (profile.y.length - 1)) * (w - pad - gap),
        y = (v) => h - 28 - ((v - min) / (max - min)) * (h - 48);
      ctx.clearRect(0, 0, w, h);
      line(ctx, pad, 12, pad, h - 28, axis);
      line(ctx, pad, h - 28, w - gap, h - 28, axis);
      for (const [values, color, dash] of [
        [profile.baseline, axis, [4, 4]],
        [profile.y, accent, []],
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
      text(ctx, max.toFixed(0), pad - 6, 18, 10, muted, "right");
      text(ctx, min.toFixed(0), pad - 6, h - 26, 10, muted, "right");
      text(ctx, String(profile.x[0]), pad, h - 7, 10, muted);
      text(ctx, String(profile.x.at(-1)), w - gap, h - 7, 10, muted, "right");
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

  document.body.dataset.viewer = "ready";
}
if (document.body.dataset.ready === "true") init();
else document.addEventListener("lab:ready", init, { once: true });

/* Shared accessible controls. No dependencies; storage remains optional. */
(() => {
  const $ = (s) => document.querySelector(s);
  const $$ = (s) => [...document.querySelectorAll(s)];
  const page = document.body.dataset.lab;
  const storage = {
    get(key) {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set(key, value) {
      try {
        localStorage.setItem(key, value);
        return true;
      } catch {
        return false;
      }
    },
  };
  $("#themeToggle")?.addEventListener("click", () => {
    const dark = document.documentElement.dataset.theme !== "dark";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    storage.set("geo-theme", dark ? "dark" : "light");
    $("#themeToggle").setAttribute("aria-pressed", String(dark));
    document.dispatchEvent(new Event("lab:theme"));
  });
  $("#themeToggle")?.setAttribute(
    "aria-pressed",
    String(document.documentElement.dataset.theme === "dark"),
  );
  const mirrors = new Map();
  const paintRange = (input) => {
    input.style.setProperty(
      "--range",
      `${(100 * (input.value - input.min)) / (input.max - input.min)}%`,
    );
    const quick = mirrors.get(input);
    if (quick) {
      quick.input.value = input.value;
      quick.input.style.setProperty(
        "--range",
        input.style.getPropertyValue("--range"),
      );
      quick.output.textContent = quick.format(input.value);
    }
  };
  $$("input[type=range]").forEach((input) => {
    paintRange(input);
    input.addEventListener("input", () => paintRange(input));
  });
  // On small screens keep the primary control next to the visualization.
  const primary =
    $("#sunSlider") || $("#monthSlider") || $("#seaLevel") || $("#stageSlider");
  if (primary) {
    const quick = document.createElement("div");
    quick.className = "mobile-control";
    const id = primary.id + "Quick",
      label = document.createElement("label"),
      output = document.createElement("output"),
      input = document.createElement("input");
    const title = {
      sunSlider: "태양 고도",
      monthSlider: "계절",
      seaLevel: "해수면",
      stageSlider: "성장 단계",
    }[primary.id];
    label.htmlFor = id;
    label.textContent = title + " 빠른 조절";
    input.type = "range";
    input.id = id;
    for (const attr of ["min", "max", "step", "value"])
      input.setAttribute(attr, primary.getAttribute(attr));
    const format = (v) =>
      primary.id === "monthSlider"
        ? Math.floor(v) + "월"
        : primary.id === "sunSlider"
          ? v + "°"
          : primary.id === "seaLevel"
            ? v + " 단위"
            : v + "단계";
    mirrors.set(primary, { input, output, format });
    quick.append(label, output, input);
    $(".stage-foot").before(quick);
    input.addEventListener("input", () => {
      primary.value = input.value;
      primary.dispatchEvent(new Event("input", { bubbles: true }));
    });
    paintRange(primary);
  }
  const choices = $$("[data-scenario]");
  if (choices.length) {
    const quick = document.createElement("div");
    quick.className = "mobile-control mobile-select";
    const label = document.createElement("label");
    label.htmlFor = "quickScenario";
    label.textContent = "탐구 주제";
    const select = document.createElement("select");
    select.id = "quickScenario";
    choices.forEach((button) => {
      const option = document.createElement("option");
      option.value = button.dataset.scenario;
      option.textContent = button.querySelector("b").textContent;
      select.append(option);
      button.addEventListener(
        "click",
        () => (select.value = button.dataset.scenario),
      );
    });
    select.addEventListener("change", () =>
      choices.find((b) => b.dataset.scenario === select.value)?.click(),
    );
    quick.append(label, select);
    $(".stage-viewport").before(quick);
    new MutationObserver(() => {
      const active = choices.find(
        (b) => b.getAttribute("aria-pressed") === "true",
      );
      if (active) select.value = active.dataset.scenario;
    }).observe($(".scenario-list"), {
      attributes: true,
      subtree: true,
      attributeFilter: ["aria-pressed"],
    });
  }
  $$("[data-preset]").forEach((button) =>
    button.addEventListener("click", () => {
      const input = document.getElementById(button.dataset.target);
      if (!input) return;
      input.value = button.dataset.preset;
      input.dispatchEvent(new Event("input", { bubbles: true }));
    }),
  );
  $$("[data-fullscreen]").forEach((button) => {
    if (!document.fullscreenEnabled) {
      button.hidden = true;
      return;
    }
    button.addEventListener("click", async () => {
      try {
        if (document.fullscreenElement) await document.exitFullscreen();
        else await button.closest(".stage").requestFullscreen();
      } catch {
        button.title = "이 브라우저에서는 전체 화면을 사용할 수 없습니다";
      }
    });
  });
  document.addEventListener("fullscreenchange", () => {
    $$("[data-fullscreen]").forEach((button) => {
      button.setAttribute("aria-pressed", String(!!document.fullscreenElement));
      button.setAttribute(
        "aria-label",
        document.fullscreenElement ? "전체 화면 닫기" : "전체 화면 열기",
      );
    });
    window.dispatchEvent(new Event("resize"));
  });
  const note = $("#observationNote"),
    status = $("#noteStatus");
  if (note) {
    note.value = storage.get(`geo-lab-note-${page}`) || "";
    note.addEventListener("input", () => {
      status.textContent = storage.set(`geo-lab-note-${page}`, note.value)
        ? "이 기기에 저장되었습니다"
        : "저장 공간을 사용할 수 없습니다. 메모를 복사해 주세요.";
    });
  }
  $("#copyNote")?.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(note.value);
      status.textContent = "메모를 복사했습니다";
    } catch {
      note.focus();
      note.select();
      status.textContent = "선택한 메모를 복사해 주세요";
    }
  });
  let snapshots = [];
  function renderSnapshots() {
    const list = $("#snapshotList");
    list.replaceChildren();
    snapshots.forEach((entry, i) => {
      const item = document.createElement("div");
      item.className = "snapshot";
      const title = document.createElement("b");
      title.textContent = `관찰 ${i + 1} · ${entry.title}`;
      item.append(
        title,
        document.createElement("br"),
        document.createTextNode(entry.values),
      );
      list.append(item);
    });
  }
  $("#captureState")?.addEventListener("click", () => {
    const values = $$("[data-reading]")
      .map((el) => `${el.dataset.reading} ${el.textContent.trim()}`)
      .join(" · ");
    const title = $("[data-state-title]")?.textContent.trim() || "현재 조건";
    if (snapshots.length === 2) snapshots.shift();
    snapshots.push({ title, values });
    renderSnapshots();
    $("#snapshotStatus").textContent = "최근 두 조건을 나란히 비교해 보세요.";
  });
  $("#clearSnapshots")?.addEventListener("click", () => {
    snapshots = [];
    renderSnapshots();
    $("#snapshotStatus").textContent = "비교 기록을 비웠습니다.";
  });
  $$("[data-filter]").forEach((button) =>
    button.addEventListener("click", () => {
      $$("[data-filter]").forEach((b) =>
        b.setAttribute("aria-pressed", String(b === button)),
      );
      let count = 0;
      $$(".experiment-card").forEach((card) => {
        card.hidden =
          button.dataset.filter !== "all" &&
          card.dataset.category !== button.dataset.filter;
        if (!card.hidden) count++;
      });
      $("#filterCount").textContent =
        `실험 ${count}개`;
    }),
  );
  window.Lab = {
    quality: "balanced",
    model: null,
    register(model) {
      this.model = model;
    },
    changed() {
      document.dispatchEvent(new Event("lab:change"));
      this.invalidate?.();
    },
    paintRange,
    ready() {
      document.body.dataset.ready = "true";
      document.dispatchEvent(new Event("lab:ready"));
    },
    setPresets(id, value) {
      $$(`[data-target="${id}"]`).forEach((b) =>
        b.setAttribute(
          "aria-pressed",
          String(Math.abs(Number(b.dataset.preset) - value) < 0.05),
        ),
      );
      const input = document.getElementById(id);
      if (input) paintRange(input);
    },
  };
  if (page === "simulators") Lab.ready();
})();

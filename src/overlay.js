// ISOLATED world — 가사 오버레이 UI. content.js 보다 먼저 주입되어 window.__yltt_overlay 로 노출.
// (content script 는 ESM import 불가 → 같은 ISOLATED world 의 window 로 함수 공유)
// 가사·번역은 외부 입력이므로 textContent 로만 삽입(innerHTML 금지, XSS 방지 — plan 보안).
(function () {
  let container = null;
  let lineEls = [];
  let activeIdx = -1;

  function mount() {
    if (container && document.documentElement.contains(container)) return;
    container = document.createElement("div");
    container.id = "yltt-overlay";
    document.documentElement.appendChild(container);
  }

  // segments: [{id, timeMs, text, translated}] — 원문 아래 번역을 병기(번역 없으면 원문만)
  function setLyrics(segments) {
    mount();
    container.replaceChildren();
    lineEls = segments.map((seg) => {
      const line = document.createElement("div");
      line.className = "yltt-line";

      const orig = document.createElement("div");
      orig.className = "yltt-orig";
      orig.textContent = seg.text;
      line.appendChild(orig);

      if (seg.translated) {
        const tr = document.createElement("div");
        tr.className = "yltt-trans";
        tr.textContent = seg.translated;
        line.appendChild(tr);
      }

      container.appendChild(line);
      return line;
    });
    activeIdx = -1;
    container.style.display = segments.length ? "block" : "none";
  }

  function highlight(idx) {
    if (idx === activeIdx) return;
    if (lineEls[activeIdx]) lineEls[activeIdx].classList.remove("yltt-active");
    const el = lineEls[idx];
    if (el) {
      el.classList.add("yltt-active");
      el.scrollIntoView({ block: "center", behavior: "smooth" });
    }
    activeIdx = idx;
  }

  function clear() {
    if (container) {
      container.replaceChildren();
      container.style.display = "none";
    }
    lineEls = [];
    activeIdx = -1;
  }

  window.__yltt_overlay = { setLyrics, highlight, clear };
})();

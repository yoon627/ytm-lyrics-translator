// ISOLATED world — 가사 오버레이 UI. content.js 보다 먼저 주입되어 window.__yltt_overlay 로 노출.
// (content script 는 ESM import 불가 → 같은 ISOLATED world 의 window 로 함수 공유)
// 가사는 외부 입력이므로 textContent 로만 삽입(innerHTML 금지, XSS 방지 — plan 보안).
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

  function setLyrics(segments) {
    mount();
    container.replaceChildren(); // 기존 줄 제거(innerHTML 사용 안 함)
    lineEls = segments.map((seg) => {
      const el = document.createElement("div");
      el.className = "yltt-line";
      el.textContent = seg.text; // XSS 방지
      container.appendChild(el);
      return el;
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

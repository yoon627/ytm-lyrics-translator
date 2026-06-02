// ISOLATED world content script — MAIN world 의 player 업데이트를 받아 가사를 요청하고,
// 재생 위치에 맞춰 오버레이(window.__yltt_overlay)의 현재 줄을 갱신한다.
// 이후 단계에서 번역·정식 stale 폐기(requestId)·캐시를 붙인다.
(function () {
  const EVENT = "yltt:player-update";

  let currentVideoId = null;
  let requestedFor = null; // 가사 요청을 보낸 videoId (곡당 1회)
  let segments = null; // 현재 곡의 가사 [{id, timeMs, text}]

  // lrc.js findCurrentIndex 와 동일 알고리즘(이진탐색). content script 는 ESM import 불가라 인라인.
  function findCurrentIndex(segs, timeMs) {
    let lo = 0;
    let hi = segs.length - 1;
    let ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (segs[mid].timeMs <= timeMs) {
        ans = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return ans;
  }

  document.addEventListener(EVENT, (e) => {
    const d = e.detail;

    if (d.videoId !== currentVideoId) {
      currentVideoId = d.videoId;
      segments = null;
      window.__yltt_overlay.clear();
      console.log(`[yltt] ▶ track change: ${d.videoId}`);
    }

    // 제목이 채워졌고 아직 이 곡을 요청하지 않았으면 가사 요청
    if (d.videoId && d.title && requestedFor !== d.videoId) {
      requestedFor = d.videoId;
      console.log(`[yltt] ▶ track: ${d.author} — ${d.title} (${d.durationSec}s)`);
      requestLyrics(d.videoId, { artist: d.author, track: d.title, durationSec: d.durationSec });
    }

    // 재생 위치에 맞춰 현재 줄 하이라이트
    if (segments && segments.length) {
      window.__yltt_overlay.highlight(findCurrentIndex(segments, d.currentTimeMs));
    }
  });

  async function requestLyrics(videoId, query) {
    try {
      const resp = await chrome.runtime.sendMessage({ type: "getLyrics", query });
      if (currentVideoId !== videoId) return; // 응답 도착 전 곡이 바뀜 — 폐기(간이 stale 방어)
      if (resp && resp.status === "ok") {
        segments = resp.segments;
        window.__yltt_overlay.setLyrics(segments);
        console.log(`[yltt] ✓ lyrics: ${segments.length} lines`);
      } else {
        console.log(`[yltt] ✗ lyrics: ${resp?.status ?? "no response"}${resp?.reason ? " (" + resp.reason + ")" : ""}`);
      }
    } catch (err) {
      console.log("[yltt] ✗ lyrics error:", err?.message || err);
    }
  }

  console.log("[yltt] content script (ISOLATED world) loaded");
})();

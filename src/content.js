// ISOLATED world content script — MAIN world(main-world.js)가 보낸 player 업데이트를 수신,
// 곡 메타(제목·길이)가 채워진 뒤 background service worker 에 가사를 요청한다.
// 이후 단계에서 상태 머신·requestId·오버레이·번역을 붙인다.
//
// 4단계 목표(수동 확인): 곡 재생 → 메타 확정 후 LRCLIB 호출 → 가사 줄 수가 콘솔에 찍히는지.
(function () {
  const EVENT = "yltt:player-update";

  let currentVideoId = null;
  let requestedFor = null; // 이미 가사 요청을 보낸 videoId (곡당 1회)
  let lastTimeLogMs = 0;

  document.addEventListener(EVENT, (e) => {
    const d = e.detail;

    if (d.videoId !== currentVideoId) {
      currentVideoId = d.videoId;
      lastTimeLogMs = 0;
      console.log(`[yltt] ▶ track change: videoId=${d.videoId} (meta 대기…)`);
    }

    // 제목이 채워졌고 이 곡을 아직 요청하지 않았을 때만 요청(트랙당 1회; duration 은 있으면 매칭 정밀도에 사용)
    if (d.videoId && d.title && requestedFor !== d.videoId) {
      requestedFor = d.videoId;
      console.log(`[yltt] ▶ track: ${d.author} — ${d.title} (${d.durationSec}s)`);
      requestLyrics({ artist: d.author, track: d.title, durationSec: d.durationSec });
    }

    // 시간 흐름 확인용 (약 5초마다, seek 되감기 시 즉시)
    if (d.currentTimeMs - lastTimeLogMs >= 5000 || d.currentTimeMs < lastTimeLogMs) {
      console.log(`[yltt]   t = ${(d.currentTimeMs / 1000).toFixed(1)}s`);
      lastTimeLogMs = d.currentTimeMs;
    }
  });

  async function requestLyrics(query) {
    try {
      const resp = await chrome.runtime.sendMessage({ type: "getLyrics", query });
      if (!resp) {
        console.log("[yltt] ✗ lyrics: no response from service worker");
      } else if (resp.status === "ok") {
        console.log(`[yltt] ✓ lyrics: ${resp.segments.length} lines — ${resp.artistName} - ${resp.trackName}`);
      } else {
        console.log(`[yltt] ✗ lyrics: ${resp.status}${resp.reason ? " (" + resp.reason + ")" : ""}`);
      }
    } catch (err) {
      console.log("[yltt] ✗ lyrics request error:", err?.message || err);
    }
  }

  console.log("[yltt] content script (ISOLATED world) loaded");
})();

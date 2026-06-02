// ISOLATED world content script — MAIN world(main-world.js)가 보낸 player 업데이트를 수신한다.
// 이후 단계에서 여기에 상태 머신·requestId·오버레이·background 통신을 붙인다.
//
// G1 단계 목표: 곡 감지와 시간 동기화가 실제로 도는지 콘솔로 확인(자동 테스트 불가 → 수동 검증).
(function () {
  const EVENT = "yltt:player-update";

  let lastVideoId = null;
  let lastTimeLogMs = 0;

  document.addEventListener(EVENT, (e) => {
    const d = e.detail;

    // 트랙 전환 로그
    if (d.videoId !== lastVideoId) {
      console.log(`[yltt] ▶ track: ${d.author} — ${d.title}  (videoId=${d.videoId})`);
      lastVideoId = d.videoId;
      lastTimeLogMs = 0;
    }

    // 시간 흐름 확인: 약 2초마다 한 번 (seek 으로 되감기면 즉시 한 번 더)
    if (d.currentTimeMs - lastTimeLogMs >= 2000 || d.currentTimeMs < lastTimeLogMs) {
      console.log(`[yltt]   t = ${(d.currentTimeMs / 1000).toFixed(1)}s`);
      lastTimeLogMs = d.currentTimeMs;
    }
  });

  console.log("[yltt] content script (ISOLATED world) loaded");
})();

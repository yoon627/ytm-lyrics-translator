// MAIN world 스크립트 — 페이지 컨텍스트에서 실행되어 YouTube 내부 #movie_player 객체에 접근한다.
// ISOLATED world content script 는 이 객체(JS 변수)를 볼 수 없으므로, 여기서 읽어
// CustomEvent 로 ISOLATED world 에 전달한다. (DOM 은 두 world 가 공유)
(function () {
  const EVENT = "yltt:player-update";
  const TICK_MS = 250; // MAIN→ISOLATED 시간 전달 주기 (G1 에서 실측해 조정 예정)

  let player = null;
  let lastVideoId = null;

  function getPlayer() {
    if (player && typeof player.getVideoData === "function") return player;
    const el = document.getElementById("movie_player");
    if (el && typeof el.getVideoData === "function" && typeof el.getCurrentTime === "function") {
      player = el;
    }
    return player;
  }

  function tick() {
    const p = getPlayer();
    if (!p) return; // player 아직 미생성 (SPA 초기/페이지 전환 중)

    let data;
    let currentTimeSec;
    let durationSec;
    try {
      data = p.getVideoData();
      currentTimeSec = p.getCurrentTime();
      durationSec = p.getDuration();
    } catch (_) {
      return; // player 준비 안 됨 — 다음 tick 에 재시도
    }
    if (!data || !data.video_id) {
      // 광고/로딩 등 video_id 없는 구간 — 직전에 곡이 있었으면 1회 통지해 오버레이를 내린다.
      if (lastVideoId !== null) {
        lastVideoId = null;
        document.dispatchEvent(new CustomEvent(EVENT, { detail: { videoId: null, title: "", author: "", currentTimeMs: 0, durationSec: 0 } }));
      }
      return;
    }

    const detail = {
      videoId: data.video_id,
      title: data.title || "",
      author: data.author || "",
      currentTimeMs: Math.round((currentTimeSec || 0) * 1000), // 초(float) → ms (plan: 변환 위치)
      durationSec: Math.round(durationSec || 0), // 곡 전체 길이 — LRCLIB duration 매칭(±2초)용
      trackChanged: data.video_id !== lastVideoId,
    };
    lastVideoId = data.video_id;
    document.dispatchEvent(new CustomEvent(EVENT, { detail }));
  }

  setInterval(tick, TICK_MS);
})();

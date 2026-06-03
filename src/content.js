// ISOLATED world content script — MAIN world 의 player 업데이트를 받아 가사를 요청하고,
// 재생 위치에 맞춰 오버레이(window.__yltt_overlay)의 현재 줄을 갱신한다.
// 번역은 background(SW)가 처리해 segments[].translated 로 담아 응답한다.
// stale 폐기: 요청마다 requestSeq 발급 → 응답은 최신 seq 일 때만 수용(A→B→A·out-of-order 폐기).
// sync.js 와 동일 로직을 인라인(content script 는 ESM import 불가 — overlay/findCurrentIndex 선례).
(function () {
  const EVENT = "yltt:player-update";

  let state = createSyncState(); // { videoId, requestedFor, seq } — sync.js 미러
  let segments = null; // 현재 곡의 가사 [{id, timeMs, text, translated}]

  // --- sync.js 와 바이트 동일 유지 (content script ESM 불가). 수정 시 src/sync.js + tests/sync.test.js 동시 변경 필수 ---
  function createSyncState() {
    return { videoId: null, requestedFor: null, seq: 0 };
  }
  function onPlayer(s, evt) {
    let { videoId, requestedFor, seq } = s;
    let trackChanged = false;
    if (evt.videoId !== videoId) {
      videoId = evt.videoId;
      trackChanged = true;
      requestedFor = null; // 트랙 바뀜 → 요청 표식 해제(A→광고(videoId null)→A 복귀 시 재요청 보장)
      seq += 1; // 트랙 전환 즉시 이전 트랙 in-flight 응답 무효화(C1: title 지연 창 + 캐시 즉답 race 차단)
    }
    let request = null;
    if (evt.videoId && evt.title && requestedFor !== evt.videoId) {
      requestedFor = evt.videoId;
      request = { reqSeq: seq };
    }
    return { state: { videoId, requestedFor, seq }, trackChanged, request };
  }
  function isFresh(s, reqSeq) {
    return reqSeq === s.seq;
  }

  // lrc.js findCurrentIndex 와 동일 알고리즘(이진탐색).
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
    const r = onPlayer(state, d);
    state = r.state;

    if (r.trackChanged) {
      segments = null;
      window.__yltt_overlay.clear();
      console.log(d.videoId ? `[yltt] ▶ track change: ${d.videoId}` : "[yltt] ▶ no video (ad/loading) — overlay cleared");
    }

    if (r.request) {
      console.log(`[yltt] ▶ track: ${d.author} — ${d.title} (${d.durationSec}s)`);
      requestLyrics(r.request.reqSeq, { artist: d.author, track: d.title, durationSec: d.durationSec, videoId: d.videoId });
    }

    if (segments && segments.length) {
      window.__yltt_overlay.highlight(findCurrentIndex(segments, d.currentTimeMs));
    }
  });

  async function requestLyrics(reqSeq, query) {
    try {
      const resp = await chrome.runtime.sendMessage({ type: "getLyrics", query });
      if (!isFresh(state, reqSeq)) return; // stale 폐기 — 응답 도착 전 더 새 요청이 발사됨(성공/실패 공통)

      if (resp && resp.status === "ok") {
        segments = resp.segments;
        window.__yltt_overlay.setLyrics(segments);
        const n = segments.filter((s) => s.translated).length;
        console.log(`[yltt] ✓ lyrics: ${segments.length} lines, ${n} translated${resp.translateError ? " (translate error: " + resp.translateError + ")" : ""}`);
      } else {
        console.log(`[yltt] ✗ lyrics: ${resp?.status ?? "no response"}${resp?.reason ? " (" + resp.reason + ")" : ""}`);
      }
    } catch (err) {
      if (!isFresh(state, reqSeq)) return; // catch 도 동일 가드 — stale 실패가 최신 트랙 상태를 덮어쓰지 않게
      console.log("[yltt] ✗ lyrics error:", err?.message || err);
    }
  }

  console.log("[yltt] content script (ISOLATED world) loaded");
})();

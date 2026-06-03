// ISOLATED world 의 트랙/요청 상태 전이(순수 함수). content.js 가 같은 로직을 인라인 사용한다
// (content script 는 ESM import 불가 — overlay/findCurrentIndex 선례와 동일 트레이드오프).
//
// stale 응답 폐기: 트랙이 바뀔 때마다 seq 를 증가시키고(이전 트랙 in-flight 무효화), 가사 요청은
// 그 seq 를 캡처해 발사한다. 응답은 reqSeq === 현재 seq 일 때만 수용 → A→B→A·out-of-order·
// 트랙 전환 직후 title 지연 창의 옛 응답(캐시 즉답 포함)을 모두 폐기한다.

export function createSyncState() {
  return { videoId: null, requestedFor: null, seq: 0 };
}

// player tick 이벤트(main-world)를 받아 다음 상태와 부수효과를 결정한다.
// 반환: { state, trackChanged, request }
//  - trackChanged: videoId 가 바뀜 → 호출부가 segments 무효화 + 오버레이 clear
//  - request: 가사 요청을 보내야 하면 { reqSeq }, 아니면 null
export function onPlayer(state, evt) {
  let { videoId, requestedFor, seq } = state;

  let trackChanged = false;
  if (evt.videoId !== videoId) {
    videoId = evt.videoId;
    trackChanged = true;
    requestedFor = null; // 트랙 바뀜 → 요청 표식 해제(A→광고(videoId null)→A 복귀 시 재요청 보장)
    seq += 1; // 트랙 전환 즉시 이전 트랙 in-flight 응답 무효화(C1: title 지연 창 + 캐시 즉답 race 차단)
  }

  // 트랙당 1회만 요청. title 이 채워진 뒤에 발사(빈 메타로 LRCLIB 400 방지). seq 는 위에서 이미 증가.
  let request = null;
  if (evt.videoId && evt.title && requestedFor !== evt.videoId) {
    requestedFor = evt.videoId;
    request = { reqSeq: seq };
  }

  return { state: { videoId, requestedFor, seq }, trackChanged, request };
}

// 응답 수용 판정: 그 응답을 유발한 요청(reqSeq)이 아직 최신 요청인가.
export function isFresh(state, reqSeq) {
  return reqSeq === state.seq;
}

import test from "node:test";
import assert from "node:assert/strict";

import { createSyncState, onPlayer, isFresh } from "../src/sync.js";

// sync.js = ISOLATED world 트랙/요청 상태 전이(순수). content.js 가 같은 로직을 인라인 복제
// (content script 는 ESM import 불가 — findCurrentIndex/overlay 선례). 여기서 시퀀스로 race 를 검증한다.
//
// 핵심: stale 폐기 = "요청당 단조증가 requestSeq". 응답은 reqSeq === 현재 seq 일 때만 수용.
// (트랙 식별·오버레이 clear·재요청 트리거는 videoId 가 담당 — epoch 별도 불필요.)

// --- createSyncState ---
test("초기 상태", () => {
  assert.deepEqual(createSyncState(), { videoId: null, requestedFor: null, seq: 0 });
});

// --- onPlayer: 트랙 변경 / 요청 트리거 ---
test("첫 트랙(videoId+title) → trackChanged + 첫 요청(seq=1)", () => {
  const r = onPlayer(createSyncState(), { videoId: "A", title: "song", author: "x", durationSec: 100 });
  assert.equal(r.trackChanged, true);
  assert.deepEqual(r.request, { reqSeq: 1 });
  assert.deepEqual(r.state, { videoId: "A", requestedFor: "A", seq: 1 });
});

test("title 미도착 → 트랙은 바뀌나 요청 보류(메타 대기)", () => {
  const r = onPlayer(createSyncState(), { videoId: "A", title: "", durationSec: 0 });
  assert.equal(r.trackChanged, true); // overlay clear 는 해야 함
  assert.equal(r.request, null); // title 없어 LRCLIB 요청 안 함
  assert.equal(r.state.seq, 1); // 트랙 변경 시 seq++ — 이전 트랙 in-flight 무효화(C1)
  assert.equal(r.state.requestedFor, null);
});

test("같은 트랙 반복 tick → 재요청 없음(트랙당 1회), trackChanged false", () => {
  let s = onPlayer(createSyncState(), { videoId: "A", title: "song" }).state;
  const r = onPlayer(s, { videoId: "A", title: "song", currentTimeMs: 5000 });
  assert.equal(r.trackChanged, false);
  assert.equal(r.request, null);
  assert.equal(r.state.seq, 1); // 불변
});

test("트랙 변경 A→B → seq=2 새 요청 + trackChanged", () => {
  let s = onPlayer(createSyncState(), { videoId: "A", title: "a" }).state;
  const r = onPlayer(s, { videoId: "B", title: "b" });
  assert.equal(r.trackChanged, true);
  assert.deepEqual(r.request, { reqSeq: 2 });
  assert.equal(r.state.videoId, "B");
  assert.equal(r.state.requestedFor, "B");
});

// --- isFresh: 응답 수용 판정 ---
test("isFresh: 최신 seq 만 수용", () => {
  const s = { videoId: "A", requestedFor: "A", seq: 3 };
  assert.equal(isFresh(s, 3), true);
  assert.equal(isFresh(s, 2), false);
  assert.equal(isFresh(s, 1), false);
});

// --- race 시나리오 (plan-review P0) ---
test("A→B→A: 늦게 온 첫 A 응답(seq1) 폐기, 복귀 A 응답(seq3) 수용", () => {
  let s = createSyncState();
  const rA1 = onPlayer(s, { videoId: "A", title: "a" }); s = rA1.state; // seq1
  const rB = onPlayer(s, { videoId: "B", title: "b" }); s = rB.state; // seq2
  const rA2 = onPlayer(s, { videoId: "A", title: "a" }); s = rA2.state; // seq3
  assert.equal(rA1.request.reqSeq, 1);
  assert.equal(rB.request.reqSeq, 2);
  assert.equal(rA2.request.reqSeq, 3);
  assert.equal(isFresh(s, 1), false); // 첫 A — 폐기
  assert.equal(isFresh(s, 2), false); // B — 폐기
  assert.equal(isFresh(s, 3), true); // 복귀 A — 수용
});

test("seek(같은 트랙 시간 점프) → 재요청 없음, 진행 중 응답 여전히 fresh", () => {
  let s = onPlayer(createSyncState(), { videoId: "A", title: "a", currentTimeMs: 0 }).state; // seq1
  const r = onPlayer(s, { videoId: "A", title: "a", currentTimeMs: 90000 }); // seek
  assert.equal(r.request, null);
  assert.equal(r.state.seq, 1);
  assert.equal(isFresh(r.state, 1), true); // 첫 요청 응답이 아직 유효
});

test("loop(같은 videoId 무한 반복) → seq 불변, 재요청 없음", () => {
  let s = onPlayer(createSyncState(), { videoId: "A", title: "a" }).state;
  for (let i = 0; i < 5; i++) {
    s = onPlayer(s, { videoId: "A", title: "a", currentTimeMs: i * 1000 }).state;
  }
  assert.equal(s.seq, 1);
});

// --- title-lag stale window (code-review C1): 트랙 전환 직후 빈 title 창에서 ---
// 이전 트랙 in-flight 응답(특히 캐시 히트로 즉시 도착)이 새 트랙 화면을 덮는 race.
test("트랙 변경은 title 빈값이어도 in-flight 무효화(seq 증가)", () => {
  const s = onPlayer(createSyncState(), { videoId: "A", title: "a" }).state; // seq1 발사
  const r = onPlayer(s, { videoId: "B", title: "" }); // B 진입, title 아직 빈 값
  assert.equal(r.trackChanged, true);
  assert.equal(r.request, null); // title 없어 요청은 보류
  assert.equal(r.state.seq, 2); // 그러나 seq 는 증가 → A 의 seq1 in-flight 무효화
});

test("A 요청 in-flight 중 B(title='') 진입 → A 응답이 stale 로 폐기", () => {
  let s = createSyncState();
  s = onPlayer(s, { videoId: "A", title: "a" }).state; // seq1 발사
  s = onPlayer(s, { videoId: "B", title: "" }).state; // 트랙 B, title 지연
  assert.equal(isFresh(s, 1), false); // 즉시 온 A(캐시) 응답이 B 화면을 덮지 않음
});

test("B title 늦게 채워짐 → 새 seq 로 정상 재요청", () => {
  let s = createSyncState();
  s = onPlayer(s, { videoId: "A", title: "a" }).state; // seq1
  s = onPlayer(s, { videoId: "B", title: "" }).state; // seq2, 요청 보류
  const r = onPlayer(s, { videoId: "B", title: "b" }); // title 도착
  assert.deepEqual(r.request, { reqSeq: 2 });
  assert.equal(r.state.requestedFor, "B");
  assert.equal(isFresh(r.state, 2), true);
});

// --- 광고/로딩 구간 (video_id 소실 → 오버레이 clear, 복귀 시 재요청) ---
test("광고 진입(videoId null) → trackChanged(clear 유도), 요청 없음, seq 증가", () => {
  const s = onPlayer(createSyncState(), { videoId: "A", title: "a" }).state; // {A,A,1}
  const r = onPlayer(s, { videoId: null, title: "" }); // 광고 — video_id 소실
  assert.equal(r.trackChanged, true); // 오버레이 clear 유도
  assert.equal(r.request, null);
  assert.equal(r.state.videoId, null);
  assert.equal(r.state.seq, 2); // 이전 곡 in-flight 무효화
});

test("광고 후 같은 곡 복귀 → 재요청(requestedFor 리셋)", () => {
  let s = createSyncState();
  s = onPlayer(s, { videoId: "A", title: "a" }).state; // {A,A,1}
  s = onPlayer(s, { videoId: null, title: "" }).state; // 광고로 clear
  const r = onPlayer(s, { videoId: "A", title: "a" }); // 복귀 — 다시 요청해야 함
  assert.deepEqual(r.request, { reqSeq: 3 });
  assert.equal(r.state.requestedFor, "A");
});

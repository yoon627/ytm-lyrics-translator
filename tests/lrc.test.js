import test from "node:test";
import assert from "node:assert/strict";

import { parseLrc, findCurrentIndex } from "../src/lrc.js";

// --- parseLrc: 타임스탬프 → ms 변환 ---
test("기본 [mm:ss.xx] 파싱 (2자리 ms = 1/100초)", () => {
  assert.deepEqual(parseLrc("[00:12.34]Hello"), [{ id: 0, timeMs: 12340, text: "Hello" }]);
});

test("3자리 ms [mm:ss.xxx] (1/1000초)", () => {
  assert.deepEqual(parseLrc("[00:12.345]Hi"), [{ id: 0, timeMs: 12345, text: "Hi" }]);
});

test("소수부 없는 [mm:ss]", () => {
  assert.deepEqual(parseLrc("[01:05]X"), [{ id: 0, timeMs: 65000, text: "X" }]);
});

// --- parseLrc: 구조 처리 (plan-reviewer high 지적 케이스) ---
test("메타태그 줄([ar:],[ti:] 등)은 제외", () => {
  const lrc = "[ar:Adele]\n[ti:Hello]\n[length:04:55]\n[00:01.00]Hi";
  assert.deepEqual(parseLrc(lrc), [{ id: 0, timeMs: 1000, text: "Hi" }]);
});

test("한 줄 다중 타임스탬프는 각각 전개(같은 텍스트)", () => {
  assert.deepEqual(parseLrc("[00:10.00][00:20.00]Chorus"), [
    { id: 0, timeMs: 10000, text: "Chorus" },
    { id: 1, timeMs: 20000, text: "Chorus" },
  ]);
});

test("빈 텍스트 줄(간주/공백)도 세그먼트로 유지", () => {
  assert.deepEqual(parseLrc("[00:30.00]"), [{ id: 0, timeMs: 30000, text: "" }]);
});

test("timeMs 오름차순 정렬 + id 재부여", () => {
  const segs = parseLrc("[00:20.00]B\n[00:10.00]A");
  assert.deepEqual(segs, [
    { id: 0, timeMs: 10000, text: "A" },
    { id: 1, timeMs: 20000, text: "B" },
  ]);
});

test("CRLF 줄바꿈 처리", () => {
  assert.deepEqual(parseLrc("[00:01.00]A\r\n[00:02.00]B").map((s) => s.text), ["A", "B"]);
});

test("앞뒤 공백 trim", () => {
  assert.deepEqual(parseLrc("[00:01.00]  spaced  "), [{ id: 0, timeMs: 1000, text: "spaced" }]);
});

// --- findCurrentIndex: 현재 재생 줄 이진탐색 (경계 케이스) ---
// parseLrc 와 분리해 세그먼트 배열을 직접 주입(단위 독립)
const sample = [
  { id: 0, timeMs: 10000, text: "A" },
  { id: 1, timeMs: 20000, text: "B" },
  { id: 2, timeMs: 30000, text: "C" },
];

test("findCurrentIndex: 첫 줄 이전(인트로)은 -1", () => {
  assert.equal(findCurrentIndex(sample, 5000), -1);
});

test("findCurrentIndex: 타임스탬프 정확 일치", () => {
  assert.equal(findCurrentIndex(sample, 10000), 0);
  assert.equal(findCurrentIndex(sample, 30000), 2);
});

test("findCurrentIndex: 두 줄 사이", () => {
  assert.equal(findCurrentIndex(sample, 15000), 0);
  assert.equal(findCurrentIndex(sample, 29999), 1);
});

test("findCurrentIndex: 마지막 줄 이후", () => {
  assert.equal(findCurrentIndex(sample, 99000), 2);
});

test("findCurrentIndex: 빈 배열은 -1", () => {
  assert.equal(findCurrentIndex([], 1000), -1);
});

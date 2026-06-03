import test from "node:test";
import assert from "node:assert/strict";

import { touchIndex, evict, MAX_CACHE_ENTRIES } from "../src/cache.js";

// cache.js = 번역 캐시 LRU 순수 로직. chrome.storage.local 에 캐시가 무한 증가하지 않도록
// 항목 수를 제한한다. 인덱스(= {cacheKey: lastAccessMs})만 다루고, 실제 storage I/O 는 background.js.

// --- touchIndex ---
test("touchIndex: 새 키 추가", () => {
  assert.deepEqual(touchIndex({}, "k1", 100), { k1: 100 });
});

test("touchIndex: 기존 키 시각 갱신, 원본 불변", () => {
  const idx = { k1: 100, k2: 200 };
  const next = touchIndex(idx, "k1", 300);
  assert.deepEqual(next, { k1: 300, k2: 200 });
  assert.deepEqual(idx, { k1: 100, k2: 200 }); // 입력 불변
});

// --- evict ---
test("evict: max 이하면 변화 없음", () => {
  const idx = { a: 1, b: 2 };
  const r = evict(idx, 5);
  assert.deepEqual(r.evictKeys, []);
  assert.deepEqual(r.index, idx);
});

test("evict: 정확히 max 면 제거 없음", () => {
  const r = evict({ a: 1, b: 2, c: 3 }, 3);
  assert.deepEqual(r.evictKeys, []);
});

test("evict: 초과 시 가장 오래된(lastAccess 작은) 것부터 제거", () => {
  const idx = { a: 10, b: 30, c: 20, d: 40 };
  const r = evict(idx, 2); // 2개만 남김 → 오래된 a(10),c(20) 제거
  assert.deepEqual(r.evictKeys.sort(), ["a", "c"]);
  assert.deepEqual(r.index, { b: 30, d: 40 });
});

test("evict: 1개만 남기기", () => {
  const r = evict({ a: 5, b: 1, c: 9 }, 1);
  assert.deepEqual(r.evictKeys.sort(), ["a", "b"]);
  assert.deepEqual(r.index, { c: 9 });
});

test("MAX_CACHE_ENTRIES 는 양의 정수", () => {
  assert.ok(Number.isInteger(MAX_CACHE_ENTRIES) && MAX_CACHE_ENTRIES > 0);
});

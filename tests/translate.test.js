import test from "node:test";
import assert from "node:assert/strict";

import {
  buildUserContent,
  parseTranslations,
  mergeTranslations,
  buildCacheKey,
  translate,
} from "../src/translate.js";

const segs = [
  { id: 0, timeMs: 1000, text: "Hello" },
  { id: 1, timeMs: 2000, text: "" }, // 간주(빈 줄)
  { id: 2, timeMs: 3000, text: "World" },
];

// --- buildUserContent: 텍스트 있는 줄만 {id: text} JSON ---
test("buildUserContent: 빈 줄 제외하고 {id:text}", () => {
  assert.deepEqual(JSON.parse(buildUserContent(segs)), { "0": "Hello", "2": "World" });
});

// --- parseTranslations: 모델 출력 → {id: 번역} ---
test("parseTranslations: 정상 JSON", () => {
  assert.deepEqual(parseTranslations('{"0":"안녕","2":"세계"}'), { "0": "안녕", "2": "세계" });
});

test("parseTranslations: ```json 코드펜스 제거", () => {
  assert.deepEqual(parseTranslations('```json\n{"0":"안녕"}\n```'), { "0": "안녕" });
});

test("parseTranslations: 깨진 JSON → 빈 객체(폴백)", () => {
  assert.deepEqual(parseTranslations("sorry, here are the lyrics"), {});
});

test("parseTranslations: 잘린 JSON(max_tokens 절단) → 완전한 쌍만 부분복구", () => {
  const r = parseTranslations('{"0":"안녕","1":"세계","2":"잘린데서 끊');
  assert.equal(r["0"], "안녕");
  assert.equal(r["1"], "세계");
  assert.ok(!("2" in r)); // 닫히지 않은 마지막 쌍은 버림
});

test("parseTranslations: 빈/공백 번역은 제외(원문 유지되도록)", () => {
  const r = parseTranslations('{"0":"안녕","1":"","2":"   "}');
  assert.equal(r["0"], "안녕");
  assert.ok(!("1" in r));
  assert.ok(!("2" in r));
});

// --- mergeTranslations: id 매핑 + 부분복구(plan-reviewer high) ---
test("mergeTranslations: 매핑된 줄은 번역, 누락/빈 줄은 null(원문 유지)", () => {
  const merged = mergeTranslations(segs, { "0": "안녕" });
  assert.equal(merged[0].translated, "안녕");
  assert.equal(merged[1].translated, null); // 빈 줄
  assert.equal(merged[2].translated, null); // 모델이 누락 → 원문만(부분복구)
  assert.equal(merged[0].text, "Hello"); // 원문 보존
  assert.equal(merged[0].timeMs, 1000); // 타임스탬프 보존
});

// --- buildCacheKey: 복합 키, 결정적 ---
test("buildCacheKey: 같은 입력 같은 키", () => {
  const a = buildCacheKey("vid1", "Korean", "claude-haiku-4-5", segs);
  const b = buildCacheKey("vid1", "Korean", "claude-haiku-4-5", segs);
  assert.equal(a, b);
});

test("buildCacheKey: videoId·lang·model 바뀌면 키 변경", () => {
  const base = buildCacheKey("vid1", "Korean", "claude-haiku-4-5", segs);
  assert.notEqual(base, buildCacheKey("vid2", "Korean", "claude-haiku-4-5", segs));
  assert.notEqual(base, buildCacheKey("vid1", "English", "claude-haiku-4-5", segs));
  assert.notEqual(base, buildCacheKey("vid1", "Korean", "claude-sonnet-4-6", segs));
});

test("buildCacheKey: 텍스트 같아도 타임스탬프(싱크) 다르면 키 변경", () => {
  const a = [{ id: 0, timeMs: 1000, text: "x" }];
  const b = [{ id: 0, timeMs: 2000, text: "x" }];
  assert.notEqual(buildCacheKey("v", "Korean", "m", a), buildCacheKey("v", "Korean", "m", b));
});

// --- translate: fetch 주입(네트워크 mock) ---
const mockFetch = (status, body) => async () => ({
  ok: status === 200,
  status,
  json: async () => body,
});

test("translate: 정상 응답 → translated 채움", async () => {
  const fetchFn = mockFetch(200, { content: [{ type: "text", text: '{"0":"안녕","2":"세계"}' }] });
  const r = await translate(segs, { apiKey: "k", model: "claude-haiku-4-5", lang: "Korean" }, fetchFn);
  assert.equal(r[0].translated, "안녕");
  assert.equal(r[2].translated, "세계");
});

test("translate: 절단 응답도 앞부분은 부분복구", async () => {
  const fetchFn = mockFetch(200, {
    stop_reason: "max_tokens",
    content: [{ type: "text", text: '{"0":"안녕","2":"잘린' }],
  });
  const r = await translate(segs, { apiKey: "k", model: "x", lang: "Korean" }, fetchFn);
  assert.equal(r[0].translated, "안녕"); // 앞부분 살림
  assert.equal(r[2].translated, null); // 잘린 줄은 원문
});

test("translate: JSON 깨지면 전부 원문(translated null)", async () => {
  const fetchFn = mockFetch(200, { content: [{ type: "text", text: "garbage" }] });
  const r = await translate(segs, { apiKey: "k", model: "x", lang: "Korean" }, fetchFn);
  assert.equal(r[0].translated, null);
  assert.equal(r[0].text, "Hello"); // 원문 보존
});

test("translate: 비-200 응답은 throw(background 가 원문 폴백)", async () => {
  await assert.rejects(() => translate(segs, { apiKey: "k", model: "x", lang: "Korean" }, mockFetch(429, {})));
});

test("translate: 번역할 텍스트가 없으면 API 호출 없이 원문", async () => {
  let called = false;
  const fetchFn = async () => {
    called = true;
    return { ok: true, status: 200, json: async () => ({}) };
  };
  const empty = [{ id: 0, timeMs: 0, text: "" }];
  const r = await translate(empty, { apiKey: "k", model: "x", lang: "Korean" }, fetchFn);
  assert.equal(called, false);
  assert.equal(r[0].translated, null);
});

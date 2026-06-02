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

// --- buildUserContent ---
test("buildUserContent: 빈 줄 제외하고 {id:text}", () => {
  assert.deepEqual(JSON.parse(buildUserContent(segs)), { "0": "Hello", "2": "World" });
});

// --- parseTranslations ---
test("parseTranslations: 정상 JSON", () => {
  assert.deepEqual(parseTranslations('{"0":"안녕","2":"세계"}'), { "0": "안녕", "2": "세계" });
});

test("parseTranslations: ```json 코드펜스 제거", () => {
  assert.deepEqual(parseTranslations('```json\n{"0":"안녕"}\n```'), { "0": "안녕" });
});

test("parseTranslations: 깨진 JSON → 빈 객체(폴백)", () => {
  assert.deepEqual(parseTranslations("sorry, here are the lyrics"), {});
});

test("parseTranslations: 잘린 JSON(절단) → 완전한 쌍만 부분복구", () => {
  const r = parseTranslations('{"0":"안녕","1":"세계","2":"잘린데서 끊');
  assert.equal(r["0"], "안녕");
  assert.equal(r["1"], "세계");
  assert.ok(!("2" in r));
});

test("parseTranslations: 빈/공백 번역은 제외(원문 유지되도록)", () => {
  const r = parseTranslations('{"0":"안녕","1":"","2":"   "}');
  assert.equal(r["0"], "안녕");
  assert.ok(!("1" in r));
  assert.ok(!("2" in r));
});

// --- mergeTranslations ---
test("mergeTranslations: 매핑된 줄은 번역, 누락/빈 줄은 null(원문 유지)", () => {
  const merged = mergeTranslations(segs, { "0": "안녕" });
  assert.equal(merged[0].translated, "안녕");
  assert.equal(merged[1].translated, null);
  assert.equal(merged[2].translated, null);
  assert.equal(merged[0].text, "Hello");
  assert.equal(merged[0].timeMs, 1000);
});

// --- buildCacheKey ---
test("buildCacheKey: 같은 입력 같은 키", () => {
  assert.equal(
    buildCacheKey("vid1", "Korean", "gemini-2.5-flash", segs),
    buildCacheKey("vid1", "Korean", "gemini-2.5-flash", segs)
  );
});

test("buildCacheKey: videoId·lang·model 바뀌면 키 변경", () => {
  const base = buildCacheKey("vid1", "Korean", "gemini-2.5-flash", segs);
  assert.notEqual(base, buildCacheKey("vid2", "Korean", "gemini-2.5-flash", segs));
  assert.notEqual(base, buildCacheKey("vid1", "English", "gemini-2.5-flash", segs));
  assert.notEqual(base, buildCacheKey("vid1", "Korean", "gemini-2.5-pro", segs));
});

test("buildCacheKey: 텍스트 같아도 타임스탬프(싱크) 다르면 키 변경", () => {
  const a = [{ id: 0, timeMs: 1000, text: "x" }];
  const b = [{ id: 0, timeMs: 2000, text: "x" }];
  assert.notEqual(buildCacheKey("v", "Korean", "m", a), buildCacheKey("v", "Korean", "m", b));
});

// --- translate: fetch 주입(Gemini 응답 형식 mock) ---
const mockFetch = (status, body) => async () => ({
  ok: status === 200,
  status,
  json: async () => body,
});
const geminiBody = (text, finishReason = "STOP") => ({
  candidates: [{ content: { parts: [{ text }] }, finishReason }],
});

test("translate: 정상 응답 → translated 채움", async () => {
  const fetchFn = mockFetch(200, geminiBody('{"0":"안녕","2":"세계"}'));
  const r = await translate(segs, { apiKey: "k", model: "gemini-2.5-flash", lang: "Korean" }, fetchFn);
  assert.equal(r[0].translated, "안녕");
  assert.equal(r[2].translated, "세계");
});

test("translate: 절단(MAX_TOKENS)도 앞부분은 부분복구", async () => {
  const fetchFn = mockFetch(200, geminiBody('{"0":"안녕","2":"잘린', "MAX_TOKENS"));
  const r = await translate(segs, { apiKey: "k", model: "x", lang: "Korean" }, fetchFn);
  assert.equal(r[0].translated, "안녕");
  assert.equal(r[2].translated, null);
});

test("translate: JSON 깨지면 전부 원문(translated null)", async () => {
  const fetchFn = mockFetch(200, geminiBody("garbage"));
  const r = await translate(segs, { apiKey: "k", model: "x", lang: "Korean" }, fetchFn);
  assert.equal(r[0].translated, null);
  assert.equal(r[0].text, "Hello");
});

test("translate: 빈 candidates(SAFETY 등)에도 안전 → 원문", async () => {
  const fetchFn = mockFetch(200, { candidates: [{ finishReason: "SAFETY" }] });
  const r = await translate(segs, { apiKey: "k", model: "x", lang: "Korean" }, fetchFn);
  assert.equal(r[0].translated, null);
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

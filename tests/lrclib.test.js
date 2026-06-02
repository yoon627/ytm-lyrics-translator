import test from "node:test";
import assert from "node:assert/strict";

import { buildLyricsUrl, classifyLyricsResponse, fetchLyrics } from "../src/lrclib.js";

// --- buildLyricsUrl ---
test("buildLyricsUrl: 필수 파라미터(artist_name, track_name)", () => {
  const url = buildLyricsUrl({ artist: "Adele", track: "Hello" });
  assert.match(url, /^https:\/\/lrclib\.net\/api\/get\?/);
  assert.match(url, /artist_name=Adele/);
  assert.match(url, /track_name=Hello/);
});

test("buildLyricsUrl: album·duration 포함 + 초 반올림", () => {
  const url = buildLyricsUrl({ artist: "A", track: "T", album: "Alb", durationSec: 180.7 });
  assert.match(url, /album_name=Alb/);
  assert.match(url, /duration=181/);
});

test("buildLyricsUrl: 특수문자 인코딩", () => {
  const url = buildLyricsUrl({ artist: "A&B", track: "x y" });
  assert.match(url, /artist_name=A%26B/);
  assert.match(url, /track_name=x\+y/); // URLSearchParams: space → +
});

// --- classifyLyricsResponse (실패 4분기) ---
test("classify: 404 → not_found", () => {
  assert.deepEqual(classifyLyricsResponse(404, null), { status: "not_found" });
});

test("classify: 5xx → error", () => {
  assert.equal(classifyLyricsResponse(500, null).status, "error");
});

test("classify: instrumental:true → instrumental", () => {
  assert.deepEqual(classifyLyricsResponse(200, { instrumental: true }), { status: "instrumental" });
});

test("classify: syncedLyrics=null(plainLyrics만) → no_synced", () => {
  assert.deepEqual(
    classifyLyricsResponse(200, { instrumental: false, syncedLyrics: null, plainLyrics: "hi" }),
    { status: "no_synced" }
  );
});

test("classify: syncedLyrics 빈 문자열 → no_synced", () => {
  assert.deepEqual(classifyLyricsResponse(200, { syncedLyrics: "" }), { status: "no_synced" });
});

test("classify: syncedLyrics 존재 → ok", () => {
  assert.deepEqual(classifyLyricsResponse(200, { syncedLyrics: "[00:01.00]Hi" }), { status: "ok" });
});

// --- fetchLyrics (fetchFn 주입으로 네트워크 mock) ---
const mockFetch = (status, body) => async () => ({ status, json: async () => body });

test("fetchLyrics: 정상 → ok + parseLrc 결과 segments", async () => {
  const r = await fetchLyrics({ artist: "A", track: "T" }, mockFetch(200, { syncedLyrics: "[00:01.00]Hi\n[00:02.00]Yo" }));
  assert.equal(r.status, "ok");
  assert.equal(r.segments.length, 2);
  assert.equal(r.segments[0].text, "Hi");
});

test("fetchLyrics: 404 → not_found", async () => {
  const r = await fetchLyrics({ artist: "A", track: "T" }, mockFetch(404, null));
  assert.equal(r.status, "not_found");
});

test("fetchLyrics: instrumental", async () => {
  const r = await fetchLyrics({ artist: "A", track: "T" }, mockFetch(200, { instrumental: true }));
  assert.equal(r.status, "instrumental");
});

test("fetchLyrics: syncedLyrics 있지만 파싱 0줄(메타만) → no_synced", async () => {
  const r = await fetchLyrics({ artist: "A", track: "T" }, mockFetch(200, { syncedLyrics: "[ar:x]\n[ti:y]" }));
  assert.equal(r.status, "no_synced");
});

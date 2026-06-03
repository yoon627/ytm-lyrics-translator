// background service worker — content script 의 요청을 받아 외부 API(LRCLIB·Gemini)를 호출한다.
// MV3 에서 content script 의 fetch 는 페이지 origin CORS 에 막히므로 외부 호출은 여기서 수행.
// API 키는 여기(SW)에서만 chrome.storage.local 로 읽는다(content/main world 비접근).
import { fetchLyrics } from "./lrclib.js";
import { translate, buildCacheKey } from "./translate.js";
import { touchIndex, evict, MAX_CACHE_ENTRIES } from "./cache.js";

const DEFAULTS = { targetLang: "Korean", model: "gemini-2.5-flash", translationEnabled: true };

async function getSettings() {
  const s = await chrome.storage.local.get(["apiKey", "targetLang", "model", "translationEnabled"]);
  return { ...DEFAULTS, ...s };
}

const withoutTranslation = (segments) => segments.map((s) => ({ ...s, translated: null }));

const CACHE_INDEX_KEY = "__yltt_cache_index__"; // 캐시 키 LRU 인덱스(설정 키와 분리)

// 캐시 키 접근 시각 기록 + 항목 수 상한 초과 시 가장 오래된 항목 제거(LRU). 인덱스만 추적.
async function touchCache(cacheKey) {
  const stored = await chrome.storage.local.get([CACHE_INDEX_KEY]);
  const touched = touchIndex(stored[CACHE_INDEX_KEY] || {}, cacheKey, Date.now());
  const { index, evictKeys } = evict(touched, MAX_CACHE_ENTRIES);
  if (evictKeys.length) await chrome.storage.local.remove(evictKeys);
  await chrome.storage.local.set({ [CACHE_INDEX_KEY]: index });
}

async function handleGetLyrics(query) {
  const lyrics = await fetchLyrics(query);
  if (lyrics.status !== "ok") return lyrics; // not_found / instrumental / no_synced 등 그대로

  const settings = await getSettings();
  if (!settings.translationEnabled || !settings.apiKey) {
    return { ...lyrics, segments: withoutTranslation(lyrics.segments) }; // 번역 off / 키 없음 → 원문만
  }

  const cacheKey = buildCacheKey(query.videoId, settings.targetLang, settings.model, lyrics.segments);
  const cached = await chrome.storage.local.get([cacheKey]);
  if (cached[cacheKey]) {
    await touchCache(cacheKey); // LRU 접근 시각 갱신
    return { ...lyrics, segments: cached[cacheKey] };
  }

  try {
    const translated = await translate(lyrics.segments, {
      apiKey: settings.apiKey,
      model: settings.model,
      lang: settings.targetLang,
    });
    // 캐시 저장 실패(쿼터 등)는 번역 결과와 분리 — 저장 못 해도 이번 번역은 정상 반환
    try {
      await chrome.storage.local.set({ [cacheKey]: translated });
      await touchCache(cacheKey); // LRU 인덱스 갱신 + 상한 초과 시 오래된 항목 제거
    } catch (cacheErr) {
      console.warn("[yltt] cache set failed:", cacheErr?.message || cacheErr);
    }
    return { ...lyrics, segments: translated };
  } catch (err) {
    // Gemini 실패(429/5xx/키오류 등) → 원문만 표시(degraded)
    return { ...lyrics, segments: withoutTranslation(lyrics.segments), translateError: String(err?.message || err) };
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "getLyrics") {
    handleGetLyrics(msg.query)
      .then(sendResponse)
      .catch((err) => sendResponse({ status: "error", reason: String(err?.message || err) }));
    return true; // 비동기 응답 — 채널 유지
  }
  return false;
});

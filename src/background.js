// background service worker — content script 의 요청을 받아 외부 API(LRCLIB)를 호출한다.
// MV3 에서 content script 의 fetch 는 페이지 origin CORS 에 막히므로, 외부 호출은 여기서 수행.
// (host_permissions 에 https://lrclib.net/* 선언)
import { fetchLyrics } from "./lrclib.js";

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "getLyrics") {
    fetchLyrics(msg.query)
      .then(sendResponse)
      .catch((err) => sendResponse({ status: "error", reason: String(err?.message || err) }));
    return true; // 비동기 응답 — 채널 유지
  }
  return false;
});

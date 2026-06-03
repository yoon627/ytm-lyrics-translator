// 번역 캐시 LRU 순수 로직 — chrome.storage.local 의 캐시 항목이 무한 증가하지 않도록 항목 수를 제한.
// 인덱스(= {cacheKey: lastAccessMs})만 다루고, 실제 storage I/O(get/set/remove)는 background.js 가 수행.

export const MAX_CACHE_ENTRIES = 200;

// 캐시 접근/저장 시 인덱스에 마지막 접근 시각을 기록(입력 불변).
export function touchIndex(index, key, nowMs) {
  return { ...index, [key]: nowMs };
}

// 항목 수가 max 초과면 가장 오래된(lastAccess 작은) 것부터 제거할 키 목록 + 정리된 인덱스를 반환.
export function evict(index, max) {
  const keys = Object.keys(index);
  if (keys.length <= max) return { index, evictKeys: [] };

  const sorted = keys.slice().sort((a, b) => index[a] - index[b]); // 오래된 것 먼저
  const evictKeys = sorted.slice(0, keys.length - max);

  const evictSet = new Set(evictKeys);
  const nextIndex = {};
  for (const k of keys) {
    if (!evictSet.has(k)) nextIndex[k] = index[k];
  }
  return { index: nextIndex, evictKeys };
}

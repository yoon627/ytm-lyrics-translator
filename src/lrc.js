// LRC 파서: syncedLyrics(LRC) → [{id, timeMs, text}] + 현재 재생 줄 탐색.
// 순수 함수만 둔다(브라우저 API 의존 없음) — node:test 로 단위 검증.

const TIMESTAMP_RE = /\[(\d{1,2}):(\d{2})(?:\.(\d{1,3}))?\]/g;

// [mm:ss.xx] / [mm:ss.xxx] / [mm:ss] → ms. 소수부는 자릿수 무관하게 초의 소수로 환산.
function toMs(mm, ss, frac) {
  let ms = parseInt(mm, 10) * 60000 + parseInt(ss, 10) * 1000;
  if (frac) ms += Math.round(parseFloat("0." + frac) * 1000);
  return ms;
}

// LRC 문자열 → 타임스탬프 오름차순 세그먼트 배열.
// - 메타태그([ar:],[ti:],[length:] 등 숫자로 시작 않는 [..])는 타임스탬프 정규식에 안 걸려 자동 제외
// - 한 줄 다중 타임스탬프([t1][t2]text)는 각각 전개(같은 text)
// - 빈 텍스트 줄(간주)도 text:"" 로 유지
export function parseLrc(lrc) {
  if (typeof lrc !== "string" || lrc.length === 0) return [];

  const segments = [];
  for (const line of lrc.split(/\r?\n/)) {
    TIMESTAMP_RE.lastIndex = 0;
    const stamps = [];
    let match;
    let lastEnd = 0;
    while ((match = TIMESTAMP_RE.exec(line)) !== null) {
      stamps.push(toMs(match[1], match[2], match[3]));
      lastEnd = match.index + match[0].length;
    }
    if (stamps.length === 0) continue; // 타임스탬프 없는 줄(메타/공백) 스킵

    const text = line.slice(lastEnd).trim();
    for (const timeMs of stamps) segments.push({ timeMs, text });
  }

  segments.sort((a, b) => a.timeMs - b.timeMs);
  return segments.map((s, id) => ({ id, timeMs: s.timeMs, text: s.text }));
}

// 정렬된 세그먼트에서 현재 시각(ms)에 해당하는 줄 인덱스(timeMs <= now 인 마지막 줄).
// 첫 줄 이전(인트로)이거나 비어 있으면 -1.
export function findCurrentIndex(segments, timeMs) {
  let lo = 0;
  let hi = segments.length - 1;
  let ans = -1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    if (segments[mid].timeMs <= timeMs) {
      ans = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }
  return ans;
}

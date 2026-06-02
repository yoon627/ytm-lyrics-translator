// Claude Messages API 로 가사 줄별 번역. 순수 함수(프롬프트/파싱/머지/캐시키)는 단위 테스트,
// fetch 는 주입. 확장 환경이라 @anthropic-ai/sdk 대신 fetch 직접 호출.
// 헤더 anthropic-dangerous-direct-browser-access:true 로 브라우저 CORS 통과(본인용·미배포).
//
// 프롬프트 캐싱은 적용 안 함: haiku-4-5 의 최소 캐시 프리픽스가 4096 토큰인데 번역 지침
// system 은 그보다 짧아 캐시되지 않는다(효과 없음).

const API_URL = "https://api.anthropic.com/v1/messages";
const ANTHROPIC_VERSION = "2023-06-01";
const MAX_TOKENS = 8192; // 상한일 뿐 — 보통 곡당 출력은 1~2K 토큰

export function buildSystemPrompt(lang) {
  return [
    `You translate song lyrics into ${lang}.`,
    `Input is a JSON object mapping numeric line IDs to original lyric lines.`,
    `Output ONLY a JSON object mapping the SAME IDs to natural, fluent ${lang} translations.`,
    `Rules:`,
    `- Translate every input ID; keep the IDs identical.`,
    `- One line in maps to one line out. Never merge, split, reorder, drop, or add lines.`,
    `- Translate the meaning naturally (의역), not word for word. Preserve tone, mood, and register.`,
    `- Output ONLY the raw JSON object. No markdown, no code fences, no commentary.`,
  ].join("\n");
}

// 텍스트 있는 줄만 {id: text} JSON 으로 (빈 줄/간주는 번역 대상 아님)
export function buildUserContent(segments) {
  const obj = {};
  for (const s of segments) {
    if (s.text && s.text.trim()) obj[s.id] = s.text;
  }
  return JSON.stringify(obj);
}

const PAIR_RE = /"(\d+)"\s*:\s*"((?:[^"\\]|\\.)*)"/g;

// 모델 출력 → {id: 번역}. 코드펜스를 벗기고, JSON.parse 실패(절단 등) 시 완전한 "id":"text"
// 쌍만 정규식으로 부분복구한다. 빈/공백 번역은 제외(번역 실패로 보고 원문 유지).
export function parseTranslations(rawText) {
  if (typeof rawText !== "string") return {};
  let t = rawText.trim();
  const fence = t.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  if (fence) t = fence[1].trim();

  let obj = {};
  try {
    const parsed = JSON.parse(t);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) obj = parsed;
  } catch {
    // 절단/약간 깨진 JSON → 닫힌 쌍만 복구(부분복구)
    PAIR_RE.lastIndex = 0;
    let m;
    while ((m = PAIR_RE.exec(t)) !== null) {
      try {
        obj[m[1]] = JSON.parse(`"${m[2]}"`);
      } catch {
        obj[m[1]] = m[2];
      }
    }
  }

  const out = {};
  for (const k of Object.keys(obj)) {
    const v = obj[k];
    if (typeof v === "string" && v.trim()) out[k] = v; // 빈/공백 제외
  }
  return out;
}

// segments + {id:번역} → 각 줄에 translated 부여. 누락 id 는 null(원문만 표시 = 부분복구).
export function mergeTranslations(segments, transMap) {
  return segments.map((s) => ({
    ...s,
    translated: Object.prototype.hasOwnProperty.call(transMap, s.id) ? transMap[s.id] : null,
  }));
}

function hashText(s) {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = (((h << 5) + h) + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

// 캐시 오염 방지용 복합 키 — 모델/언어/가사 본문+타임스탬프가 바뀌면 키도 바뀐다.
export function buildCacheKey(videoId, lang, model, segments) {
  const joined = segments.map((s) => `${s.timeMs}:${s.text}`).join("\n");
  return `${videoId}:${lang}:${model}:${hashText(joined)}`;
}

export async function translate(segments, opts, fetchFn = fetch) {
  const { apiKey, model, lang } = opts;
  const hasText = segments.some((s) => s.text && s.text.trim());
  if (!hasText) return mergeTranslations(segments, {}); // 번역할 것 없음

  const res = await fetchFn(API_URL, {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "anthropic-version": ANTHROPIC_VERSION,
      "content-type": "application/json",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model,
      max_tokens: MAX_TOKENS,
      system: buildSystemPrompt(lang),
      messages: [{ role: "user", content: buildUserContent(segments) }],
    }),
  });

  if (!res.ok) throw new Error(`Claude API ${res.status}`); // background 가 catch → 원문 표시

  const data = await res.json();
  if (data && data.stop_reason === "max_tokens") {
    console.warn("[yltt] translation truncated (max_tokens) — recovering partial");
  }
  const text = data?.content?.[0]?.text ?? "";
  return mergeTranslations(segments, parseTranslations(text));
}

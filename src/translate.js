// Gemini API 로 가사 줄별 번역. 순수 함수(프롬프트/파싱/머지/캐시키)는 단위 테스트, fetch 는 주입.
// 확장 SW + host_permissions 면 CORS 면제(content script 직접 호출 금지 — 반드시 SW 에서).
// JSON 강제(responseMimeType/responseFormat)는 세대별 키가 갈리고 schema 동반이 필요해,
// 평문 응답 + parseTranslations(부분복구 포함) 으로 처리한다.

const API_BASE = "https://generativelanguage.googleapis.com/v1beta/models";
const MAX_OUTPUT_TOKENS = 8192; // 상한일 뿐 — 보통 곡당 출력은 1~2K 토큰

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

  const res = await fetchFn(`${API_BASE}/${model}:generateContent`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      system_instruction: { parts: [{ text: buildSystemPrompt(lang) }] },
      contents: [{ parts: [{ text: buildUserContent(segments) }] }],
      generationConfig: { maxOutputTokens: MAX_OUTPUT_TOKENS, temperature: 0.7 },
    }),
  });

  if (!res.ok) throw new Error(`Gemini API ${res.status}`); // background 가 catch → 원문 표시

  const data = await res.json();
  const cand = data?.candidates?.[0];
  if (cand?.finishReason === "MAX_TOKENS") {
    console.warn("[yltt] translation truncated (MAX_TOKENS) — recovering partial");
  }
  const text = cand?.content?.parts?.[0]?.text ?? "";
  return mergeTranslations(segments, parseTranslations(text));
}

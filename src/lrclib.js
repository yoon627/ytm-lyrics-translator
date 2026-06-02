// LRCLIB 가사 조회 — URL 생성·응답 분기는 순수 함수로 두어 단위 테스트, fetch 는 주입.
// CORS: lrclib.net 은 allow_origin(Any) 라 SW 에서 직접 호출 가능. 키·rate limit 없음.
import { parseLrc } from "./lrc.js";

const LRCLIB_GET = "https://lrclib.net/api/get";

export function buildLyricsUrl({ artist, track, album, durationSec }) {
  const params = new URLSearchParams({ artist_name: artist, track_name: track });
  if (album) params.set("album_name", album);
  if (durationSec) params.set("duration", String(Math.round(durationSec)));
  return `${LRCLIB_GET}?${params.toString()}`;
}

// 실패 4분기(plan Decisions): not_found / instrumental / no_synced / ok (+ error)
export function classifyLyricsResponse(httpStatus, data) {
  if (httpStatus === 404) return { status: "not_found" };
  if (httpStatus !== 200) return { status: "error", reason: `HTTP ${httpStatus}` };
  if (!data) return { status: "error", reason: "empty body" };
  if (data.instrumental) return { status: "instrumental" };
  if (!data.syncedLyrics) return { status: "no_synced" }; // plainLyrics 만 있어도 싱크 불가
  return { status: "ok" };
}

export async function fetchLyrics(query, fetchFn = fetch) {
  const res = await fetchFn(buildLyricsUrl(query));
  const data = res.status === 200 ? await res.json() : null;

  const verdict = classifyLyricsResponse(res.status, data);
  if (verdict.status !== "ok") return verdict;

  const segments = parseLrc(data.syncedLyrics);
  if (segments.length === 0) return { status: "no_synced" }; // 메타태그만 있는 등
  return { status: "ok", segments, trackName: data.trackName, artistName: data.artistName };
}

---
title: ytm-lyrics-translator — YTM 가사를 LRCLIB+Claude 로 번역해 싱크 오버레이
status: in_progress
started: 2026-06-02
updated: 2026-06-02
---

# Goal
데스크톱 Chrome 의 music.youtube.com 에서 재생 중인 곡의 싱크 가사(LRCLIB)를 Claude API 로 한국어 번역해, 원문+번역을 재생에 맞춰 오버레이로 표시하는 **본인용 MV3 확장**. 차별점: 기계번역이 아닌 LLM 문맥 번역 품질.

# Progress
- 2026-06-02: 사용자와 설계 합의(확장 형태 / LRCLIB / Claude API / 원문+번역 병기 / 본인용). 기존 도구(better-lyrics)는 Google 기계번역이라 한국어 가사 품질이 나쁜 점이 차별화 근거.
- 2026-06-02: researcher 2건으로 LRCLIB·Claude API·MV3·YTM DOM 사실 1차 출처 확정. draft plan 작성.
- 2026-06-02: plan-reviewer(Claude+codex 병행) 검토 — stale race(critical), id 기반 번역 I/O·복합 캐시키·키 SW 전용(high), 실패 4분기·광고·XSS 등 반영. MVP 를 "syncedLyrics 있는 곡만"으로 축소. (지적 처리는 # Review Disposition)
- 2026-06-02: 스캐폴딩(package.json, node:test) + **lrc.js 파서 TDD 완료** — parseLrc(메타필터·다중 ts 전개·빈 줄·2/3자리 ms)·findCurrentIndex(이진탐색 경계) **14 테스트 Green**. (Red→구현→Green 확인)
- 2026-06-02: `git init` + 초기 커밋(d2d819c, main) + 작업 브랜치 `feat/mvp`. manifest.json + main-world.js(MAIN world, #movie_player getVideoData/getCurrentTime, 250ms tick) + content.js(ISOLATED, CustomEvent 수신·콘솔 로그) **2-world 골격 작성**.
- 2026-06-02: **G1 통과**(커밋 faf907c). 4단계 LRCLIB 연동 — lrclib.js(buildLyricsUrl·classifyLyricsResponse·fetchLyrics) **TDD 13 테스트** + background.js(SW fetch) + manifest host_permissions[lrclib.net] + main-world getDuration 추가. **메타 타이밍 버그**: 트랙 변경 직후 getVideoData title/duration 빈 값 → 빈 artist/track 으로 LRCLIB 호출 → HTTP 400. **해결**: '제목 채워진 후 트랙당 1회 요청'. 실측 'joan - don't say you love me' 41줄 ✓.
- 2026-06-02: 5단계 오버레이 — overlay.js(window.__yltt_overlay, textContent 삽입)+overlay.css(우하단 반투명 패널)+content.js findCurrentIndex 인라인+간이 stale 방어. **G2 통과**(가사 표시·현재 줄 하이라이트 동작). `requestStorageAccessFor: Permission denied` 콘솔 에러는 YTM 페이지 자체(Storage Access API)·무해 — grep 으로 우리 코드 무관 확인.

# Next  (단계별 검증 게이트 사슬 — 3-world 통신·player API 는 자동테스트 불가라 수동 게이트가 핵심)
1. ✅ package.json + lrc.js 파서 TDD (14 테스트)
2. ✅ 2-world 골격 (G1 통과, faf907c)
3. ✅ LRCLIB fetch(SW) + 실패 4분기 + 파서 연동 (lrclib.js 13 테스트; 메타 타이밍 버그 해결; 실측 41줄 ✓)
4. ✅ overlay 싱크 표시(원문만) — G2 통과(findCurrentIndex content 인라인)
5. **← 지금** Claude 번역: popup(API 키·대상 언어 → chrome.storage) + background Claude 호출(id 기반 {id:text} JSON I/O + 부분복구) + 캐시(복합 키) + 오버레이 원문 아래 번역 병기 — **[수동 게이트 G3]**
6. stale 폐기 정식화(requestId/상태머신) + 빠른 곡 전환/loop/광고/seek

# Decisions
- **형태**: MV3 브라우저 확장. YTM 공식 플러그인 개념 없음 → 브라우저 확장이 유일 경로. content script 가 music.youtube.com 에 주입.
- **가사 소스**: LRCLIB `GET https://lrclib.net/api/get` (artist_name·track_name 필수, album_name·duration 선택, duration ±2초). CORS `allow_origin(Any)`, 키·rate limit 없음. 응답: syncedLyrics(LRC `[mm:ss.xx]`)·plainLyrics·instrumental·id·duration. (출처: lrclib.net/docs + tranxuanthang/lrclib server/src/lib.rs)
  - **실패 경로 4분기** (plan-review medium): ①404=매칭 없음 ②`instrumental:true`=연주곡(가사 없음 정상, "연주곡" 표시) ③`syncedLyrics=null`+plainLyrics 존재=싱크 불가(MVP 는 "싱크 가사 없음"으로 종료) ④200+duration 어긋남=틀린 매칭. `/api/search` 폴백은 **MVP 이후**(과한 범위).
- **번역 엔진**: Claude `POST https://api.anthropic.com/v1/messages`. 모델 `claude-haiku-4-5`($1/$5 MTok). 헤더 x-api-key + anthropic-version:2023-06-01 + content-type:application/json + anthropic-dangerous-direct-browser-access:true. 응답 content[0].text. **Claude 실패(429/5xx/키오류) 시 원문만 표시**(degraded). sonnet 옵션은 MVP 이후. (출처: platform.claude.com/docs + anthropic-sdk-typescript src/client.ts)
- **번역 I/O** (변경: "줄 수 검증"→"id 기반 매핑". 이유: 줄 수 검증은 한 줄만 어긋나도 곡 전체가 원문 폴백 + 메타태그·중복 타임스탬프·빈 줄·후렴 중복으로 줄 정합이 쉽게 깨짐 — plan-review high): LRC 원문 통째 전송 금지. 파서가 `{id,timeMs,text}[]` 생성 → 텍스트 있는 세그먼트만 `{id:text}` JSON 으로 Claude 전송 → `{id:번역}` JSON 수신 → id 로 머지, **누락 id 는 그 줄만 원문 유지(부분 복구)**.
- **아키텍처 (3-world)**: 곡 메타/시간을 `#movie_player.getVideoData()`/`getCurrentTime()` 으로 획득(DOM 셀렉터보다 견고, better-lyrics 검증). 이 객체는 MAIN world 에만 존재 → 스크립트 분리: **MAIN world**(player 접근, 곡·시간 CustomEvent 발신, videoId 변화 감지) + **ISOLATED world**(이벤트 수신, chrome.storage, background 통신, 오버레이). `getCurrentTime()` 은 초(float) → lrc.js 에서 ms 변환. MAIN→ISOLATED 시간 전달 주기와 렌더 보간 주기는 G1 에서 실측해 확정.
- **stale 응답 폐기** (신규, plan-review critical): ISOLATED 가 요청마다 단조증가 `requestId`(=trackEpoch) 발급 → SW 응답에 echo → **현재 epoch === 응답 epoch 일 때만 반영**. videoId 단독 검증은 loop·A→B→A 재진입에서 stale 통과하므로 불충분.
- **상태 머신** (신규, codex 제안): `EMPTY→DETECTING→FETCHING_LYRICS→TRANSLATING→READY→FAILED`, 모든 전이는 trackEpoch 일치 시에만. race 와 실패 경로를 한 곳에서 관리.
- **외부 API 호출 위치**: background service worker (MV3 에서 content script fetch 는 페이지 origin CORS 에 막힘; SW 는 host_permissions 으로 우회). content↔SW 는 chrome.runtime.sendMessage + 리스너 `return true`.
- **캐시** (변경: "videoId 별"→복합 키 2층. 이유: 모델 2종·언어·프롬프트 변경 시 오염 — plan-review high): 키 = `videoId + lang + model + promptVersion + syncedLyrics해시`. **SW inFlight(메모리 dedupe, 동일 요청 동시 1개)** + **완료 결과 chrome.storage.local(2층)**. 번역 요청은 **트랙 identity 변경 시 1회만**; seek/pause/timeupdate 는 렌더 전용(재번역 금지).
- **API 키 보안** (보강): chrome.storage.local 저장. **read 는 background.js(SW) 전용, write 는 popup 전용, content/main world 절대 비접근**. 하드코딩·로깅 금지(§8). Anthropic 공식 "dangerous" 경고 → 본인용·미배포 한정.
- **오버레이 보안** (신규): 가사·번역은 외부 입력 → **textContent 삽입만(innerHTML 금지)**, XSS 방지(§8 외부 입력 불신).
- **광고 처리** (신규, plan-review): 광고 videoId/player 상태 구간은 LRCLIB·Claude 호출 안 함, 오버레이 숨김.
- **feature flag** (신규, rollback): `translationEnabled`/`overlayEnabled`/`useCache`/`debugMode` (chrome.storage) → "번역 OFF, 원문 싱크 유지" degraded 롤백.
- **테스트**: node:test (의존성 0). 순수 함수 단위테스트 — lrc 파서(메타필터·중복 ts 전개·빈 줄·2/3자리 ms), 현재줄 이진탐색(첫 줄 이전/마지막 이후/정확 일치 경계), 번역 머지(부분 복구), 캐시 키 생성. 3-world 통신·player API·오버레이·실 API 는 수동 게이트(G1~G3).
- **MVP 범위**: syncedLyrics 있는 곡만 + 영어→한국어 + 원문+번역 병기 + stale 폐기 + 키 SW 전용 + Claude 실패 시 원문. 이후: search 폴백, sonnet, 다국어 자동감지, "번역만" 토글, 로마자, seek-to-middle/인트로 정교화.

# Key Files (예정)
- `manifest.json` — MV3. content_scripts 2개(world:MAIN / world:ISOLATED), background.service_worker(type:module), host_permissions[music.youtube.com, lrclib.net, api.anthropic.com], permissions[storage], web_accessible_resources(overlay.css), action(popup)
- `src/main-world.js` — MAIN world. #movie_player 접근, getVideoData/getCurrentTime, 곡·시간 CustomEvent 발신, videoId 변화·광고 상태 감지
- `src/content.js` — ISOLATED world. CustomEvent 수신, **상태 머신 + requestId 발급**, storage(설정만) read, background 에 가사 요청, 오버레이 주입 + tick 갱신
- `src/overlay.js` / `src/overlay.css` — 오버레이 DOM·현재 줄 하이라이트. **textContent only**
- `src/background.js` — SW. LRCLIB fetch(+실패 4분기) → lrc 파싱 → translate 호출. **API 키 read 유일 지점**. inFlight dedupe + storage 캐시
- `src/lrc.js` — LRC 파서 → `{id,timeMs,text}[]` (메타필터·중복 ts 전개 포함) + 현재줄 이진탐색 (**TDD**)
- `src/translate.js` — Claude 호출 + id 머지/부분복구 + 캐시 키 생성 (**머지·캐시키 TDD**)
- `popup/popup.html` · `popup/popup.js` — API 키·언어·flag 설정 → chrome.storage (**키 write 유일 지점**)
- `tests/` — lrc 파서·이진탐색·번역 머지·캐시키 단위테스트
- `package.json` — scripts.test = `node --test`

# Blockers
(status 는 in_progress — 아래는 구현 시 해결할 설계/확인 항목)
- ③ (재작성) 번역 매핑: 줄 수 검증 → **id 기반 매핑 + 부분 복구**(위 Decisions 반영). 구현 핵심 리스크.
- ④ (신규) stale 응답 race → requestId echo 검증 + 상태 머신(위 반영). 구현 핵심.
- ⑤ (신규) 광고 재생 videoId/player 상태 구간 처리.
- ① MV3 SW fetch 에서 anthropic-dangerous-direct-browser-access 실제 필요 여부 → 일단 포함, G 단계서 확인.
- ② `"world":"MAIN"` manifest 정확 문법 → better-lyrics manifest 참고해 확정.

# Review Disposition (2026-06-02 plan-review)
- **fix(plan 반영)**: stale race(requestId)·id 기반 I/O·복합 캐시키·키 SW 전용·실패 4분기·Claude 실패경로·광고 처리·오버레이 textContent·feature flag·상태 머신·tick 단위·TDD 대상 확대·게이트 사슬.
- **defer(MVP 이후)**: /api/search 폴백, sonnet 옵션, 다국어 자동감지, 로마자, seek-to-middle/인트로 정교화.
- **false-positive/wontfix**: 없음.

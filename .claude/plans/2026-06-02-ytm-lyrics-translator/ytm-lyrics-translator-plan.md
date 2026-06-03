---
title: ytm-lyrics-translator — YTM 가사를 LRCLIB+Claude 로 번역해 싱크 오버레이
status: in_progress
started: 2026-06-02
updated: 2026-06-03
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
- 2026-06-03: 6단계 Claude 번역 — translate.js(id-keyed JSON I/O·부분복구·캐시키, 11테스트) + popup(키 설정, write 전용) + background(가사→번역→캐시, 키 read SW 전용) + overlay 원문/번역 병기. **code-review**(Claude; codex 미가용=Windows sandbox spawn 실패): **fix** High2(캐시 set 격리+`unlimitedStorage`, max_tokens 절단 정규식 부분복구) + Med2(빈/공백 번역 제외, 캐시키 timeMs 포함). **defer** A→B→A requestId(→stale 정식화)·findCurrentIndex 중복·LRU·durationSec=0. **42 테스트 Green**. G3 대기.
- 2026-06-03: **번역 엔진 Claude → Gemini 무료 티어 교체**(비용 0). translate.js 의 fetch 만 Gemini generateContent 형식으로(gemini-2.5-flash, x-goog-api-key, candidates[0].content.parts[0].text, finishReason MAX_TOKENS). 순수 로직 불변. background DEFAULTS model·manifest host_permissions(generativelanguage.googleapis.com)·popup 라벨(Gemini Key) 갱신. **43 테스트 Green**. researcher 로 Gemini API·CORS 확정. G3 대기(Gemini 키).
- 2026-06-03: **일본어 곡 싱크 어긋남 버그 진단 착수**(코드 변경 0). 영어 정상·일본어만 문제. 코드 분석으로 시간→줄 매칭(findCurrentIndex 이진탐색, content.js)·초→ms 변환(main-world.js)은 **언어 무관** 확인 → 원인을 가사 데이터(매칭 버전/타임스탬프) 쪽으로 좁힘. 가설 3: ①`[offset:±N]` LRC 태그 무시(lrc.js TIMESTAMP_RE 가 메타태그 미수집 → 전체 일정 밀림) ②틀린 버전 매칭(plan 실패분기 ④ duration 검증이 classifyLyricsResponse 에 **미구현**, lrclib.js → 갈수록 어긋남) ③duration 누락 요청(content.js 가 title 만 보고 요청 → getDuration 0 타이밍이면 buildLyricsUrl 이 duration 생략 → 길이 무시 매칭). 사용자 답: 양상 '곡마다 제각각' + '한두 곡만 확인' → 곡별 매칭/버전 쪽 의심. **재현 곡명/콘솔 로그 대기 중**.
- 2026-06-03: **G3 통과** — 사용자 확인("번역 돼"). 실 Gemini API 로 원문+한국어 병기 동작 실증, MVP 핵심 경로 검증 완료. 일본어 싱크 버그는 [입력 대기]로 보류(사용자 결정) → **7단계(defer 항목) 진행 전환, stale race(critical) 먼저**.
- 2026-06-03: **stale 정식화 dlc 착수**(Explore 완료). 현 방어=content.js:52 videoId 단독 비교(A→B→A·loop 옛 응답 통과). draft 설계: epoch 클로저 캡처 검증, **background echo 불필요 발견**(await Promise=요청-응답 1:1 → 클로저가 echo 동치), 6-state→경량 축소 검토. plan-reviewer 대기.
- 2026-06-03: **plan-review 완료**(Claude+codex 0.136.0 병행; codex 보조 read 만 sandbox 실패, 본 검토 정상). 핵심 정정: draft '트랙당 epoch'→**요청당 `requestSeq`**(동일 videoId out-of-order 차단; 트랙 식별은 currentVideoId, 2-token 불필요). echo 불필요·경량상태 유지 확인. **catch/실패/degraded 전 경로 stale 가드**(draft 누락분). 순수 reducer 로 시퀀스 TDD. 스코프=stale 만(requestKey/duration=일본어 가설③ 영역은 보류 유지로 defer).
- 2026-06-03: **stale 정식화 구현 완료**(dlc). `src/sync.js`(순수 reducer)+`tests/sync.test.js` TDD → content.js 가 `requestSeq` 로 stale 폐기(성공/실패/catch 전 경로); background/main-world/manifest **무변경**. **code-review(Claude+codex)**: 잔존 Critical **C1**(트랙 전환 직후 title 빈 창 + 캐시 즉답 → 옛 응답 통과) 발견 → **fix**: `trackChanged` 시 `seq++`(이전 트랙 in-flight 무효화) 를 sync.js+content.js 인라인 **양쪽 동시** + 재현 테스트 3종. **55 테스트 Green**. 수동 게이트(트랙 빠른 전환 시 가사 안 섞임 육안 확인) 대기.
- 2026-06-03: 플랫폼 대안 researcher 조사(userscript/th-ch electron/Win GSMTC/OSS). 결론은 Decisions '플랫폼 확장 검토'. + **7단계 광고 구간 처리 완료**(dlc): main-world 가 video_id 소실 구간(광고/로딩, code-review m2)을 null 이벤트로 통지→clear; sync trackChanged 시 requestedFor 리셋(A→광고→A 재요청) + content 인라인 동기화 + 광고 테스트 2종. **57 Green**. seek/loop 는 sync 로 이미 커버(seek 재요청無·loop seq 불변).
- 2026-06-03: **7단계 캐시 LRU 완료**(dlc). `src/cache.js`(touchIndex/evict 순수 LRU)+`tests/cache.test.js`(7테스트) → background.js 가 `__yltt_cache_index__` 인덱스로 캐시 키만 추적(설정 키 분리), 항목 200 초과 시 오래된 것 제거. **64 테스트 Green**. 한계: 인덱스 도입 전 기존 캐시는 재접근 전까지 추적 밖(자가치유). **7단계 코드 완결**(광고+seek/loop+LRU).

# Next  (단계별 검증 게이트 사슬 — 3-world 통신·player API 는 자동테스트 불가라 수동 게이트가 핵심)
- **[버그·보류·입력 대기] 일본어 곡 싱크 어긋남** (사용자 보류 2026-06-03 — 데이터 오면 재개): 재현 곡명/콘솔 로그(`[yltt] ▶ track:` 의 author·title·durationSec + `[yltt] ✓ lyrics:` 의 줄수) 확보 → LRCLIB `/api/get` 직접 조회로 (a)받은 가사 기준 길이 vs YTM durationSec (b)`[offset:]` 태그 유무 (c)동명 이버전 수 대조 → 가설 ①offset무시/②틀린버전/③duration누락 중 확정 → 수정 + 재현 테스트(lrc.test.js 또는 lrclib.test.js). 양상 '곡마다 제각각'·표본 1~2곡이라 데이터 확보가 선행 조건.
1. ✅ package.json + lrc.js 파서 TDD (14 테스트)
2. ✅ 2-world 골격 (G1 통과, faf907c)
3. ✅ LRCLIB fetch(SW) + 실패 4분기 + 파서 연동 (lrclib.js 13 테스트; 메타 타이밍 버그 해결; 실측 41줄 ✓)
4. ✅ overlay 싱크 표시(원문만) — G2 통과(findCurrentIndex content 인라인)
5. ✅ Claude 번역 (translate.js 11테스트, popup/background/overlay 통합, code-review fix 반영, 42 테스트)
6. ✅ [수동 게이트 G3 통과] Gemini 키 입력 → 원문+한국어 번역 병기 동작 (사용자 확인 2026-06-03)
7. ✅ **7단계 코드 완결** — stale(requestSeq+C1 fix) + 광고 구간 clear(null 이벤트+requestedFor 리셋) + seek/loop(sync 커버) + 캐시 LRU. **64 테스트**. | **다음: 수동 게이트 종합 확인**(트랙전환 stale·광고 오버레이·LRU 동작) + 일본어 버그(보류·데이터 대기). (video_id 有 광고는 MVP 밖)

# Decisions
- **형태**: MV3 브라우저 확장. YTM 공식 플러그인 개념 없음 → 브라우저 확장이 유일 경로. content script 가 music.youtube.com 에 주입.
- **가사 소스**: LRCLIB `GET https://lrclib.net/api/get` (artist_name·track_name 필수, album_name·duration 선택, duration ±2초). CORS `allow_origin(Any)`, 키·rate limit 없음. 응답: syncedLyrics(LRC `[mm:ss.xx]`)·plainLyrics·instrumental·id·duration. (출처: lrclib.net/docs + tranxuanthang/lrclib server/src/lib.rs)
  - **실패 경로 4분기** (plan-review medium): ①404=매칭 없음 ②`instrumental:true`=연주곡(가사 없음 정상, "연주곡" 표시) ③`syncedLyrics=null`+plainLyrics 존재=싱크 불가(MVP 는 "싱크 가사 없음"으로 종료) ④200+duration 어긋남=틀린 매칭. `/api/search` 폴백은 **MVP 이후**(과한 범위).
- **번역 엔진**: Claude `POST https://api.anthropic.com/v1/messages`. 모델 `claude-haiku-4-5`($1/$5 MTok). 헤더 x-api-key + anthropic-version:2023-06-01 + content-type:application/json + anthropic-dangerous-direct-browser-access:true. 응답 content[0].text. **Claude 실패(429/5xx/키오류) 시 원문만 표시**(degraded). sonnet 옵션은 MVP 이후. (출처: platform.claude.com/docs + anthropic-sdk-typescript src/client.ts)
- **번역 I/O** (변경: "줄 수 검증"→"id 기반 매핑". 이유: 줄 수 검증은 한 줄만 어긋나도 곡 전체가 원문 폴백 + 메타태그·중복 타임스탬프·빈 줄·후렴 중복으로 줄 정합이 쉽게 깨짐 — plan-review high): LRC 원문 통째 전송 금지. 파서가 `{id,timeMs,text}[]` 생성 → 텍스트 있는 세그먼트만 `{id:text}` JSON 으로 Claude 전송 → `{id:번역}` JSON 수신 → id 로 머지, **누락 id 는 그 줄만 원문 유지(부분 복구)**.
- **아키텍처 (3-world)**: 곡 메타/시간을 `#movie_player.getVideoData()`/`getCurrentTime()` 으로 획득(DOM 셀렉터보다 견고, better-lyrics 검증). 이 객체는 MAIN world 에만 존재 → 스크립트 분리: **MAIN world**(player 접근, 곡·시간 CustomEvent 발신, videoId 변화 감지) + **ISOLATED world**(이벤트 수신, chrome.storage, background 통신, 오버레이). `getCurrentTime()` 은 초(float) → lrc.js 에서 ms 변환. MAIN→ISOLATED 시간 전달 주기와 렌더 보간 주기는 G1 에서 실측해 확정.
- **stale 응답 폐기** (신규, plan-review critical): ISOLATED 가 요청마다 단조증가 `requestId`(=trackEpoch) 발급 → SW 응답에 echo → **현재 epoch === 응답 epoch 일 때만 반영**. videoId 단독 검증은 loop·A→B→A 재진입에서 stale 통과하므로 불충분.
- **상태 머신** (신규, codex 제안): `EMPTY→DETECTING→FETCHING_LYRICS→TRANSLATING→READY→FAILED`, 모든 전이는 trackEpoch 일치 시에만. race 와 실패 경로를 한 곳에서 관리.
- **stale 구현 확정** (2026-06-03, dlc + plan-review): ①**요청당 `requestSeq`**(content.js, 가사 발사마다 ++); 발사 시 `reqSeq` 클로저 캡처 → **모든 응답 경로(성공/not_found 등/catch)** 에서 `reqSeq!==requestSeq` 면 폐기. (draft 원안 '트랙당 epoch' 는 동일 videoId out-of-order 미차단 → plan-review 로 '요청당 seq'로 정정. 트랙 식별·오버레이 clear·재요청 트리거는 `currentVideoId` 가 담당 — 2-token 불필요, plan 원안 'requestId'로 복귀.) ②**background echo 불필요** — `await chrome.runtime.sendMessage` 는 응답이 요청에 1:1(Promise) → 클로저 캡처가 echo 동치 → background/main-world **무변경**(plan-review 확인). ③상태는 경량 유지하되 **실패 reason 직교**: 번역 실패=가사 READY+degraded(원문 표시), not_found/instrumental/no_synced 는 가사 없음 — 6-state full 불요. ④순수 reducer `src/sync.js`(ESM export)+`tests/sync.test.js`: A→B→A·동일videoId out-of-order·seek·loop·stale실패·degraded 시퀀스 TDD; content.js 는 window 공유/인라인(findCurrentIndex 선례). ⑤**스코프 제외(defer)**: requestKey/duration 안정화(일본어 가설③ 영역, 사용자 보류)·SW inFlight dedupe·콜드스타트 재시도·flag 배선·광고 오버레이 clear.
- **외부 API 호출 위치**: background service worker (MV3 에서 content script fetch 는 페이지 origin CORS 에 막힘; SW 는 host_permissions 으로 우회). content↔SW 는 chrome.runtime.sendMessage + 리스너 `return true`.
- **캐시** (변경: "videoId 별"→복합 키 2층. 이유: 모델 2종·언어·프롬프트 변경 시 오염 — plan-review high): 키 = `videoId + lang + model + promptVersion + syncedLyrics해시`. **SW inFlight(메모리 dedupe, 동일 요청 동시 1개)** + **완료 결과 chrome.storage.local(2층)**. 번역 요청은 **트랙 identity 변경 시 1회만**; seek/pause/timeupdate 는 렌더 전용(재번역 금지).
- **API 키 보안** (보강): chrome.storage.local 저장. **read 는 background.js(SW) 전용, write 는 popup 전용, content/main world 절대 비접근**. 하드코딩·로깅 금지(§8). Anthropic 공식 "dangerous" 경고 → 본인용·미배포 한정.
- **오버레이 보안** (신규): 가사·번역은 외부 입력 → **textContent 삽입만(innerHTML 금지)**, XSS 방지(§8 외부 입력 불신).
- **광고 처리** (신규, plan-review): 광고 videoId/player 상태 구간은 LRCLIB·Claude 호출 안 함, 오버레이 숨김.
- **feature flag** (신규, rollback): `translationEnabled`/`overlayEnabled`/`useCache`/`debugMode` (chrome.storage) → "번역 OFF, 원문 싱크 유지" degraded 롤백.
- **테스트**: node:test (의존성 0). 순수 함수 단위테스트 — lrc 파서(메타필터·중복 ts 전개·빈 줄·2/3자리 ms), 현재줄 이진탐색(첫 줄 이전/마지막 이후/정확 일치 경계), 번역 머지(부분 복구), 캐시 키 생성. 3-world 통신·player API·오버레이·실 API 는 수동 게이트(G1~G3).
- **MVP 범위**: syncedLyrics 있는 곡만 + 영어→한국어 + 원문+번역 병기 + stale 폐기 + 키 SW 전용 + Claude 실패 시 원문. 이후: search 폴백, sonnet, 다국어 자동감지, "번역만" 토글, 로마자, seek-to-middle/인트로 정교화.
- **플랫폼 확장 검토** (2026-06-03, researcher): 차별점=LLM 번역 품질(`translate.js`); better-lyrics·YTM 공식(2025-10~ 테스트)은 기계번역. 이식난이도 ①Userscript(`@grant none`+`GM_xmlhttpRequest`/`@connect`, 코어 거의 그대로; 같은 브라우저라 실익 적음) ②th-ch/youtube-music Electron 플러그인(renderer 메타+위치+오버레이; LRCLIB 이미 내장→번역 레이어만) ③OS 미디어세션(Win GSMTC: `Position`이 LastUpdatedTime 스냅샷→연속 싱크 정확도 미보장·트랙길이 없어 매칭 약함; Spotify 등 범용이 유일 장점, mac 15.4+ 접근제한). **결론**: chrome ext 유지 + 순수 코어(lrc/lrclib/translate) 플랫폼 독립 유지. OS 범용은 GSMTC position 갱신주기 로컬 측정 선행.

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
- **[진단 입력 대기]** 일본어 싱크 버그: 재현 곡의 실제 데이터(콘솔 `[yltt]` 로그 author/title/durationSec/줄수, 또는 곡명) 필요. 받으면 LRCLIB 조회로 가설 3개 중 확정 가능 — 입력만 오면 즉시 진행(작업 자체가 막힌 건 아님, status 유지).
- ③ (재작성) 번역 매핑: 줄 수 검증 → **id 기반 매핑 + 부분 복구**(위 Decisions 반영). 구현 핵심 리스크.
- ④ (신규) stale 응답 race → requestId echo 검증 + 상태 머신(위 반영). 구현 핵심.
- ⑤ (신규) 광고 재생 videoId/player 상태 구간 처리.
- ① MV3 SW fetch 에서 anthropic-dangerous-direct-browser-access 실제 필요 여부 → 일단 포함, G 단계서 확인.
- ② `"world":"MAIN"` manifest 정확 문법 → better-lyrics manifest 참고해 확정.

# Review Disposition (2026-06-02 plan-review)
- **fix(plan 반영)**: stale race(requestId)·id 기반 I/O·복합 캐시키·키 SW 전용·실패 4분기·Claude 실패경로·광고 처리·오버레이 textContent·feature flag·상태 머신·tick 단위·TDD 대상 확대·게이트 사슬.
- **defer(MVP 이후)**: /api/search 폴백, sonnet 옵션, 다국어 자동감지, 로마자, seek-to-middle/인트로 정교화.
- **false-positive/wontfix**: 없음.

## stale 정식화 (2026-06-03 plan-review, Claude+codex)
- **fix(이번 반영)**: ①트랙당 epoch→**요청당 requestSeq**(동일 videoId out-of-order). ②**catch/실패/degraded 전 경로 stale 가드**. ③실패 reason 직교(degraded=READY+원문). ④순수 reducer 시퀀스 테스트(A→B→A·out-of-order·seek·loop·stale실패).
- **defer(스코프 밖)**: requestKey/duration 안정화(일본어 가설③·사용자 보류)·SW inFlight dedupe(plan 캐시 Decisions 와 코드 불일치 → 코드 기준 'MVP 이후'로 정정)·SW 콜드스타트 reject 재시도·feature flag 실배선·광고 중 오버레이 clear.
- **확인된 정당성(✅)**: echo 불필요·경량 상태·seek 재요청 금지·loop epoch 불변.
- **code-review(2026-06-03, Claude+codex) fix**: **C1** title-lag stale(트랙 전환 직후 빈 title 창+캐시 즉답으로 옛 응답 통과; seq 가 요청에만 묶여 트랙 전환 미연동) → `trackChanged` 시 `seq++` 차단 + 재현 테스트 3종(M1) + 인라인 양쪽 동시(M2 drift 방지). **defer 잔존**: m2 광고/로딩 video_id 소실 구간 stale = C1 fix 로도 안 닫힘(trackChanged 미발생) → plan '광고 오버레이 clear' defer 와 통합 추적.

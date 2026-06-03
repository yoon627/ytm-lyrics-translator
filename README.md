# YTM Lyrics Translator

YouTube Music(데스크톱 Chrome)에서 재생 중인 곡의 **싱크 가사**를 [LRCLIB](https://lrclib.net)에서 가져와 **Google Gemini**로 번역하고, 원문과 번역을 재생 위치에 맞춰 화면 오버레이로 보여주는 개인용 Chrome 확장(Manifest V3)입니다.

> **차별점:** better-lyrics나 YTM 공식 번역은 기계번역이라 한국어 품질이 떨어집니다. 이 확장은 LLM(Gemini)으로 문맥을 살려 의역합니다.

> ⚠️ 개인용 개발 빌드입니다. 스토어에 배포되지 않으며, 아래처럼 직접 로드해 사용합니다.

## 특징

- 재생 중인 곡의 싱크 가사를 자동 표시하고 현재 줄을 강조
- Gemini로 줄별 문맥 번역 — 원문과 번역을 함께 표시
- 번역 결과 캐시 (곡당 1회 번역, 최대 200곡 LRU)
- API 키는 브라우저 로컬에 저장 (번역 요청 시에만 Google Gemini로 전송)
- 외부 런타임 의존성 0, 빌드 스텝 없음

## 작동 방식

1. **MAIN world 스크립트**가 YTM 내부 `#movie_player`에서 곡 정보(곡 ID·제목·아티스트·재생 위치·길이)를 250ms마다 읽습니다.
2. 곡이 바뀌면 **content script**가 background에 가사를 요청합니다. 오래된 응답은 폐기해 빠른 곡 전환 시 가사가 섞이지 않게 합니다.
3. **background service worker**가 LRCLIB에서 싱크 가사를 조회 → LRC 파싱 → Gemini(`gemini-2.5-flash`)로 줄별 번역 → 캐시합니다.
4. **오버레이**가 원문+번역을 표시하고 재생 위치에 맞춰 현재 줄을 하이라이트합니다.

> 외부 호출은 모두 background service worker에서 일어납니다(MV3 CORS 우회). 가사 조회는 `lrclib.net`, 번역은 `generativelanguage.googleapis.com` 만 사용합니다.

## 설치 & 사용법

1. 이 저장소를 클론하거나 ZIP으로 다운로드합니다.
   ```bash
   git clone https://github.com/yoon627/ytm-lyrics-translator.git
   ```
2. [Google AI Studio](https://aistudio.google.com/app/apikey)에서 **Gemini API 키**를 무료로 발급받습니다.
3. Chrome 주소창에 `chrome://extensions` 입력 → 우상단 **개발자 모드** 켜기 → **압축해제된 확장 프로그램을 로드합니다** → 이 폴더를 선택합니다.
4. 툴바의 확장 아이콘을 클릭 → **Gemini API Key** 를 붙여넣고 **저장**합니다.
5. [music.youtube.com](https://music.youtube.com) 에서 곡을 재생하면 화면 우하단에 원문+번역 오버레이가 나타납니다.

## 설정 (확장 팝업)

| 항목 | 설명 |
| --- | --- |
| **Gemini API Key** | 번역에 사용. 없으면 번역 없이 원문 가사만 표시 |
| **대상 언어** | 기본 `Korean`. 영어 명칭으로 입력 (예: `Korean`, `English`, `Japanese`) |
| **번역 켜기** | 끄면 번역을 건너뛰고 원문 가사만 싱크 표시 |

키는 이 브라우저의 `chrome.storage.local` 에만 저장됩니다.

## 동작 범위와 한계

- **데스크톱 Chrome의 `music.youtube.com` 전용** — 모바일 앱·다른 브라우저는 미지원.
- LRCLIB에 **싱크 가사가 있는 곡만** 표시합니다. 연주곡, 싱크 없는 곡, 매칭 실패 곡은 오버레이가 뜨지 않습니다.
- 번역 실패(키 오류·요청 한도·서버 오류) 시 원문 가사만 표시합니다(degraded).
- 일부 곡(특히 일부 일본어 곡)에서 싱크가 어긋날 수 있습니다 — LRCLIB 매칭/타임스탬프 관련 이슈로 조사 보류 중.

## 프라이버시 / 보안

- API 키 **read는 background, write는 팝업 코드에서만** 이뤄집니다 (content·페이지 스크립트는 키를 읽지 않음).
- 가사·번역 텍스트는 `textContent` 로만 삽입합니다(`innerHTML` 미사용, XSS 방지).
- 키는 Gemini 호출 시 요청 헤더로만 사용되며, 그 외 어디에도 전송·로깅하지 않습니다.

## 개발

```bash
npm test      # node --test — 순수 함수 단위 테스트
```

순수 로직(파서·매칭·번역 머지·캐시·stale 처리)은 단위 테스트로 검증하고, 브라우저 통합(player 접근·오버레이·실제 API)은 수동으로 확인합니다. 외부 의존성은 없습니다.

### 구조

```
manifest.json        MV3. content_scripts(MAIN/ISOLATED) + background SW + popup
src/
  main-world.js      MAIN world — #movie_player 접근, 곡·시간 이벤트 발신
  content.js         ISOLATED — 이벤트 수신, 가사 요청, stale 폐기, 오버레이 갱신
  background.js      SW — LRCLIB fetch → 파싱 → Gemini 번역 → 캐시 (키 read 유일 지점)
  lrclib.js          LRCLIB 조회 + 실패 분기(미매칭/연주곡/싱크없음)
  lrc.js             LRC 파서 + 현재 줄 이진탐색
  translate.js       Gemini 번역 + 부분복구 머지 + 캐시 키
  sync.js            stale 응답 폐기용 순수 reducer
  cache.js           번역 캐시 LRU
  overlay.js/.css    오버레이 UI
popup/               키·언어·번역 토글 설정
tests/               순수 함수 단위 테스트
```

기술 스택: 바닐라 JavaScript(ESM), Manifest V3, Node.js `node:test`. 빌드·번들 과정이 없습니다.

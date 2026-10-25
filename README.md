# 1vs1 Arena 2

Python + pygame으로 만든 1대1 대전 게임입니다. pygbag으로 웹에서 실행됩니다.

- 플레이: https://growingleave.github.io/1vs1-arena-2/

## 웹 버전 (JavaScript, 옮기는 중)

pygame 버전을 순수 HTML/JavaScript(Canvas)로 조금씩 옮기고 있습니다. 설치 없이 브라우저만 있으면 실행됩니다.

- 플레이: https://growingleave.github.io/1vs1-arena-2/web/ (main 브랜치에 합쳐진 뒤)
- 크롬북에서 바로 열기: `web/index.html` 파일을 더블클릭
- 지금까지 옮긴 것: 검사, 마법사 / 클래식 아레나 맵 / 캐릭터 선택(연습장) → VS 화면 → 맵 선택 → 전투 → 결과
- 아직 안 옮긴 것: 나머지 9개 캐릭터, 용암 구덩이·설원 맵, 조이스틱(조이콘)

`web/` 폴더 구조:

- `index.html`: 실행 파일 (스크립트 순서가 중요합니다)
- `js/core.js`: 화면 크기, 게임 시간, 사각형/충돌 판정, 글자, 소리
- `js/status.js`: 상태이상 (`status_effects.py`)
- `js/world.js`: 벽, 구슬, 맵 (`wall.py`, `pickup.py`, `map.py`)
- `js/player.js`: 플레이어 (`player.py`)
- `js/characters/`: 캐릭터별 스킬 (`abilities/`). 새 캐릭터는 파일을 만들고 `index.js`와 `index.html`에 추가합니다.
- `js/input.js`: 키보드 입력
- `js/game.js`: 화면 흐름과 전투 진행 (`main.py`)
- `js/main.js`: 1/60초 고정 틱 게임 루프

나중에 온라인 대전을 붙이기 쉽도록, 플레이어는 키보드를 직접 읽지 않고 매 틱 `{ up, down, left, right, skills }` 입력을 받습니다.

## 폴더 구조

- `src/assets/`: 게임 원본 코드와 리소스입니다. 여기서 수정합니다.
  - `main.py`: 게임 진입점
  - `abilities/`: 캐릭터별 스킬
  - `images/`, `sounds/`, `font/`: 리소스
- `index.html`: 브라우저용 파이썬 실행기입니다(pygbag). 보통 수정하지 않습니다.
- `web_src.tar.gz`, `web_src.apk`: 배포용 압축 파일입니다. `build.py`로 생성합니다.

## 수정 후 배포

1. `src/assets/` 안의 코드를 수정합니다.
2. PC에서 확인: `cd src/assets && python main.py`
3. 배포 파일 생성: `python build.py`
4. 커밋하고 push하면 GitHub Pages에 반영됩니다.

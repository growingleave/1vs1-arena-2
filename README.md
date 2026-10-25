# 1vs1 Arena 2

Python + pygame으로 만든 1대1 대전 게임입니다. pygbag으로 웹에서 실행됩니다.

- 플레이: https://growingleave.github.io/1vs1-arena-2/

## 웹 버전 (JavaScript, 옮기는 중)

pygame 버전을 순수 HTML/JavaScript(Canvas)로 조금씩 옮기고 있습니다. 설치 없이 브라우저만 있으면 실행됩니다.

- 플레이: https://growingleave.github.io/1vs1-arena-2/web/ (main 브랜치에 합쳐진 뒤)
- 크롬북에서 바로 열기: `web/index.html` 파일을 더블클릭
- 지금까지 옮긴 것: 캐릭터 11개 전부 / 클래식 아레나 맵 / 캐릭터 선택(연습장) → VS 화면 → 맵 선택 → 전투 → 결과
- 아직 안 옮긴 것: 용암 구덩이·설원 맵, 조이스틱(조이콘)

`web/` 폴더 구조:

- `index.html`: 실행 파일 (스크립트 순서가 중요합니다)
- `js/core.js`: 화면 크기, 게임 시간, 사각형/충돌 판정, 글자, 소리
- `js/status.js`: 상태이상 (`status_effects.py`)
- `js/world.js`: 벽, 구슬, 맵 (`wall.py`, `pickup.py`, `map.py`)
- `js/player.js`: 플레이어 (`player.py`)
- `js/characters/`: 캐릭터별 스킬 (`abilities/`). `common.js`는 캐릭터들이 같이 쓰는 도구입니다. 새 캐릭터는 파일을 만들고 `index.js`와 `index.html`에 추가합니다.
- `js/input.js`: 키보드 입력
- `js/game.js`: 화면 흐름과 전투 진행 (`main.py`)
- `js/main.js`: 1/60초 고정 틱 게임 루프 (혼자 할 때 / 온라인일 때)
- `js/net.js`: 온라인 대전 연결, `js/lobby.js`: 방 만들기·들어가기 화면
- `../server/server.js`: 온라인 대전 서버 (방 관리, 입력 모아 보내기)

나중에 온라인 대전을 붙이기 쉽도록, 플레이어는 키보드를 직접 읽지 않고 매 틱 `{ up, down, left, right, skills }` 입력을 받습니다.

## 온라인 대전 (다른 기기끼리)

시작 화면에서 **방 만들기**를 누르면 4글자 방 코드가 나옵니다. 다른 기기에서 그 코드를 입력하고 **방 들어가기**를 누르면 대전이 시작됩니다.

- 온라인 조작 (P1/P2 모두 같은 키): 이동 WASD 또는 방향키 · 평타 G · 스킬 H, J · 궁극기 Y · 준비 SPACE
- 방식: 서버는 1초에 60번 두 사람의 입력을 모아 보내기만 하고, 두 기기가 같은 입력으로 게임을 똑같이 계산합니다. 그래서 서버가 가볍고 데이터도 적게 씁니다.
- 게임 안의 무작위 값은 `gameRandom()`(씨앗이 같으면 같은 값이 나오는 난수)만 씁니다. 캐릭터를 고칠 때 `Math.random()`을 쓰면 두 기기 화면이 어긋나니 주의하세요. 화면 그리기(draw) 코드에서 게임 상태를 바꾸는 것도 마찬가지입니다.
- 두 기기의 게임 상태가 어긋나면 화면 아래 표시줄에 경고가 뜹니다.

### 서버 배포 (Render, 무료)

1. https://render.com 에 GitHub 계정으로 가입합니다.
2. 대시보드에서 **New → Blueprint**를 고르고 이 저장소를 선택합니다. `render.yaml` 설정대로 싱가포르 지역 무료 서버가 만들어집니다.
3. 배포가 끝나면 `https://(서비스 이름).onrender.com` 주소가 생깁니다. **이 주소로 들어가면 바로 온라인 대전을 할 수 있습니다.**
4. GitHub Pages 주소(`/web/`)에서도 온라인 대전을 하려면 `web/js/net.js`의 `ONLINE_SERVER_URL`에 `wss://(서비스 이름).onrender.com`을 적습니다.

무료 서버는 15분 동안 아무도 접속하지 않으면 잠들고, 다시 깨어나는 데 1분쯤 걸립니다. 행사 전에 미리 한 번 접속해 두세요.

### 내 컴퓨터에서 서버 실행 (Node.js 필요)

```
npm install
npm start
```

http://localhost:3000 으로 접속합니다. 같은 와이파이의 다른 기기는 `http://(이 컴퓨터 IP):3000` 으로 접속합니다.

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

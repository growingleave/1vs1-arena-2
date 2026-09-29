# 1vs1 Arena 2

Python + pygame으로 만든 1대1 대전 게임입니다. pygbag으로 웹에서 실행됩니다.

- 플레이: https://growingleave.github.io/1vs1-arena-2/

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

# 1vs1 Arena (웹 버전) — 작업 규칙

파이게임 1vs1 대전 게임을 바닐라 JS 웹 버전으로 옮긴 프로젝트.
11월 6일 행사에서 **저사양 크롬북 여러 대로 온라인 대전**을 한다 (Render 서버 https://arena-1vs1.onrender.com, 방 코드로 만들기/들어가기).

## 빠른 시작 (새 세션은 먼저 이것만 보고 바로 작업)
- 고칠 파일: 캐릭터별 `web/js/characters/<이름>.js` 하나 + 필요하면 그림 생성기 `tools/<이름>_gen.js`. 공통 이펙트 클래스는 `web/js/vfx.js`.
- 비슷한 작업은 이미 끝난 캐릭터를 참고 (모든 캐릭터가 구운 그림 + 코드 파티클로 완성됨). 코드 전체를 훑지 말 것.
- 그림 생성: `node tools/<이름>_gen.js <폴더>` → 나온 PNG를 `web/assets/`에 복사.
- 확인 이미지: `node tools/tests/shot.js <캐릭터번호> <스킬번호 0~3> <폴더> 100,300,600` → `<폴더>/shot_all.png` 한 장. 다른 장면이 필요하면 복사해서 장면 부분만 고친다.
- 동기화 테스트: `node tools/tests/sync_test.js 3-3 3-0` (캐릭터번호쌍). 전부 '같음', `ERRS []`면 통과.
  궁극기까지 시험하려면 `FULL_ULT=1 node tools/tests/sync_test.js 4-4`.
- 온라인 재현 테스트: 서버를 켜고(`PORT=3123 npm start`, 서버 경유만 보려면 `RELAY_ONLY=1`) → `PORT=3123 CPU=4 node tools/tests/net_test.js`. 가짜 와이파이(좋음/보통/나쁨)에서 1P·2P 입력 지연과 화면 멈춤 비율.
- 렉 테스트: `node tools/tests/perf_test.js 6-6` (CPU 6배 느리게, 실제 대전 프레임 시간). 평균이 16.7ms보다 한참 아래, '16.7ms 넘김'이 1% 아래면 괜찮음.
- Playwright·Chromium은 컨테이너에 이미 있음 (설치하지 말 것).

## 사용자와 일하는 방식
- 사용자는 한국어로 말한다. 답도 한국어로, 짧고 쉽게.
- **"찾아만 봐", "초안만", "코딩은 아직"** 이라고 하면 구현하지 말고 조사·초안(확인 이미지)만 보여준다. "넣어줘"라고 하면 그때 구현.
- 추천을 물으면 여러 안을 늘어놓기보다 하나를 추천한다.
- **확인 이미지는 작게, 한 장으로** 합쳐서 보낸다 (토큰 절약). 여러 장면은 한 장에 나란히.
- 작업은 한 번에 묶어서 한다. 끝나면 커밋 → PR → main에 머지까지 하고 결과를 보고한다.
- 결과 보고 때 밸런스가 바뀌는 부분(최대 피해량 등)이 있으면 한 줄로 알려준다.

## 이펙트(VFX) 규칙
- **메인 그림은 구운 그림(PNG)으로, 보조 이펙트·파티클만 코드로** 그린다.
  - 구운 그림은 `tools/*_gen.js` (Playwright 캔버스) 로 만들고 `web/assets/`에 복사한다. 생성기도 커밋한다.
  - 게임용 그림은 1/2 크기로 저장한다.
  - 빛나는 그림: 검은 배경 + 블러 → 밝기를 투명도로 → 게임에서 `'lighter'`로 그림. 흰 그림은 `vfxTinted`로 색을 입히고 흰 심을 살짝 겹친다.
  - 물체 그림(칼·칼집·주사기 등)은 보통(`source-over`)으로 그린다.
- **캐릭터마다 자기 이펙트 색**을 쓴다 (빨강/파랑 팀 색으로 칠하지 않는다). 각 캐릭터 데이터의 `fxColor` — 색은 사용자가 정해준다.
- 왼쪽을 볼 때는 그림을 좌우 반전 (대각선 포함).
- 판정(히트박스) 크기와 그림 크기를 맞춘다.
- 맞혔을 때·사용할 때·투사체가 벽/사거리 끝에서 사라질 때 파티클을 넣는다.

## 렉 기준: 저사양 크롬북
- 매 프레임 `ctx.filter`(blur), `shadowBlur`, 큰 그라디언트 새로 만들기 금지. 블러는 미리 구워둔다.
- 색 입힌 그림·실루엣은 한 번만 만들어 캐시해서 재사용 (`vfxTinted`).
- 계속 나오는 파티클은 적게. 이펙트는 `Vfx`가 최대 32개까지만 유지한다.
- 화면 전체를 번쩍이는 연출은 피한다 (눈 피로 + 비용).
- 새 연출을 넣으면 렉 영향을 같이 설명한다.

## 온라인 동기화 (락스텝) — 꼭 지킬 것
- 게임 로직은 `gameRandom`과 `Time.now`만 쓴다. `Math.random`·`Date.now`·`performance.now`는 **화면 전용(VFX)** 에서만.
- VFX는 결과에 영향을 주면 안 된다 (시뮬레이션 코드에서 `Vfx.spawn` 하는 건 괜찮음).
- `gameChecksum`은 hp, rect, ultGauge, attacks 개수를 본다.
- 스킬을 바꾸면 두 클라이언트가 같은 결과를 내는지 동기화 테스트를 돌린다 (Playwright로 같은 입력을 두 번 돌려 비교).

## 코드 구조 메모
- `web/index.html`의 스크립트 순서가 곧 로드 순서: core → vfx → … → characters/common → characters/* → characters/index → …
  - 새 캐릭터 파일은 `index.html`과 `characters/index.js`(CHARACTER_REGISTRY)에 둘 다 추가.
- 캐릭터 순서: 0 검사, 1 마법사, 2 무투가, 3 가속자, 4 데몰리셔니스트, 5 해커, 6 어쌔신, 7 그라인더, 8 DIO, 9 샌즈, 10 궁수, 11 뱀파이어.
- 로드아웃: 왼쪽(P1)·오른쪽(P2) 구역마다 선택창(`select`)/훈련장(`train`). 훈련장 발판 = 능력 바꾸기·허수아비 복귀. 캐릭터를 바꾸면 `resetTraining`으로 그 플레이어의 공격·소환물까지 완전 리셋. 테스트는 `g.sides[*].mode = 'train'`로 바로 훈련장.
- 궁극기 게이지: 기본 초당 2 + 준 피해 1당 0.6 (player.js의 ULT_PASSIVE_RATE·ULT_DAMAGE_RATE). 통 크기는 캐릭터마다 `player.maxUltGauge` (검사 100 기준), 아이콘은 통 대비 %. 궁극기로 생긴 공격은 `isUlt` 표시(player.js·game.js가 자동으로 붙이고 퍼뜨림) → 궁극기 피해는 게이지를 채우지 않는다. 궁극기 코드에서 직접 `takeDamage` 할 때도 `addUltGauge` 하지 말 것.
- 플레이어 훅: `preUpdateHooks`, `preDrawHooks`(몸 아래), `postDrawHooks`(몸 위), `bodyStyle`. 캐릭터를 바꾸면 플레이어가 새로 만들어진다.
- 벽 통과 불가 투사체는 판정 가운데의 작은 판정(35%, 최소 8px)이 벽에 닿을 때만 사라진다 (`wallCoreRect` / `wallCorePoints`).
- 조작: 온라인은 방향키 + Q W E R (평타, 스킬1, 스킬2, 궁) — `net.js`. 한 기기 2인용은 `input.js`의 노트북/크롬북 키 배치.

## 남은 일 (메모)
- 소리: 피격 소리만 (core.js `HitSound`, `web/assets/hit.ogg` → `sh tools/hit_sound_build.sh` → `web/js/hit_sound_data.js`). 스킬 효과음은 없앰. 배경음악: `web/js/bgm.js` + `web/assets/bgm.ogg` (반복, 첫 키 입력 때 시작, M 키로 끄기/켜기).
- 모든 캐릭터 이펙트 교체 완료 (2026-11-01). 이후는 실제 크롬북 테스트·세부 조정.
- 평타 후딜 BASIC_POST_DELAY 0.08초(common.js applyBasicPostDelay): 검사, 폭파광, 어쌔신 찌르기. 어쌔신 찌르기 11.2/쿨 450ms, 회전 베기는 16.8/350ms/후딜 없음.
- 마법사/해커 몸 그림: tools/portrait_gen.js (원본 tools/src/portraits_src.png, 바깥 체크무늬만 지움, 128 정사각형).
- 몸 그림: tools/portrait_gen.js (원본 tools/src/portraits_src.png, portraits2_src.png). 9명(마법사·해커·검사·궁수·무투가·어쌔신·뱀파이어·분쇄자·샌즈) 같은 배율(원본 1px=0.1285), 바닥=히트박스 바닥. 출력된 spriteSize/spriteAnchor를 각 apply에 적음. 마법사·해커 외 7명은 1.15배 키움(ay=1-20/size).
- 기본맵(클래식 아레나): 좌우 한 칸 벽·상하 얇은 벽 제거, 구슬 대신 보급 상자(terrain.js SupplyDropEvent, 수치는 SUPPLY). 첫 상자 8초, 먹은 뒤 15초마다. 확률 보통 체력40/궁40/공20, 궁 풀이면 체력60/공40, 풀피면 궁60/공40. 체력 +40, 궁 +통의 30%, 공격력 +20% 8초(status power_up, game.updateAttacks에서 곱함). 그림 tools/supply_gen.js.
- 기본맵 그림: tools/arena_classic_gen.js → arena_classic_floor.webp(바닥, 맨 먼저) + arena_classic_walls.png(벽, drawGround 다음에 벽 부분만 잘라 그림). 맵 정의 floorImage/wallImage. 벽 옮기면 다시 구움.
- 해커 평타 판정: 몸 네모(+8px)가 스캔 삼각형에 닿으면 게이지. 뱀파이어 창 길이 135, 찌른 뒤 조금만 물림.
- 상태이상·버프 공통 이펙트: web/js/status_vfx.js (drawStatusUnder/Over, player.draw에서 호출). 맞을 때 0.12초 슬로우는 안 그림(slow.total).

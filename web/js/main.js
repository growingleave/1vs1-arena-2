// 게임 루프: 1/60초 고정 틱으로 게임을 진행하고, 브라우저가 그릴 때마다 화면을 그린다.
// 화면 주사율(60Hz, 120Hz...)이나 일시적인 버벅임과 상관없이 게임 속도가 항상 같게 유지된다.
//
// - 혼자(한 키보드로 둘이) 할 때: 내 키보드 입력으로 바로 틱을 진행한다.
// - 온라인일 때: 서버가 보내준 틱(두 사람 입력)만큼만 진행한다. 두 기기가 같은 틱을 같은 순서로 계산한다.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const TICK_MS = 1000 / 60;
const MAX_TICKS_PER_FRAME = 5;   // 탭을 오래 비웠다가 돌아와도 한꺼번에 몰아서 진행하지 않게 (혼자 할 때)
const ONLINE_BUFFER_LIMIT = 4;   // 온라인에서 받아둔 틱이 이보다 많이 쌓이면 빠르게 따라잡는다
const ONLINE_MAX_CATCH_UP = 300; // 한 번 그릴 때 따라잡는 최대 틱 수 (화면이 멈춘 것처럼 보이지 않게)

let game = new Game();
let lastTime = performance.now();
let accumulator = 0;

// 온라인 대전 시작: 두 기기가 완전히 같은 상태에서 출발해야 한다
Net.onStart = (seed) => {
    Time.now = 0;
    seedRandom(seed);
    applyControlScheme('chromebook');
    pressedKeys.clear();
    tappedKeys.clear();
    keyDownQueue.length = 0;
    game = new Game();
    game.state = 'LOADOUT';
    accumulator = 0;
    Lobby.message = '';
};

// 상대가 나가거나 연결이 끊기면 시작 화면으로
Net.onEnd = (message) => {
    Lobby.message = message;
    backToTitle();
};

function backToTitle() {
    seedRandom(Date.now());
    pressedKeys.clear();
    tappedKeys.clear();
    keyDownQueue.length = 0;
    game = new Game();
}

function stepLocal() {
    if (accumulator > TICK_MS * MAX_TICKS_PER_FRAME) accumulator = TICK_MS * MAX_TICKS_PER_FRAME;
    while (accumulator >= TICK_MS) {
        // 새로 눌린 키(메뉴 조작)를 먼저 처리하고, 눌려 있는 키로 플레이어를 움직인다
        while (keyDownQueue.length > 0) game.handleKeyDown(keyDownQueue.shift());
        game.step(TICK_MS / 1000, readInput(P1_CONTROLS), readInput(P2_CONTROLS));
        clearTappedKeys();
        accumulator -= TICK_MS;
    }
}

function stepOnline() {
    // 평소에는 1/60초마다 받은 틱을 하나씩 계산한다
    while (accumulator >= TICK_MS && Net.frames.length > 0) {
        Net.applyFrame(Net.frames.shift(), game, TICK_MS / 1000);
        accumulator -= TICK_MS;
    }
    // 받은 틱이 없으면 기다린다 (그동안 시간을 쌓아두지 않는다)
    if (Net.frames.length === 0) accumulator = Math.min(accumulator, TICK_MS);

    // 네트워크가 잠깐 막혔거나 탭을 내렸다 오면 틱이 밀린다 → 빠르게 따라잡기
    let caughtUp = 0;
    while (Net.frames.length > ONLINE_BUFFER_LIMIT && caughtUp < ONLINE_MAX_CATCH_UP) {
        Net.applyFrame(Net.frames.shift(), game, TICK_MS / 1000);
        caughtUp += 1;
    }
}

function frame(now) {
    accumulator += now - lastTime;
    lastTime = now;

    if (Net.isOnline()) stepOnline();
    else stepLocal();

    game.render(ctx);
    Lobby.update(game);
    requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

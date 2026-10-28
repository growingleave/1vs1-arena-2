// 게임 루프: 1/60초 고정 틱으로 게임을 진행하고, 브라우저가 그릴 때마다 화면을 그린다.
// 화면 주사율(60Hz, 120Hz...)이나 일시적인 버벅임과 상관없이 게임 속도가 항상 같게 유지된다.
//
// - 혼자(한 키보드로 둘이) 할 때: 내 키보드 입력으로 바로 틱을 진행한다.
// - 온라인일 때: 서버가 보내준 틱(두 사람 입력)만큼만 진행한다. 두 기기가 같은 틱을 같은 순서로 계산한다.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const TICK_MS = 1000 / 60;
const MAX_TICKS_PER_FRAME = 5;   // 탭을 오래 비웠다가 돌아와도 한꺼번에 몰아서 진행하지 않게 (혼자 할 때)
const ONLINE_CATCH_UP_MARGIN = 2; // 받아둔 틱이 (여유분 + 이 값)보다 많으면 따라잡는다
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
    // 1/60초마다 받은 틱을 하나씩 계산한다. 틱이 없으면 그냥 기다린다 (시간을 쌓아두지 않는다)
    while (accumulator >= TICK_MS && Net.frames.length > 0) {
        Net.applyFrame(Net.frames.shift(), game, TICK_MS / 1000);
        accumulator -= TICK_MS;
    }
    if (Net.frames.length === 0) accumulator = Math.min(accumulator, TICK_MS);

    // 밀려서 틱이 쌓이면 따라잡는다. 여유분(bufferTarget)만큼은 남겨 둬서 다음 들쭉날쭉함을 버틴다.
    // 조금 많으면 한 틱씩 더(부드럽게), 아주 많으면(탭을 내렸다 오는 등) 한꺼번에
    const excess = Net.frames.length - (Net.bufferTarget() + ONLINE_CATCH_UP_MARGIN);
    let extra = excess > 60 ? Math.min(excess, ONLINE_MAX_CATCH_UP) : (excess > 0 ? 1 : 0);
    while (extra > 0) {
        Net.applyFrame(Net.frames.shift(), game, TICK_MS / 1000);
        extra -= 1;
    }
}

// 성능 측정: 1초 동안 몇 번 그렸는지(FPS), 계산·그리기에 평균 몇 ms 걸렸는지. 화면 오른쪽 아래에 작게 표시
const Perf = {
    frames: 0, stepMs: 0, drawMs: 0, since: performance.now(),
    fps: 0, avgStep: 0, avgDraw: 0,
    add(stepMs, drawMs) {
        this.frames += 1;
        this.stepMs += stepMs;
        this.drawMs += drawMs;
        const now = performance.now();
        if (now - this.since >= 1000) {
            this.fps = Math.round(this.frames * 1000 / (now - this.since));
            this.avgStep = this.stepMs / this.frames;
            this.avgDraw = this.drawMs / this.frames;
            this.frames = 0;
            this.stepMs = 0;
            this.drawMs = 0;
            this.since = now;
        }
    },
    draw(ctx) {
        const text = `FPS ${this.fps} · 계산 ${this.avgStep.toFixed(1)}ms · 그리기 ${this.avgDraw.toFixed(1)}ms`;
        drawText(ctx, text, WIDTH - 8, HEIGHT - 6, 12, 'rgba(160, 160, 170, 0.8)', { align: 'right', baseline: 'bottom' });
    },
};

function frame(now) {
    accumulator += now - lastTime;
    lastTime = now;

    const t0 = performance.now();
    if (Net.isOnline()) stepOnline();
    else stepLocal();
    const t1 = performance.now();
    game.render(ctx);
    const t2 = performance.now();
    Perf.add(t1 - t0, t2 - t1);
    Perf.draw(ctx);
    Lobby.update(game);
    requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

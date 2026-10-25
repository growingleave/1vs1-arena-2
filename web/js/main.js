// 게임 루프: 1/60초 고정 틱으로 게임을 진행하고, 브라우저가 그릴 때마다 화면을 그린다.
// 화면 주사율(60Hz, 120Hz...)이나 일시적인 버벅임과 상관없이 게임 속도가 항상 같게 유지된다.

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');

const TICK_MS = 1000 / 60;
const MAX_TICKS_PER_FRAME = 5; // 탭을 오래 비웠다가 돌아와도 한꺼번에 몰아서 진행하지 않게

const game = new Game();
let lastTime = performance.now();
let accumulator = 0;

function frame(now) {
    accumulator += now - lastTime;
    lastTime = now;
    if (accumulator > TICK_MS * MAX_TICKS_PER_FRAME) accumulator = TICK_MS * MAX_TICKS_PER_FRAME;

    while (accumulator >= TICK_MS) {
        // 새로 눌린 키(메뉴 조작)를 먼저 처리하고, 눌려 있는 키로 플레이어를 움직인다
        while (keyDownQueue.length > 0) game.handleKeyDown(keyDownQueue.shift());
        game.step(TICK_MS / 1000, readInput(P1_CONTROLS), readInput(P2_CONTROLS));
        clearTappedKeys();
        accumulator -= TICK_MS;
    }

    game.render(ctx);
    requestAnimationFrame(frame);
}

requestAnimationFrame(frame);

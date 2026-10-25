// 키보드 입력. 눌린 키를 기억해 두었다가, 매 틱 플레이어별 입력 객체로 바꿔준다.
// 키는 e.code(키보드 위치 기준)로 다뤄서 한/영 상태와 상관없이 동작한다.

const pressedKeys = new Set();
// 지난 틱 이후에 눌렸던 키. 한 틱(1/60초)보다 짧게 톡 쳐도 입력이 사라지지 않게 한 틱 동안은 눌린 걸로 본다
const tappedKeys = new Set();
const keyDownQueue = []; // 이번 틱에 새로 눌린 키 (메뉴 선택, 준비 확정 등에 사용)

// 시작 화면에서 노트북/크롬북 버전을 고르면 스킬키가 여기에 맞춰 바뀐다
const CONTROL_SCHEMES = {
    laptop: {
        label: '노트북 버전 (P1: H J K U ・ P2: 숫자패드 1 2 3 5)',
        p1Skills: ['KeyH', 'KeyJ', 'KeyK', 'KeyU'],
        p2Skills: ['Numpad1', 'Numpad2', 'Numpad3', 'Numpad5'],
    },
    chromebook: {
        label: "크롬북 버전 (P1: G H J Y ・ P2: L ; ' P)",
        p1Skills: ['KeyG', 'KeyH', 'KeyJ', 'KeyY'],
        p2Skills: ['KeyL', 'Semicolon', 'Quote', 'KeyP'],
    },
};

const P1_CONTROLS = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', skills: [] };
const P2_CONTROLS = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', skills: [] };

function applyControlScheme(name) {
    P1_CONTROLS.skills = CONTROL_SCHEMES[name].p1Skills;
    P2_CONTROLS.skills = CONTROL_SCHEMES[name].p2Skills;
}
applyControlScheme('chromebook');

function isDown(code) {
    return pressedKeys.has(code) || tappedKeys.has(code);
}

function readInput(controls) {
    return {
        up: isDown(controls.up),
        down: isDown(controls.down),
        left: isDown(controls.left),
        right: isDown(controls.right),
        skills: controls.skills.map(isDown),
    };
}

// 한 틱을 진행한 뒤에 부른다
function clearTappedKeys() {
    tappedKeys.clear();
}

// 게임에 쓰는 키는 브라우저 기본 동작(스크롤, ' 키의 빠른 찾기 등)을 막는다
const GAME_KEYS = new Set([
    'Space', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight',
    'Quote', 'Slash', 'Semicolon', 'Tab',
]);

// 방 코드 입력칸처럼 글자를 치는 곳에서는 게임 키로 쓰지 않는다
function isTypingTarget(e) {
    const tag = e.target && e.target.tagName;
    return tag === 'INPUT' || tag === 'TEXTAREA';
}

// 온라인 대전 중에는 내 키보드가 게임에 바로 들어가지 않고 서버로 간다 (net.js).
// 서버가 두 사람의 입력을 모아 돌려준 것으로만 게임이 진행된다.
window.addEventListener('keydown', (e) => {
    if (isTypingTarget(e)) return;
    if (GAME_KEYS.has(e.code)) e.preventDefault();
    if (e.repeat) return;
    if (Net.isOnline()) {
        Net.onLocalKeyDown(e.code);
        return;
    }
    pressedKeys.add(e.code);
    tappedKeys.add(e.code);
    keyDownQueue.push(e.code);
});

window.addEventListener('keyup', (e) => {
    if (Net.isOnline()) {
        Net.onLocalKeyUp(e.code);
        return;
    }
    pressedKeys.delete(e.code);
});

// 창 밖으로 포커스가 나가면 키가 눌린 채로 남지 않게 모두 뗀다
window.addEventListener('blur', () => {
    if (Net.isOnline()) Net.releaseAllLocalKeys();
    else pressedKeys.clear();
});

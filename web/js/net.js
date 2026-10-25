// 온라인 대전 연결 (서버: server/server.js)
//
// 1. 방 만들기 → 서버가 4글자 코드를 준다. 다른 기기에서 그 코드로 방 들어가기.
// 2. 두 명이 모이면 서버가 같은 무작위 씨앗(seed)과 함께 시작 신호를 보낸다.
// 3. 서버는 1초에 60번 "이번 틱의 두 사람 입력"을 보내고, 두 기기는 그 입력대로 한 틱씩 똑같이 계산한다.
//    (내 키보드 입력도 바로 쓰지 않고, 서버를 거쳐 돌아온 것으로만 게임에 반영한다)

// 온라인 대전 서버 주소 (Render에 배포한 서버).
// - 게임을 서버 주소(https://arena-1vs1.onrender.com)로 열면 그 서버에 바로 접속한다.
// - GitHub Pages 주소로 열거나, 크롬북에서 index.html 파일을 직접 열면 이 주소로 접속한다.
// - 주소 뒤에 ?server=ws://... 를 붙이면 다른 서버로 접속할 수 있다 (내 컴퓨터에서 시험할 때 등).
const ONLINE_SERVER_URL = 'wss://arena-1vs1.onrender.com';

// 온라인에서 내가 쓰는 키 (P1/P2 상관없이 같은 키로 조작한다)
const ONLINE_LOCAL_KEYS = {
    up: ['KeyW', 'ArrowUp'],
    down: ['KeyS', 'ArrowDown'],
    left: ['KeyA', 'ArrowLeft'],
    right: ['KeyD', 'ArrowRight'],
    s0: ['KeyG'],
    s1: ['KeyH'],
    s2: ['KeyJ'],
    s3: ['KeyY'],
    ready: ['Space', 'Enter'],
};

// 내 자리(P1/P2)에 맞는 게임 안의 키. 게임은 원래 한 키보드로 둘이 하던 키 배치 그대로 돌아간다.
const SLOT_GAME_KEYS = [
    { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', s0: 'KeyG', s1: 'KeyH', s2: 'KeyJ', s3: 'KeyY', ready: 'Space' },
    { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', s0: 'KeyL', s1: 'Semicolon', s2: 'Quote', s3: 'KeyP', ready: 'Enter' },
];

const CHECKSUM_INTERVAL = 60; // 1초마다 두 기기의 게임 상태를 비교

function resolveServerUrl() {
    const param = new URLSearchParams(location.search).get('server');
    if (param) return param;
    // 게임을 서버에서 직접 열었다면(Render 주소, 내 컴퓨터의 localhost 등) 같은 주소로 접속
    const isWebPage = location.protocol === 'http:' || location.protocol === 'https:';
    if (isWebPage && !location.hostname.endsWith('github.io')) {
        return `${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}`;
    }
    return ONLINE_SERVER_URL;
}

// 게임 상태 요약값 (두 기기가 같은지 비교용)
function gameChecksum(game) {
    const parts = [Math.round(Time.now), game.state, game.attacks.length];
    for (const p of [game.player1, game.player2]) {
        if (p) parts.push(p.hp.toFixed(2), p.rect.x, p.rect.y, p.ultGauge.toFixed(2));
    }
    const text = parts.join('|');
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    return h >>> 0;
}

const Net = {
    // 'idle' | 'connecting' | 'waiting'(방을 만들고 상대 기다리는 중) | 'playing' | 'closed'
    status: 'idle',
    ws: null,
    code: '',
    slot: -1,
    frames: [],          // 서버에서 받았지만 아직 계산하지 않은 틱들
    frameCount: 0,       // 지금까지 계산한 틱 수
    pingMs: null,
    desynced: false,
    lastError: '',
    physicalHeld: new Set(),
    lastSentHeld: '',
    pendingDowns: [],
    pingTimer: null,
    onStart: null,       // (seed) => void
    onEnd: null,         // (message) => void : 상대가 나가거나 연결이 끊겼을 때

    isOnline() {
        return this.status === 'playing';
    },

    connect(onOpen) {
        const url = resolveServerUrl();
        if (!url) {
            this.fail('온라인 서버 주소가 설정되지 않았어요. 서버 주소로 게임을 열어 주세요.');
            return;
        }
        this.status = 'connecting';
        this.lastError = '';
        let ws;
        try {
            ws = new WebSocket(url);
        } catch (e) {
            this.fail('서버에 연결할 수 없어요.');
            return;
        }
        this.ws = ws;
        ws.onopen = () => {
            onOpen();
            this.pingTimer = setInterval(() => this.send({ t: 'ping', c: performance.now() }), 2000);
        };
        ws.onmessage = (ev) => this.handleMessage(JSON.parse(ev.data));
        ws.onerror = () => {};
        ws.onclose = () => {
            if (this.ws !== ws) return; // 이미 정리한 연결
            const prevStatus = this.status;
            this.cleanup();
            if (prevStatus === 'playing' || prevStatus === 'waiting') {
                if (this.onEnd) this.onEnd('서버와 연결이 끊겼어요.');
            } else if (prevStatus === 'connecting') {
                this.lastError = '서버에 연결할 수 없어요. 서버가 깨어나는 중이면 1분쯤 뒤 다시 해 보세요.';
            }
        };
    },

    createRoom() {
        this.connect(() => this.send({ t: 'create' }));
    },

    joinRoom(code) {
        this.connect(() => this.send({ t: 'join', code }));
    },

    leave() {
        this.send({ t: 'leave' });
        const ws = this.ws;
        this.cleanup();
        if (ws) ws.close();
    },

    cleanup() {
        clearInterval(this.pingTimer);
        this.pingTimer = null;
        this.ws = null;
        this.status = 'idle';
        this.code = '';
        this.slot = -1;
        this.frames = [];
        this.frameCount = 0;
        this.pingMs = null;
        this.desynced = false;
        this.physicalHeld.clear();
        this.lastSentHeld = '';
        this.pendingDowns = [];
    },

    fail(message) {
        const ws = this.ws;
        this.cleanup();
        if (ws) ws.close();
        this.lastError = message;
    },

    send(msg) {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(msg));
    },

    handleMessage(msg) {
        if (msg.t === 'created') {
            this.status = 'waiting';
            this.code = msg.code;
        } else if (msg.t === 'start') {
            this.status = 'playing';
            this.code = msg.code;
            this.slot = msg.slot;
            this.frames = [];
            this.frameCount = 0;
            if (this.onStart) this.onStart(msg.seed);
        } else if (msg.t === 'f') {
            this.frames.push(msg);
        } else if (msg.t === 'pong') {
            this.pingMs = Math.round(performance.now() - msg.c);
        } else if (msg.t === 'desync') {
            this.desynced = true;
        } else if (msg.t === 'left') {
            const ws = this.ws;
            this.cleanup();
            if (ws) ws.close();
            if (this.onEnd) this.onEnd('상대가 방을 나갔어요.');
        } else if (msg.t === 'error') {
            this.fail(msg.message);
        }
    },

    // ------------------------------------------
    // 내 키보드 → 서버
    // ------------------------------------------
    actionOf(code) {
        for (const [action, codes] of Object.entries(ONLINE_LOCAL_KEYS)) {
            if (codes.includes(code)) return action;
        }
        return null;
    },

    gameKey(action) {
        return SLOT_GAME_KEYS[this.slot][action];
    },

    onLocalKeyDown(code) {
        const action = this.actionOf(code);
        if (!action) return;
        this.physicalHeld.add(code);
        this.pendingDowns.push(this.gameKey(action));
        this.flushInput();
    },

    onLocalKeyUp(code) {
        if (!this.physicalHeld.delete(code)) return;
        this.flushInput();
    },

    releaseAllLocalKeys() {
        this.physicalHeld.clear();
        this.flushInput();
    },

    flushInput() {
        const held = new Set();
        for (const code of this.physicalHeld) held.add(this.gameKey(this.actionOf(code)));
        const heldList = [...held].sort();
        const key = heldList.join(',');
        if (key === this.lastSentHeld && this.pendingDowns.length === 0) return;
        this.lastSentHeld = key;
        this.send({ t: 'in', held: heldList, down: this.pendingDowns });
        this.pendingDowns = [];
    },

    // ------------------------------------------
    // 서버에서 받은 틱 하나를 게임에 적용
    // ------------------------------------------
    applyFrame(frame, game, tickSec) {
        pressedKeys.clear();
        for (const code of frame.h) pressedKeys.add(code);
        tappedKeys.clear();
        for (const code of frame.d) tappedKeys.add(code);
        for (const code of frame.d) game.handleKeyDown(code);

        game.step(tickSec, readInput(P1_CONTROLS), readInput(P2_CONTROLS));
        tappedKeys.clear();
        this.frameCount += 1;

        if (this.frameCount % CHECKSUM_INTERVAL === 0) {
            this.send({ t: 'sum', f: this.frameCount, h: gameChecksum(game) });
        }
    },
};

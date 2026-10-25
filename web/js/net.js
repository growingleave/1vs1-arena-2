// 온라인 대전 연결 (서버: server/server.js)
//
// 1. 방 만들기 → 서버가 4글자 코드를 준다. 다른 기기에서 그 코드로 방 들어가기.
// 2. 두 명이 모이면 기기끼리 직접 연결(WebRTC)을 먼저 시도한다. 연결 정보는 서버가 전달해 준다.
//    - 성공(같은 와이파이 등): 방을 만든 기기(방장)가 1초에 60번 "이번 틱의 두 사람 입력"을 만들어 상대에게 보낸다.
//    - 실패: 지금까지처럼 서버가 그 일을 한다 (서버 경유).
// 3. 두 기기는 받은 틱의 입력대로 한 틱씩 똑같이 계산한다. 같은 무작위 씨앗(seed)으로 시작하므로 결과가 같다.
//    (내 키보드 입력도 바로 쓰지 않고, 틱으로 돌아온 것으로만 게임에 반영한다)
//
// 주소 뒤에 ?p2p=off 를 붙이면 직접 연결을 시도하지 않고 항상 서버 경유로 한다 (비교 시험용).

// 온라인 대전 서버 주소 (Render에 배포한 서버).
// - 게임을 서버 주소(https://arena-1vs1.onrender.com)로 열면 그 서버에 바로 접속한다.
// - GitHub Pages 주소로 열거나, 크롬북에서 index.html 파일을 직접 열면 이 주소로 접속한다.
// - 주소 뒤에 ?server=ws://... 를 붙이면 다른 서버로 접속할 수 있다 (내 컴퓨터에서 시험할 때 등).
const ONLINE_SERVER_URL = 'wss://arena-1vs1.onrender.com';

// 온라인에서 내가 쓰는 키 (P1/P2 상관없이 같은 키로 조작한다)
// 이동: 방향키 / 평타 Q · 스킬 1 W · 스킬 2 E · 궁극기 R / 준비·확정: SPACE 또는 ENTER
const ONLINE_LOCAL_KEYS = {
    up: ['ArrowUp'],
    down: ['ArrowDown'],
    left: ['ArrowLeft'],
    right: ['ArrowRight'],
    s0: ['KeyQ'],
    s1: ['KeyW'],
    s2: ['KeyE'],
    s3: ['KeyR'],
    ready: ['Space', 'Enter'],
};

// 내 자리(P1/P2)에 맞는 게임 안의 키. 게임은 원래 한 키보드로 둘이 하던 키 배치 그대로 돌아간다.
const SLOT_GAME_KEYS = [
    { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', s0: 'KeyG', s1: 'KeyH', s2: 'KeyJ', s3: 'KeyY', ready: 'Space' },
    { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight', s0: 'KeyL', s1: 'Semicolon', s2: 'Quote', s3: 'KeyP', ready: 'Enter' },
];

const CHECKSUM_INTERVAL = 60; // 1초마다 두 기기의 게임 상태를 비교
const P2P_TIMEOUT_MS = 5000;  // 이 시간 안에 직접 연결이 안 되면 서버 경유로 시작
const NET_TICK_MS = 1000 / 60;

// 직접 연결용 공개 STUN 서버 (서로 다른 네트워크일 때 내 공인 주소를 알아내는 데 쓴다. 같은 와이파이면 없어도 됨)
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

// 방장이 상대 입력을 받을 때, 상대 자리(P2) 키만 받아들인다
const GUEST_ALLOWED_KEYS = new Set(Object.values(SLOT_GAME_KEYS[1]));

function p2pAllowed() {
    return new URLSearchParams(location.search).get('p2p') !== 'off' && typeof RTCPeerConnection !== 'undefined';
}

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

// 화면에 보여줄 서버 이름 (예: arena-1vs1.onrender.com)
function serverHostLabel() {
    try {
        return new URL(resolveServerUrl()).host;
    } catch {
        return '없음';
    }
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
    // 'idle' | 'connecting'(서버 연결 중) | 'waiting'(방을 만들고 상대 기다리는 중)
    // | 'linking'(상대와 직접 연결 시도 중) | 'playing'
    status: 'idle',
    mode: 'relay',       // 'p2p'(기기끼리 직접) 또는 'relay'(서버 경유)
    ws: null,
    code: '',
    slot: -1,
    frames: [],          // 받았지만 아직 계산하지 않은 틱들
    frameCount: 0,       // 지금까지 계산한 틱 수
    pingMs: null,
    desynced: false,
    lastFrameAt: 0,      // 마지막으로 틱이 도착한 시각
    gapSamples: [],      // 최근 2초 동안의 [도착 시각, 바로 전 틱과의 간격]
    lastError: '',
    physicalHeld: new Set(),
    lastSentHeld: '',
    pendingDowns: [],
    pingTimer: null,
    onStart: null,       // (seed) => void
    onEnd: null,         // (message) => void : 상대가 나가거나 연결이 끊겼을 때

    // 직접 연결(WebRTC)
    pc: null,
    dc: null,
    pendingCandidates: [],
    modeDecided: false,
    peerTimer: null,
    // 방장 기기가 틱을 만들 때 쓰는 값
    hostTimer: null,
    hostWorker: null,
    hostStart: 0,
    hostFrame: 0,
    hostHeld: [new Set(), new Set()],
    hostDowns: [[], []],

    isOnline() {
        return this.status === 'playing';
    },

    // 화면 아래 표시줄에 쓰는 연결 방식 설명
    connectionLabel() {
        return this.mode === 'p2p' ? '직접 연결' : `서버 경유 (${serverHostLabel()})`;
    },

    // ------------------------------------------
    // 서버 연결
    // ------------------------------------------
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
            this.pingTimer = setInterval(() => this.sendPing(), 2000);
        };
        ws.onmessage = (ev) => this.handleMessage(JSON.parse(ev.data));
        ws.onerror = () => {};
        ws.onclose = () => {
            if (this.ws !== ws) return; // 이미 정리한 연결
            const prevStatus = this.status;
            this.cleanup();
            if (prevStatus === 'playing' || prevStatus === 'waiting' || prevStatus === 'linking') {
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
        this.closePeer();
        this.stopHostPump();
        this.ws = null;
        this.status = 'idle';
        this.mode = 'relay';
        this.code = '';
        this.slot = -1;
        this.frames = [];
        this.frameCount = 0;
        this.pingMs = null;
        this.desynced = false;
        this.lastFrameAt = 0;
        this.gapSamples = [];
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

    // 핑은 실제로 틱이 오가는 길로 잰다 (직접 연결이면 상대 기기까지, 서버 경유면 서버까지 왕복)
    sendPing() {
        const msg = { t: 'ping', c: performance.now() };
        if (this.mode === 'p2p' && this.status === 'playing') this.sendPeer(msg);
        else this.send(msg);
    },

    handleMessage(msg) {
        if (msg.t === 'created') {
            this.status = 'waiting';
            this.code = msg.code;
        } else if (msg.t === 'peer') {
            this.status = 'linking';
            this.slot = msg.slot;
            this.frames = [];
            this.startPeer();
        } else if (msg.t === 'signal') {
            this.handleSignal(msg.data);
        } else if (msg.t === 'start') {
            this.status = 'playing';
            this.code = msg.code;
            this.slot = msg.slot;
            this.mode = msg.mode === 'p2p' ? 'p2p' : 'relay';
            this.frameCount = 0;
            this.pingMs = null;
            // 직접 연결이면 방장이 보낸 틱이 시작 신호보다 먼저 도착했을 수 있으니 받아둔 틱은 그대로 둔다
            if (this.mode === 'relay') {
                this.frames = [];
                this.closePeer();
            }
            if (this.onStart) this.onStart(msg.seed);
            if (this.mode === 'p2p' && this.slot === 0) this.startHostPump();
        } else if (msg.t === 'f') {
            this.receiveFrame(msg);
        } else if (msg.t === 'pong') {
            this.pingMs = Math.round(performance.now() - msg.c);
        } else if (msg.t === 'desync') {
            this.desynced = true;
        } else if (msg.t === 'left') {
            this.endMatch('상대가 방을 나갔어요.');
        } else if (msg.t === 'error') {
            this.fail(msg.message);
        }
    },

    endMatch(message) {
        const ws = this.ws;
        this.cleanup();
        if (ws) ws.close();
        if (this.onEnd) this.onEnd(message);
    },

    // ------------------------------------------
    // 기기끼리 직접 연결 (WebRTC)
    // ------------------------------------------
    startPeer() {
        this.modeDecided = false;
        this.pendingCandidates = [];
        if (!p2pAllowed()) {
            if (this.slot === 0) this.decideMode('relay');
            return;
        }

        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        this.pc = pc;
        pc.onicecandidate = (e) => {
            if (e.candidate) this.send({ t: 'signal', data: { candidate: e.candidate.toJSON() } });
        };

        if (this.slot === 0) {
            // 방장: 데이터 통로를 만들고 연결 요청(offer)을 보낸다
            this.setupChannel(pc.createDataChannel('game', { ordered: true }));
            pc.createOffer()
                .then((offer) => pc.setLocalDescription(offer))
                .then(() => this.send({ t: 'signal', data: { sdp: pc.localDescription.toJSON() } }))
                .catch(() => this.decideMode('relay'));
            this.peerTimer = setTimeout(() => this.decideMode('relay'), P2P_TIMEOUT_MS);
        } else {
            pc.ondatachannel = (e) => this.setupChannel(e.channel);
        }
    },

    async handleSignal(data) {
        const pc = this.pc;
        if (!pc || !data) return;
        try {
            if (data.sdp) {
                await pc.setRemoteDescription(data.sdp);
                for (const c of this.pendingCandidates) await pc.addIceCandidate(c);
                this.pendingCandidates = [];
                if (data.sdp.type === 'offer') {
                    const answer = await pc.createAnswer();
                    await pc.setLocalDescription(answer);
                    this.send({ t: 'signal', data: { sdp: pc.localDescription.toJSON() } });
                }
            } else if (data.candidate) {
                if (pc.remoteDescription) await pc.addIceCandidate(data.candidate);
                else this.pendingCandidates.push(data.candidate);
            }
        } catch (e) {
            // 연결 정보가 맞지 않으면 직접 연결은 포기 (방장이 시간이 지나면 서버 경유로 시작한다)
        }
    },

    setupChannel(dc) {
        this.dc = dc;
        dc.onopen = () => {
            if (this.slot === 0) this.decideMode('p2p');
        };
        dc.onmessage = (ev) => this.handlePeerMessage(JSON.parse(ev.data));
        dc.onclose = () => {
            if (this.dc === dc && this.status === 'playing' && this.mode === 'p2p') {
                this.endMatch('상대 기기와 직접 연결이 끊겼어요.');
            }
        };
    },

    // 방장만 결정한다: 직접 연결이 열렸으면 'p2p', 시간이 지나도록 안 열리면 'relay'
    decideMode(mode) {
        if (this.modeDecided || this.slot !== 0 || this.status !== 'linking') return;
        this.modeDecided = true;
        clearTimeout(this.peerTimer);
        if (mode === 'relay') this.closePeer();
        this.send({ t: 'mode', mode });
    },

    closePeer() {
        clearTimeout(this.peerTimer);
        this.peerTimer = null;
        if (this.dc) {
            this.dc.onclose = null;
            this.dc.onmessage = null;
            try { this.dc.close(); } catch (e) { /* 이미 닫힘 */ }
        }
        if (this.pc) {
            try { this.pc.close(); } catch (e) { /* 이미 닫힘 */ }
        }
        this.dc = null;
        this.pc = null;
        this.pendingCandidates = [];
    },

    // 다른 기기(서버 또는 방장)에서 만든 틱이 도착했을 때. 도착 간격을 기록해서 끊김을 보여준다
    receiveFrame(frame) {
        const now = performance.now();
        if (this.lastFrameAt) this.gapSamples.push([now, now - this.lastFrameAt]);
        this.lastFrameAt = now;
        while (this.gapSamples.length && now - this.gapSamples[0][0] > 2000) this.gapSamples.shift();
        this.frames.push(frame);
    },

    // 최근 2초 동안 틱이 가장 늦게 도착한 간격(ms). 정상이면 20ms 안팎, 크면 화면이 버벅인다
    // 방장 기기는 틱을 직접 만들어서 해당 없음(null)
    maxFrameGapMs() {
        if (this.mode === 'p2p' && this.slot === 0) return null;
        let max = 0;
        for (const [, gap] of this.gapSamples) if (gap > max) max = gap;
        return Math.round(max);
    },

    sendPeer(msg) {
        if (this.dc && this.dc.readyState === 'open') this.dc.send(JSON.stringify(msg));
    },

    handlePeerMessage(msg) {
        if (msg.t === 'f') {
            this.receiveFrame(msg);                      // 방장이 보낸 틱 (상대 기기)
        } else if (msg.t === 'in' && this.slot === 0) {  // 상대가 보낸 입력 (방장 기기)
            if (Array.isArray(msg.held)) this.hostHeld[1] = new Set(msg.held.filter(c => GUEST_ALLOWED_KEYS.has(c)));
            if (Array.isArray(msg.down)) for (const c of msg.down) if (GUEST_ALLOWED_KEYS.has(c)) this.hostDowns[1].push(c);
        } else if (msg.t === 'ping') {
            this.sendPeer({ t: 'pong', c: msg.c });
        } else if (msg.t === 'pong') {
            this.pingMs = Math.round(performance.now() - msg.c);
        }
    },

    // 방장 기기: 서버 대신 1초에 60번 틱을 만들어 내 게임에 넣고 상대에게 보낸다
    // 틱 시계는 웹 워커에서 돌린다. 크롬은 뒤로 간 창(다른 창을 클릭했거나 최소화)의 타이머를
    // 크게 늦추는데, 그러면 방장이 틱을 몰아서 보내게 되어 상대 화면이 버벅인다. 워커 타이머는 거의 늦추지 않는다.
    startHostPump() {
        this.hostStart = performance.now();
        this.hostFrame = 0;
        this.hostHeld = [new Set(), new Set()];
        this.hostDowns = [[], []];
        try {
            const source = 'setInterval(() => postMessage(0), 4);';
            const url = URL.createObjectURL(new Blob([source], { type: 'text/javascript' }));
            this.hostWorker = new Worker(url);
            URL.revokeObjectURL(url);
            this.hostWorker.onmessage = () => this.pumpHost();
            this.hostWorker.onerror = () => this.useTimerPump();
        } catch (e) {
            this.useTimerPump();
        }
    },

    // 워커를 못 쓰는 환경이면 일반 타이머로
    useTimerPump() {
        if (this.hostWorker) this.hostWorker.terminate();
        this.hostWorker = null;
        if (!this.hostTimer) this.hostTimer = setInterval(() => this.pumpHost(), 4);
    },

    stopHostPump() {
        if (this.hostWorker) this.hostWorker.terminate();
        this.hostWorker = null;
        clearInterval(this.hostTimer);
        this.hostTimer = null;
    },

    pumpHost() {
        const due = Math.floor((performance.now() - this.hostStart) / NET_TICK_MS);
        while (this.hostFrame < due) {
            const frame = {
                t: 'f',
                f: this.hostFrame,
                h: [...this.hostHeld[0], ...this.hostHeld[1]],
                d: [...this.hostDowns[0], ...this.hostDowns[1]],
            };
            this.hostDowns = [[], []];
            this.frames.push(frame);
            this.sendPeer(frame);
            this.hostFrame += 1;
        }
    },

    // ------------------------------------------
    // 내 키보드 → 틱을 만드는 쪽 (서버, 또는 직접 연결이면 방장 기기)
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
        const downs = this.pendingDowns;
        this.pendingDowns = [];

        if (this.mode === 'p2p' && this.slot === 0) {
            this.hostHeld[0] = held;           // 방장: 내 입력은 바로 다음 틱에 들어간다
            this.hostDowns[0].push(...downs);
        } else if (this.mode === 'p2p') {
            this.sendPeer({ t: 'in', held: heldList, down: downs });
        } else {
            this.send({ t: 'in', held: heldList, down: downs });
        }
    },

    // ------------------------------------------
    // 받은 틱 하나를 게임에 적용
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

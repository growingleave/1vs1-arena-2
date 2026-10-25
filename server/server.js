// 온라인 대전 서버
//
// 하는 일
// 1. web/ 폴더의 게임 파일을 그대로 보여준다 (이 서버 주소로 접속하면 바로 플레이 가능)
// 2. 방 만들기 / 방 코드로 들어가기
// 3. 두 명이 모이면 먼저 기기끼리 직접 연결(WebRTC)을 시도하도록 연결 정보를 전달해 준다.
//    - 직접 연결 성공: 방을 만든 기기가 틱을 만들어 상대에게 보낸다. 서버는 상태 비교와 나가기 알림만 한다.
//    - 직접 연결 실패: 서버가 1초에 60번 "이번 틱에 두 사람이 누르고 있는 키"를 모아서 두 사람에게 보낸다.
//
// 서버는 게임을 직접 계산하지 않는다. 두 기기가 같은 입력을 받아 똑같이 계산하므로
// 서버는 아주 가볍고, 주고받는 데이터도 작다.
//
// 실행: npm install 후 npm start (기본 주소 http://localhost:3000)

const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT) || 3000;
const WEB_ROOT = path.join(__dirname, '..', 'web');
const TICK_MS = 1000 / 60;
const PEER_TIMEOUT_MS = 10000; // 방장이 연결 결과를 이 시간 안에 안 알려주면 서버 경유로 시작

// 방 코드에 헷갈리는 글자(I, O, 0, 1 등)는 쓰지 않는다
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 4;

// 플레이어 자리별로 보낼 수 있는 키. 다른 사람 캐릭터를 조종하지 못하게 서버에서 걸러낸다.
// (게임 안의 P1/P2 키 배치 = 크롬북 버전과 같다)
const ALLOWED_CODES = [
    new Set(['KeyW', 'KeyS', 'KeyA', 'KeyD', 'KeyG', 'KeyH', 'KeyJ', 'KeyY', 'Space']),
    new Set(['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyL', 'Semicolon', 'Quote', 'KeyP', 'Enter']),
];

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml',
    '.ogg': 'audio/ogg',
    '.json': 'application/json',
};

// ------------------------------------------
// 정적 파일 (web/ 폴더)
// ------------------------------------------
const server = http.createServer((req, res) => {
    const urlPath = decodeURIComponent((req.url || '/').split('?')[0]);
    if (urlPath === '/health') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end(`ok rooms=${rooms.size}`);
        return;
    }

    let filePath = path.normalize(path.join(WEB_ROOT, urlPath));
    if (!filePath.startsWith(WEB_ROOT)) { // ../ 로 바깥 파일을 못 보게
        res.writeHead(403);
        res.end();
        return;
    }
    if (urlPath.endsWith('/')) filePath = path.join(filePath, 'index.html');

    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end('Not found');
            return;
        }
        res.writeHead(200, {
            'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream',
            'Cache-Control': 'no-cache',
        });
        res.end(data);
    });
});

// ------------------------------------------
// 방
// ------------------------------------------
const rooms = new Map(); // code -> room

function makeRoomCode() {
    for (let attempt = 0; attempt < 1000; attempt++) {
        let code = '';
        for (let i = 0; i < CODE_LENGTH; i++) code += CODE_CHARS[crypto.randomInt(CODE_CHARS.length)];
        if (!rooms.has(code)) return code;
    }
    throw new Error('방 코드를 만들 수 없음');
}

function send(ws, msg) {
    if (ws && ws.readyState === ws.OPEN) ws.send(JSON.stringify(msg));
}

function createRoom(ws) {
    const room = {
        code: makeRoomCode(),
        players: [ws, null],
        held: [new Set(), new Set()],  // 자리별로 지금 누르고 있는 키
        downs: [[], []],               // 자리별로 이번 틱에 새로 누른 키
        started: false,
        mode: null,                    // 'p2p'(기기끼리 직접) 또는 'relay'(서버 경유)
        peerTimer: null,
        startTime: 0,
        frame: 0,
        checksums: new Map(),          // frame -> [자리0 값, 자리1 값]
    };
    rooms.set(room.code, room);
    ws.room = room;
    ws.slot = 0;
    send(ws, { t: 'created', code: room.code });
    console.log(`[방 ${room.code}] 생성 (방 ${rooms.size}개)`);
}

function joinRoom(ws, rawCode) {
    const code = String(rawCode || '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) {
        send(ws, { t: 'error', message: '그런 방이 없어요. 코드를 다시 확인해 주세요.' });
        return;
    }
    if (room.players[1]) {
        send(ws, { t: 'error', message: '이미 두 명이 들어간 방이에요.' });
        return;
    }
    room.players[1] = ws;
    ws.room = room;
    ws.slot = 1;

    // 먼저 기기끼리 직접 연결을 시도하게 한다. 방장(자리 0)이 결과를 알려주면 시작
    room.players.forEach((p, slot) => send(p, { t: 'peer', slot }));
    room.peerTimer = setTimeout(() => startRoom(room, 'relay'), PEER_TIMEOUT_MS);
}

function startRoom(room, mode) {
    if (room.started || !rooms.has(room.code)) return;
    clearTimeout(room.peerTimer);
    room.started = true;
    room.mode = mode;
    room.frame = 0;
    room.startTime = performance.now();
    const seed = crypto.randomInt(0x7fffffff);
    room.players.forEach((ws, slot) => send(ws, { t: 'start', code: room.code, slot, seed, mode }));
    console.log(`[방 ${room.code}] 대전 시작 (${mode === 'p2p' ? '기기끼리 직접 연결' : '서버 경유'})`);
}

// 직접 연결에 필요한 정보(WebRTC offer/answer/ICE 후보)를 상대에게 그대로 전달
function relaySignal(ws, msg) {
    const room = ws.room;
    if (!room || room.started) return;
    send(room.players[1 - ws.slot], { t: 'signal', data: msg.data });
}

function closeRoom(room, leaver) {
    if (!rooms.has(room.code)) return;
    clearTimeout(room.peerTimer);
    rooms.delete(room.code);
    for (const ws of room.players) {
        if (ws && ws !== leaver) {
            send(ws, { t: 'left' });
            ws.room = null;
        }
    }
    console.log(`[방 ${room.code}] 닫힘 (방 ${rooms.size}개)`);
}

function handleInput(ws, msg) {
    const room = ws.room;
    if (!room || !room.started || room.mode !== 'relay') return;
    const allowed = ALLOWED_CODES[ws.slot];
    if (Array.isArray(msg.held)) {
        room.held[ws.slot] = new Set(msg.held.filter(c => allowed.has(c)));
    }
    if (Array.isArray(msg.down)) {
        for (const c of msg.down) if (allowed.has(c)) room.downs[ws.slot].push(c);
    }
}

// 두 기기의 게임 상태 요약값을 비교해서, 다르면 둘 다에게 알려준다 (테스트용 안전장치)
function handleChecksum(ws, msg) {
    const room = ws.room;
    if (!room || !Number.isInteger(msg.f)) return;
    let entry = room.checksums.get(msg.f);
    if (!entry) {
        entry = [null, null];
        room.checksums.set(msg.f, entry);
    }
    entry[ws.slot] = msg.h;
    if (entry[0] !== null && entry[1] !== null) {
        if (entry[0] !== entry[1]) {
            console.log(`[방 ${room.code}] ${msg.f}틱에서 두 기기의 게임 상태가 다름`);
            room.players.forEach(p => send(p, { t: 'desync', f: msg.f }));
        }
        room.checksums.delete(msg.f);
    }
    // 오래된 값은 버린다
    for (const f of room.checksums.keys()) if (f < msg.f - 600) room.checksums.delete(f);
}

// 시작 시각 기준으로 밀린 틱을 모두 보낸다 (setInterval이 조금씩 늦어도 1초 60틱을 유지)
function pumpRooms() {
    const now = performance.now();
    for (const room of rooms.values()) {
        if (!room.started || room.mode !== 'relay') continue;
        const due = Math.floor((now - room.startTime) / TICK_MS);
        while (room.frame < due) {
            const held = [...room.held[0], ...room.held[1]];
            const down = [...room.downs[0], ...room.downs[1]];
            room.downs[0] = [];
            room.downs[1] = [];
            const msg = JSON.stringify({ t: 'f', f: room.frame, h: held, d: down });
            for (const ws of room.players) if (ws && ws.readyState === ws.OPEN) ws.send(msg);
            room.frame += 1;
        }
    }
}
setInterval(pumpRooms, 4);

// ------------------------------------------
// WebSocket
// ------------------------------------------
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
    ws.room = null;
    ws.slot = -1;
    ws.isAlive = true;
    ws.on('pong', () => { ws.isAlive = true; });

    ws.on('message', (data) => {
        let msg;
        try {
            msg = JSON.parse(data);
        } catch {
            return;
        }
        if (msg.t === 'in') handleInput(ws, msg);
        else if (msg.t === 'ping') send(ws, { t: 'pong', c: msg.c });
        else if (msg.t === 'sum') handleChecksum(ws, msg);
        else if (msg.t === 'signal') relaySignal(ws, msg);
        else if (msg.t === 'mode' && ws.room && ws.slot === 0) startRoom(ws.room, msg.mode === 'p2p' ? 'p2p' : 'relay');
        else if (msg.t === 'create' && !ws.room) createRoom(ws);
        else if (msg.t === 'join' && !ws.room) joinRoom(ws, msg.code);
        else if (msg.t === 'leave' && ws.room) {
            const room = ws.room;
            ws.room = null;
            closeRoom(room, ws);
        }
    });

    ws.on('close', () => {
        if (ws.room) closeRoom(ws.room, ws);
    });
});

// 응답 없는 연결 정리 (와이파이가 끊긴 기기 등)
setInterval(() => {
    for (const ws of wss.clients) {
        if (!ws.isAlive) {
            ws.terminate();
            continue;
        }
        ws.isAlive = false;
        ws.ping();
    }
}, 10000);

server.listen(PORT, () => {
    console.log(`서버 실행 중: http://localhost:${PORT}`);
});

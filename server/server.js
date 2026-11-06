// 온라인 대전 서버
//
// 하는 일
// 1. web/ 폴더의 게임 파일을 그대로 보여준다 (이 서버 주소로 접속하면 바로 플레이 가능)
// 2. 방 목록(방 이름·잠금 표시) / 방 만들기(이름, 비밀번호 선택) / 목록에서 골라 들어가기 / 방 코드로 들어가기
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
const os = require('os');
const { WebSocketServer } = require('ws');

const PORT = Number(process.env.PORT) || 3000;
const WEB_ROOT = path.join(__dirname, '..', 'web');
const TICK_MS = 1000 / 60;
const PEER_TIMEOUT_MS = 10000;
// RELAY_ONLY=1 로 실행하면 직접 연결을 시도하지 않고 처음부터 서버 경유로 한다.
// 재현 테스트(tools/tests/net_test.js) 결과: 서버 경유는 1P·2P 지연이 같아 공평하지만, 둘 다 직접 연결 때의 2P만큼 늦어지고
// 와이파이가 나쁘면 화면 멈춤이 더 많다 (순서대로 다 받아야 하는 연결이라 하나가 늦으면 뒤가 다 기다림).
// 그래서 기본은 직접 연결을 먼저 시도한다.
const RELAY_ONLY = process.env.RELAY_ONLY === '1'; // 방장이 연결 결과를 이 시간 안에 안 알려주면 서버 경유로 시작

// 방 코드에 헷갈리는 글자(I, O, 0, 1 등)는 쓰지 않는다
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 4;

// 방 목록 관련 (멀티존 방식)
const PROTOCOL_VERSION = 2;          // 게임 파일(net.js)과 같아야 함. 다르면 새로고침 안내
const ROOM_NAME_MAX = 16;
const ROOM_PASSWORD_MAX = 12;
const MAX_ROOMS_PER_IP = 3;          // 한 곳(같은 공인 IP)에서 동시에 만들 수 있는 방 수 (방 도배 막기)
const WAITING_ROOM_MAX_MS = 30 * 60 * 1000; // 30분 동안 아무도 안 들어오면 방을 닫음 (유령 방 정리)
// 아주 간단한 금지어 (완벽하지 않음). 들어 있으면 그 부분을 *로 바꾼다
const BAD_WORDS = ['시발', '씨발', 'ㅅㅂ', 'ㅆㅂ', '병신', 'ㅂㅅ', '좆', '지랄', '개새', '꺼져', '미친놈', '미친년', 'fuck', 'shit', 'bitch', 'sex', '섹스', '느금', '니애미', '애미', '애비'];

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

// 방 이름 정리: 보이지 않는 글자 제거, 공백 정리, 길이 제한, 금지어 가리기
function cleanRoomName(raw, code) {
    let name = String(raw || '').normalize('NFC').replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202e\u2060-\u206f\ufeff]/g, '');
    name = name.replace(/\s+/g, ' ').trim();
    name = [...name].slice(0, ROOM_NAME_MAX).join('');
    const squashed = name.toLowerCase().replace(/[\s._\-*~!@#$%^&()]/g, '');
    for (const w of BAD_WORDS) {
        if (squashed.includes(w)) name = name.replace(new RegExp(w.split('').join('[\\s._\\-*~!@#$%^&()]*'), 'gi'), '*'.repeat(w.length));
    }
    return name || `방 ${code}`;
}

function hashPassword(password, salt) {
    return crypto.createHash('sha256').update(salt + ':' + password).digest('hex');
}

function roomState(room) {
    if (room.started) return 'playing';
    if (room.players[1]) return 'full';
    return 'waiting';
}

// 목록 화면을 보고 있는 연결들에게 방 목록을 보낸다 (바뀔 때마다, 0.2초에 한 번까지)
const watchers = new Set();
let listTimer = null;
function roomListMessage() {
    const list = [];
    for (const room of rooms.values()) list.push({ id: room.code, name: room.name, locked: !!room.passwordHash, state: roomState(room), age: Date.now() - room.createdAt });
    list.sort((a, b) => (a.state === 'waiting' ? 0 : 1) - (b.state === 'waiting' ? 0 : 1) || a.age - b.age);
    return JSON.stringify({ t: 'rooms', rooms: list.slice(0, 50) });
}
function broadcastRooms() {
    if (listTimer) return;
    listTimer = setTimeout(() => {
        listTimer = null;
        const msg = roomListMessage();
        for (const ws of watchers) if (ws.readyState === ws.OPEN) ws.send(msg);
    }, 200);
}

function countRoomsFromIp(ip) {
    let n = 0;
    for (const room of rooms.values()) if (room.hostIp === ip) n++;
    return n;
}

function versionOk(ws, msg) {
    if (msg.v === PROTOCOL_VERSION) return true;
    send(ws, { t: 'error', message: '게임 버전이 서버와 달라요. 페이지를 새로고침(Ctrl+R) 해 주세요.' });
    return false;
}

function createRoom(ws, msg = {}) {
    if (countRoomsFromIp(ws.ip) >= MAX_ROOMS_PER_IP) {
        send(ws, { t: 'error', message: `같은 곳에서 만든 방이 너무 많아요 (최대 ${MAX_ROOMS_PER_IP}개). 안 쓰는 방을 닫아 주세요.` });
        return;
    }
    const code = makeRoomCode();
    const password = String(msg.password || '').slice(0, ROOM_PASSWORD_MAX);
    const salt = crypto.randomBytes(8).toString('hex');
    const room = {
        code,
        name: cleanRoomName(msg.name, code),
        passwordHash: password ? hashPassword(password, salt) : null,
        salt,
        hostIp: ws.ip,
        createdAt: Date.now(),
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
    send(ws, { t: 'created', code: room.code, name: room.name, locked: !!room.passwordHash });
    console.log(`[방 ${room.code}] 생성 (방 ${rooms.size}개)`);
    broadcastRooms();
}

// 비밀번호를 여러 번 틀리면 잠깐 못 넣게 한다 (연결마다·IP마다)
const pwFails = new Map(); // ip -> { count, until, first }
function passwordBlocked(ip) {
    const f = pwFails.get(ip);
    return f && Date.now() < f.until ? Math.ceil((f.until - Date.now()) / 1000) : 0;
}
function notePasswordFail(ip) {
    const now = Date.now();
    let f = pwFails.get(ip);
    if (!f || now - f.first > 60000) f = { count: 0, until: 0, first: now };
    f.count += 1;
    f.until = now + (f.count >= 5 ? 30000 : 1500); // 1분 안에 5번 틀리면 30초, 아니면 1.5초
    pwFails.set(ip, f);
}

function joinRoom(ws, rawCode, rawPassword) {
    const code = String(rawCode || '').trim().toUpperCase();
    const room = rooms.get(code);
    if (!room) {
        send(ws, { t: 'error', message: '그런 방이 없어요. 이미 닫혔거나 코드가 틀렸어요.' });
        return;
    }
    if (room.players[1]) {
        send(ws, { t: 'error', message: '방이 꽉 찼어요. 다른 사람이 먼저 들어갔어요.' });
        return;
    }
    if (room.passwordHash) {
        const wait = passwordBlocked(ws.ip);
        if (wait) {
            send(ws, { t: 'error', code: 'badpw', message: `비밀번호를 너무 많이 틀렸어요. ${wait}초 뒤에 다시 해 주세요.` });
            return;
        }
        const pw = String(rawPassword || '').slice(0, ROOM_PASSWORD_MAX);
        if (!pw || hashPassword(pw, room.salt) !== room.passwordHash) {
            notePasswordFail(ws.ip);
            send(ws, { t: 'error', code: 'badpw', message: pw ? '비밀번호가 틀렸어요.' : '비밀번호가 있는 방이에요. 비밀번호를 입력해 주세요.' });
            return;
        }
    }
    room.players[1] = ws;
    ws.room = room;
    ws.slot = 1;
    broadcastRooms();

    if (RELAY_ONLY) {
        startRoom(room, 'relay');
        return;
    }
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
    broadcastRooms();
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
    broadcastRooms();
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
// 틱 보내기 반복. 윈도우는 타이머가 약 16ms 단위로 움직여서 틱이 2개씩 몰려 나가기 쉽다.
// 그래서 윈도우에서 서버 경유 대전이 있는 동안은 쉬지 않고 확인해서 틱을 제때 하나씩 보낸다 (CPU 코어 하나를 더 씀)
function pumpLoop() {
    pumpRooms();
    let relaying = false;
    for (const room of rooms.values()) if (room.started && room.mode === 'relay') { relaying = true; break; }
    if (relaying && process.platform === 'win32') setImmediate(pumpLoop);
    else setTimeout(pumpLoop, 4);
}
pumpLoop();

// ------------------------------------------
// WebSocket
// ------------------------------------------
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
    // 접속한 곳 (Render 같은 곳에선 앞단 프록시가 x-forwarded-for에 진짜 주소를 넣어 준다)
    const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    ws.ip = fwd || req.socket.remoteAddress || '?';
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
        else if (msg.t === 'list') { if (versionOk(ws, msg)) { watchers.add(ws); send(ws, JSON.parse(roomListMessage())); } }
        else if (msg.t === 'unlist') watchers.delete(ws);
        else if (msg.t === 'create' && !ws.room) { if (versionOk(ws, msg)) createRoom(ws, msg); }
        else if (msg.t === 'join' && !ws.room) { if (versionOk(ws, msg)) joinRoom(ws, msg.code, msg.password); }
        else if (msg.t === 'leave' && ws.room) {
            const room = ws.room;
            ws.room = null;
            closeRoom(room, ws);
        }
    });

    ws.on('close', () => {
        watchers.delete(ws);
        if (ws.room) closeRoom(ws.room, ws);
    });
});

// 오래 아무도 안 들어온 방 닫기 + 오래된 비밀번호 실패 기록 지우기
setInterval(() => {
    const now = Date.now();
    for (const room of [...rooms.values()]) {
        if (!room.started && !room.players[1] && now - room.createdAt > WAITING_ROOM_MAX_MS) {
            send(room.players[0], { t: 'error', message: '30분 동안 아무도 들어오지 않아서 방을 닫았어요.' });
            closeRoom(room, null);
        }
    }
    for (const [ip, f] of pwFails) if (now - f.first > 120000 && now > f.until) pwFails.delete(ip);
}, 30000);

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

// 같은 와이파이·핫스팟의 다른 기기(크롬북)가 접속할 주소들
function lanAddresses() {
    const out = [];
    for (const list of Object.values(os.networkInterfaces())) {
        for (const a of list || []) if (a.family === 'IPv4' && !a.internal) out.push(a.address);
    }
    return out;
}

server.listen(PORT, () => {
    console.log(`서버 실행 중: http://localhost:${PORT}`);
    console.log(RELAY_ONLY ? '연결 방식: 항상 서버 경유 (RELAY_ONLY=1)' : '연결 방식: 기기끼리 직접 연결 먼저 시도 (안 되면 서버 경유)');
    const addrs = lanAddresses();
    if (addrs.length) {
        console.log('');
        console.log('==============================================');
        console.log(' 크롬북 주소창에 아래 주소를 입력하세요');
        for (const a of addrs) console.log(`   http://${a}:${PORT}`);
        console.log('==============================================');
        console.log(' (이 창을 닫으면 서버가 꺼집니다. 노트북 절전 모드는 꺼 두세요)');
        console.log('');
    }
});

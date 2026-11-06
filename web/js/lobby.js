// 시작 화면의 온라인 메뉴와 온라인 중 상태 표시줄.
// 글자 입력과 클릭이 필요해서 캔버스 위에 HTML로 올린다.
//
// 멀티존 방식 방 목록:
//   - 시작 화면에 있는 동안 서버에 "목록 보기" 연결을 따로 하나 열어 두고, 방이 바뀔 때마다 목록을 받는다
//   - 방을 누르면 들어감 (비밀번호가 있으면 비밀번호를 물어봄). ↑↓ + ENTER로도 고를 수 있음
//   - 방 만들기: 이름(최대 16자) + 비밀번호(선택, 최대 12자)
//   - 예전처럼 4자리 방 코드로 들어가기도 남겨 둠 (목록이 안 뜰 때 대신 쓰기)

const ROOM_STATE_LABEL = { waiting: '들어갈 수 있음', full: '꽉 참', playing: '게임 중' };

const Lobby = {
    message: '', // 상대가 나갔을 때 등 시작 화면에 보여줄 안내
    lastView: '',
    form: 'list',      // 'list' | 'create' | 'password'
    rooms: [],         // 서버가 보내 준 방 목록 [{ id, name, locked, state }]
    roomsKey: '',
    sel: 0,            // 키보드로 고른 방 번호 (들어갈 수 있는 방 중에서)
    pwRoom: null,      // 비밀번호를 물어보는 방
    browseWs: null,    // 목록 보기 연결
    browseRetry: 0,
    listError: '',
    listLoaded: false,

    init() {
        // 버튼을 누른 뒤 포커스가 남아 있으면 SPACE/ENTER가 버튼을 다시 누르게 되므로 바로 풀어준다
        document.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') e.target.blur();
        });

        this.panel = document.getElementById('lobby');
        this.bar = document.getElementById('online-bar');
        this.codeInput = document.getElementById('room-code');
        this.listEl = document.getElementById('room-list');
        this.nameInput = document.getElementById('room-name');
        this.pwInput = document.getElementById('room-pw');
        this.joinPwInput = document.getElementById('join-pw');

        // 방 만들기
        document.getElementById('btn-create').addEventListener('click', () => this.openForm('create'));
        document.getElementById('btn-create-ok').addEventListener('click', () => this.create());
        document.getElementById('btn-create-cancel').addEventListener('click', () => this.openForm('list'));
        for (const el of [this.nameInput, this.pwInput]) {
            el.addEventListener('keydown', (e) => {
                if (e.isComposing) return; // 한글 조합 중 ENTER는 글자 확정용
                if (e.key === 'Enter') this.create();
                if (e.key === 'Escape') this.openForm('list');
            });
        }

        // 비밀번호 있는 방
        document.getElementById('btn-pw-ok').addEventListener('click', () => this.joinWithPassword());
        document.getElementById('btn-pw-cancel').addEventListener('click', () => this.openForm('list'));
        this.joinPwInput.addEventListener('keydown', (e) => {
            if (e.isComposing) return;
            if (e.key === 'Enter') this.joinWithPassword();
            if (e.key === 'Escape') this.openForm('list');
        });

        // 코드로 들어가기 (예전 방식)
        document.getElementById('btn-join').addEventListener('click', () => this.joinByCode());
        this.codeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.joinByCode();
        });
        this.codeInput.addEventListener('input', () => {
            this.codeInput.value = this.codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
        });

        // 목록에서 방 누르기
        this.listEl.addEventListener('click', (e) => {
            const btn = e.target.closest('.room');
            if (!btn || btn.disabled) return;
            const room = this.rooms.find((r) => r.id === btn.dataset.id);
            if (room) this.pickRoom(room);
        });

        // 목록 화면에서 ↑↓ + ENTER (글자 입력칸에 있을 땐 무시)
        document.addEventListener('keydown', (e) => {
            if (!this.listVisible() || isTypingTarget(e)) return;
            const open = this.rooms.filter((r) => r.state === 'waiting');
            if (!open.length) return;
            if (e.code === 'ArrowDown') { this.sel = (this.sel + 1) % open.length; this.renderList(); }
            else if (e.code === 'ArrowUp') { this.sel = (this.sel - 1 + open.length) % open.length; this.renderList(); }
            else if (e.code === 'Enter' || e.code === 'NumpadEnter') this.pickRoom(open[Math.min(this.sel, open.length - 1)]);
        });

        document.getElementById('btn-cancel').addEventListener('click', () => { Net.leave(); this.openForm('list'); });
        document.getElementById('btn-leave').addEventListener('click', () => {
            Net.leave();
            this.message = '방에서 나왔어요.';
            backToTitle();
        });
    },

    listVisible() {
        return !this.panel.hidden && !this.panel.querySelector('.menu').hidden;
    },

    openForm(form) {
        this.form = form;
        this.message = '';
        Net.lastError = '';
        this.lastView = ''; // 화면 다시 그리기
        if (form === 'create') setTimeout(() => this.nameInput.focus(), 0);
        if (form === 'password') { this.joinPwInput.value = ''; setTimeout(() => this.joinPwInput.focus(), 0); }
    },

    create() {
        const name = this.nameInput.value.trim();
        const password = this.pwInput.value;
        this.nameInput.blur();
        this.pwInput.blur();
        this.message = '';
        this.form = 'list';
        Net.createRoom(name, password);
    },

    pickRoom(room) {
        if (!room || room.state !== 'waiting') return;
        this.message = '';
        if (room.locked) {
            this.pwRoom = room;
            this.openForm('password');
            return;
        }
        Net.joinRoom(room.id);
    },

    joinWithPassword() {
        if (!this.pwRoom) return;
        const pw = this.joinPwInput.value;
        if (!pw) { this.message = '비밀번호를 입력해 주세요.'; this.lastView = ''; return; }
        this.joinPwInput.blur();
        // 맞으면 바로 대전 연결로, 틀리면 서버가 오류를 보내고 비밀번호 칸은 그대로 열려 있음
        Net.joinRoom(this.pwRoom.id, pw);
    },

    joinByCode() {
        const code = this.codeInput.value.trim();
        if (code.length !== 4) {
            this.message = '방 코드 4글자를 입력해 주세요.';
            this.lastView = '';
            return;
        }
        this.message = '';
        this.codeInput.blur();
        const room = this.rooms.find((r) => r.id === code);
        if (room && room.locked) { this.pwRoom = room; this.openForm('password'); return; }
        Net.joinRoom(code);
    },

    // ------------------------------------------
    // 목록 보기 연결 (게임 연결과 따로). 시작 화면에 있을 때만 열어 둔다
    // ------------------------------------------
    updateBrowse(game) {
        const want = game.state === 'TITLE' && Net.status === 'idle' && !!resolveServerUrl();
        if (!want) {
            if (this.browseWs) {
                const ws = this.browseWs;
                this.browseWs = null;
                try { ws.close(); } catch { /* 이미 닫힘 */ }
            }
            return;
        }
        if (this.browseWs || performance.now() < this.browseRetry) return;
        let ws;
        try {
            ws = new WebSocket(resolveServerUrl());
        } catch {
            this.browseRetry = performance.now() + 3000;
            return;
        }
        this.browseWs = ws;
        this.lastView = '';
        ws.onopen = () => ws.send(JSON.stringify({ t: 'list', v: NET_PROTOCOL_VERSION }));
        ws.onmessage = (ev) => {
            let msg;
            try { msg = JSON.parse(ev.data); } catch { return; }
            if (msg.t === 'rooms') {
                this.listLoaded = true;
                this.listError = '';
                this.setRooms(msg.rooms || []);
                this.lastView = '';
            } else if (msg.t === 'error') {
                this.listError = msg.message; // 버전이 다를 때 등
                this.lastView = '';
            }
        };
        ws.onclose = () => {
            if (this.browseWs !== ws) return;
            this.browseWs = null;
            this.browseRetry = performance.now() + 3000; // 3초 뒤 다시 연결 (서버가 깨어나는 중 등)
            this.lastView = '';
        };
    },

    setRooms(rooms) {
        const key = JSON.stringify(rooms.map((r) => [r.id, r.name, r.locked, r.state]));
        if (key === this.roomsKey) return;
        this.roomsKey = key;
        this.rooms = rooms;
        // 비밀번호를 묻던 방이 사라지거나 꽉 차면 목록으로
        if (this.form === 'password' && this.pwRoom) {
            const r = rooms.find((x) => x.id === this.pwRoom.id);
            if (!r || r.state !== 'waiting') {
                this.openForm('list');
                this.message = '그 방은 이제 들어갈 수 없어요.';
            }
        }
    },

    renderList() {
        const el = this.listEl;
        el.textContent = '';
        if (!this.rooms.length) {
            const d = document.createElement('div');
            d.className = 'empty';
            d.textContent = this.listLoaded ? '아직 방이 없어요. "방 만들기"로 먼저 만들어 보세요.'
                : '방 목록을 불러오는 중... (서버가 잠들어 있으면 1분쯤 걸려요)';
            el.appendChild(d);
            return;
        }
        const open = this.rooms.filter((r) => r.state === 'waiting');
        const selId = open.length ? open[Math.min(this.sel, open.length - 1)].id : null;
        for (const r of this.rooms) {
            const b = document.createElement('button');
            b.type = 'button';
            b.className = 'room' + (r.id === selId ? ' sel' : '');
            b.dataset.id = r.id;
            b.disabled = r.state !== 'waiting';
            const lock = document.createElement('span');
            lock.className = 'lock';
            lock.textContent = r.locked ? '🔒' : '';
            const name = document.createElement('span');
            name.className = 'name';
            name.textContent = r.name; // 이름은 글자로만 넣는다 (HTML로 넣지 않음)
            const st = document.createElement('span');
            st.className = 'state ' + r.state;
            st.textContent = ROOM_STATE_LABEL[r.state] || r.state;
            b.append(lock, name, st);
            el.appendChild(b);
        }
    },

    // 매 프레임 불리지만, 보이는 내용이 바뀔 때만 화면을 고친다
    update(game) {
        this.updateBrowse(game);
        const view = this.currentView(game);
        const key = JSON.stringify(view);
        if (key === this.lastView) return;
        this.lastView = key;

        this.panel.hidden = !view.panel;
        this.bar.hidden = !view.bar;
        if (view.panel) {
            this.panel.querySelector('.menu').hidden = view.panel !== 'menu';
            this.panel.querySelector('.create-form').hidden = view.panel !== 'create';
            this.panel.querySelector('.pw-form').hidden = view.panel !== 'password';
            this.panel.querySelector('.busy').hidden = view.panel !== 'busy';
            this.panel.querySelector('.busy-text').innerHTML = view.busyText || '';
            this.panel.querySelector('.notice').textContent = view.notice || '';
            this.panel.querySelector('.pw-room').textContent = this.pwRoom ? this.pwRoom.name : '';
            this.panel.querySelector('.server').textContent = p2pAllowed()
                ? `연결 방식: 기기끼리 직접 연결 시도 → 안 되면 서버 경유 · 서버: ${serverHostLabel()}`
                : `연결 방식: 서버 경유 · 서버: ${serverHostLabel()}`;
            if (view.panel === 'menu') this.renderList();
        }
        if (view.bar) {
            this.bar.querySelector('.bar-text').textContent = view.bar;
            this.bar.classList.toggle('warn', !!view.warn);
        }
    },

    currentView(game) {
        if (Net.status === 'waiting' || Net.status === 'linking' || Net.status === 'playing') this.form = 'list'; // 방에 들어갔으면 폼은 닫음
        if (Net.status === 'playing') {
            const me = Net.slot === 0 ? 'P1 (빨강)' : 'P2 (파랑)';
            const ping = Net.pingMs === null ? '' : ` · 핑 ${Net.pingMs}ms`;
            // 틱 끊김: 정상이면 20ms 안팎. 크게 튀면 틱을 만드는 쪽(방장 창이나 서버)이 늦어지고 있다는 뜻
            const gap = Net.maxFrameGapMs();
            const gapText = gap === null ? '' : ` · 틱 끊김 ${Math.round(gap / 10) * 10}ms · 여유분 ${Net.bufferTarget()}틱`;
            const switches = ['buffer', 'fast', 'p2p'].filter(urlSwitchOff).map(n => `${n}=off`);
            const switchText = switches.length ? ` · [${switches.join(' ')}]` : '';
            const warn = Net.desynced ? ' · ⚠ 두 기기 화면이 어긋났어요. 나갔다가 다시 들어와 주세요' : '';
            const name = Net.roomName ? `${Net.roomName} (${Net.code})` : Net.code;
            return { bar: `온라인 · 방 ${name} · 나: ${me} · ${Net.connectionLabel()}${ping}${gapText}${switchText}${warn}`, warn: Net.desynced };
        }
        if (Net.status === 'linking') {
            return { panel: 'busy', busyText: '상대와 연결하는 중...<br><small>같은 와이파이면 기기끼리 직접 연결하고, 안 되면 서버를 거쳐 연결해요 (최대 5초)</small>' };
        }
        if (Net.status === 'connecting') {
            return { panel: 'busy', busyText: '서버에 연결하는 중...<br><small>서버가 잠들어 있으면 1분쯤 걸릴 수 있어요</small>' };
        }
        if (Net.status === 'waiting') {
            const esc = (t) => String(t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
            return {
                panel: 'busy',
                busyText: `${Net.roomLocked ? '🔒 ' : ''}<b>${esc(Net.roomName || '')}</b> 방을 만들었어요<br>`
                    + `<small>상대가 방 목록에서 이 방을 누르면 시작해요 · 방 코드 </small><b class="code">${esc(Net.code)}</b><br><small>상대를 기다리는 중...</small>`,
            };
        }
        if (game.state === 'TITLE') {
            const notice = Net.lastError || this.message || this.listError;
            // 비밀번호가 틀렸으면 비밀번호 칸을 그대로 둔다
            if (this.form === 'password' && this.pwRoom) return { panel: 'password', notice, room: this.pwRoom.id };
            if (this.form === 'create') return { panel: 'create', notice };
            return { panel: 'menu', notice, rooms: this.roomsKey, loaded: this.listLoaded, sel: this.sel };
        }
        return {};
    },
};

Lobby.init();

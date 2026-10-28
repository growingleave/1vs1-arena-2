// 시작 화면의 온라인 메뉴(방 만들기 / 방 들어가기)와 온라인 중 상태 표시줄.
// 글자 입력이 필요해서 캔버스 위에 HTML로 올린다.

const Lobby = {
    message: '', // 상대가 나갔을 때 등 시작 화면에 보여줄 안내
    lastView: '',

    init() {
        // 버튼을 누른 뒤 포커스가 남아 있으면 SPACE/ENTER가 버튼을 다시 누르게 되므로 바로 풀어준다
        document.addEventListener('click', (e) => {
            if (e.target.tagName === 'BUTTON') e.target.blur();
        });

        this.panel = document.getElementById('lobby');
        this.bar = document.getElementById('online-bar');
        this.codeInput = document.getElementById('room-code');

        document.getElementById('btn-create').addEventListener('click', () => {
            this.message = '';
            Net.createRoom();
        });
        document.getElementById('btn-join').addEventListener('click', () => this.join());
        this.codeInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.join();
        });
        this.codeInput.addEventListener('input', () => {
            this.codeInput.value = this.codeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4);
        });
        document.getElementById('btn-cancel').addEventListener('click', () => Net.leave());
        document.getElementById('btn-leave').addEventListener('click', () => {
            Net.leave();
            this.message = '방에서 나왔어요.';
            backToTitle();
        });
    },

    join() {
        const code = this.codeInput.value.trim();
        if (code.length !== 4) {
            this.message = '방 코드 4글자를 입력해 주세요.';
            return;
        }
        this.message = '';
        this.codeInput.blur();
        Net.joinRoom(code);
    },

    // 매 프레임 불리지만, 보이는 내용이 바뀔 때만 화면을 고친다
    update(game) {
        const view = this.currentView(game);
        const key = JSON.stringify(view);
        if (key === this.lastView) return;
        this.lastView = key;

        this.panel.hidden = !view.panel;
        this.bar.hidden = !view.bar;
        if (view.panel) {
            this.panel.querySelector('.menu').hidden = view.panel !== 'menu';
            this.panel.querySelector('.busy').hidden = view.panel === 'menu';
            this.panel.querySelector('.busy-text').innerHTML = view.busyText || '';
            this.panel.querySelector('.notice').textContent = view.notice || '';
            this.panel.querySelector('.server').textContent = p2pAllowed()
                ? `연결 방식: 기기끼리 직접 연결 시도 → 안 되면 서버 경유 · 서버: ${serverHostLabel()}`
                : `연결 방식: 서버 경유 · 서버: ${serverHostLabel()}`;
        }
        if (view.bar) {
            this.bar.querySelector('.bar-text').textContent = view.bar;
            this.bar.classList.toggle('warn', !!view.warn);
        }
    },

    currentView(game) {
        if (Net.status === 'playing') {
            const me = Net.slot === 0 ? 'P1 (빨강)' : 'P2 (파랑)';
            const ping = Net.pingMs === null ? '' : ` · 핑 ${Net.pingMs}ms`;
            // 틱 끊김: 정상이면 20ms 안팎. 크게 튀면 틱을 만드는 쪽(방장 창이나 서버)이 늦어지고 있다는 뜻
            const gap = Net.maxFrameGapMs();
            const gapText = gap === null ? '' : ` · 틱 끊김 ${Math.round(gap / 10) * 10}ms · 여유분 ${Net.bufferTarget()}틱`;
            const switches = ['buffer', 'fast', 'p2p'].filter(urlSwitchOff).map(n => `${n}=off`);
            const switchText = switches.length ? ` · [${switches.join(' ')}]` : '';
            const warn = Net.desynced ? ' · ⚠ 두 기기 화면이 어긋났어요. 나갔다가 다시 들어와 주세요' : '';
            return { bar: `온라인 · 방 ${Net.code} · 나: ${me} · ${Net.connectionLabel()}${ping}${gapText}${switchText}${warn}`, warn: Net.desynced };
        }
        if (Net.status === 'linking') {
            return { panel: 'busy', busyText: '상대와 연결하는 중...<br><small>같은 와이파이면 기기끼리 직접 연결하고, 안 되면 서버를 거쳐 연결해요 (최대 5초)</small>' };
        }
        if (Net.status === 'connecting') {
            return { panel: 'busy', busyText: '서버에 연결하는 중...<br><small>서버가 잠들어 있으면 1분쯤 걸릴 수 있어요</small>' };
        }
        if (Net.status === 'waiting') {
            return {
                panel: 'busy',
                busyText: `방 코드 <b class="code">${Net.code}</b><br><small>다른 기기에서 '방 들어가기'에 이 코드를 입력하세요. 상대를 기다리는 중...</small>`,
            };
        }
        if (game.state === 'TITLE') {
            return { panel: 'menu', notice: Net.lastError || this.message };
        }
        return {};
    },
};

Lobby.init();

// 게임패드(프로콘, 조이콘, 엑스박스 패드 등) 입력: 패드 상태를 매 프레임 읽어 "키보드 키를 누른 것"으로 바꿔 넣는다.
// 그래서 메뉴, 대전, 온라인이 키보드와 똑같이 동작한다.
//   한 컴퓨터 대전: 첫 번째 패드 = P1, 두 번째 패드 = P2 (키보드도 같이 쓸 수 있음)
//   온라인 대전: 어느 패드든 내 캐릭터
// 버튼 (표준 배치 번호, 닌텐도 기준 이름):
//   스틱 / 십자키 = 이동
//   B(아래, 0) 또는 R(5) = 평타,  Y(왼쪽, 2) 또는 L(4) = 스킬 1,  X(위, 3) 또는 ZL(6) = 스킬 2,  A(오른쪽, 1) 또는 ZR(7) = 궁극기
//   + / -(9, 8) = 준비 확정 (P1 = Space, P2 = Enter)
//   시작 화면에서는 아무 버튼이나 누르면 크롬북 버전으로 시작
// 조이콘 하나를 옆으로 쥐면 브라우저에 따라 버튼 번호가 다를 수 있어서, 시작 화면·선택 화면에 누른 버튼 번호를 보여준다

const PAD_DEADZONE = 0.5;
const PAD_SKILL_BUTTONS = [[0, 5], [2, 4], [3, 6], [1, 7]]; // 평타, 스킬 1, 스킬 2, 궁극기
const PAD_READY_BUTTONS = [9, 8];

const Gamepads = {
    held: new Map(),   // 패드 번호 → 지금 이 패드가 누르고 있는 키 코드들
    info: [],          // 화면 표시용: [{ name, slot, buttons: [눌린 번호], axes }]

    // 이 패드가 쓸 키 배치 (온라인이면 온라인 키, 아니면 P1/P2 키)
    controlsFor(slot) {
        if (Net.isOnline()) {
            const k = ONLINE_LOCAL_KEYS;
            return { up: k.up[0], down: k.down[0], left: k.left[0], right: k.right[0], skills: [k.s0[0], k.s1[0], k.s2[0], k.s3[0]], ready: k.ready[0] };
        }
        const c = slot === 0 ? P1_CONTROLS : P2_CONTROLS;
        return { ...c, ready: slot === 0 ? 'Space' : 'Enter' };
    },

    poll() {
        const list = navigator.getGamepads ? [...navigator.getGamepads()].filter((g) => g && g.connected) : [];
        this.info = [];
        const seen = new Set();
        list.forEach((pad, slot) => {
            if (slot > 1) return; // 패드는 2개까지
            seen.add(pad.index);
            const pressed = (i) => !!(pad.buttons[i] && (pad.buttons[i].pressed || pad.buttons[i].value > 0.5));
            const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
            const c = this.controlsFor(slot);
            const want = new Set();
            if (ay < -PAD_DEADZONE || pressed(12)) want.add(c.up);
            if (ay > PAD_DEADZONE || pressed(13)) want.add(c.down);
            if (ax < -PAD_DEADZONE || pressed(14)) want.add(c.left);
            if (ax > PAD_DEADZONE || pressed(15)) want.add(c.right);
            PAD_SKILL_BUTTONS.forEach((btns, i) => { if (btns.some(pressed) && c.skills[i]) want.add(c.skills[i]); });
            if (PAD_READY_BUTTONS.some(pressed)) want.add(c.ready);
            const anyButton = pad.buttons.some((b, i) => i < 12 && b && b.pressed);
            if (anyButton && typeof game !== 'undefined' && game.state === 'TITLE' && !Net.isOnline()) want.add('Digit2');
            this.apply(pad.index, want);
            this.info.push({
                name: pad.id.replace(/\(.*?\)/g, '').trim().slice(0, 28) || '게임패드',
                slot,
                buttons: pad.buttons.map((b, i) => (b && b.pressed ? i : -1)).filter((i) => i >= 0),
                axes: [ax, ay],
            });
        });
        // 빠진 패드는 누르던 키를 모두 뗀다
        for (const idx of [...this.held.keys()]) if (!seen.has(idx)) this.apply(idx, new Set());
    },

    // 원하는 키 집합과 지금 누른 키 집합의 차이만큼 누름/뗌
    apply(idx, want) {
        const have = this.held.get(idx) || new Set();
        for (const code of have) if (!want.has(code)) inputKeyUp(code);
        for (const code of want) if (!have.has(code)) inputKeyDown(code);
        if (want.size) this.held.set(idx, want); else this.held.delete(idx);
    },

    // 시작 화면·선택 화면 왼쪽 아래 구석에 연결된 패드와 누른 버튼 번호 (버튼 확인용)
    drawStatus(ctx) {
        if (!this.info.length) return;
        this.info.forEach((p, i) => {
            const who = Net.isOnline() ? '나' : (p.slot === 0 ? 'P1' : 'P2');
            const btn = p.buttons.length ? `버튼 ${p.buttons.join(',')}` : '';
            const stick = Math.hypot(p.axes[0], p.axes[1]) > PAD_DEADZONE ? `스틱 ${p.axes[0].toFixed(1)},${p.axes[1].toFixed(1)}` : '';
            const y = HEIGHT - 6 - (this.info.length - 1 - i) * 16;
            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)'; ctx.fillRect(4, y - 15, 330, 16);
            drawText(ctx, `패드 ${who}: ${p.name} ${btn} ${stick}`, 8, y, 12, '#9fe0a0', { baseline: 'bottom' });
        });
    },
};

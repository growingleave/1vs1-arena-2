// 게임 진행 (main.py를 옮김)
// 화면 흐름: TITLE → LOADOUT(구역마다 선택창 ↔ 훈련장) → VERSUS(대결 연출) → MAP_SELECT → BATTLE → GAMEOVER
//
// step()은 게임을 1틱 진행시키고, render()는 현재 상태를 그리기만 한다.
// 둘을 나눠두면 나중에 온라인 대전에서 step()만 서버로 옮기기 쉽다.

const LOADOUT_DIVIDER_X = 637;

const LOADOUT_SIDE_X = [0, LOADOUT_DIVIDER_X + 6]; // 왼쪽(P1)·오른쪽(P2) 구역의 시작 x
const LOADOUT_SIDE_W = LOADOUT_DIVIDER_X;

// 훈련장 배치는 P1 기준으로 적고, P2는 좌우를 뒤집어 쓴다
function trainX(n, x, w = 0) { return n === 1 ? x : WIDTH - x - w; }
// 위쪽(0~240)은 이름·스킬 아이콘·능력 설명 자리라 훈련장은 그 아래에 둔다
const TRAIN_SPAWN = [150, 480];
const TRAIN_DUMMY = [330, 360];
const TRAIN_ORB = [330, 455];

function buildTrainingWalls() {
    const walls = [new Wall(LOADOUT_DIVIDER_X, 0, 6, HEIGHT, '#3a3a46')]; // 중앙 분리벽 (P1/P2 구역)
    for (const n of [1, 2]) {
        for (const [x, y, w, h] of [[150, 530, 140, 30], [480, 470, 56, 56], [70, 290, 26, 110]]) {
            walls.push(new Wall(trainX(n, x, w), y, w, h, '#5c5c6a'));
        }
    }
    return walls;
}

// 발판: 밟으면 한 번 동작한다 (능력 바꾸기 → 선택창, 허수아비 복귀)
function buildTrainingPads(n) {
    return {
        change: new Rect(trainX(n, 24, 160), 616, 160, 70),
        reset: new Rect(trainX(n, 453, 160), 616, 160, 70),
    };
}

function createLoadoutOrb(n) {
    const orb = new Pickup(trainX(n, TRAIN_ORB[0]), TRAIN_ORB[1], 'ult');
    orb.respawnTime = 1200; // 궁극기를 바로바로 다시 시험해볼 수 있게
    return orb;
}

// 선택창 카드 배치 (구역 안 기준)
// 히든 캐릭터: 선택창에서 커맨드(이동키 위 위 아래 아래 왼 오 왼 오)를 치면 그 사람 선택창에 나타난다
const HIDDEN_CHARACTERS = [8]; // DIO
const HIDDEN_COMMAND = 'UUDDLRLR';
// 선택창에서 아예 안 보이는 캐릭터 (코드·그림 파일은 남겨 둠). 폭파광: 디자인을 아직 못 구함
const DISABLED_CHARACTERS = [4];
const SELECT_COLS = 4, SELECT_CARD_W = 132, SELECT_CARD_H = 62, SELECT_GAP = 8;
const SELECT_GRID_X = Math.round((LOADOUT_SIDE_W - (SELECT_COLS * SELECT_CARD_W + (SELECT_COLS - 1) * SELECT_GAP)) / 2);
const SELECT_GRID_Y = 58;

// 캐릭터 설명을 항목별로 나눈다 ("평타: ..., 스킬 1: ..." → 항목 목록)
function characterSummaryItems(idx) {
    // 항목은 ", 머리말:" 로 나뉜다 (머리말 안에는 쉼표를 쓰지 않는다)
    return getCharacterData(idx).desc.split(/,\s*(?=[^,:：]{1,24}[:：])/).map((t) => t.trim()).filter(Boolean);
}

// 글자를 너비에 맞춰 여러 줄로 나눈다 (그리기 전용)
function wrapText(ctx, text, maxW, size, bold) {
    setFont(ctx, size, bold);
    const out = [];
    let line = '';
    for (const ch of text) {
        if (ctx.measureText(line + ch).width > maxW && line) { out.push(line); line = ch.trim() ? ch : ''; }
        else line += ch;
    }
    if (line) out.push(line);
    return out;
}

// 훈련장 설명 패널용으로 줄바꿈해 둔 설명 (캐릭터별로 한 번만 계산)
const _trainDescCache = new Map();
function trainingDescLines(ctx, idx, width) {
    if (_trainDescCache.has(idx)) return _trainDescCache.get(idx);
    const rows = [];
    for (const item of characterSummaryItems(idx)) {
        const m = item.match(/^([^:：]{1,24})[:：]\s*(.*)$/);
        const head = m ? m[1] : '', body = m ? m[2] : item;
        const headW = head ? textWidth(ctx, head, 12, true) + 8 : 0;
        wrapText(ctx, body, width - headW, 12, false).forEach((text, i) => rows.push({ head: i === 0 ? head : '', headW, text }));
    }
    _trainDescCache.set(idx, rows);
    return rows;
}

// 훈련장 바닥 (한 번만 그려 두고 재사용)
let _trainingBg = null;
function trainingBackground() {
    if (_trainingBg) return _trainingBg;
    const c = document.createElement('canvas'); c.width = WIDTH; c.height = HEIGHT;
    const g = c.getContext('2d');
    g.fillStyle = '#16161c'; g.fillRect(0, 0, WIDTH, HEIGHT);
    for (const n of [1, 2]) {
        const ox = LOADOUT_SIDE_X[n - 1];
        // 바닥 타일
        for (let y = 0; y < HEIGHT; y += 40) for (let x = 0; x < LOADOUT_SIDE_W; x += 40) {
            g.fillStyle = ((x + y) / 40) % 2 ? '#1b1b23' : '#1e1e27';
            g.fillRect(ox + x, y, Math.min(40, LOADOUT_SIDE_W - x), 40);
        }
        g.strokeStyle = 'rgba(255,255,255,0.035)'; g.lineWidth = 1; g.beginPath();
        for (let x = 0; x <= LOADOUT_SIDE_W; x += 40) { g.moveTo(ox + x + 0.5, 0); g.lineTo(ox + x + 0.5, HEIGHT); }
        for (let y = 0; y <= HEIGHT; y += 40) { g.moveTo(ox, y + 0.5); g.lineTo(ox + LOADOUT_SIDE_W, y + 0.5); }
        g.stroke();
        // 테두리
        g.strokeStyle = n === 1 ? 'rgba(230,60,60,0.35)' : 'rgba(60,120,230,0.35)'; g.lineWidth = 4;
        g.strokeRect(ox + 4, 4, LOADOUT_SIDE_W - 8, HEIGHT - 8);
        // 허수아비 과녁
        const dx = trainX(n, TRAIN_DUMMY[0]), dy = TRAIN_DUMMY[1];
        for (const [r, a] of [[90, 0.06], [62, 0.09], [34, 0.13]]) {
            g.strokeStyle = `rgba(255,90,90,${a * 2})`; g.lineWidth = 2; g.fillStyle = `rgba(255,90,90,${a * 0.5})`;
            g.beginPath(); g.arc(dx, dy, r, 0, Math.PI * 2); g.fill(); g.stroke();
        }
        g.strokeStyle = 'rgba(255,120,120,0.25)'; g.lineWidth = 1; g.beginPath();
        g.moveTo(dx - 100, dy); g.lineTo(dx + 100, dy); g.moveTo(dx, dy - 100); g.lineTo(dx, dy + 100); g.stroke();
        // 거리 눈금 (허수아비에서 100px마다)
        g.fillStyle = 'rgba(255,255,255,0.18)'; g.font = '11px sans-serif'; g.textAlign = 'center';
        for (let k = 1; k <= 3; k++) {
            const tx = n === 1 ? dx - k * 100 : dx + k * 100;
            if (tx < ox + 12 || tx > ox + LOADOUT_SIDE_W - 12) continue;
            g.fillRect(tx - 1, dy + 104, 2, 10); g.fillText(`${k * 100}`, tx, dy + 128);
        }
        // 출발점
        const sx = trainX(n, TRAIN_SPAWN[0]), sy = TRAIN_SPAWN[1];
        g.strokeStyle = 'rgba(255,255,255,0.15)'; g.lineWidth = 2; g.setLineDash([6, 6]);
        g.beginPath(); g.arc(sx, sy, 30, 0, Math.PI * 2); g.stroke(); g.setLineDash([]);
        // 아래 발판 구역 띠
        g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(ox + 8, 600, LOADOUT_SIDE_W - 16, 112);
    }
    _trainingBg = c;
    return c;
}

// 조작키 안내 한 줄. 온라인에서는 내 자리만 (상대 키는 내 키보드와 상관없음)
function controlHintText(n) {
    if (Net.isOnline()) {
        if (Net.slot !== n - 1) return null;
        return '이동 방향키 · Q 평타 · W 스킬1 · E 스킬2 · R 궁극기';
    }
    const ctl = n === 1 ? P1_CONTROLS : P2_CONTROLS;
    const [a, b, c, d] = ctl.skills.map(keyLabel);
    return `이동 ${n === 1 ? 'WASD' : '방향키'} · ${a} 평타 · ${b} 스킬1 · ${c} 스킬2 · ${d} 궁극기`;
}

function keyLabel(code) {
    if (!code) return '';
    if (code.startsWith('Key')) return code.slice(3);
    return { Semicolon: ';', Quote: "'", Space: 'SPACE', Enter: 'ENTER', Numpad1: '1' }[code] || code.replace('Numpad', '');
}

class Game {
    constructor() {
        this.state = 'TITLE';

        // 선택창 요약에 쓰는 기본 능력치 (캐릭터를 한 번씩 만들어 읽어 둔다)
        this.charStats = CHARACTER_REGISTRY.map((_, i) => {
            const p = spawnCharacterPlayer(0, 0, COLOR_RED, i, 1);
            return { hp: p.maxHp, atk: p.baseAtk, speed: p.speed, ult: p.maxUltGauge };
        });
        this.loadoutWalls = buildTrainingWalls();
        this.trainPads = [buildTrainingPads(1), buildTrainingPads(2)];

        this.p1CharIdx = 0;
        this.p2CharIdx = 1;
        this.hiddenUnlocked = [false, false]; // P1/P2 각자 히든 캐릭터 해금 (게임을 껐다 켜면 다시 숨김)
        this.selectedMapIdx = 0;

        this.walls = this.loadoutWalls;
        this.pickups = [];
        this.hazards = [];     // 고정 지형 (용암 구덩이, 빙판)
        this.mapEvents = [];   // 반복 이벤트 (낙하 용암, 눈보라)
        this.previewCache = { idx: -1, hazards: [], events: [] }; // 맵 선택 미리보기용 (그림 전용)
        this.battleBgColor = COLOR_BG;
        this.attacks = [];
        this.winnerText = '';
        this.versusStartTime = 0;

        this.enterLoadout();
    }

    enterLoadout() {
        Vfx.clear();
        this.walls = this.loadoutWalls;
        this.attacks = [];
        this.loadoutOrbs = [null, null];
        // 구역마다 화면이 둘: 'select'(캐릭터 선택창) / 'train'(훈련장)
        this.sides = [1, 2].map((n) => ({ mode: 'select', cursor: n === 1 ? this.p1CharIdx : this.p2CharIdx, onPad: null }));
        this.resetTraining(1);
        this.resetTraining(2);
        this.p1Ready = false;
        this.p2Ready = false;
    }

    // 그 구역을 완전히 새로: 그 플레이어가 만든 공격·소환물(DIO 스탠드, 폭파광 변신 등)을 지우고
    // 캐릭터·허수아비·궁극기 구슬을 처음 상태로 다시 만든다
    resetTraining(n) {
        const old = n === 1 ? this.player1 : this.player2;
        if (old) this.attacks = this.attacks.filter((a) => a.owner !== old);
        Vfx.clear();
        const charIdx = n === 1 ? this.p1CharIdx : this.p2CharIdx;
        const player = spawnCharacterPlayer(trainX(n, TRAIN_SPAWN[0]), TRAIN_SPAWN[1], n === 1 ? COLOR_RED : COLOR_BLUE, charIdx, n);
        player.rect.setCenter(trainX(n, TRAIN_SPAWN[0]), TRAIN_SPAWN[1]);
        if (n === 1) this.player1 = player; else this.player2 = player;
        this.resetDummy(n);
        this.loadoutOrbs[n - 1] = createLoadoutOrb(n);
        this.sides[n - 1].onPad = null;
    }

    // 허수아비를 제자리로 (상태이상도 모두 풀린 새 허수아비)
    resetDummy(n) {
        const dummy = createPracticeDummy(0, 0);
        dummy.rect.setCenter(trainX(n, TRAIN_DUMMY[0]), TRAIN_DUMMY[1]);
        if (n === 1) this.dummy1 = dummy; else this.dummy2 = dummy;
        // 훈련장에서는 "상대"가 자기 쪽 허수아비
        (n === 1 ? this.player1 : this.player2).opponent = dummy;
    }

    // 선택창에서 고른 캐릭터로 훈련장에 들어간다
    confirmSelection(n) {
        const side = this.sides[n - 1];
        if (n === 1) this.p1CharIdx = side.cursor; else this.p2CharIdx = side.cursor;
        this.resetTraining(n);
        side.mode = 'train';
    }

    // 선택창 키 조작 (방향키: 고르기, 평타 키: 훈련장으로)
    // 선택창에 보이는 캐릭터 번호 목록 (히든은 해금한 사람에게만)
    visibleCharacters(n) {
        return CHARACTER_REGISTRY.map((_, i) => i).filter((i) => !DISABLED_CHARACTERS.includes(i) && (!HIDDEN_CHARACTERS.includes(i) || this.hiddenUnlocked[n - 1]));
    }

    handleSelectKey(n, code) {
        const side = this.sides[n - 1];
        const ctl = n === 1 ? P1_CONTROLS : P2_CONTROLS;
        // 히든 커맨드: 최근 이동키 8개
        const dir = { [ctl.up]: 'U', [ctl.down]: 'D', [ctl.left]: 'L', [ctl.right]: 'R' }[code];
        side.cmd = ((side.cmd || '') + (dir || '-')).slice(-HIDDEN_COMMAND.length);
        if (side.cmd === HIDDEN_COMMAND && !this.hiddenUnlocked[n - 1]) {
            this.hiddenUnlocked[n - 1] = true;
            side.cursor = HIDDEN_CHARACTERS[0];
            side.unlockTime = Time.now;
            return;
        }
        const list = this.visibleCharacters(n), count = list.length;
        let c = Math.max(0, list.indexOf(side.cursor));
        if (code === ctl.left) c = (c - 1 + count) % count;
        else if (code === ctl.right) c = (c + 1) % count;
        else if (code === ctl.up) c = c - SELECT_COLS >= 0 ? c - SELECT_COLS : Math.min(count - 1, c + SELECT_COLS * Math.floor((count - 1 - c) / SELECT_COLS));
        else if (code === ctl.down) c = c + SELECT_COLS < count ? c + SELECT_COLS : c % SELECT_COLS;
        else if (code === ctl.skills[0]) { this.confirmSelection(n); return; }
        side.cursor = list[c];
    }

    startBattle() {
        Vfx.clear();
        const map = MAPS[this.selectedMapIdx];
        this.walls = map.buildWalls();
        this.pickups = map.buildPickups();
        this.hazards = map.buildHazards ? map.buildHazards() : [];
        this.mapEvents = map.buildEvents ? map.buildEvents() : [];
        this.battleBgColor = map.bgColor || COLOR_BG;
        this.battleMap = map;
        this.attacks = [];
        this.state = 'BATTLE';
    }

    // ------------------------------------------
    // 키를 새로 눌렀을 때 (메뉴 조작)
    // ------------------------------------------
    handleKeyDown(code) {
        if (this.state === 'TITLE') {
            if (code === 'Digit1' || code === 'Numpad1') {
                applyControlScheme('laptop');
                this.enterLoadout();
                this.state = 'LOADOUT';
            } else if (code === 'Digit2' || code === 'Numpad2') {
                applyControlScheme('chromebook');
                this.enterLoadout();
                this.state = 'LOADOUT';
            }
        } else if (this.state === 'LOADOUT') {
            // 확정 (다시 누르면 취소). 선택창에서 누르면 지금 고른 캐릭터로 확정
            if (code === 'Space') {
                if (!this.p1Ready && this.sides[0].mode === 'select') this.confirmSelection(1);
                this.p1Ready = !this.p1Ready;
            }
            if (code === 'Enter' || code === 'NumpadEnter') {
                if (!this.p2Ready && this.sides[1].mode === 'select') this.confirmSelection(2);
                this.p2Ready = !this.p2Ready;
            }
            for (const n of [1, 2]) {
                if (this.sides[n - 1].mode === 'select' && !(n === 1 ? this.p1Ready : this.p2Ready)) this.handleSelectKey(n, code);
            }
        } else if (this.state === 'MAP_SELECT') {
            if (code === 'ArrowLeft' || code === 'KeyA') {
                this.selectedMapIdx = (this.selectedMapIdx - 1 + MAPS.length) % MAPS.length;
            } else if (code === 'ArrowRight' || code === 'KeyD') {
                this.selectedMapIdx = (this.selectedMapIdx + 1) % MAPS.length;
            } else if (code === 'Space' || code === 'Enter' || code === 'NumpadEnter') {
                this.startBattle();
            }
        } else if (this.state === 'GAMEOVER') {
            if (code === 'Space' || code === 'Enter' || code === 'NumpadEnter') {
                this.enterLoadout();
                this.state = 'LOADOUT';
            }
        }
    }

    // ------------------------------------------
    // 1틱 진행
    // p1Input / p2Input: player.js의 입력 객체
    // ------------------------------------------
    step(dtSec, p1Input, p2Input) {
        Time.now += dtSec * 1000;
        CURRENT_WALLS = this.walls;

        if (this.state === 'LOADOUT') this.stepLoadout(dtSec, p1Input, p2Input);
        else if (this.state === 'VERSUS') this.stepVersus();
        else if (this.state === 'BATTLE') this.stepBattle(dtSec, p1Input, p2Input);
    }

    // 공격들을 움직이고, 맞은 대상에게 피해를 준다. getTarget(attack)은 그 공격이 노리는 대상
    updateAttacks(walls, getTarget) {
        for (const attack of [...this.attacks]) {
            const before = this.attacks.length;
            attack.update(walls);
            let hitNow = false;

            const target = getTarget(attack);
            if (target && !attack.hitPlayers.includes(target) && attack.collidesWith(target)) {
                // 방어력 계산은 takeDamage 안에서 하고, 실제 들어간 피해만큼 궁극기 충전
                // 보급 상자 공격력 증가 (power_up) 중이면 피해 증가
                const pu = attack.owner && attack.owner.statusEffects && attack.owner.statusEffects.power_up;
                const finalDamage = target.takeDamage(attack.damage * (pu ? 1 + pu.power / 100 : 1));
                attack.hitPlayers.push(target);
                // 궁극기 공격의 피해는 궁극기 게이지를 채우지 않는다
                if (!attack.isUlt) attack.owner.addUltGauge(finalDamage * attack.owner.ultChargeMultiplier);
                if (attack.applyEffect) attack.applyEffect(target);
                hitNow = true;
            }

            const expired = attack.isExpired();
            // 궁극기 공격이 이번 틱에 만들어 낸 공격(폭발, 연속 타격 등)도 궁극기 공격
            if (attack.isUlt) markUltAttacks(this.attacks, before);
            if (expired) {
                this.attacks.splice(this.attacks.indexOf(attack), 1);
                // 맞혀서 사라진 게 아니면(벽·사거리 끝·시간 끝) 사라진 자리에 파티클 (화면용)
                if (!hitNow) spawnProjectileFizzle(attack);
            }
        }
        handleAttackWallCollisions(this.attacks, walls);
    }

    stepLoadout(dtSec, p1Input, p2Input) {
        const walls = this.loadoutWalls;
        const training = (n) => this.sides[n - 1].mode === 'train';
        if (!this.p1Ready && training(1)) this.player1.update(dtSec, p1Input, this.attacks, walls);
        if (!this.p2Ready && training(2)) this.player2.update(dtSec, p2Input, this.attacks, walls);
        this.dummy1.update(dtSec, EMPTY_INPUT, this.attacks, walls);
        this.dummy2.update(dtSec, EMPTY_INPUT, this.attacks, walls);

        this.updateAttacks(walls, (attack) => {
            if (attack.owner === this.player1) return this.dummy1;
            if (attack.owner === this.player2) return this.dummy2;
            return null;
        });

        for (const n of [1, 2]) {
            if (!training(n)) continue;
            const player = n === 1 ? this.player1 : this.player2;
            const orb = this.loadoutOrbs[n - 1];
            orb.update();
            if (orb.collidesWithPlayer(player)) orb.collect(player);

            // 발판: 올라선 순간 한 번만 동작 (확정 전까지만)
            if (n === 1 ? this.p1Ready : this.p2Ready) continue;
            const side = this.sides[n - 1];
            const pads = this.trainPads[n - 1];
            const on = player.rect.colliderect(pads.change) ? 'change' : player.rect.colliderect(pads.reset) ? 'reset' : null;
            if (on && on !== side.onPad) {
                if (on === 'reset') this.resetDummy(n);
                else {
                    // 능력 바꾸기: 지금 캐릭터의 흔적을 지우고 선택창으로
                    this.attacks = this.attacks.filter((a) => a.owner !== player);
                    Vfx.clear();
                    side.cursor = n === 1 ? this.p1CharIdx : this.p2CharIdx;
                    side.mode = 'select';
                }
            }
            side.onPad = on;
        }

        if (this.p1Ready && this.p2Ready) {
            this.player1 = spawnCharacterPlayer(200, 360, COLOR_RED, this.p1CharIdx, 1);
            this.player2 = spawnCharacterPlayer(1040, 360, COLOR_BLUE, this.p2CharIdx, 2);
            this.player1.opponent = this.player2;
            this.player2.opponent = this.player1;
            this.attacks = [];
            this.versusStartTime = Time.now;
            this.state = 'VERSUS';
        }
    }

    stepVersus() {
        if (Time.now - this.versusStartTime >= VERSUS_SLIDE_MS + VERSUS_HOLD_MS) {
            this.state = 'MAP_SELECT';
        }
    }

    stepBattle(dtSec, p1Input, p2Input) {
        const p1 = this.player1;
        const p2 = this.player2;
        p1.update(dtSec, p1Input, this.attacks, this.walls);
        p2.update(dtSec, p2Input, this.attacks, this.walls);

        this.updateAttacks(this.walls, (attack) => (attack.owner === p1 ? p2 : p1));

        for (const pickup of this.pickups) {
            pickup.update();
            if (pickup.collidesWithPlayer(p1)) pickup.collect(p1);
            else if (pickup.collidesWithPlayer(p2)) pickup.collect(p2);
        }

        // 빙판처럼 이동에 영향을 주는 지형은 매 틱 다시 판정하므로 기본값으로 되돌려 두고,
        // 지형이 이번 틱에 다시 걸어준다 (다음 틱 이동 계산에서 쓰인다)
        for (const p of [p1, p2]) {
            p.onIce = false;
            p.iceFriction = 1.0;
        }
        for (const hazard of this.hazards) {
            hazard.update(dtSec);
            hazard.applyDamage([p1, p2], dtSec);
        }
        for (const ev of this.mapEvents) {
            ev.update(dtSec);
            ev.applyDamage([p1, p2], dtSec);
        }

        if (p1.hp <= 0 || p2.hp <= 0) {
            this.state = 'GAMEOVER';
            if (p1.hp <= 0 && p2.hp <= 0) this.winnerText = 'DRAW!';
            else if (p1.hp <= 0) this.winnerText = 'PLAYER 2 WINS!';
            else this.winnerText = 'PLAYER 1 WINS!';
        }
    }

    // ------------------------------------------
    // 그리기
    // ------------------------------------------
    render(ctx) {
        // 화면 흔들림: 바깥 빈틈은 검게 칠하고 전체를 살짝 민다 (화면 효과라 게임 결과와는 무관)
        const [sx, sy] = Vfx.shakeOffset();
        if (sx !== 0 || sy !== 0) {
            ctx.fillStyle = '#000';
            ctx.fillRect(0, 0, WIDTH, HEIGHT);
            ctx.save();
            ctx.translate(sx, sy);
            this.renderState(ctx);
            ctx.restore();
            return;
        }
        this.renderState(ctx);
    }

    renderState(ctx) {
        if (this.state === 'TITLE') this.renderTitle(ctx);
        else if (this.state === 'LOADOUT') this.renderLoadout(ctx);
        else if (this.state === 'VERSUS') this.renderVersus(ctx);
        else if (this.state === 'MAP_SELECT') this.renderMapSelect(ctx);
        else if (this.state === 'BATTLE') this.renderBattle(ctx);
        else if (this.state === 'GAMEOVER') this.renderGameOver(ctx);
    }

    renderTitle(ctx) {
        clearScreen(ctx, COLOR_BG);
        drawText(ctx, '1v1 TOP-DOWN ARENA', WIDTH / 2, HEIGHT / 2 - 100, 40, COLOR_WHITE, { bold: true, align: 'center' });
        drawText(ctx, '웹 버전 (JavaScript)', WIDTH / 2, HEIGHT / 2 - 50, 18, COLOR_GOLD, { bold: true, align: 'center' });
        drawText(ctx, `[1] ${CONTROL_SCHEMES.laptop.label}`, WIDTH / 2, HEIGHT / 2, 24, COLOR_WHITE, { bold: true, align: 'center' });
        drawText(ctx, `[2] ${CONTROL_SCHEMES.chromebook.label}`, WIDTH / 2, HEIGHT / 2 + 40, 24, COLOR_WHITE, { bold: true, align: 'center' });
        if (Math.floor(Time.now / 500) % 2 === 0) {
            drawText(ctx, '사용 중인 기기에 맞는 번호를 눌러 시작하세요', WIDTH / 2, HEIGHT / 2 + 100, 16, COLOR_GRAY, { align: 'center' });
        }
        drawText(ctx, `M: 배경음악 ${Bgm.muted ? '켜기' : '끄기'}`, WIDTH / 2, HEIGHT - 40, 14, COLOR_GRAY, { align: 'center' });
    }

    renderLoadout(ctx) {
        ctx.drawImage(trainingBackground(), 0, 0);
        Vfx.drawGround(ctx);
        for (const wall of this.loadoutWalls) wall.draw(ctx);

        for (const n of [1, 2]) {
            if (this.sides[n - 1].mode !== 'train') continue;
            this.renderPads(ctx, n);
            this.loadoutOrbs[n - 1].draw(ctx);
            (n === 1 ? this.dummy1 : this.dummy2).draw(ctx);
        }
        for (const n of [1, 2]) if (this.sides[n - 1].mode === 'train') (n === 1 ? this.player1 : this.player2).draw(ctx);
        for (const attack of this.attacks) attack.draw(ctx);
        Vfx.draw(ctx);

        for (const n of [1, 2]) {
            if (this.sides[n - 1].mode === 'select') this.renderSelect(ctx, n);
            else this.renderTrainingHud(ctx, n);
        }
    }

    // 지금 조작 키 이름 (온라인은 모두 같은 키)
    keyNames(n) {
        if (Net.isOnline()) return { move: '방향키', s0: 'Q', ready: 'SPACE' };
        const ctl = n === 1 ? P1_CONTROLS : P2_CONTROLS;
        return { move: n === 1 ? 'WASD' : '방향키', s0: keyLabel(ctl.skills[0]), ready: n === 1 ? 'SPACE' : 'ENTER' };
    }

    renderPads(ctx, n) {
        const pads = this.trainPads[n - 1];
        const on = this.sides[n - 1].onPad;
        for (const [key, label, sub, color] of [['change', '능력 바꾸기', '캐릭터 선택창으로', '#ffd700'], ['reset', '허수아비 복귀', '제자리 + 상태 초기화', '#7fd0ff']]) {
            const r = pads[key];
            const lit = on === key;
            ctx.fillStyle = lit ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.06)';
            ctx.beginPath(); ctx.roundRect(r.x, r.y, r.w, r.h, 10); ctx.fill();
            ctx.strokeStyle = color; ctx.lineWidth = lit ? 3 : 2; ctx.setLineDash(lit ? [] : [8, 5]);
            ctx.beginPath(); ctx.roundRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2, 10); ctx.stroke(); ctx.setLineDash([]);
            drawText(ctx, label, r.centerx, r.y + 14, 18, color, { bold: true, align: 'center' });
            drawText(ctx, sub, r.centerx, r.y + 40, 12, '#b4b4be', { align: 'center' });
        }
    }

    renderTrainingHud(ctx, n) {
        const ox = LOADOUT_SIDE_X[n - 1];
        const player = n === 1 ? this.player1 : this.player2;
        const ready = n === 1 ? this.p1Ready : this.p2Ready;
        const color = n === 1 ? COLOR_RED : COLOR_BLUE;
        const data = getCharacterData(n === 1 ? this.p1CharIdx : this.p2CharIdx);
        const k = this.keyNames(n);
        const x = n === 1 ? ox + 18 : ox + LOADOUT_SIDE_W - 18;
        const align = n === 1 ? 'left' : 'right';
        drawText(ctx, `P${n} 훈련장 · ${data.name}`, x, 14, 20, color, { bold: true, align });
        drawSkillIcons(ctx, player, n === 1 ? x : x - 120, 44);
        const hint = controlHintText(n);
        drawText(ctx, hint ? `${hint} · ${k.ready} 준비` : `발판을 밟아 능력 바꾸기 / 허수아비 복귀 · ${k.ready}: 준비`, x, 84, 13, '#c8c8d0', { bold: true, align });

        // 내 능력 설명 (반투명 패널, 뒤의 훈련장이 비쳐 보이게)
        const px = ox + 14, pw = LOADOUT_SIDE_W - 28;
        const rows = trainingDescLines(ctx, n === 1 ? this.p1CharIdx : this.p2CharIdx, pw - 24);
        const ph = rows.length * 15 + 14;
        ctx.fillStyle = 'rgba(10, 10, 16, 0.72)';
        ctx.beginPath(); ctx.roundRect(px, 104, pw, ph, 8); ctx.fill();
        ctx.fillStyle = data.fxColor || COLOR_GRAY; ctx.fillRect(px, 112, 3, ph - 16);
        rows.forEach((row, i) => {
            const y = 111 + i * 15;
            if (row.head) drawText(ctx, row.head, px + 12, y, 12, COLOR_GOLD, { bold: true });
            drawText(ctx, row.text, px + 12 + row.headW, y, 12, '#d8d8e0');
        });
        if (ready) {
            drawText(ctx, 'READY', player.rect.centerx, player.rect.top - 28, 24, COLOR_GOLD, { bold: true, align: 'center' });
            drawText(ctx, '상대를 기다리는 중... (다시 누르면 취소)', ox + LOADOUT_SIDE_W / 2, 250, 15, COLOR_GOLD, { bold: true, align: 'center' });
        }
    }

    renderSelect(ctx, n) {
        const ox = LOADOUT_SIDE_X[n - 1];
        const side = this.sides[n - 1];
        const ready = n === 1 ? this.p1Ready : this.p2Ready;
        const current = n === 1 ? this.p1CharIdx : this.p2CharIdx;
        const color = n === 1 ? COLOR_RED : COLOR_BLUE;
        const k = this.keyNames(n);

        ctx.fillStyle = '#15151b'; ctx.fillRect(ox, 0, LOADOUT_SIDE_W, HEIGHT);
        ctx.strokeStyle = color; ctx.globalAlpha = 0.5; ctx.lineWidth = 4; ctx.strokeRect(ox + 4, 4, LOADOUT_SIDE_W - 8, HEIGHT - 8); ctx.globalAlpha = 1;
        drawText(ctx, `P${n} 캐릭터 선택`, ox + LOADOUT_SIDE_W / 2, 18, 24, color, { bold: true, align: 'center' });
        if (side.unlockTime && Time.now - side.unlockTime < 2500) {
            drawText(ctx, '히든 캐릭터 해금!', ox + LOADOUT_SIDE_W - 22, 24, 15, COLOR_GOLD, { bold: true, align: 'right', alpha: Math.floor((Time.now - side.unlockTime) / 200) % 2 ? 0.5 : 1 });
        }

        // 카드
        this.visibleCharacters(n).forEach((i, pos) => {
            const data = CHARACTER_REGISTRY[i];
            const x = ox + SELECT_GRID_X + (pos % SELECT_COLS) * (SELECT_CARD_W + SELECT_GAP);
            const y = SELECT_GRID_Y + Math.floor(pos / SELECT_COLS) * (SELECT_CARD_H + SELECT_GAP);
            const sel = i === side.cursor;
            const fx = data.fxColor || COLOR_GRAY;
            ctx.fillStyle = sel ? '#2c2c3a' : COLOR_CARD_BG;
            ctx.beginPath(); ctx.roundRect(x, y, SELECT_CARD_W, SELECT_CARD_H, 8); ctx.fill();
            ctx.fillStyle = fx; ctx.globalAlpha = sel ? 0.9 : 0.35; ctx.fillRect(x + 6, y + SELECT_CARD_H - 8, SELECT_CARD_W - 12, 3); ctx.globalAlpha = 1;
            const tx = x + 34, ty = y + SELECT_CARD_H / 2 - 2;
            if (isImageReady(data.thumbnail)) ctx.drawImage(data.thumbnail, tx - 22, ty - 22, 44, 44);
            else {
                ctx.fillStyle = fx; ctx.globalAlpha = 0.85; ctx.beginPath(); ctx.arc(tx, ty, 19, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
                drawText(ctx, data.name[0], tx, ty, 20, '#15151b', { bold: true, align: 'center', baseline: 'middle' });
            }
            drawText(ctx, data.name, x + 94, y + 16, 15, sel ? COLOR_WHITE : '#c8c8d0', { bold: true, align: 'center' });
            if (i === current) drawText(ctx, '사용 중', x + 94, y + 38, 11, COLOR_GOLD, { bold: true, align: 'center' });
            ctx.strokeStyle = sel ? COLOR_GOLD : '#3a3a48'; ctx.lineWidth = sel ? 3 : 1.5;
            ctx.beginPath(); ctx.roundRect(x + 1, y + 1, SELECT_CARD_W - 2, SELECT_CARD_H - 2, 8); ctx.stroke();
        });

        // 요약
        const data = getCharacterData(side.cursor);
        const py = SELECT_GRID_Y + 3 * (SELECT_CARD_H + SELECT_GAP) + 8;
        const px = ox + SELECT_GRID_X;
        const pw = LOADOUT_SIDE_W - SELECT_GRID_X * 2;
        const ph = HEIGHT - py - 64;
        ctx.fillStyle = '#1d1d26'; ctx.beginPath(); ctx.roundRect(px, py, pw, ph, 10); ctx.fill();
        ctx.fillStyle = data.fxColor || COLOR_GRAY; ctx.fillRect(px, py + 10, 4, ph - 20);
        drawText(ctx, data.name, px + 18, py + 12, 24, data.fxColor || COLOR_WHITE, { bold: true });
        const st = this.charStats[side.cursor];
        if (st) drawText(ctx, `체력 ${st.hp} · 공격력 ${st.atk} · 이동속도 ${st.speed} · 궁극기 ${st.ult}`, px + pw - 16, py + 20, 14, '#b4b4be', { align: 'right' });
        let ly = py + 46;
        const maxY = py + ph - 18;
        for (const item of characterSummaryItems(side.cursor)) {
            const m = item.match(/^([^:：]{1,24})[:：]\s*(.*)$/);
            const head = m ? m[1] : '', body = m ? m[2] : item;
            const headW = head ? textWidth(ctx, head, 13, true) + 8 : 0;
            const lines = wrapText(ctx, body, pw - 36 - headW, 13, false);
            for (let i = 0; i < lines.length && ly < maxY; i++, ly += 17) {
                if (i === 0 && head) drawText(ctx, head, px + 18, ly, 13, COLOR_GOLD, { bold: true });
                drawText(ctx, lines[i], px + 18 + headW, ly, 13, '#d8d8e0');
            }
            ly += 4;
            if (ly >= maxY) break;
        }

        const hint = ready ? `준비 완료! 상대를 기다리는 중... (${k.ready}: 취소)` : `${k.move}: 고르기 · ${k.s0}: 훈련장 들어가기 · ${k.ready}: 이 캐릭터로 준비`;
        drawText(ctx, hint, ox + LOADOUT_SIDE_W / 2, HEIGHT - 42, 15, ready ? COLOR_GOLD : COLOR_WHITE, { bold: true, align: 'center' });
    }

    renderVersus(ctx) {
        // 대난투 스타일: 양쪽 초상화가 화면 밖에서 미끄러져 들어와 "/"를 사이에 두고 마주선다
        clearScreen(ctx, COLOR_BG);

        const size = 380;
        const gap = 80;
        const cy = HEIGHT / 2 - 90;
        const finalX1 = WIDTH / 2 - gap / 2 - size / 2;
        const finalX2 = WIDTH / 2 + gap / 2 + size / 2;
        const startX1 = -size / 2;
        const startX2 = WIDTH + size / 2;

        const elapsed = Time.now - this.versusStartTime;
        const slideT = Math.min(1.0, elapsed / VERSUS_SLIDE_MS);
        const eased = 1.0 - (1.0 - slideT) ** 3; // 빠르게 다가오다 부드럽게 멈춤

        const x1 = startX1 + (finalX1 - startX1) * eased;
        const x2 = startX2 + (finalX2 - startX2) * eased;
        drawPortrait(ctx, x1, cy, size, COLOR_RED, getCharacterData(this.p1CharIdx).thumbnail);
        drawPortrait(ctx, x2, cy, size, COLOR_BLUE, getCharacterData(this.p2CharIdx).thumbnail);

        if (slideT > 0.6) {
            const alpha = Math.min(1.0, (slideT - 0.6) / 0.4);
            drawText(ctx, '/', WIDTH / 2, cy, 140, COLOR_GOLD, { bold: true, align: 'center', baseline: 'middle', alpha });
            drawText(ctx, getCharacterData(this.p1CharIdx).name, x1, cy + size / 2 + 12, 40, COLOR_RED, { bold: true, align: 'center', alpha });
            drawText(ctx, getCharacterData(this.p2CharIdx).name, x2, cy + size / 2 + 12, 40, COLOR_BLUE, { bold: true, align: 'center', alpha });
        }
    }

    renderMapSelect(ctx) {
        clearScreen(ctx, COLOR_BG);
        const map = MAPS[this.selectedMapIdx];

        drawText(ctx, '맵 선택', WIDTH / 2, 30, 40, COLOR_WHITE, { bold: true, align: 'center' });

        const scale = 0.6;
        const pw = WIDTH * scale;
        const ph = HEIGHT * scale;
        const px = (WIDTH - pw) / 2;
        const py = (HEIGHT - ph) / 2;

        ctx.fillStyle = map.bgColor || '#0a0a0e';
        ctx.fillRect(px, py, pw, ph);
        if (isImageReady(map.floorImage)) ctx.drawImage(map.floorImage, px, py, pw, ph);

        // 지형 미리보기: 고른 맵이 바뀔 때만 새로 만든다 (그림 전용이라 게임 결과와 무관)
        if (this.previewCache.idx !== this.selectedMapIdx) {
            this.previewCache = {
                idx: this.selectedMapIdx,
                hazards: map.buildHazards ? map.buildHazards() : [],
                events: map.buildEvents ? map.buildEvents() : [],
            };
        }
        for (const hazard of this.previewCache.hazards) hazard.drawPreview(ctx, px, py, scale);
        for (const ev of this.previewCache.events) ev.drawPreview(ctx, px, py, scale);

        if (isImageReady(map.wallImage)) ctx.drawImage(map.wallImage, px, py, pw, ph);
        else for (const wall of map.buildWalls()) {
            ctx.fillStyle = wall.color;
            ctx.fillRect(px + wall.rect.x * scale, py + wall.rect.y * scale, wall.rect.w * scale, wall.rect.h * scale);
        }
        for (const pickup of map.buildPickups()) {
            ctx.beginPath();
            ctx.arc(px + pickup.x * scale, py + pickup.y * scale, Math.max(3, pickup.radius * scale), 0, Math.PI * 2);
            ctx.fillStyle = pickup.color;
            ctx.fill();
        }

        ctx.strokeStyle = COLOR_GOLD;
        ctx.lineWidth = 3;
        ctx.strokeRect(px + 1.5, py + 1.5, pw - 3, ph - 3);

        drawText(ctx, '방향키: 맵 변경    SPACE / ENTER: 전투 시작', WIDTH / 2, py - 40, 24, COLOR_WHITE, { bold: true, align: 'center' });
        drawText(ctx, map.name, WIDTH / 2, py + ph + 14, 24, COLOR_GOLD, { bold: true, align: 'center' });
        drawText(ctx, `${this.selectedMapIdx + 1} / ${MAPS.length}`, WIDTH / 2, py + ph + 46, 16, COLOR_GRAY, { align: 'center' });
    }

    renderBattle(ctx) {
        const map = this.battleMap || {};
        if (isImageReady(map.floorImage)) ctx.drawImage(map.floorImage, 0, 0, WIDTH, HEIGHT);
        else clearScreen(ctx, this.battleBgColor);

        for (const hazard of this.hazards) hazard.draw(ctx);
        for (const ev of this.mapEvents) ev.draw(ctx);
        Vfx.drawGround(ctx);
        if (isImageReady(map.wallImage)) {
            // 벽 그림에서 벽(+그림자) 부분만 잘라 그림 (화면 전체를 그리는 것보다 가벼움)
            for (const wall of this.walls) {
                const r = wall.rect, x = Math.max(0, r.x - 2), y = Math.max(0, r.y - 2);
                const w = Math.min(WIDTH - x, r.w + 16), h = Math.min(HEIGHT - y, r.h + 18);
                ctx.drawImage(map.wallImage, x, y, w, h, x, y, w, h);
            }
        } else for (const wall of this.walls) wall.draw(ctx);
        for (const pickup of this.pickups) pickup.draw(ctx);
        this.player1.draw(ctx);
        this.player2.draw(ctx);
        for (const attack of this.attacks) attack.draw(ctx);
        Vfx.draw(ctx);

        const p1 = this.player1;
        const p2 = this.player2;
        drawText(ctx, `P1 HP: ${Math.trunc(Math.max(0, p1.hp))}/${Math.trunc(p1.maxHp)}`, 20, 15, 16, p1.color);
        p1.getStatusText().forEach((t, i) => drawText(ctx, t, 155, 15 + i * 20, 16, '#ffff64'));
        drawSkillIcons(ctx, p1, 20, 42);
        const hint1 = controlHintText(1);
        if (hint1) drawText(ctx, hint1, 20, 80, 13, '#c8c8d0', { bold: true });

        drawText(ctx, `P2 HP: ${Math.trunc(Math.max(0, p2.hp))}/${Math.trunc(p2.maxHp)}`, WIDTH - 160, 15, 16, p2.color);
        p2.getStatusText().forEach((t, i) => drawText(ctx, t, WIDTH - 270, 15 + i * 20, 16, '#ffff64'));
        drawSkillIcons(ctx, p2, WIDTH - 160, 42);
        const hint2 = controlHintText(2);
        if (hint2) drawText(ctx, hint2, WIDTH - 20, 80, 13, '#c8c8d0', { bold: true, align: 'right' });

        // 경고 배너처럼 모든 것 위에 그릴 것
        for (const ev of this.mapEvents) if (ev.drawOverlay) ev.drawOverlay(ctx);
    }

    renderGameOver(ctx) {
        clearScreen(ctx, COLOR_BG);
        drawText(ctx, this.winnerText, WIDTH / 2, 260, 40, COLOR_WHITE, { bold: true, align: 'center' });
        drawText(ctx, 'Press SPACE / ENTER to Restart', WIDTH / 2, 340, 24, COLOR_GRAY, { bold: true, align: 'center' });
    }
}

const VERSUS_SLIDE_MS = 700; // 화면 밖에서 미끄러져 들어오는 시간
const VERSUS_HOLD_MS = 900;  // 마주선 채로 기다리는 시간

function clearScreen(ctx, color) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawPortrait(ctx, cx, cy, size, color, image) {
    const x = cx - size / 2;
    const y = cy - size / 2;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, 12);
    ctx.fill();
    if (isImageReady(image)) ctx.drawImage(image, x, y, size, size);
    ctx.strokeStyle = COLOR_WHITE;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(x + 2, y + 2, size - 4, size - 4, 12);
    ctx.stroke();
}

// ------------------------------------------
// 스킬 아이콘 (스킬 1, 스킬 2, 궁극기). 평타는 표시하지 않는다.
// ------------------------------------------
function drawSkillIcons(ctx, player, x, y) {
    for (let idx = 1; idx < player.abilities.length; idx++) {
        const skill = player.abilities[idx];
        if (!skill) continue;
        const ix = x + (idx - 1) * 40;
        if (idx === 3) drawUltIcon(ctx, ix, y, 32, player.ultGauge / player.maxUltGauge * 100); // 자기 통 대비 %
        else drawSkillIconWithClock(ctx, ix, y, 32, skill, `S${idx}`, player.color);
    }
}

// 쿨타임을 시계 바늘로 보여주는 아이콘.
// 버프 지속 중이면 초록색 + 남은 시간, 충전형 스킬이면 남은 개수를 보여준다.
function drawSkillIconWithClock(ctx, x, y, size, skill, label, color) {
    ctx.fillStyle = '#1e1e23';
    ctx.fillRect(x, y, size, size);
    ctx.strokeStyle = COLOR_GRAY;
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);

    const cx = x + size / 2;
    const cy = y + size / 2;
    const radius = size / 2 - 4;
    const border = (c) => {
        ctx.strokeStyle = c;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
    };
    const hand = (angleRad, handColor) => {
        ctx.strokeStyle = handColor;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(cx + radius * Math.cos(angleRad), cy + radius * Math.sin(angleRad));
        ctx.stroke();
        ctx.fillStyle = COLOR_WHITE;
        ctx.beginPath();
        ctx.arc(cx, cy, 2, 0, Math.PI * 2);
        ctx.fill();
    };

    if (skill.buffEndTime !== undefined && Time.now < skill.buffEndTime) {
        const left = skill.buffEndTime - Time.now;
        ctx.fillStyle = 'rgba(50, 220, 100, 0.4)';
        ctx.fillRect(x, y, size, size);
        border(COLOR_GREEN);
        drawText(ctx, `${Math.max(0.1, left / 1000).toFixed(1)}s`, cx, cy - 4, 11, COLOR_WHITE, { bold: true, align: 'center' });
    } else if (skill.cooldownType === 'charges') {
        if (skill.currentCharges < skill.maxCharges) {
            const progress = Math.min(1.0, (Time.now - skill.lastChargeTime) / skill.chargeCooldown);
            ctx.fillStyle = `rgba(0, 0, 0, ${(150 / 255) * (1 - progress)})`;
            ctx.fillRect(x, y, size, size);
            border(COLOR_GRAY);
        } else {
            border(color);
        }
        drawText(ctx, String(skill.currentCharges), cx, cy, 24, skill.currentCharges === skill.maxCharges ? COLOR_GOLD : COLOR_WHITE,
                 { bold: true, align: 'center', baseline: 'middle' });
    } else if (skill.cooldown !== undefined && skill.lastUsed !== undefined) {
        const progress = skill.cooldown > 0 ? Math.min(1.0, (Time.now - skill.lastUsed) / skill.cooldown) : 1.0;
        if (progress < 1.0) {
            hand((-90 + progress * 360) * Math.PI / 180, '#ffc832');
            ctx.fillStyle = 'rgba(0, 0, 0, 0.47)';
            ctx.fillRect(x, y, size, size);
        } else {
            hand(-Math.PI / 2, color);
            border(color);
        }
    }

    drawText(ctx, label, x + 3, y + 2, 11, '#dcdcdc', { bold: true });
}

// 궁극기 게이지가 아래에서 위로 차오르는 아이콘
function drawUltIcon(ctx, x, y, size, gaugePercent) {
    ctx.fillStyle = '#1e1e23';
    ctx.fillRect(x, y, size, size);

    const pct = Math.min(100.0, Math.max(0.0, gaugePercent));
    const fillH = Math.trunc((size - 2) * (pct / 100.0));
    if (fillH > 0) {
        ctx.fillStyle = pct < 100 ? '#7850c8' : COLOR_GOLD;
        ctx.fillRect(x + 1, y + size - 1 - fillH, size - 2, fillH);
    }

    if (pct >= 100.0) {
        ctx.strokeStyle = COLOR_GOLD;
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, size - 2, size - 2);
    } else {
        ctx.strokeStyle = COLOR_GRAY;
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, size - 1, size - 1);
    }

    drawText(ctx, 'Ult', x + 3, y + 2, 11, COLOR_WHITE, { bold: true });
    drawText(ctx, `${Math.trunc(pct)}%`, x + size / 2, y + size / 2 - 4, 11, pct < 100 ? COLOR_WHITE : '#000000', { bold: true, align: 'center' });
}

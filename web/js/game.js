// 게임 진행 (main.py를 옮김)
// 화면 흐름: TITLE → LOADOUT(캐릭터 고르기·연습) → VERSUS(대결 연출) → MAP_SELECT → BATTLE → GAMEOVER
//
// step()은 게임을 1틱 진행시키고, render()는 현재 상태를 그리기만 한다.
// 둘을 나눠두면 나중에 온라인 대전에서 step()만 서버로 옮기기 쉽다.

const LOADOUT_DIVIDER_X = 637;

function buildPedestals(zoneXOffset) {
    // 캐릭터 팻말: 밟으면 그 캐릭터로 즉시 교체된다
    const cols = 5;
    const size = 46;
    return CHARACTER_REGISTRY.map((_, i) => ({
        index: i,
        rect: new Rect(zoneXOffset + 40 + (i % cols) * 115, 500 + Math.floor(i / cols) * 60, size, size),
    }));
}

function createLoadoutOrbs() {
    const orbs = [new Pickup(320, 300, 'ult'), new Pickup(960, 300, 'ult')];
    for (const orb of orbs) orb.respawnTime = 1200; // 궁극기를 바로바로 다시 시험해볼 수 있게
    return orbs;
}

class Game {
    constructor() {
        this.state = 'TITLE';

        this.loadoutWalls = [
            new Wall(LOADOUT_DIVIDER_X, 0, 6, HEIGHT), // 중앙 분리벽 (P1/P2 구역)
            new Wall(150, 430, 140, 40),               // P1 연습용 벽
            new Wall(990, 430, 140, 40),               // P2 연습용 벽
        ];
        this.pedestalsP1 = buildPedestals(0);
        this.pedestalsP2 = buildPedestals(LOADOUT_DIVIDER_X + 6);

        this.p1CharIdx = 0;
        this.p2CharIdx = 1;
        this.selectedMapIdx = 0;

        this.walls = this.loadoutWalls;
        this.pickups = [];
        this.battleBgColor = COLOR_BG;
        this.attacks = [];
        this.winnerText = '';
        this.versusStartTime = 0;

        this.enterLoadout();
    }

    enterLoadout() {
        this.walls = this.loadoutWalls;
        this.dummy1 = createPracticeDummy(320, 220);
        this.dummy2 = createPracticeDummy(960, 220);
        this.loadoutOrbs = createLoadoutOrbs();
        this.player1 = spawnCharacterPlayer(150, 380, COLOR_RED, this.p1CharIdx, 1);
        this.player2 = spawnCharacterPlayer(1130, 380, COLOR_BLUE, this.p2CharIdx, 2);
        // 로드아웃에서는 "상대"가 자기 쪽 허수아비
        this.player1.opponent = this.dummy1;
        this.player2.opponent = this.dummy2;
        this.p1Ready = false;
        this.p2Ready = false;
        this.attacks = [];
    }

    startBattle() {
        const map = MAPS[this.selectedMapIdx];
        this.walls = map.buildWalls();
        this.pickups = map.buildPickups();
        this.battleBgColor = map.bgColor || COLOR_BG;
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
            if (code === 'Space') this.p1Ready = !this.p1Ready; // 1P 확정 (다시 누르면 취소)
            if (code === 'Enter' || code === 'NumpadEnter') this.p2Ready = !this.p2Ready; // 2P 확정
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
            attack.update(walls);

            const target = getTarget(attack);
            if (target && !attack.hitPlayers.includes(target) && attack.collidesWith(target)) {
                // 방어력 계산은 takeDamage 안에서 하고, 실제 들어간 피해만큼 궁극기 충전
                const finalDamage = target.takeDamage(attack.damage);
                attack.hitPlayers.push(target);
                attack.owner.addUltGauge(finalDamage * attack.owner.ultChargeMultiplier);
                if (attack.applyEffect) attack.applyEffect(target);
            }

            if (attack.isExpired()) {
                this.attacks.splice(this.attacks.indexOf(attack), 1);
            }
        }
        handleAttackWallCollisions(this.attacks, walls);
    }

    stepLoadout(dtSec, p1Input, p2Input) {
        const walls = this.loadoutWalls;
        if (!this.p1Ready) this.player1.update(dtSec, p1Input, this.attacks, walls);
        if (!this.p2Ready) this.player2.update(dtSec, p2Input, this.attacks, walls);
        this.dummy1.update(dtSec, EMPTY_INPUT, this.attacks, walls);
        this.dummy2.update(dtSec, EMPTY_INPUT, this.attacks, walls);

        this.updateAttacks(walls, (attack) => {
            if (attack.owner === this.player1) return this.dummy1;
            if (attack.owner === this.player2) return this.dummy2;
            return null;
        });

        for (const orb of this.loadoutOrbs) {
            orb.update();
            if (orb.collidesWithPlayer(this.player1)) orb.collect(this.player1);
            else if (orb.collidesWithPlayer(this.player2)) orb.collect(this.player2);
        }

        // 팻말을 밟으면 그 캐릭터로 즉시 교체 (확정 전까지만)
        if (!this.p1Ready) this.player1 = this.swapOnPedestal(this.player1, this.pedestalsP1, 1);
        if (!this.p2Ready) this.player2 = this.swapOnPedestal(this.player2, this.pedestalsP2, 2);

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

    swapOnPedestal(player, pedestals, playerNum) {
        const currentIdx = playerNum === 1 ? this.p1CharIdx : this.p2CharIdx;
        for (const pedestal of pedestals) {
            if (pedestal.index !== currentIdx && player.rect.colliderect(pedestal.rect)) {
                if (playerNum === 1) this.p1CharIdx = pedestal.index;
                else this.p2CharIdx = pedestal.index;

                const cx = player.rect.centerx;
                const cy = player.rect.centery;
                const swapped = spawnCharacterPlayer(cx, cy, player.color, pedestal.index, playerNum);
                swapped.rect.setCenter(cx, cy);
                swapped.opponent = playerNum === 1 ? this.dummy1 : this.dummy2;
                return swapped;
            }
        }
        return player;
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
    }

    renderLoadout(ctx) {
        clearScreen(ctx, COLOR_BG);

        for (const wall of this.loadoutWalls) wall.draw(ctx);
        for (const orb of this.loadoutOrbs) orb.draw(ctx);

        this.renderPedestals(ctx, this.pedestalsP1, this.p1CharIdx);
        this.renderPedestals(ctx, this.pedestalsP2, this.p2CharIdx);

        this.dummy1.draw(ctx);
        this.dummy2.draw(ctx);
        this.player1.draw(ctx);
        this.player2.draw(ctx);
        for (const attack of this.attacks) attack.draw(ctx);

        if (this.p1Ready) {
            drawText(ctx, 'READY', this.player1.rect.centerx, this.player1.rect.top - 28, 24, COLOR_GOLD, { bold: true, align: 'center' });
        }
        if (this.p2Ready) {
            drawText(ctx, 'READY', this.player2.rect.centerx, this.player2.rect.top - 28, 24, COLOR_GOLD, { bold: true, align: 'center' });
        }

        drawText(ctx, '허수아비에게 시험해보고, 팻말을 밟아 능력을 교체하세요 (SPACE/ENTER: 확정, 다시 누르면 취소)',
                 WIDTH / 2, 15, 22, COLOR_WHITE, { bold: true, align: 'center' });

        const p1Name = getCharacterData(this.p1CharIdx).name;
        const p2Name = getCharacterData(this.p2CharIdx).name;
        drawText(ctx, `P1: ${p1Name}${this.p1Ready ? ' (확정!)' : ''}`, 20, 50, 16, COLOR_RED);
        drawText(ctx, `P2: ${p2Name}${this.p2Ready ? ' (확정!)' : ''}`, WIDTH - 250, 50, 16, COLOR_BLUE);

        drawSkillIcons(ctx, this.player1, 20, 75);
        drawSkillIcons(ctx, this.player2, WIDTH - 160, 75);

        // 캐릭터 설명: P1은 왼쪽, P2는 오른쪽에 한 줄씩
        const lines = (idx) => getCharacterData(idx).desc.split(',').map(s => s.trim()).filter(Boolean);
        lines(this.p1CharIdx).forEach((line, i) => drawText(ctx, line, 20, 120 + i * 20, 16, COLOR_GRAY));
        lines(this.p2CharIdx).forEach((line, i) => drawText(ctx, line, WIDTH - 20, 120 + i * 20, 16, COLOR_GRAY, { align: 'right' }));
    }

    renderPedestals(ctx, pedestals, charIdx) {
        for (const pedestal of pedestals) {
            const r = pedestal.rect;
            const isCurrent = pedestal.index === charIdx;
            const data = getCharacterData(pedestal.index);

            if (isCurrent) {
                // 선택된 팻말: 금색 글로우
                const g = r.inflate(10, 10);
                ctx.fillStyle = 'rgba(255, 215, 0, 0.5)';
                ctx.beginPath();
                ctx.roundRect(g.x, g.y, g.w, g.h, 10);
                ctx.fill();
            }
            ctx.fillStyle = isCurrent ? COLOR_GOLD : COLOR_CARD_BG;
            ctx.beginPath();
            ctx.roundRect(r.x, r.y, r.w, r.h, 6);
            ctx.fill();

            if (isImageReady(data.thumbnail)) {
                ctx.drawImage(data.thumbnail, r.centerx - 20, r.centery - 20, 40, 40);
                if (!isCurrent) {
                    ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                    ctx.fillRect(r.x, r.y, r.w, r.h);
                }
            }

            const border = isCurrent ? 3 : 2;
            ctx.strokeStyle = isCurrent ? COLOR_WHITE : COLOR_GRAY;
            ctx.lineWidth = border;
            ctx.beginPath();
            ctx.roundRect(r.x + border / 2, r.y + border / 2, r.w - border, r.h - border, 6);
            ctx.stroke();

            drawText(ctx, data.name, r.centerx, r.bottom + 3, 11, isCurrent ? COLOR_GOLD : COLOR_WHITE, { bold: true, align: 'center' });
        }
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

        for (const wall of map.buildWalls()) {
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

        drawText(ctx, '방향키(A/D): 맵 변경    SPACE / ENTER: 전투 시작', WIDTH / 2, py - 40, 24, COLOR_WHITE, { bold: true, align: 'center' });
        drawText(ctx, map.name, WIDTH / 2, py + ph + 14, 24, COLOR_GOLD, { bold: true, align: 'center' });
        drawText(ctx, `${this.selectedMapIdx + 1} / ${MAPS.length}`, WIDTH / 2, py + ph + 46, 16, COLOR_GRAY, { align: 'center' });
    }

    renderBattle(ctx) {
        clearScreen(ctx, this.battleBgColor);

        for (const wall of this.walls) wall.draw(ctx);
        for (const pickup of this.pickups) pickup.draw(ctx);
        this.player1.draw(ctx);
        this.player2.draw(ctx);
        for (const attack of this.attacks) attack.draw(ctx);

        const p1 = this.player1;
        const p2 = this.player2;
        drawText(ctx, `P1 HP: ${Math.trunc(Math.max(0, p1.hp))}/${Math.trunc(p1.maxHp)}`, 20, 15, 16, p1.color);
        p1.getStatusText().forEach((t, i) => drawText(ctx, t, 155, 15 + i * 20, 16, '#ffff64'));
        drawSkillIcons(ctx, p1, 20, 42);

        drawText(ctx, `P2 HP: ${Math.trunc(Math.max(0, p2.hp))}/${Math.trunc(p2.maxHp)}`, WIDTH - 160, 15, 16, p2.color);
        p2.getStatusText().forEach((t, i) => drawText(ctx, t, WIDTH - 270, 15 + i * 20, 16, '#ffff64'));
        drawSkillIcons(ctx, p2, WIDTH - 160, 42);
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
        if (idx === 3) drawUltIcon(ctx, ix, y, 32, player.ultGauge);
        else drawSkillIconWithClock(ctx, ix, y, 32, skill, `S${idx + 1}`, player.color);
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

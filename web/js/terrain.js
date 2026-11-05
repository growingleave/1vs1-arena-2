// 전투맵 지형 (terrain.py를 옮김): 용암 구덩이, 낙하 용암, 빙판, 눈보라
//
// 모든 지형은 다음 메서드를 갖는다.
// - update(dtSec)                       : 게임 틱마다
// - applyDamage(players, dtSec)         : 피해/상태이상 (없으면 비워둠)
// - draw(ctx)                           : 전투 화면 (벽·캐릭터보다 먼저 그림)
// - drawPreview(ctx, px, py, scale)     : 맵 선택 화면의 축소 미리보기
// - drawOverlay(ctx)                    : (선택) 경고 배너처럼 맨 위에 그릴 것
//
// 온라인 대전 주의: 게임 결과에 영향을 주는 무작위(용암 낙하 위치, 눈보라 시간)는 gameRandom()만 쓴다.
// 그리고 맵 선택 미리보기에서도 지형을 만들기 때문에, 만들 때(constructor)는 gameRandom()을 쓰지 않고
// 첫 update에서 정한다. (미리보기는 기기마다 그리는 횟수가 달라서, 거기서 난수를 쓰면 두 기기가 어긋난다)

// 화상을 매 틱 다시 걸어도 되도록 넉넉한 지속시간으로 갱신한다 (용암을 벗어나도 이만큼 화상이 남는다)
const LAVA_BURN_LINGER_DURATION = 3.0;

// 글자로 된 씨앗으로 항상 같은 값을 내는 난수 (그림에만 쓴다: 용암 기포 배치, 눈발)
function seededRng(text) {
    let h = 2166136261;
    for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
    let state = h >>> 0;
    return (min, max) => {
        state = (state + 0x6D2B79F5) >>> 0;
        let t = state;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return min + (((t ^ (t >>> 14)) >>> 0) / 4294967296) * (max - min);
    };
}

// 원 안에 고르게 퍼진, 커졌다 작아졌다 하는 노란 기포들 (씨앗이 같으면 항상 같은 배치)
function generateLavaBubbles(radius, seed) {
    const rng = seededRng(seed);
    const count = Math.max(6, Math.trunc(radius / 11));
    const sector = (Math.PI * 2) / count;
    const bubbles = [];
    for (let i = 0; i < count; i++) {
        // 각도를 구간별로 나눠 뭉침 없이 퍼지게, 거리는 sqrt로 뽑아 바깥까지 고르게
        const angle = sector * i + rng(-sector * 0.4, sector * 0.4);
        const dist = radius * 0.8 * Math.sqrt(rng(0.1, 1.0));
        bubbles.push({
            ox: Math.cos(angle) * dist,
            oy: Math.sin(angle) * dist,
            baseRadius: rng(radius * 0.06, radius * 0.13),
            phase: rng(0, Math.PI * 2),
            speed: rng(2.0, 3.6),
        });
    }
    return bubbles;
}

function drawLavaCircle(ctx, x, y, radius, animT, bubbles) {
    const cx = Math.trunc(x);
    const cy = Math.trunc(y);
    drawCircle(ctx, cx, cy, radius + 6, 'rgb(50, 18, 10)');            // 그을린 테두리
    drawCircle(ctx, cx, cy, radius, 'rgb(160, 50, 12)');               // 주황색 용암 (눈부시지 않게 어둡게)
    drawCircle(ctx, cx, cy, Math.trunc(radius * 0.88), 'rgb(180, 66, 18)');
    for (const b of bubbles) {
        const pulse = (Math.sin(animT * b.speed + b.phase) + 1) / 2;
        const r = Math.max(2, Math.trunc(b.baseRadius * (0.5 + 0.9 * pulse)));
        drawCircle(ctx, cx + Math.trunc(b.ox), cy + Math.trunc(b.oy), r, 'rgb(210, 118, 45)');
    }
}

// 맵이 주는 효과를 무시하는 상태(마법사 망령화 등)인지
function immuneToMap(player) {
    return player.immuneKeywords && player.immuneKeywords.has('map');
}

function applyLavaBurn(x, y, radius, tickDamage, players) {
    for (const p of players) {
        if (!p || p.hp <= 0 || p.invincible || immuneToMap(p)) continue;
        const hitRadius = radius + Math.max(p.rect.w, p.rect.h) / 3;
        if (Math.hypot(p.rect.centerx - x, p.rect.centery - y) <= hitRadius) {
            burn(p, LAVA_BURN_LINGER_DURATION, tickDamage, true);
        }
    }
}

// ==========================================
// 용암 구덩이 (고정): 닿으면 화상. 이동은 막지 않는다
// ==========================================
class LavaPit {
    constructor(x, y, radius, tickDamage = 4) {
        this.x = x;
        this.y = y;
        this.radius = radius;
        this.tickDamage = tickDamage;
        this.animT = 0;
        this.bubbles = generateLavaBubbles(radius, `lava_${Math.trunc(x)}_${Math.trunc(y)}_${Math.trunc(radius)}`);
    }

    update(dtSec) { this.animT += dtSec; }

    applyDamage(players) {
        applyLavaBurn(this.x, this.y, this.radius, this.tickDamage, players);
    }

    draw(ctx) {
        drawLavaCircle(ctx, this.x, this.y, this.radius, this.animT, this.bubbles);
    }

    drawPreview(ctx, px, py, scale) {
        drawCircle(ctx, px + this.x * scale, py + this.y * scale, Math.max(4, Math.trunc(this.radius * scale)), 'rgb(220, 90, 30)');
    }
}

// ==========================================
// 낙하 용암 (반복 이벤트): 대기 → 경고 원 → 용암 장판 → 대기 ...
// ==========================================
class LavaFallEvent {
    constructor(area, { radius = 70, tickDamage = 4, intervalRange = [2.0, 4.0], warningDuration = 1.3,
                        activeDuration = 6.0, avoidZones = [], dropsPerWave = 2, minDropSpacing = 160 } = {}) {
        this.area = area; // Rect: 떨어질 수 있는 범위
        this.radius = radius;
        this.tickDamage = tickDamage;
        this.intervalRange = intervalRange;
        this.warningDuration = warningDuration;
        this.activeDuration = activeDuration;
        this.avoidZones = avoidZones; // [[x, y, 최소 거리], ...]
        this.dropsPerWave = dropsPerWave;
        this.minDropSpacing = minDropSpacing;

        this.state = 'idle';
        this.timer = null; // 첫 update에서 정한다 (위 설명 참고)
        this.animT = 0;
        this.drops = []; // [{ x, y, bubbles }]
    }

    randomIn(min, max) {
        return min + gameRandom() * (max - min);
    }

    pickPositions() {
        const picked = [];
        const a = this.area;
        for (let i = 0; i < this.dropsPerWave; i++) {
            let x = a.centerx;
            let y = a.centery;
            for (let attempt = 0; attempt < 20; attempt++) {
                const cx = this.randomIn(a.left, a.right);
                const cy = this.randomIn(a.top, a.bottom);
                if (!this.avoidZones.every(([ax, ay, d]) => Math.hypot(cx - ax, cy - ay) >= d)) continue;
                if (!picked.every(([ox, oy]) => Math.hypot(cx - ox, cy - oy) >= this.minDropSpacing)) continue;
                x = cx;
                y = cy;
                break;
            }
            picked.push([x, y]);
        }
        return picked;
    }

    update(dtSec) {
        if (this.timer === null) this.timer = this.randomIn(...this.intervalRange);
        this.animT += dtSec;
        this.timer -= dtSec;
        if (this.timer > 0) return;

        if (this.state === 'idle') {
            this.drops = this.pickPositions().map(([x, y]) => ({ x, y, bubbles: [] }));
            this.state = 'warning';
            this.timer = this.warningDuration;
        } else if (this.state === 'warning') {
            this.state = 'active';
            this.timer = this.activeDuration;
            for (const d of this.drops) {
                d.bubbles = generateLavaBubbles(this.radius, `lavafall_${d.x.toFixed(1)}_${d.y.toFixed(1)}_${this.animT.toFixed(2)}`);
            }
        } else {
            this.state = 'idle';
            this.timer = this.randomIn(...this.intervalRange);
            this.drops = [];
        }
    }

    applyDamage(players) {
        if (this.state !== 'active') return;
        for (const d of this.drops) applyLavaBurn(d.x, d.y, this.radius, this.tickDamage, players);
    }

    draw(ctx) {
        if (this.state === 'warning') {
            // 떨어질 때가 가까울수록 더 진하고 빠르게 깜빡인다
            const progress = 1 - Math.max(0, this.timer) / this.warningDuration;
            const pulse = (Math.sin(this.animT * (8 + 6 * progress)) + 1) / 2;
            const alpha = (90 + 130 * progress) / 255;
            for (const d of this.drops) {
                drawCircle(ctx, d.x, d.y, this.radius, `rgba(255, 60, 20, ${alpha * 0.3})`);
                drawCircle(ctx, d.x, d.y, this.radius - 2, null, `rgba(255, ${70 + Math.trunc(80 * pulse)}, 30, ${alpha})`, 4);
            }
        } else if (this.state === 'active') {
            for (const d of this.drops) drawLavaCircle(ctx, d.x, d.y, this.radius, this.animT, d.bubbles);
        }
    }

    // 실제 위치는 매번 무작위라, 미리보기에서는 떨어질 수 있는 범위만 표시
    drawPreview(ctx, px, py, scale) {
        const a = this.area;
        ctx.strokeStyle = 'rgb(230, 110, 40)';
        ctx.lineWidth = 2;
        ctx.strokeRect(px + a.x * scale + 1, py + a.y * scale + 1, a.w * scale - 2, a.h * scale - 2);
    }
}

// ==========================================
// 빙판 (고정, 피해 없음): 위에 있으면 미끄러진다 (player.js가 iceFriction 값을 읽어 처리)
// ==========================================
class IcePatch {
    constructor(rect, friction = 0.08, baked = false) {
        this.rect = rect;
        this.baked = baked; // 바닥 그림에 이미 그려져 있으면 전투 중엔 안 그림 (미리보기는 그림)
        this.friction = friction; // 1.0에 가까울수록 안 미끄러움
    }

    update() {}

    applyDamage(players) {
        for (const p of players) {
            if (!p || immuneToMap(p)) continue;
            if (this.rect.colliderect(p.rect)) {
                p.onIce = true;
                p.iceFriction = Math.min(p.iceFriction, this.friction);
            }
        }
    }

    draw(ctx) {
        if (this.baked) return;
        const r = this.rect;
        ctx.fillStyle = `rgba(190, 225, 245, ${90 / 255})`;
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = `rgba(225, 245, 255, ${170 / 255})`;
        ctx.lineWidth = 2;
        ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    }

    drawPreview(ctx, px, py, scale) {
        const r = this.rect;
        ctx.fillStyle = 'rgb(190, 225, 245)';
        ctx.fillRect(px + r.x * scale, py + r.y * scale, r.w * scale, r.h * scale);
    }
}

// ==========================================
// 눈보라 (반복 이벤트): 경고 문구 + 화톳불 켜짐 → 안전 범위 표시 → 눈보라(범위 밖이면 슬로우+피해) → 대기
// ==========================================
class BlizzardEvent {
    constructor(torchPositions, { safeRadius = 130, stormTickDamage = 6, stormSlowPower = 35,
                                  intervalRange = [18.0, 26.0], announceDuration = 2.5,
                                  prepareDuration = 4.0, stormDuration = 7.0 } = {}) {
        this.torches = torchPositions;
        this.safeRadius = safeRadius;
        this.stormTickDamage = stormTickDamage;
        this.stormSlowPower = stormSlowPower;
        this.intervalRange = intervalRange;
        this.announceDuration = announceDuration;
        this.prepareDuration = prepareDuration;
        this.stormDuration = stormDuration;

        this.state = 'idle';
        this.timer = null; // 첫 update에서 정한다
        this.animT = 0;
        this.tickTimers = new Map(); // 플레이어 → 다음 피해까지 쌓인 시간

        // 눈발 (그림 전용, 항상 같은 배치)
        const rng = seededRng('blizzard_snow');
        this.flakes = [];
        for (let i = 0; i < 24; i++) {
            this.flakes.push({ x: rng(0, WIDTH), y: rng(0, HEIGHT), vx: rng(-70, -30), vy: rng(160, 240), len: rng(6, 12) });
        }
    }

    update(dtSec) {
        if (this.timer === null) this.timer = this.intervalRange[0] + gameRandom() * (this.intervalRange[1] - this.intervalRange[0]);
        this.animT += dtSec;

        if (this.state === 'storm') {
            for (const f of this.flakes) {
                f.x += f.vx * dtSec;
                f.y += f.vy * dtSec;
                if (f.y > HEIGHT) f.y -= HEIGHT;
                if (f.x < 0) f.x += WIDTH;
            }
        }

        this.timer -= dtSec;
        if (this.timer > 0) return;

        if (this.state === 'idle') {
            this.state = 'announce';
            this.timer = this.announceDuration;
        } else if (this.state === 'announce') {
            this.state = 'prepare';
            this.timer = this.prepareDuration;
        } else if (this.state === 'prepare') {
            this.state = 'storm';
            this.timer = this.stormDuration;
        } else {
            this.state = 'idle';
            this.timer = this.intervalRange[0] + gameRandom() * (this.intervalRange[1] - this.intervalRange[0]);
        }
    }

    inSafeZone(p) {
        return this.torches.some(([tx, ty]) => Math.hypot(p.rect.centerx - tx, p.rect.centery - ty) <= this.safeRadius);
    }

    // 지속 피해가 아니라, 눈보라 동안 안전 범위 밖에 있는 그 순간에만 슬로우 + 0.4초마다 피해
    applyDamage(players, dtSec) {
        if (this.state !== 'storm') return;
        for (const p of players) {
            if (!p || p.hp <= 0 || p.invincible || immuneToMap(p)) continue;
            if (this.inSafeZone(p)) {
                this.tickTimers.set(p, 0); // 다시 나가면 바로 한 번 맞도록
                continue;
            }
            slow(p, 0.25, this.stormSlowPower); // 짧게 계속 갱신 → 안전지대에 들어가면 곧 풀림
            let timer = (this.tickTimers.get(p) || 0) + dtSec;
            if (timer >= 0.4) {
                p.takeDamage(this.stormTickDamage);
                timer -= 0.4;
            }
            this.tickTimers.set(p, timer);
        }
    }

    draw(ctx) {
        const lit = this.state !== 'idle';
        for (const [tx, ty] of this.torches) {
            if (this.state === 'prepare' || this.state === 'storm') {
                drawCircle(ctx, tx, ty, this.safeRadius, `rgba(255, 170, 60, ${55 / 255})`);
                drawCircle(ctx, tx, ty, this.safeRadius - 1.5, null, `rgba(255, 190, 90, ${130 / 255})`, 3);
            }
            // 화톳불: 꺼져 있으면 돌무더기, 켜지면 흔들리는 불꽃
            ctx.fillStyle = 'rgb(70, 60, 55)';
            ctx.fillRect(tx - 10, ty - 10, 20, 20);
            ctx.strokeStyle = 'rgb(40, 35, 32)';
            ctx.lineWidth = 2;
            ctx.strokeRect(tx - 9, ty - 9, 18, 18);
            if (lit) {
                const flameH = 20 + ((Math.sin(this.animT * 9) + 1) / 2) * 8;
                fillPolygon(ctx, [[tx - 8, ty - 6], [tx + 8, ty - 6], [tx, ty - 6 - flameH]], 'rgb(255, 140, 30)');
                fillPolygon(ctx, [[tx - 4, ty - 8], [tx + 4, ty - 8], [tx, ty - 8 - flameH * 0.55]], 'rgb(255, 220, 90)');
            }
        }

        if (this.state === 'storm') {
            ctx.fillStyle = `rgba(215, 230, 245, ${35 / 255})`;
            ctx.fillRect(0, 0, WIDTH, HEIGHT);
            ctx.strokeStyle = 'rgb(245, 250, 255)';
            ctx.lineWidth = 2;
            ctx.beginPath();
            for (const f of this.flakes) {
                ctx.moveTo(f.x, f.y);
                ctx.lineTo(f.x + 5, f.y - f.len);
            }
            ctx.stroke();
        }
    }

    drawOverlay(ctx) {
        if (this.state !== 'announce') return;
        const pulse = (Math.sin(this.animT * 6) + 1) / 2;
        const text = '눈보라가 곧 다가옵니다!';
        const w = textWidth(ctx, text, 34, true);
        ctx.fillStyle = `rgba(10, 15, 25, ${150 / 255})`;
        ctx.fillRect(WIDTH / 2 - w / 2 - 14, 110 - 17 - 8, w + 28, 34 + 16);
        drawText(ctx, text, WIDTH / 2, 110, 34, 'rgb(170, 225, 255)',
                 { bold: true, align: 'center', baseline: 'middle', alpha: (180 + 75 * pulse) / 255 });
    }

    drawPreview(ctx, px, py, scale) {
        for (const [tx, ty] of this.torches) {
            drawCircle(ctx, px + tx * scale, py + ty * scale, Math.max(3, Math.trunc(this.safeRadius * scale * 0.4)), 'rgb(255, 170, 60)');
        }
    }
}

// ==========================================
// 보급 상자: 일정 시간마다 하늘에서 낙하산 상자가 떨어진다. 먼저 닿은 사람이 무작위 보급을 받는다
//   보통: 체력 회복 40% / 궁극기 40% / 공격력 증가 20% (확률)
//   궁극기가 꽉 찼으면: 체력 60% / 공격력 40%,  체력이 꽉 찼으면: 궁극기 60% / 공격력 40%,  둘 다 꽉 찼으면 공격력
// 위치·종류는 gameRandom()으로만 정한다 (온라인 동기화). 만들 때는 난수를 쓰지 않는다 (미리보기)
// ==========================================
const SUPPLY_CRATE_IMAGE = loadImage('assets/supply_crate.png'); // 96x96 나무 상자
const SUPPLY_CHUTE_IMAGE = loadImage('assets/supply_chute.png'); // 120x84 낙하산, 줄이 모이는 곳 = 아래 가운데
const SUPPLY = {
    firstDelay: 8,      // 전투 시작 후 첫 상자까지(초)
    interval: 15,       // 상자를 먹은 뒤 다음 상자까지(초)
    fallTime: 1.6,      // 떨어지는 시간(초). 이 동안 바닥에 그림자로 위치를 알려줌
    size: 40,           // 상자 크기 (판정 = 이 네모)
    heal: 40,           // 체력 회복량
    ultRatio: 0.3,      // 궁극기 게이지 통의 30%
    atkPower: 20,       // 공격력 +20%
    atkDuration: 8,     // 공격력 증가 시간(초)
};

class SupplyDropEvent {
    constructor(area = new Rect(90, 90, 1280 - 180, 720 - 180), { avoidZones = [] } = {}) {
        this.area = area;
        this.avoidZones = avoidZones; // [[x, y, 최소 거리], ...] 이 근처엔 안 떨어짐
        this.state = 'idle';
        this.timer = null; // 첫 update에서 정함
        this.animT = 0;
        this.x = 0; this.y = 0;
        this.popups = []; // 화면용: 받은 보급 글자 { x, y, text, color, t }
    }

    pickPosition() {
        const a = this.area, half = SUPPLY.size / 2;
        for (let attempt = 0; attempt < 30; attempt++) {
            const x = a.left + gameRandom() * a.w, y = a.top + gameRandom() * a.h;
            const r = new Rect(Math.round(x - half - 16), Math.round(y - half - 16), SUPPLY.size + 32, SUPPLY.size + 32);
            if (CURRENT_WALLS.some((w) => w.rect.colliderect(r))) continue;
            if (!this.avoidZones.every(([ax, ay, d]) => Math.hypot(x - ax, y - ay) >= d)) continue;
            return [Math.round(x), Math.round(y)];
        }
        return [640, 180];
    }

    update(dtSec) {
        if (this.timer === null) this.timer = SUPPLY.firstDelay;
        this.animT += dtSec;
        this.popups = this.popups.filter((p) => this.animT - p.t < 1.4);
        if (this.state === 'landed') return;
        this.timer -= dtSec;
        if (this.timer > 0) return;
        if (this.state === 'idle') {
            [this.x, this.y] = this.pickPosition();
            this.state = 'falling';
            this.timer = SUPPLY.fallTime;
        } else if (this.state === 'falling') {
            this.state = 'landed';
            if (typeof Vfx !== 'undefined' && Vfx.spawn && typeof HitSparkVFX !== 'undefined') {
                Vfx.spawn(new HitSparkVFX(this.x, this.y + SUPPLY.size / 2, { color: '#d79a52', angle: -Math.PI / 2, count: 10, size: 18 }));
            }
        }
    }

    crateRect() {
        const h = SUPPLY.size / 2;
        return new Rect(this.x - h, this.y - h, SUPPLY.size, SUPPLY.size);
    }

    // 먼저 닿은 사람이 받는다 (같은 틱이면 P1 먼저)
    applyDamage(players) {
        if (this.state !== 'landed') return;
        const r = this.crateRect();
        for (const p of players) {
            if (!p || p.hp <= 0 || !p.rect.colliderect(r)) continue;
            this.give(p);
            this.state = 'idle';
            this.timer = SUPPLY.interval;
            return;
        }
    }

    give(p) {
        const ultFull = p.ultGauge >= p.maxUltGauge, hpFull = p.hp >= p.maxHp;
        let table;
        if (ultFull && hpFull) table = [['atk', 1]];
        else if (ultFull) table = [['heal', 0.6], ['atk', 0.4]];
        else if (hpFull) table = [['ult', 0.6], ['atk', 0.4]];
        else table = [['heal', 0.4], ['ult', 0.4], ['atk', 0.2]];
        let roll = gameRandom(), kind = table[table.length - 1][0];
        for (const [k, w] of table) { if (roll < w) { kind = k; break; } roll -= w; }

        let text, color;
        if (kind === 'heal') {
            p.hp = Math.min(p.maxHp, p.hp + SUPPLY.heal);
            text = `+${SUPPLY.heal} 체력`; color = '#50dc64';
        } else if (kind === 'ult') {
            p.addUltGauge(p.maxUltGauge * SUPPLY.ultRatio);
            text = `궁극기 +${Math.round(SUPPLY.ultRatio * 100)}%`; color = '#3c96e6';
        } else {
            p.statusEffects.power_up = { duration: SUPPLY.atkDuration, power: SUPPLY.atkPower };
            text = `공격력 +${SUPPLY.atkPower}% (${SUPPLY.atkDuration}초)`; color = '#ff7a3a';
        }
        this.popups.push({ x: p.rect.centerx, y: p.rect.top - 28, text, color, t: this.animT });
    }

    drawCrate(ctx, x, y) {
        const s = SUPPLY.size + 8;
        if (isImageReady(SUPPLY_CRATE_IMAGE)) ctx.drawImage(SUPPLY_CRATE_IMAGE, x - s / 2, y - s / 2, s, s);
        else { ctx.fillStyle = '#b07038'; ctx.fillRect(x - s / 2, y - s / 2, s, s); }
    }

    draw(ctx) {
        if (this.state === 'falling') {
            const k = Math.max(0, this.timer) / SUPPLY.fallTime; // 1 → 0 (땅에 가까워짐)
            // 바닥 그림자: 떨어질수록 진하고 작아짐
            ctx.fillStyle = `rgba(0, 0, 0, ${0.25 + 0.35 * (1 - k)})`;
            ctx.beginPath(); ctx.ellipse(this.x, this.y + SUPPLY.size / 2 - 2, 22 + 14 * k, 8 + 5 * k, 0, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = `rgba(255, 210, 90, ${0.5 + 0.4 * Math.sin(this.animT * 10)})`; ctx.lineWidth = 2;
            ctx.strokeRect(this.x - SUPPLY.size / 2, this.y - SUPPLY.size / 2, SUPPLY.size, SUPPLY.size);
            // 하늘에서 내려오는 상자 + 낙하산 (살짝 흔들림)
            const cy = this.y - 420 * k, sway = Math.sin(this.animT * 3) * 6 * k;
            ctx.save(); ctx.translate(this.x + sway, cy); ctx.rotate(sway * 0.02);
            if (isImageReady(SUPPLY_CHUTE_IMAGE)) ctx.drawImage(SUPPLY_CHUTE_IMAGE, -45, -SUPPLY.size / 2 - 60, 90, 63);
            this.drawCrate(ctx, 0, 0);
            ctx.restore();
        } else if (this.state === 'landed') {
            // 은은하게 빛나는 테두리
            const a = 0.35 + 0.25 * Math.sin(this.animT * 4);
            ctx.save(); ctx.globalCompositeOperation = 'lighter';
            const g = ctx.createRadialGradient(this.x, this.y, 8, this.x, this.y, 44);
            g.addColorStop(0, `rgba(255, 210, 90, ${a})`); g.addColorStop(1, 'rgba(255, 210, 90, 0)');
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(this.x, this.y, 44, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
            this.drawCrate(ctx, this.x, this.y + Math.sin(this.animT * 4) * 1.5);
        }
    }

    // 받은 보급 글자는 캐릭터 위에 보이게 맨 위에 그림
    drawOverlay(ctx) {
        for (const p of this.popups) {
            const t = (this.animT - p.t) / 1.4;
            drawText(ctx, p.text, p.x, p.y - 24 * t, 18, p.color, { bold: true, align: 'center', alpha: Math.max(0, 1 - t * t) });
        }
    }

    // 미리보기: 상자 아이콘만
    drawPreview(ctx, px, py, scale) {
        const s = 40 * scale * 2;
        if (isImageReady(SUPPLY_CRATE_IMAGE)) ctx.drawImage(SUPPLY_CRATE_IMAGE, px + 640 * scale - s / 2, py + 180 * scale - s / 2, s, s);
    }
}

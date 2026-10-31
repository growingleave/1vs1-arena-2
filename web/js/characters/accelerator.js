// 가속자 (abilities/accelerator.py를 옮김)

const ACCELERATOR_IMAGE = loadImage('assets/accelerator.png');

// 이펙트 그림 (tools/accelerator_gen.js로 생성)
const ACC_BULLET_IMAGE = loadImage('assets/acc_bullet.png');   // 80x20, 머리 x 72, 가운데 y 10 (하늘색, 'lighter')
const ACC_MUZZLE_IMAGE = loadImage('assets/acc_muzzle.png');   // 80x60, 총구 x 4, 가운데 y 30 (하늘색, 'lighter')
const ACC_SYRINGE_IMAGE = loadImage('assets/acc_syringe.png'); // 200x50, 유리통 속 x 52~148 y 18~32, 바늘 끝 x 195 (보통)
const ACC_PLUNGER_IMAGE = loadImage('assets/acc_plunger.png'); // 110x50, 고무 마개 앞면 x 108 (보통)
const ACC_HEAL_IMAGE = loadImage('assets/acc_heal.png');       // 150x150, 고리 반지름 = 크기의 0.36 (초록, 'lighter')
const ACC_CYAN = '#64dcff';
const ACC_CLOCK_IMAGE = loadImage('assets/acc_clock.png');             // 200x200 흰 빛, 가운데 = 그림 가운데 (색을 입혀 'lighter')
const ACC_CLOCK_BREAK_IMAGE = loadImage('assets/acc_clock_break.png'); // 160x160 흰 빛 (색을 입혀 'lighter')
const ACC_CLOCK_ICON_IMAGE = loadImage('assets/acc_clock_icon.png');   // 24x24, 시계판 가운데 (12, 13) (보통)
const ACC_RAINBOW = ['#64dcff', '#50ff9a', '#b478ff', '#ff70c8'];      // 궁극기 잔상 색 (차례대로 돌아감)

// 그림을 (x, y)에 기준점(ax, ay)을 맞춰 angle로 돌려 k배로 그린다
function accDraw(ctx, img, x, y, ax, ay, angle, k, alpha, lighter = true) {
    if (!isImageReady(img) || alpha <= 0) return;
    ctx.save();
    ctx.translate(x, y); ctx.rotate(angle);
    if (lighter) ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(img, -ax * k, -ay * k, img.naturalWidth * k, img.naturalHeight * k);
    ctx.restore();
}

// 총구 불꽃: 잠깐 번쩍이고 사라짐 + 앞쪽으로 작은 불꽃 몇 개
class AccMuzzleVFX extends SparkVFX {
    constructor(x, y, angle) {
        super(ACC_CYAN);
        this.x = x; this.y = y; this.angle = angle; this.duration = 0.09;
        for (let i = 0; i < 4; i++) this.addSpark(x, y, angle + vfxRand(-0.5, 0.5), vfxRand(150, 320), vfxRand(0.06, 0.14), vfxRand(0.8, 1.4));
    }

    get finished() { return this.elapsed >= this.duration && this.sparksDone; }

    draw(ctx) {
        const t = this.elapsed / this.duration;
        if (t < 1) accDraw(ctx, ACC_MUZZLE_IMAGE, this.x, this.y, 4, 30, this.angle, 0.5 * (0.8 + 0.4 * t), 1 - t * t);
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; this.drawSparks(ctx); ctx.restore();
    }
}

// 흰 그림(시계 등)에 색을 입혀 'lighter'로 그린다. size = 지름, flat = 세로 배율 (바닥에 눕히면 0.4쯤)
// 색 입힌 그림은 vfxTinted가 한 번 만들어 두고 계속 쓴다 (매 프레임 새로 만들지 않음)
function accDrawClock(ctx, img, color, x, y, size, flat, angle, alpha) {
    if (!isImageReady(img) || alpha <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(x, y); ctx.scale(1, flat); ctx.rotate(angle);
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(vfxTinted(img, color), -size / 2, -size / 2, size, size);
    ctx.globalAlpha = Math.min(1, alpha) * 0.35;
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
    ctx.restore();
}

// 잔상: 지나간 자리에 색 입힌 캐릭터 실루엣이 잠깐 남는다 (실루엣도 색별로 한 번만 만들어 둠)
function accDrawSilhouette(ctx, player, x, y, facingX, color, alpha) {
    if (!isImageReady(player.spriteImage) || alpha <= 0) return;
    const s = player.spriteSize;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.translate(x, y);
    if (facingX < 0) ctx.scale(-1, 1);
    ctx.drawImage(vfxTinted(player.spriteImage, color), -s / 2, -s / 2, s, s);
    ctx.restore();
}

function drawAfterimages(ctx, player, afterimages, life, maxAlpha) {
    for (const img of afterimages) {
        const a = maxAlpha * (1 - (Time.now - img.time) / life);
        accDrawSilhouette(ctx, player, img.x, img.y, img.fx, img.color, a);
    }
}

// 과열 정도(0~1)에 따른 색: 청록 → 주황 → 빨강 (8단계로 끊어서 색 입힌 그림이 9장까지만 생기게)
function accHeatColor(ratio) {
    const q = Math.round(Math.max(0, Math.min(1, ratio)) * 8) / 8;
    const lerp = (a, b, t) => a.map((v, i) => Math.round(v + (b[i] - v) * t));
    const c = q < 0.6 ? lerp([100, 220, 255], [255, 150, 60], q / 0.6) : lerp([255, 150, 60], [255, 60, 60], (q - 0.6) / 0.4);
    return `rgb(${c[0]},${c[1]},${c[2]})`;
}

// 시계 문양이 퍼지거나(켤 때) 줄어들며(끌 때) 사라짐
class AccClockBurstVFX {
    constructor(x, y, { color = ACC_CYAN, from = 60, to = 200, flat = 1, duration = 0.35, spin = 1.5 } = {}) {
        Object.assign(this, { x, y, color, from, to, flat, duration, spin });
        this.elapsed = 0;
    }
    get finished() { return this.elapsed >= this.duration; }
    update(dt) { this.elapsed += dt; }
    draw(ctx) {
        const t = Math.min(1, this.elapsed / this.duration), e = 1 - (1 - t) * (1 - t);
        accDrawClock(ctx, ACC_CLOCK_IMAGE, this.color, this.x, this.y, this.from + (this.to - this.from) * e, this.flat, this.spin * e, 1.2 * (1 - t));
    }
}

// 과열로 꺼질 때: 깨진 시계(그림) + 파편 불똥(코드)
class AccClockBreakVFX extends SparkVFX {
    constructor(owner) {
        super('#ff8040');
        this.owner = owner; this.duration = 0.55;
        const cx = owner.rect.centerx, cy = owner.rect.centery;
        for (let i = 0; i < 14; i++) this.addSpark(cx, cy, vfxRand(0, Math.PI * 2), vfxRand(120, 300), vfxRand(0.2, 0.45), vfxRand(1, 2.2));
    }
    get finished() { return this.elapsed >= this.duration && this.sparksDone; }
    draw(ctx) {
        const t = Math.min(1, this.elapsed / this.duration);
        accDrawClock(ctx, ACC_CLOCK_BREAK_IMAGE, '#ff7040', this.owner.rect.centerx, this.owner.rect.centery, 90 + 50 * t, 1, 0, 1.3 * (1 - t));
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; this.drawSparks(ctx); ctx.restore();
    }
}

// 궁극기가 끝날 때: 남아 있던 잔상들이 몸으로 빨려 들어오며 사라짐
class AccCollapseVFX {
    constructor(owner, afterimages) {
        this.owner = owner; this.duration = 0.25; this.elapsed = 0;
        this.items = afterimages.map((a) => ({ x: a.x, y: a.y, fx: a.fx, color: a.color }));
    }
    get finished() { return this.elapsed >= this.duration; }
    update(dt) { this.elapsed += dt; }
    draw(ctx) {
        const t = Math.min(1, this.elapsed / this.duration), e = t * t;
        const cx = this.owner.rect.centerx, cy = this.owner.rect.centery;
        for (const a of this.items) accDrawSilhouette(ctx, this.owner, a.x + (cx - a.x) * e, a.y + (cy - a.y) * e, a.fx, a.color, 0.6 * (1 - t));
    }
}

// ==========================================
// [평타] 탄환 2발 (오른쪽 → 왼쪽 순서로 발사)
// ==========================================
class AcceleratorBullet {
    constructor(owner, direction, side) {
        this.owner = owner;
        this.direction = direction;
        this.damage = owner.baseAtk * 0.5;
        this.speed = 10.0;
        this.createdTime = Time.now;
        this.lifespan = 600;
        this.hitPlayers = [];

        this.width = 15;
        this.height = 7;

        const perpX = -direction[1];
        const perpY = direction[0];
        const sideOffset = side === 'right' ? 12 : -12;
        this.posX = owner.rect.centerx + direction[0] * 20 + perpX * sideOffset;
        this.posY = owner.rect.centery + direction[1] * 20 + perpY * sideOffset;

        this.angle = directionToAngle(direction);
        this.startX = this.posX;
        this.startY = this.posY;
        this.maxRange = 300;
        Vfx.spawn(new AccMuzzleVFX(this.posX, this.posY, Math.atan2(direction[1], direction[0])));
    }

    getPolygonPoints() {
        return rotatedRectPoints(this.posX, this.posY, this.width, this.height, this.angle);
    }

    update() {
        this.posX += this.direction[0] * this.speed * this.owner.timeScale;
        this.posY += this.direction[1] * this.speed * this.owner.timeScale;
    }

    isExpired() {
        const timeOver = Time.now - this.createdTime >= this.lifespan;
        const outOfRange = Math.hypot(this.posX - this.startX, this.posY - this.startY) >= this.maxRange;
        return timeOver || outOfRange;
    }

    collidesWith(target) {
        return canBeHit(this, target) && checkPolygonCollision(this.getPolygonPoints(), target.rect);
    }

    // 맞으면 바로 사라지고 맞은 자리에서 불꽃
    applyEffect(target) {
        this.lifespan = 0;
        Vfx.spawn(new HitSparkVFX(target.rect.centerx, target.rect.centery,
            { color: ACC_CYAN, angle: Math.atan2(this.direction[1], this.direction[0]), count: 8, size: 18 }));
    }

    draw(ctx) {
        if (!isImageReady(ACC_BULLET_IMAGE)) { drawPolygon(ctx, this.getPolygonPoints(), 'rgb(100, 220, 255)', COLOR_WHITE, 1); return; }
        accDraw(ctx, ACC_BULLET_IMAGE, this.posX, this.posY, 72, 10, Math.atan2(this.direction[1], this.direction[0]), 0.5, 1);
    }
}

class AcceleratorBasicManager {
    constructor(owner, direction, attacks) {
        this.owner = owner;
        this.direction = direction;
        this.attacks = attacks;
        this.startTime = Time.now;
        this.leftSpawned = false;
        this.damage = 0;
        this.hitPlayers = [];
        attacks.push(new AcceleratorBullet(owner, direction, 'right'));
    }

    update() {
        if (!this.leftSpawned && Time.now - this.startTime >= 70) {
            this.attacks.push(new AcceleratorBullet(this.owner, this.direction, 'left'));
            this.leftSpawned = true;
        }
    }

    isExpired() { return this.leftSpawned && Time.now - this.startTime >= 100; }

    collidesWith() { return false; }

    draw() {}
}

class AcceleratorBasicSkill extends Skill {
    constructor() { super('Time Bullets', 250); }

    use(owner, direction, attacks) {
        this.lastUsed = Time.now;
        attacks.push(new AcceleratorBasicManager(owner, direction, attacks));
    }
}

// ==========================================
// [스킬 1] 맵 전체 시간 지연 필드 (켜기/끄기). 켜둘수록 과열 게이지가 찬다
// ==========================================
// 감속이 걸린 상대 머리 옆에 작은 시계 (판은 그림, 느리게 도는 바늘은 코드)
function drawSlowClockIcon(ctx, target) {
    if (!target || target.hidden || !isImageReady(ACC_CLOCK_ICON_IMAGE)) return;
    const x = target.rect.right + 4, y = target.rect.top - 2;
    ctx.drawImage(ACC_CLOCK_ICON_IMAGE, x - 12, y - 13);
    ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1.5; ctx.lineCap = 'round';
    const m = Time.now * 0.002, h = Time.now * 0.0003;
    ctx.beginPath();
    ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(m) * 6, y + Math.sin(m) * 6);
    ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(h) * 4, y + Math.sin(h) * 4);
    ctx.stroke();
}

class AcceleratorTimeField {
    constructor(owner, skill) {
        this.owner = owner;
        this.skill = skill;
        this.damage = 0;
        this.hitPlayers = [];
        this.forceExpire = false;
        this.afterimages = [];
        this.lastAfterimageTime = 0;
        this.slowTarget = null; // 감속이 걸린 상대 (머리 위 시계 아이콘용, 화면 전용)
    }

    update() {
        this.slowTarget = null;
        if (!this.skill.isActive || this.owner.isUltActive) {
            this.forceExpire = true;
            return;
        }

        speedUp(this.owner, 0.3, 20);

        if (Time.now - this.lastAfterimageTime >= 80) {
            this.afterimages.push({ x: this.owner.rect.centerx, y: this.owner.rect.centery, fx: this.owner.facing[0], time: Time.now, color: ACC_CYAN });
            this.lastAfterimageTime = Time.now;
        }
        this.afterimages = this.afterimages.filter(img => Time.now - img.time < 220);
    }

    isExpired() { return this.forceExpire; }

    // 상대에게 계속 감속을 건다. 피해 판정은 없으니 항상 false
    collidesWith(target) {
        if (target && !target.invincible && target.defense < 100.0) {
            timeSlow(target, 0.3, 40);
            slow(target, 0.3, 40);
            this.slowTarget = target;
        }
        return false;
    }

    // 몸 아래: 잔상 3개 + 발밑에서 도는 시계 (과열될수록 주황 → 빨강) + 70% 넘으면 김
    drawUnder(ctx) {
        drawAfterimages(ctx, this.owner, this.afterimages, 220, 0.5);
        const r = this.owner.rect;
        const heat = this.skill.charge / this.skill.maxCharge;
        accDrawClock(ctx, ACC_CLOCK_IMAGE, accHeatColor(heat), r.centerx, r.bottom - 2, 66, 0.38, Time.now * 0.0012, 0.75);
        if (heat > 0.7) {
            const k = (heat - 0.7) / 0.3;
            for (let i = 0; i < 3; i++) {
                const ph = (Time.now / 700 + i / 3) % 1;
                ctx.fillStyle = `rgba(235, 235, 240, ${0.35 * (1 - ph) * k})`;
                ctx.beginPath();
                ctx.arc(r.centerx + (i - 1) * 12 + Math.sin(ph * 6 + i) * 3, r.top + 2 - ph * 26, 3 + ph * 5, 0, Math.PI * 2);
                ctx.fill();
            }
        }
    }

    draw(ctx) {
        ctx.fillStyle = `rgba(100, 200, 255, ${12 / 255})`;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        drawSlowClockIcon(ctx, this.slowTarget);
    }
}

class AcceleratorTimeSkill extends Skill {
    constructor() {
        super('Global Time Dilation', 400);
        this.isActive = false;
        this.charge = 0.0;
        this.maxCharge = 100.0;
        this.owner = null;
    }

    // 켜져 있으면 과열 게이지가 차고, 꽉 차면 피해를 입고 1.5초 기절
    updateCharge(player, dtSec) {
        if (player.isUltActive) this.isActive = false;

        if (this.isActive) {
            this.charge += 35.0 * dtSec;
            if (this.charge >= this.maxCharge) {
                this.charge = 0.0;
                this.isActive = false;
                player.takeDamage(15.0);
                slow(player, 1.5, 100);
                silence(player, 1.5);
                Vfx.spawn(new AccClockBreakVFX(player));
            }
        } else {
            this.charge -= 40.0 * dtSec;
        }
        this.charge = Math.max(0.0, Math.min(this.maxCharge, this.charge));
    }

    canUse() {
        if (this.owner && this.owner.isUltActive) return false;
        return super.canUse();
    }

    use(owner, direction, attacks) {
        this.owner = owner;
        if (owner.isUltActive) return;
        this.lastUsed = Time.now;
        this.isActive = !this.isActive;
        const r = owner.rect;
        if (this.isActive) {
            owner.accTimeField = new AcceleratorTimeField(owner, this);
            attacks.push(owner.accTimeField);
            Vfx.spawn(new AccClockBurstVFX(r.centerx, r.bottom - 2, { from: 60, to: 230, flat: 0.38, duration: 0.35 }));
        } else {
            Vfx.spawn(new AccClockBurstVFX(r.centerx, r.bottom - 2, { from: 120, to: 30, flat: 0.38, duration: 0.25, spin: -1.5 }));
        }
    }
}

// ==========================================
// [스킬 2] 시간 안정화: 체력 회복 + 과열 감소 + 궁극기 종료
// ==========================================
// 치료 이펙트: 플레이어 뒤·위에서 대각선으로 주사기가 꽂히고(그림), 초록 약이 줄어들며 들어간 뒤(코드),
// 주사기가 빠지면서 초록 치료 빛(그림)과 올라가는 + 표시·반짝이(코드)
class AccHealVFX extends SparkVFX {
    constructor(owner) {
        super('#46ff82');
        this.owner = owner;
        this.duration = 0.95;
        const back = owner.facing[0] > 0 ? -1 : 1;              // 바라보는 쪽의 반대 (위·아래를 보면 왼쪽 뒤)
        const len = Math.hypot(back, -1.2);
        this.out = [back / len, -1.2 / len];                    // 몸에서 주사기 쪽(뒤·위)으로 향하는 방향
        this.angle = Math.atan2(-this.out[1], -this.out[0]);    // 바늘이 몸을 향하는 각도
        this.tip = [back * 10, -14];                            // 몸 가운데에서 바늘 끝까지 (어깨 뒤쪽)
        this.crosses = [];
        this.healed = false;
    }

    get finished() { return this.elapsed >= this.duration && this.sparksDone; }

    update(dt) {
        super.update(dt);
        const cx = this.owner.rect.centerx, cy = this.owner.rect.centery;
        if (!this.healed && this.elapsed >= 0.42) {
            this.healed = true;
            for (let i = 0; i < 14; i++) this.addSpark(cx + vfxRand(-14, 14), cy + vfxRand(-6, 10), -Math.PI / 2 + vfxRand(-0.8, 0.8), vfxRand(40, 120), vfxRand(0.3, 0.6), vfxRand(1, 2));
            for (let i = 0; i < 6; i++) this.crosses.push({ x: vfxRand(-22, 22), y: vfxRand(-6, 14), vy: vfxRand(30, 60), t: vfxRand(0, 0.15), size: vfxRand(5, 9) });
        }
        for (const c of this.crosses) { c.t += dt; c.y -= c.vy * dt; }
    }

    draw(ctx) {
        const t = this.elapsed;
        const cx = this.owner.rect.centerx, cy = this.owner.rect.centery;
        const k = 0.4;
        // 주사기: 0~0.15초 꽂힘 → 0.15~0.45초 약 들어감 → 0.45~0.62초 빠지며 사라짐
        if (t < 0.62 && isImageReady(ACC_SYRINGE_IMAGE) && isImageReady(ACC_PLUNGER_IMAGE)) {
            const slideIn = Math.min(1, t / 0.15), slideOut = Math.max(0, (t - 0.45) / 0.17);
            const away = 26 * (1 - slideIn * slideIn) + 22 * slideOut;
            const alpha = Math.min(1, t / 0.08) * (1 - slideOut);
            const liquid = 1 - Math.min(1, Math.max(0, (t - 0.15) / 0.3)); // 남은 약 (1 → 0)
            const tx = cx + this.tip[0] + this.out[0] * away, ty = cy + this.tip[1] + this.out[1] * away;
            ctx.save();
            ctx.translate(tx, ty); ctx.rotate(this.angle); ctx.scale(k, k); ctx.translate(-195, -25); // 바늘 끝이 원점
            ctx.globalAlpha = alpha;
            // 밀대: 약이 줄어드는 만큼 앞으로 밀려 들어간다 (마개 앞면 = 약의 뒤쪽 끝)
            const front = 52 + (1 - liquid) * 96;
            ctx.drawImage(ACC_PLUNGER_IMAGE, front - 108, 0);
            // 약 (코드): 마개 앞면부터 유리통 앞쪽 끝(148)까지, 초록 + 위쪽 빛
            if (liquid > 0) {
                const g = ctx.createLinearGradient(0, 18, 0, 32);
                g.addColorStop(0, 'rgba(150,255,180,0.95)'); g.addColorStop(0.5, 'rgba(70,255,130,0.9)'); g.addColorStop(1, 'rgba(30,170,80,0.9)');
                ctx.fillStyle = g; ctx.fillRect(front, 18, 148 - front, 14);
                ctx.fillStyle = 'rgba(255,255,255,0.6)'; ctx.beginPath(); ctx.arc(front + 8 + (t * 60) % Math.max(1, 140 - front), 23, 1.6, 0, Math.PI * 2); ctx.fill();
            }
            ctx.drawImage(ACC_SYRINGE_IMAGE, 0, 0);
            ctx.restore();
        }
        // 치료 빛 (그림): 0.42초부터 커지며 사라짐
        if (t >= 0.42) {
            const u = Math.min(1, (t - 0.42) / 0.5);
            const size = 110 * (0.6 + 0.6 * u);
            accDraw(ctx, ACC_HEAL_IMAGE, cx, cy, 75, 75, 0, size / 150, 1.3 * (1 - u));
        }
        // 올라가는 + 표시 (코드)
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        for (const c of this.crosses) {
            const a = Math.max(0, 1 - c.t / 0.5);
            if (a <= 0) continue;
            const x = cx + c.x, y = cy + c.y, sz = c.size;
            ctx.fillStyle = `rgba(110,255,150,${a})`;
            ctx.fillRect(x - sz / 2, y - sz / 6, sz, sz / 3); ctx.fillRect(x - sz / 6, y - sz / 2, sz / 3, sz);
        }
        this.drawSparks(ctx);
        ctx.restore();
    }
}

class AcceleratorHealSkill extends Skill {
    constructor() {
        super('Time Stabilization', 3000);
        this.owner = null;
    }

    use(owner, direction, attacks) {
        this.owner = owner;
        this.lastUsed = Time.now;

        if (owner.isUltActive && owner.activeUltField) owner.activeUltField.forceExpire = true;

        const timeSkill = owner.abilities[1];
        if (timeSkill && timeSkill.charge !== undefined) timeSkill.charge = Math.max(0.0, timeSkill.charge - 45.0);

        owner.hp = Math.min(owner.maxHp, owner.hp + 25.0);
        Vfx.spawn(new AccHealVFX(owner));
    }
}

// ==========================================
// [궁극기] 산데비스탄 오버드라이브: 공격력·속도 증가, 상대 감속. 시간이 지날수록 자기 체력이 깎인다
// ==========================================
class AcceleratorUltField {
    constructor(owner) {
        this.owner = owner;
        this.damage = 0;
        this.hitPlayers = [];
        this.forceExpire = false;

        this.lifespan = 16000;
        this.startTime = Time.now;
        this.lastDamageTick = this.startTime;
        this.damageInterval = 1500;
        this.delayBeforeDamage = 2500;

        this.afterimages = [];
        this.lastAfterimageTime = 0;
        this.afterimageCount = 0;
        this.flashTimer = 0;
        this.ended = false;
    }

    update() {
        this.slowTarget = null;
        if (this.forceExpire) return;
        const elapsed = Time.now - this.startTime;

        speedUp(this.owner, 0.3, 30);

        if (Time.now - this.lastAfterimageTime >= 50) {
            const color = ACC_RAINBOW[this.afterimageCount++ % ACC_RAINBOW.length];
            this.afterimages.push({ x: this.owner.rect.centerx, y: this.owner.rect.centery, fx: this.owner.facing[0], time: Time.now, color });
            this.lastAfterimageTime = Time.now;
        }
        this.afterimages = this.afterimages.filter(img => Time.now - img.time < 240);

        // 2.5초 뒤부터 점점 짧은 간격으로 자기 체력이 깎인다
        if (elapsed >= this.delayBeforeDamage && Time.now - this.lastDamageTick >= this.damageInterval) {
            this.owner.takeDamage(4.0);
            this.lastDamageTick = Time.now;
            Vfx.spawn(new HitSparkVFX(this.owner.rect.centerx, this.owner.rect.centery, { color: '#ff5050', angle: -Math.PI / 2, count: 8, size: 16 }));
            this.flashTimer = 180;
            this.damageInterval = Math.max(200, this.damageInterval - 150);
        }

        if (this.flashTimer > 0) this.flashTimer -= 16;
    }

    isExpired() {
        if (this.forceExpire || Time.now - this.startTime >= this.lifespan) {
            if (!this.ended) {
                this.ended = true;
                Vfx.spawn(new AccCollapseVFX(this.owner, this.afterimages));
            }
            this.owner.isUltActive = false;
            if (this.owner.originalBaseAtk !== undefined) this.owner.baseAtk = this.owner.originalBaseAtk;
            this.owner.activeUltField = null;
            return true;
        }
        return false;
    }

    collidesWith(target) {
        if (target && !target.invincible && target.defense < 100.0) {
            timeSlow(target, 0.3, 50);
            slow(target, 0.3, 50);
            this.slowTarget = target;
        }
        return false;
    }

    // 몸 아래: 무지개 실루엣 잔상 + 발밑에서 빠르게 도는 시계
    drawUnder(ctx) {
        drawAfterimages(ctx, this.owner, this.afterimages, 240, 0.6);
        const r = this.owner.rect;
        accDrawClock(ctx, ACC_CLOCK_IMAGE, ACC_RAINBOW[Math.floor(Time.now / 120) % ACC_RAINBOW.length], r.centerx, r.bottom - 2, 76, 0.38, Time.now * 0.004, 0.8);
    }

    draw(ctx) {
        ctx.fillStyle = `rgba(40, 100, 200, ${20 / 255})`;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);

        // 자기 피해를 받을 때: 화면 전체 대신 몸에만 빨간 지지직 줄
        if (this.flashTimer > 0 && !this.owner.hidden) {
            const r = this.owner.rect, k = this.flashTimer / 180, f = Math.floor(Time.now / 40);
            ctx.fillStyle = `rgba(255, 60, 60, ${0.7 * k})`;
            for (let i = 0; i < 3; i++) {
                const y = r.top + ((i * 17 + f * 7) % r.h);
                const dx = ((i * 13 + f * 5) % 12) - 6;
                ctx.fillRect(r.x - 8 + dx, y, r.w + 16, 3);
            }
        }
        drawSlowClockIcon(ctx, this.slowTarget);
    }
}

class AcceleratorUltSkill extends Skill {
    constructor() {
        super('Sandevistan Overdrive', 500, ['ult'], -99999);
        this.owner = null;
    }

    canUse() {
        if (this.owner && this.owner.isUltActive) return false;
        return super.canUse();
    }

    use(owner, direction, attacks) {
        this.owner = owner;
        if (owner.isUltActive) return;
        this.lastUsed = Time.now;

        const timeSkill = owner.abilities[1];
        if (timeSkill) timeSkill.isActive = false;

        owner.isUltActive = true;
        if (owner.originalBaseAtk === undefined) owner.originalBaseAtk = owner.baseAtk;
        owner.baseAtk = owner.originalBaseAtk * 1.3;

        const field = new AcceleratorUltField(owner);
        owner.activeUltField = field;
        attacks.push(field);
        const r = owner.rect;
        Vfx.spawn(new AccClockBurstVFX(r.centerx, r.centery, { from: 80, to: 420, duration: 0.45, spin: 2 }));
        Vfx.spawn(new AccClockBurstVFX(r.centerx, r.bottom - 2, { color: '#b478ff', from: 60, to: 260, flat: 0.38, duration: 0.4, spin: -2 }));
    }
}

// ==========================================
// 캐릭터 등록
// ==========================================
function applyAccelerator(player) {
    player.baseAtk = 12;
    player.maxHp = 100;
    player.hp = 100;
    player.speed = 4.7;
    player.isUltActive = false;
    player.spriteImage = ACCELERATOR_IMAGE;

    const timeSkill = new AcceleratorTimeSkill();
    timeSkill.owner = player;
    const healSkill = new AcceleratorHealSkill();
    healSkill.owner = player;
    const ultSkill = new AcceleratorUltSkill();
    ultSkill.owner = player;

    player.abilities = [new AcceleratorBasicSkill(), timeSkill, healSkill, ultSkill];

    // 잔상·발밑 시계는 몸보다 아래에 그린다 (궁극기 중이면 궁극기 것만)
    player.preDrawHooks.push((ctx) => {
        if (player.activeUltField) player.activeUltField.drawUnder(ctx);
        else if (player.accTimeField && !player.accTimeField.forceExpire && timeSkill.isActive) player.accTimeField.drawUnder(ctx);
    });

    // 과열 게이지는 기본 update 전에 계산
    player.preUpdateHooks.push((dtSec) => timeSkill.updateCharge(player, dtSec));

    // 과열 게이지 막대 (P1은 왼쪽, P2는 오른쪽)
    player.postDrawHooks.push((ctx) => {
        const pct = Math.max(0, Math.min(100, (timeSkill.charge / timeSkill.maxCharge) * 100));
        const w = 20;
        const h = 200;
        const y = 100;
        const x = player.playerNum === 1 ? 20 : WIDTH - 40;
        ctx.fillStyle = '#1e1e23';
        ctx.fillRect(x, y, w, h);
        ctx.strokeStyle = '#64646e';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
        const fillH = Math.trunc(h * (pct / 100));
        if (fillH > 0) {
            ctx.fillStyle = pct < 80 ? 'rgb(100, 220, 255)' : 'rgb(255, 80, 80)';
            ctx.fillRect(x + 1, y + h - 1 - fillH, w - 2, fillH);
        }
    });
}

const ACCELERATOR_CHARACTER_DATA = {
    id: 'ACCELERATOR',
    fxColor: '#64dcff',
    name: '가속자',
    desc: '평타: 투사체를 빠르게 쏩니다(6, 2발 연속), 스킬 1: 가속을 하며 상대보다 이동속도가 증가합니다(상대 슬로우/쿨타임 지연 40%), 스킬 2: 체력을 일정 채워주며 가속을 멈출 수 있습니다(25%), 궁극기: 폭주를 하며 대미지와 속도가 증가합니다(각 30%, 상대 슬로우/쿨타임 지연 50%), 스킬 2를 눌러 취소할 수 있습니다',
    apply: applyAccelerator,
    thumbnail: ACCELERATOR_IMAGE,
};

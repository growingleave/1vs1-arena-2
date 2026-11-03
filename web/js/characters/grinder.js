// 분쇄자 (abilities/grinder.py를 옮김)

// 그림 (tools/grinder_gen.js로 생성): 모두 흰 빛 그림 → 주황을 입혀 'lighter'로 (게임 이펙트 느낌)
const GRINDER_SAW_IMAGE = loadImage('assets/grinder_saw.png');            // 64x64 도는 톱날 빛, 바깥 반지름 30
const GRINDER_GRAB_OPEN_IMAGE = loadImage('assets/grinder_claw_open.png'); // 64x64 펼친 집게 빛 윤곽, 줄 거는 곳 (32,4), 발이 아래로
const GRINDER_GRAB_SHUT_IMAGE = loadImage('assets/grinder_claw_shut.png'); // 64x64 오므린 집게 (같은 좌표계)
const GRINDER_PRESS_IMAGE = loadImage('assets/grinder_press.png');        // 120x150 프레스 빛 윤곽, 찍는 면 가운데 (60,146)
const GRINDER_IMPACT_IMAGE = loadImage('assets/grinder_impact.png');      // 128x128 네모 충격파, 바깥 한 변 ≈ 112
const GRINDER_SCRAP_IMAGES = [0, 1, 2, 3].map((i) => loadImage(`assets/grinder_scrap_${i}.png`)); // 24x24 달궈진 너트·볼트·톱니 조각·쇳조각
const GRINDER_SPARK = '#e0904a';   // 불꽃: 녹슨 쇳가루 색
const GRINDER_GLOW = '#a8623a';    // 빛 그림 바탕: 녹슨 색
const GRINDER_CORE = '#b4b6bc';    // 빛 그림 가운데: 회색 쇠

// 빛 그림 공통: 녹슨 색을 입혀 'lighter'로 + 회색 쇠 빛을 겹쳐 가운데를 밝게. (ax, ay) = 그림에서 (x,y)에 올 점의 비율
function grinderGlow(ctx, img, x, y, w, h, { angle = 0, alpha = 1, ax = 0.5, ay = 0.5, core = 0.5 } = {}) {
    if (!isImageReady(img) || alpha <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(x, y); if (angle) ctx.rotate(angle);
    ctx.globalAlpha = Math.min(1, alpha); ctx.drawImage(vfxTinted(img, GRINDER_GLOW), -w * ax, -h * ay, w, h);
    ctx.globalAlpha = Math.min(1, alpha) * core; ctx.drawImage(vfxTinted(img, GRINDER_CORE), -w * ax, -h * ay, w, h);
    ctx.restore();
}

// 도는 톱날은 미리 돌려 둔 6장(톱니 16개라 22.5도마다 같은 모양 → 3.75도씩)을 크기에 맞춰 한 번 만들어 두고
// 그릴 때는 돌리지 않고 찍기만 한다 (저사양에서 매 프레임 회전·확대가 무거워서)
const _grinderDiscFrames = new Map();
function grinderDiscFrame(size, i) {
    if (!isImageReady(GRINDER_SAW_IMAGE)) return null;
    let frames = _grinderDiscFrames.get(size);
    if (!frames) {
        frames = [];
        for (let k = 0; k < 6; k++) {
            const c = document.createElement('canvas'); c.width = c.height = Math.ceil(size);
            const x = c.getContext('2d'); x.translate(c.width / 2, c.height / 2); x.rotate(k * (22.5 / 6) * Math.PI / 180);
            x.drawImage(vfxTinted(GRINDER_SAW_IMAGE, GRINDER_GLOW), -size / 2, -size / 2, size, size);
            x.globalCompositeOperation = 'lighter'; x.globalAlpha = 0.5; x.drawImage(vfxTinted(GRINDER_SAW_IMAGE, GRINDER_CORE), -size / 2, -size / 2, size, size);
            frames.push(c);
        }
        _grinderDiscFrames.set(size, frames);
    }
    return frames[((i % 6) + 6) % 6];
}

// 집게를 (x,y)에 그린다: 발이 angle(화면 각도) 방향을 보게
function drawGrinderClaw(ctx, img, x, y, angle, size = 46, ay = 0.35) {
    grinderGlow(ctx, img, x, y, size, size, { angle: angle - Math.PI / 2, ax: 0.5, ay });
}

// 집게 줄 (어두운 쇠줄 + 밝은 결)
function drawGrinderCable(ctx, x0, y0, x1, y1) {
    ctx.save(); ctx.lineCap = 'round';
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = 'rgba(168, 98, 58, 0.4)'; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.strokeStyle = 'rgba(190, 192, 198, 0.85)'; ctx.lineWidth = 1.5; ctx.setLineDash([6, 4]); ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    ctx.restore();
}

// 불꽃 튀김 묶음 (화면 전용): 공격이 살아 있는 동안 emit으로 채우고, 끝나면 남은 불꽃이 사라질 때까지 그린다
class GrinderSparksVFX extends SparkVFX {
    constructor() { super(GRINDER_SPARK); this.done = false; }
    get finished() { return this.done && this.sparksDone; }
    emit(x, y, angle, n, spread = 0.6, speed = [120, 320]) {
        for (let i = 0; i < n; i++) this.addSpark(x, y, angle + vfxRand(-spread, spread), vfxRand(speed[0], speed[1]), vfxRand(0.12, 0.3), vfxRand(0.9, 1.8));
    }
    // 가볍게: 불꽃 하나당 선 한 번만 (공용 drawSparks는 색 선 + 흰 심 두 번)
    draw(ctx) {
        const [r, g, b] = this.rgb;
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        for (const sp of this.sparks) {
            if (sp.life <= 0) continue;
            const a = sp.life / sp.maxLife;
            ctx.strokeStyle = `rgba(${r},${g},${b},${a})`; ctx.lineWidth = sp.size * 1.4;
            ctx.beginPath(); ctx.moveTo(sp.x, sp.y); ctx.lineTo(sp.x - sp.vx * 0.04, sp.y - sp.vy * 0.04); ctx.stroke();
        }
        ctx.restore();
    }
}

// 여러 공격이 함께 쓰는 불꽃 묶음 (궁극기 조각 15개가 각자 이펙트를 만들지 않게). 0.6초 동안 안 쓰면 끝난다
class GrinderSparkPoolVFX extends GrinderSparksVFX {
    constructor() { super(); this.idle = 0; }
    update(dt) { super.update(dt); this.idle += dt; if (this.idle > 0.6) this.done = true; }
    emit(...args) { this.idle = 0; super.emit(...args); }
}
function grinderSparkPool(owner) {
    let pool = owner._grinderSparkPool;
    if (!pool || pool.done || !Vfx.active.includes(pool)) { pool = owner._grinderSparkPool = new GrinderSparkPoolVFX(); Vfx.spawn(pool); }
    return pool;
}

// ==========================================
// [스킬 1 연계] 그랩 기절이 끝난 뒤 0.5초 동안 50% 슬로우.
// 슬로우는 한 번에 하나만 걸리므로 기절이 끝나는 시각에 걸리도록 상대 몸에 훅을 달아 둔다
function grinderScheduleAfterSlow(target, at) {
    target.grinderAfterSlowAt = at;
    if (target.grinderAfterSlowHooked) return;
    target.grinderAfterSlowHooked = true;
    target.preUpdateHooks.push(() => {
        if (target.grinderAfterSlowAt && Time.now >= target.grinderAfterSlowAt) {
            target.grinderAfterSlowAt = 0;
            slow(target, 0.5, 50);
        }
    });
}

// [스킬 1 연계] 그랩에 맞은 상대를 내 쪽으로 끌어온다 (벽에 끼지 않게)
// ==========================================
class GrinderReverseKnockbackEffect {
    constructor(owner, target) {
        this.owner = owner;
        this.target = target;
        this.duration = 200;
        this.createdTime = Time.now;
        this.damage = 0;
        this.hitPlayers = [];
        this.pullSpeed = 28.0;

        slow(target, 0.3, 100); // 기절 = 이동 불가 + 침묵
        silence(target, 0.3);
        bind(target, 0.5);
    }

    distance() {
        return Math.hypot(this.owner.rect.centerx - this.target.rect.centerx, this.owner.rect.centery - this.target.rect.centery);
    }

    update() {
        if (!this.target) return;
        const dx = this.owner.rect.centerx - this.target.rect.centerx;
        const dy = this.owner.rect.centery - this.target.rect.centery;
        const dist = Math.hypot(dx, dy);
        if (dist > 40) {
            const ts = this.owner.timeScale;
            moveEntityWithWalls(this.target, (dx / dist) * this.pullSpeed * ts, (dy / dist) * this.pullSpeed * ts, CURRENT_WALLS);
            // 끌려오는 동안 이동 불가·침묵 유지 (이미 걸린 더 긴 기절은 줄이지 않는다)
            const sl = this.target.statusEffects.slow, si = this.target.statusEffects.silence;
            if (!sl || sl.power < 100 || sl.duration < 0.1) slow(this.target, 0.1, 100);
            if (!si || si.duration < 0.1) silence(this.target, 0.1);
        }
    }

    isExpired() {
        if (!this.target) return true;
        return Time.now - this.createdTime >= this.duration || this.distance() <= 40;
    }

    collidesWith() { return false; }

    // 오므린 집게가 상대를 물고 끌려온다
    draw(ctx) {
        if (!this.target) return;
        const o = this.owner.rect, t = this.target.rect;
        const ang = Math.atan2(t.centery - o.centery, t.centerx - o.centerx);
        drawGrinderCable(ctx, o.centerx, o.centery, t.centerx - Math.cos(ang) * 14, t.centery - Math.sin(ang) * 14);
        drawGrinderClaw(ctx, GRINDER_GRAB_SHUT_IMAGE, t.centerx - Math.cos(ang) * 14, t.centery - Math.sin(ang) * 14, ang);
    }
}

// ==========================================
// [스킬 1] 철제 그랩
// ==========================================
class GrinderGrabBullet {
    constructor(owner, direction, attacks) {
        this.owner = owner;
        this.direction = direction;
        this.attacks = attacks;
        this.damage = owner.baseAtk * 1.2;
        this.speed = 24.0;
        this.createdTime = Time.now;
        this.lifespan = 400;
        this.hitPlayers = [];
        this.width = 15;
        this.height = 45;
        this.posX = owner.rect.centerx + direction[0] * 25;
        this.posY = owner.rect.centery + direction[1] * 25;
        this.startX = this.posX;
        this.startY = this.posY;
        this.maxRange = 350;
        this.angle = directionToAngle(direction);
    }

    getPolygonPoints() {
        return rotatedRectPoints(this.posX, this.posY, this.width, this.height, this.angle);
    }

    update() {
        this.posX += this.direction[0] * this.speed * this.owner.timeScale;
        this.posY += this.direction[1] * this.speed * this.owner.timeScale;
    }

    isExpired() {
        return Time.now - this.createdTime >= this.lifespan ||
               Math.hypot(this.posX - this.startX, this.posY - this.startY) >= this.maxRange;
    }

    collidesWith(target) {
        return canBeHit(this, target) && checkPolygonCollision(this.getPolygonPoints(), target.rect);
    }

    applyEffect(target) {
        this.attacks.push(new GrinderReverseKnockbackEffect(this.owner, target));
        slow(target, 1.0, 100);
        silence(target, 0.5);
        grinderScheduleAfterSlow(target, Time.now + 1000); // 기절(1초)이 끝나면 0.5초 동안 50% 슬로우
        this.lifespan = 0;
        // 집게가 닫히며 물 때 불꽃
        const ang = Math.atan2(this.direction[1], this.direction[0]);
        Vfx.spawn(new HitSparkVFX(target.rect.centerx, target.rect.centery, { color: GRINDER_SPARK, angle: ang + Math.PI, count: 12, size: 22 }));
        Vfx.shake(3, 0.1);
    }

    // 날아가는 동안: 줄 + 활짝 펼친 집게
    draw(ctx) {
        const ang = Math.atan2(this.direction[1], this.direction[0]);
        drawGrinderCable(ctx, this.owner.rect.centerx, this.owner.rect.centery, this.posX - Math.cos(ang) * 40, this.posY - Math.sin(ang) * 40);
        // 펼친 집게 발 사이 폭(그림 크기의 약 0.72)이 판정 길이 45와 비슷하게, 집게 발 부분이 판정 위에 오게
        drawGrinderClaw(ctx, GRINDER_GRAB_OPEN_IMAGE, this.posX, this.posY, ang, 64, 0.66);
    }
}

class GrinderSkill1 extends Skill {
    constructor() { super('Iron Grab', 3500); }

    use(owner, direction, attacks) {
        this.lastUsed = Time.now;
        attacks.push(new GrinderGrabBullet(owner, direction, attacks));
    }
}

// ==========================================
// [스킬 2] 0.3초 뒤 앞쪽 80x80을 내려찍어 1초 기절
// ==========================================
class GrinderSkill2Hitbox {
    constructor(owner, direction) {
        this.owner = owner;
        this.damage = owner.baseAtk * 1.6;
        this.createdTime = Time.now;
        this.delay = 300;
        this.activeDuration = 150;
        this.lifespan = this.delay + this.activeDuration;
        this.hitPlayers = [];
        this.width = 80;
        this.height = 80;

        const [ux, uy] = normalizeOr(direction);
        this.posX = owner.rect.centerx + ux * 50;
        this.posY = owner.rect.centery + uy * 50;
        this.rect = squareRect(this.posX, this.posY, this.width);
        Vfx.spawn(new GrinderPressVFX(this.posX, this.posY, this.delay / 1000)); // 프레스 그림은 이펙트가 그린다
    }

    update() {}

    isExpired() { return Time.now - this.createdTime >= this.lifespan; }

    collidesWith(target) {
        if (Time.now - this.createdTime < this.delay) return false;
        return canBeHit(this, target) && this.rect.colliderect(target.rect);
    }

    applyEffect(target) {
        slow(target, 1.0, 100);
        silence(target, 1.0);
    }

    // 떨어지기 전: 바닥에 찍힐 자리 경고 (옅은 빨강 + 점선 테두리). 프레스 그림은 GrinderPressVFX
    draw(ctx) {
        const el = Time.now - this.createdTime;
        if (el >= this.delay) return;
        const r = this.rect, k = el / this.delay;
        ctx.save();
        ctx.fillStyle = `rgba(220, 50, 50, ${0.1 + 0.15 * k})`; ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.setLineDash([8, 6]); ctx.strokeStyle = `rgba(255, 110, 90, ${0.5 + 0.4 * k})`; ctx.lineWidth = 2; ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
        ctx.restore();
    }
}

// 프레스가 찍힌 자리에서 바닥을 따라 퍼지는 먼지 + 그을림 (이펙트 하나로 묶음, 화면 전용)
class GrinderDustRingVFX {
    constructor(x, y) {
        this.x = x; this.y = y; this.elapsed = 0; this.duration = 0.9;
        this.puffs = [];
        for (let i = 0; i < 7; i++) { const a = (i + vfxRand(-0.3, 0.3)) / 7 * Math.PI * 2; this.puffs.push({ a, sp: vfxRand(70, 120), size: vfxRand(28, 40), rot: vfxRand(0, 6) }); }
    }
    get finished() { return this.elapsed >= this.duration; }
    update(dt) { this.elapsed += dt; }
    draw(ctx) {
        const t = this.elapsed, k = t / this.duration;
        dmxDraw(ctx, DMX_SCORCH_IMAGE, this.x, this.y - 10, 110, { alpha: 0.5 * (1 - k) });
        for (const p of this.puffs) {
            const d = 30 + p.sp * (1 - Math.exp(-4 * t)) * 0.6;
            dmxDraw(ctx, DMX_DUST_IMAGE, this.x + Math.cos(p.a) * d, this.y + Math.sin(p.a) * d * 0.6, p.size * (0.8 + 0.6 * k), { alpha: 0.55 * (1 - k), angle: p.rot + k });
        }
    }
}

// 유압 프레스 (화면 전용): 위에서 점점 빨라지며 내려와 쾅 찍고(흔들림·먼지·금·불꽃), 잠깐 눌렀다가 다시 올라가며 사라진다
class GrinderPressVFX {
    constructor(x, y, fallTime) {
        this.x = x; this.y = y; this.fall = fallTime; this.elapsed = 0; this.duration = fallTime + 0.6; this.hit = false;
    }
    get finished() { return this.elapsed >= this.duration; }
    update(dt) {
        this.elapsed += dt;
        if (!this.hit && this.elapsed >= this.fall) {
            this.hit = true;
            Vfx.shake(7, 0.2);
            const sp = new GrinderSparksVFX(); sp.done = true;
            for (let i = 0; i < 4; i++) sp.emit(this.x + (i - 1.5) * 24, this.y + 40, -Math.PI / 2 + (i - 1.5) * 0.5, 5, 0.5, [120, 300]);
            Vfx.spawn(sp);
            Vfx.spawn(new GrinderDustRingVFX(this.x, this.y + 10)); // 쾅: 바닥을 따라 퍼지는 회색 먼지
        }
    }
    draw(ctx) {
        const t = this.elapsed;
        let lift, alpha = 1;
        if (t < this.fall) { const k = t / this.fall; lift = 170 * (1 - k * k); alpha = Math.min(1, t / 0.08); }  // 점점 빨라지며 내려옴
        else if (t < this.fall + 0.18) lift = -2 * Math.sin((t - this.fall) * 40) * (1 - (t - this.fall) / 0.18); // 찍고 살짝 튐
        else { const k = (t - this.fall - 0.18) / 0.42; lift = 110 * k * k; alpha = 1 - k; }                  // 다시 올라가며 사라짐
        // 그림자 (프레스가 가까울수록 진하고 작게)
        const sh = Math.max(0, Math.min(1, 1 - lift / 170));
        ctx.save();
        ctx.fillStyle = `rgba(0, 0, 0, ${0.15 + 0.3 * sh})`;
        ctx.beginPath(); ctx.ellipse(this.x, this.y + 30, 50 - 8 * (1 - sh), 14 - 4 * (1 - sh), 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        // 찍는 순간: 네모 충격파가 퍼짐
        const it = (t - this.fall) / 0.35;
        if (it >= 0 && it < 1) grinderGlow(ctx, GRINDER_IMPACT_IMAGE, this.x, this.y, 80 * (1 + 0.5 * dmxEaseOut(it)), 80 * (1 + 0.5 * dmxEaseOut(it)), { alpha: 1.2 * (1 - it) });
        const w = 96, h = w * 150 / 120;            // 판 너비 ≈ 판정 80 + 여유
        grinderGlow(ctx, GRINDER_PRESS_IMAGE, this.x, this.y + 40 - lift, w, h, { alpha, ax: 0.5, ay: 146 / 150 }); // 찍는 면이 판정 아래쪽 가까이
    }
}

class GrinderSkill2 extends Skill {
    constructor() { super('Ground Slam Control', 6000); }

    use(owner, direction, attacks) {
        this.lastUsed = Time.now;
        slow(owner, 0.3, 100);
        attacks.push(new GrinderSkill2Hitbox(owner, direction));
    }
}

// ==========================================
// [궁극기] -15도~15도로 15발 난사
// ==========================================
class GrinderUltimateSquareBullet {
    constructor(owner, direction) {
        this.owner = owner;
        this.damage = owner.baseAtk * 0.25;
        this.speed = 15.0;
        this.createdTime = Time.now;
        this.lifespan = 2000;
        this.hitPlayers = [];
        this.width = 12;
        this.height = 12;

        const angle = Math.atan2(direction[1], direction[0]) + randomUniform(-15, 15) * Math.PI / 180;
        this.dirX = Math.cos(angle);
        this.dirY = Math.sin(angle);
        this.posX = owner.rect.centerx + this.dirX * 45;
        this.posY = owner.rect.centery + this.dirY * 45;
        this.startX = this.posX;
        this.startY = this.posY;
        this.maxRange = 1200;
        this.angle = directionToAngle([this.dirX, this.dirY]);
        this.rect = squareRect(this.posX, this.posY, this.width);
        // 화면 전용: 고철 조각 그림 중 하나를 골라 빙글빙글 돌며 날아간다
        this.scrap = GRINDER_SCRAP_IMAGES[Math.floor(Math.random() * GRINDER_SCRAP_IMAGES.length)];
        this.noFizzle = true; // 사라질 때 불꽃은 공용 불꽃 묶음으로 (이펙트 수 아끼기)
        this.spin = (Math.random() < 0.5 ? -1 : 1) * vfxRand(8, 16);
    }

    update() {
        const oldX = this.posX;
        const oldY = this.posY;
        this.posX += this.dirX * this.speed * this.owner.timeScale;
        this.posY += this.dirY * this.speed * this.owner.timeScale;
        this.rect = squareRect(this.posX, this.posY, this.width);

        // 벽 판정은 실제보다 작은 8x8로 (닿자마자 막히지 않게)
        const col = new Rect(Math.trunc(this.posX - 4), Math.trunc(this.posY - 4), 8, 8);
        for (const wall of CURRENT_WALLS) {
            if (col.colliderect(wall.rect)) {
                this.posX = oldX;
                this.posY = oldY;
                this.rect = squareRect(this.posX, this.posY, this.width);
                this.createdTime = Time.now - this.lifespan;
                grinderSparkPool(this.owner).emit(this.posX, this.posY, Math.atan2(this.dirY, this.dirX) + Math.PI, 5, 0.9, [80, 220]); // 벽에 부딪힌 불꽃
                break;
            }
        }
    }

    isExpired() {
        return Time.now - this.createdTime >= this.lifespan ||
               Math.hypot(this.posX - this.startX, this.posY - this.startY) >= this.maxRange;
    }

    collidesWith(target) {
        return canBeHit(this, target) && this.rect.colliderect(target.rect);
    }

    applyEffect(target) {
        slow(target, 0.2, 100);
        silence(target, 0.2);
        bind(target, 0.2);
        moveEntityWithWalls(target, this.dirX * 8.0, this.dirY * 8.0, CURRENT_WALLS); // 살짝 밀림
        this.lifespan = 0;
        grinderSparkPool(this.owner).emit(target.rect.centerx, target.rect.centery, Math.atan2(this.dirY, this.dirX), 7, 0.9, [120, 300]);
    }

    draw(ctx) {
        const t = (Time.now - this.createdTime) / 1000;
        // 달궈진 조각 + 뒤로 짧은 불꼬리
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.lineCap = 'round';
        ctx.strokeStyle = 'rgba(168, 98, 58, 0.45)'; ctx.lineWidth = 5;
        ctx.beginPath(); ctx.moveTo(this.posX, this.posY); ctx.lineTo(this.posX - this.dirX * 22, this.posY - this.dirY * 22); ctx.stroke();
        ctx.restore();
        grinderGlow(ctx, this.scrap, this.posX, this.posY, 22, 22, { angle: t * this.spin, core: 0.6 });
    }
}

class GrinderUltimateManager {
    constructor(owner, direction, attacks) {
        this.owner = owner;
        this.direction = direction;
        this.attacks = attacks;
        this.totalBullets = 15;
        this.firedCount = 0;
        this.interval = 110; // 조각 사이 간격 (원래 60ms)
        this.lastFireTime = 0;
        this.damage = 0;
        this.hitPlayers = [];
    }

    update() {
        if (this.firedCount < this.totalBullets &&
            (this.firedCount === 0 || Time.now - this.lastFireTime >= this.interval)) {
            this.lastFireTime = Time.now;
            this.attacks.push(new GrinderUltimateSquareBullet(this.owner, this.direction));
            this.firedCount += 1;
            // 화면 전용: 쏠 때마다 앞에서 불꽃 + 살짝 흔들림
            const r = this.owner.rect, a = Math.atan2(this.direction[1], this.direction[0]);
            grinderSparkPool(this.owner).emit(r.centerx + Math.cos(a) * 40, r.centery + Math.sin(a) * 40, a, 3, 0.45, [150, 360]);
            if (this.firedCount % 3 === 1) Vfx.shake(2, 0.08);
        }
    }

    isExpired() {
        return this.firedCount >= this.totalBullets;
    }

    collidesWith() { return false; }

    draw() {}
}

class GrinderUltimate extends Skill {
    constructor() { super('Iron Barrage', 500, ['ult'], -99999); }

    use(owner, direction, attacks) {
        this.lastUsed = Time.now;
        attacks.push(new GrinderUltimateManager(owner, direction, attacks));
    }
}

// ==========================================
// [평타] 누르고 있는 동안 앞에서 도는 분쇄기 (최대 3초, 같은 상대는 0.3초마다 다시 맞음)
// ==========================================
class GrinderSpinAttack {
    constructor(owner, direction) {
        this.owner = owner;
        this.damage = owner.baseAtk * 0.45;
        this.createdTime = Time.now;
        this.hitPlayers = [];
        this.hitPlayersTime = new Map();
        owner.grinderSpinActive = true;

        // 앞쪽 왼쪽·오른쪽에 그라인더 원판 두 개 (판정도 원 두 개). 원래는 앞 55에 반지름 45 원 하나
        this.discR = 28;   // 원판 반지름
        this.dist = 50;    // 몸 중심에서 앞으로
        this.side = 30;    // 좌우로 벌어진 거리
        this.dirVec = normalizeOr(direction);
        this.posX = owner.rect.centerx + this.dirVec[0] * this.dist;
        this.posY = owner.rect.centery + this.dirVec[1] * this.dist;
        this.effectAngle = 0.0;
        this.sparks = new GrinderSparksVFX(); // 화면 전용: 원판에서 튀는 불꽃
        Vfx.spawn(this.sparks);
    }

    discCenters() {
        const [dx, dy] = this.dirVec, px = -dy, py = dx;
        return [[this.posX + px * this.side, this.posY + py * this.side], [this.posX - px * this.side, this.posY - py * this.side]];
    }

    update() {
        // 갈고 있는 동안 본인 40% 슬로우 (더 강한 슬로우가 걸려 있으면 그대로 둠)
        const e = this.owner.statusEffects.slow;
        if (!e || e.power <= 40) slow(this.owner, 0.1, 40);
        this.posX = this.owner.rect.centerx + this.dirVec[0] * this.dist;
        this.posY = this.owner.rect.centery + this.dirVec[1] * this.dist;

        this.effectAngle += 15.0;
        if (this.effectAngle >= 360) this.effectAngle -= 360;

        for (const [target, lastHit] of this.hitPlayersTime) {
            if (Time.now - lastHit >= 300) {
                const i = this.hitPlayers.indexOf(target);
                if (i >= 0) this.hitPlayers.splice(i, 1);
            }
        }

        // 화면 전용: 각 원판의 앞쪽 바깥 모서리에서 불꽃이 바깥·앞으로 튄다
        const a = Math.atan2(this.dirVec[1], this.dirVec[0]);
        this.tick = (this.tick || 0) + 1;
        if (this.tick % 3 === 0) this.discCenters().forEach(([cx, cy], i) => {   // 세 틱에 한 번만 (렉 줄이기)
            const out = a + (i === 0 ? 0.9 : -0.9);
            this.sparks.emit(cx + Math.cos(out) * this.discR, cy + Math.sin(out) * this.discR, out, 1, 0.5, [100, 260]);
        });
    }

    // 평타 키를 떼거나 3초가 지나면 끝
    isExpired() {
        const keyPressed = this.owner.input.skills[0];
        if (!keyPressed || Time.now - this.createdTime >= 3000) {
            this.owner.grinderSpinActive = false;
            this.sparks.done = true;
            return true;
        }
        return false;
    }

    collidesWith(target) {
        if (!canBeHit(this, target)) return false;
        const reach = this.discR + Math.max(target.rect.w, target.rect.h) / 2;
        return this.discCenters().some(([cx, cy]) => Math.hypot(target.rect.centerx - cx, target.rect.centery - cy) <= reach);
    }

    applyEffect(target) {
        this.hitPlayersTime.set(target, Time.now);
        // 화면 전용: 갈리는 순간 불꽃이 확 튐
        const a = Math.atan2(target.rect.centery - this.owner.rect.centery, target.rect.centerx - this.owner.rect.centerx);
        this.sparks.emit(target.rect.centerx, target.rect.centery, a + Math.PI, 6, 1.1, [140, 360]);
    }

    // 몸에서 뻗은 팔 + 빠르게 도는 원판 두 개 (서로 반대로 돔)
    draw(ctx) {
        const o = this.owner.rect;
        ctx.save(); ctx.lineCap = 'round';
        for (const [cx, cy] of this.discCenters()) {
            ctx.strokeStyle = 'rgba(190, 170, 150, 0.7)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(o.centerx, o.centery); ctx.lineTo(cx, cy); ctx.stroke();
        }
        ctx.restore();
        const size = Math.round(this.discR * 2 * 64 / 60);   // 톱날 바깥이 판정 반지름에 오게
        const step = Math.floor((Time.now - this.createdTime) / 16);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        this.discCenters().forEach(([cx, cy], i) => {
            const img = grinderDiscFrame(size, i === 0 ? step : -step); // 왼쪽·오른쪽이 서로 반대로 돔
            if (img) ctx.drawImage(img, Math.round(cx - img.width / 2), Math.round(cy - img.height / 2));
        });
        ctx.restore();
    }
}

class GrinderBasicAttack extends Skill {
    constructor(owner) {
        super('Grinder Spin Smash', 100);
        this.owner = owner;
    }

    canUse() {
        if (this.owner && this.owner.grinderSpinActive) return false;
        return super.canUse();
    }

    use(owner, direction, attacks) {
        this.owner = owner;
        this.lastUsed = Time.now;
        attacks.push(new GrinderSpinAttack(owner, direction));
    }
}

// ==========================================
// 캐릭터 등록
// ==========================================
function applyGrinder(player) {
    player.baseAtk = 20;
    player.maxHp = 300;
    player.maxUltGauge = 110; // 궁극기 게이지 통 (검사 100 기준)
    player.hp = player.maxHp;
    player.speed = 4.1;
    player.grinderSpinActive = false;
    player.abilities = [
        new GrinderBasicAttack(player), // 평타 (누르고 있는 동안 회전 분쇄)
        new GrinderSkill1(),            // 스킬 1 (철제 그랩)
        new GrinderSkill2(),            // 스킬 2 (전방 제어 슬램)
        new GrinderUltimate(),          // 궁극기 (난사)
    ];
}

const GRINDER_CHARACTER_DATA = {
    id: 'GRINDER',
    fxColor: '#e0b060',
    name: '분쇄자',
    desc: '평타(누르고 있기·최대 3초): 앞 좌우에 분쇄기 2개를 돌려 닿은 적에게 0.3초마다 피해를 줍니다(9). 쓰는 동안 내가 40% 느려집니다, 스킬 1(3.5초): 집게 그랩을 날려 맞은 적을 내 앞으로 끌어옵니다(24, 1초 이동 불가·0.5초 침묵, 그 뒤 0.5초 슬로우 50%), 스킬 2(6초): 0.3초 뒤 앞쪽을 유압 프레스로 내려찍습니다(32, 1초 기절), 궁극기: 앞쪽 30도 부채꼴로 고철 조각 15발을 난사합니다(5씩, 맞을 때마다 0.2초 경직)',
    apply: applyGrinder,
    thumbnail: null,
};

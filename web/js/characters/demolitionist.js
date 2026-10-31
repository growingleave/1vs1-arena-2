// 폭파광 (abilities/demolitionist.py를 옮김)

// 원 범위 판정 공통: 중심에서 반지름 안에 상대 중심이 들어오면 맞음
function hitsInCircle(attack, target, x, y, radius) {
    if (!canBeHit(attack, target) || attack.hitPlayers.includes(target)) return false;
    return Math.hypot(target.rect.centerx - x, target.rect.centery - y) <= radius;
}

// 평소는 주황, 변신(보라 몸) 중엔 이펙트가 더 붉고 화려해진다
const DMX_ORANGE = '255, 150, 60';
const DMX_RED = '255, 60, 30';
const DMX_ORANGE_HEX = '#ffa040';
const DMX_RED_HEX = '#ff3a24';

// 그림 (tools/demolitionist_gen.js로 생성, 모두 1/2 크기)
const DMX_GRENADE_IMAGE = loadImage('assets/dmx_grenade.png');     // 32x32 유탄, 가운데 — 보통
const DMX_BIGBOMB_IMAGE = loadImage('assets/dmx_bigbomb.png');     // 40x64 떨어지는 폭탄, 코 끝 (20,62) — 보통
const DMX_FIRE_IMAGE = loadImage('assets/dmx_fireball.png');       // 160x160 불덩이(주황), 불꽃 끝 반지름 ≈ 72 — 'lighter'
const DMX_FIRE_RED_IMAGE = loadImage('assets/dmx_fireball_red.png'); // 160x160 불덩이(붉은) — 'lighter'
const DMX_RING_IMAGE = loadImage('assets/dmx_ring.png');           // 160x160 흰 충격파 고리, 반지름 70 — 색 입혀 'lighter'
const DMX_CONE_IMAGE = loadImage('assets/dmx_cone.png');           // 200x140 스킬1 폭발(주황), 뒤쪽 기준점 (10,70), 길이 ≈ 185 — 'lighter'
const DMX_CONE_RED_IMAGE = loadImage('assets/dmx_cone_red.png');   // 200x140 변신 스킬1 (붉은) — 'lighter'
const DMX_SMOKE_IMAGE = loadImage('assets/dmx_smoke.png');         // 128x128 검은 연기, 가운데 — 보통
const DMX_DUST_IMAGE = loadImage('assets/dmx_dust.png');           // 128x128 옅은 흙먼지, 가운데 — 보통
const DMX_SCORCH_IMAGE = loadImage('assets/dmx_scorch.png');       // 160x160 바닥 그을림, 반지름 ≈ 70 — 보통
const DMX_WARN_IMAGE = loadImage('assets/dmx_warn.png');           // 200x200 흰 경고 고리, 반지름 92 — 색 입혀 'lighter'

// 그림 그리기 공통: 가운데(또는 기준점 ax,ay 비율)를 (x,y)에 맞춰 size(가로) 크기로
function dmxDraw(ctx, img, x, y, size, { angle = 0, alpha = 1, lighter = false, tint = null, ax = 0.5, ay = 0.5 } = {}) {
    if (!isImageReady(img) || alpha <= 0 || size <= 0) return;
    const h = size * img.naturalHeight / img.naturalWidth;
    ctx.save();
    if (lighter) ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.translate(x, y);
    if (angle) ctx.rotate(angle);
    ctx.drawImage(tint ? vfxTinted(img, tint) : img, -size * ax, -h * ay, size, h);
    ctx.restore();
}

const dmxEaseOut = (t) => 1 - (1 - t) * (1 - t);

// 폭발 하나 (화면 전용): 그을림 → 불덩이 → 충격파 고리 → 불똥 → 연기 → 먼지바람
// 먼지바람은 일부러 옅게, 바닥을 따라 바깥으로 천천히 번지게 (눈에 띄기보다 자연스럽게)
class DmxBoomVFX extends SparkVFX {
    constructor(x, y, radius, { red = false, big = false } = {}) {
        super(red ? '#ff6a3a' : '#ffc070');
        this.x = x; this.y = y; this.radius = radius; this.red = red; this.big = big;
        this.duration = big ? 1.8 : 1.3;
        this.spin = Math.random() * Math.PI * 2;
        const n = (red ? 16 : 10) + (big ? 12 : 0);
        for (let i = 0; i < n; i++) this.addSpark(x, y, vfxRand(0, Math.PI * 2), vfxRand(radius * 1.2, radius * 3.4), vfxRand(0.2, 0.5), vfxRand(1.4, 2.8));
        this.smoke = [];
        for (let i = 0; i < (big ? 6 : 4); i++) {
            const a = vfxRand(0, Math.PI * 2), d = vfxRand(0, radius * 0.45);
            this.smoke.push({ x: Math.cos(a) * d, y: Math.sin(a) * d, s: vfxRand(0.7, 1.0), rot: vfxRand(0, 6) });
        }
        this.dust = [];
        const nd = big ? 10 : 7;
        for (let i = 0; i < nd; i++) this.dust.push({ a: (i + vfxRand(-0.3, 0.3)) / nd * Math.PI * 2, s: vfxRand(0.8, 1.15), rot: vfxRand(0, 6) });
        if (big) Vfx.shake(9, 0.35); else if (red) Vfx.shake(3, 0.12);
    }

    get finished() { return this.elapsed >= this.duration && this.sparksDone; }

    draw(ctx) {
        const t = this.elapsed, R = this.radius, x = this.x, y = this.y;
        // 바닥 그을림 (오래 남아 서서히)
        dmxDraw(ctx, DMX_SCORCH_IMAGE, x, y, R * 2.3, { alpha: 0.55 * Math.max(0, 1 - t / this.duration), angle: this.spin });
        // 먼지바람: 폭발 가장자리에서 바깥으로 번짐 (옅게)
        const dt = Math.min(1, t / (this.duration * 0.85));
        if (dt < 1) {
            const da = 0.22 * Math.min(1, t / 0.12) * (1 - dt);
            for (const d of this.dust) {
                const r = R * (0.55 + 0.75 * dmxEaseOut(dt));
                dmxDraw(ctx, DMX_DUST_IMAGE, x + Math.cos(d.a) * r, y + Math.sin(d.a) * r * 0.8, R * 0.8 * d.s * (0.8 + 0.5 * dt), { alpha: da, angle: d.rot + dt });
            }
        }
        // 연기: 조금 늦게 피어올라 위로 천천히
        if (t > 0.06) {
            const st = Math.min(1, (t - 0.06) / (this.duration - 0.06));
            for (const s of this.smoke) {
                dmxDraw(ctx, DMX_SMOKE_IMAGE, x + s.x, y + s.y - st * R * 0.6, R * 1.1 * s.s * (0.7 + 0.6 * st),
                    { alpha: 0.7 * Math.min(1, (t - 0.06) / 0.1) * (1 - st), angle: s.rot });
            }
        }
        // 충격파 고리
        const rt = Math.min(1, t / 0.3);
        if (rt < 1) {
            const rr = R * (0.35 + 0.85 * dmxEaseOut(rt));
            dmxDraw(ctx, DMX_RING_IMAGE, x, y, rr * 2 * 80 / 70, { lighter: true, tint: this.red ? DMX_RED_HEX : DMX_ORANGE_HEX, alpha: 1.1 * (1 - rt) });
            if (this.big) dmxDraw(ctx, DMX_RING_IMAGE, x, y, rr * 1.4 * 80 / 70, { lighter: true, tint: '#ffd080', alpha: 0.8 * (1 - rt) });
        }
        // 불덩이: 순식간에 커졌다가 사그라듦
        const ft = Math.min(1, t / (this.big ? 0.55 : 0.4));
        if (ft < 1) {
            const grow = dmxEaseOut(Math.min(1, t / 0.1));
            dmxDraw(ctx, this.red ? DMX_FIRE_RED_IMAGE : DMX_FIRE_IMAGE, x, y, R * (this.big ? 1.7 : 2.25) * (0.45 + 0.6 * grow + 0.15 * ft),
                { lighter: true, angle: this.spin, alpha: (this.big ? 0.85 : this.red ? 1.3 : 1.1) * (1 - ft * ft) });
        }
        ctx.save(); ctx.globalCompositeOperation = 'lighter'; this.drawSparks(ctx); ctx.restore();
    }
}

// 작은 흙먼지 한 뭉치 (밀려날 때 발밑 등, 화면 전용)
class DmxPuffVFX {
    constructor(x, y, size, { vx = 0, vy = 0, duration = 0.45, alpha = 0.35, image = DMX_DUST_IMAGE } = {}) {
        Object.assign(this, { x, y, size, vx, vy, duration, alpha, image });
        this.elapsed = 0; this.rot = Math.random() * 6;
    }
    get finished() { return this.elapsed >= this.duration; }
    update(dt) { this.elapsed += dt; this.x += this.vx * dt; this.y += this.vy * dt; }
    draw(ctx) {
        const t = this.elapsed / this.duration;
        dmxDraw(ctx, this.image, this.x, this.y, this.size * (0.7 + 0.6 * t), { alpha: this.alpha * (1 - t), angle: this.rot + t });
    }
}

// 밀려나는 몸 뒤로 남는 바람 줄 (코드, 화면 전용). dir = 밀려가는 방향
function dmxDrawStreaks(ctx, rect, dir, alpha, color = '255, 235, 210') {
    if (alpha <= 0) return;
    const px = -dir[1], py = dir[0];
    ctx.save();
    ctx.strokeStyle = `rgba(${color}, ${alpha})`; ctx.lineWidth = 2; ctx.lineCap = 'round';
    ctx.beginPath();
    for (const [off, len] of [[-12, 26], [0, 36], [12, 22]]) {
        const sx = rect.centerx - dir[0] * 16 + px * off, sy = rect.centery - dir[1] * 16 + py * off;
        ctx.moveTo(sx, sy); ctx.lineTo(sx - dir[0] * len, sy - dir[1] * len);
    }
    ctx.stroke();
    ctx.restore();
}

// 스킬1에 맞아 밀려나는 상대: 몸 뒤 바람 줄 + 발밑 먼지 (forcedMove 0.3초 동안)
class DmxPushTrailVFX {
    constructor(target, direction, color) {
        this.target = target; this.direction = direction; this.color = color;
        this.duration = 0.3; this.elapsed = 0; this.nextPuff = 0;
    }
    get finished() { return this.elapsed >= this.duration || this.target.hidden; }
    update(dt) {
        this.elapsed += dt;
        if (this.elapsed >= this.nextPuff) {
            this.nextPuff += 0.06;
            const r = this.target.rect;
            Vfx.spawn(new DmxPuffVFX(r.centerx, r.bottom - 4, 30, { vx: -this.direction[0] * 30, vy: -14, duration: 0.5, alpha: 0.4 }));
        }
    }
    draw(ctx) {
        if (this.target.hidden) return;
        // 밀려가는 쪽의 반대(앞쪽)에서 바람 줄이 뒤로 흐르는 느낌
        dmxDrawStreaks(ctx, this.target.rect, [-this.direction[0], -this.direction[1]], 0.75 * (1 - this.elapsed / this.duration), this.color);
    }
}

// 스킬1 앞으로 뿜는 폭발 그림 (몸 앞쪽에서 시작, 순식간에 뻗었다 사라짐)
function dmxDrawCone(ctx, img, x, y, angle, length, t) {
    if (t >= 1) return;
    const k = length / 185 * (0.65 + 0.35 * dmxEaseOut(Math.min(1, t * 3)));
    dmxDraw(ctx, img, x, y, 200 * k, { lighter: true, angle, alpha: 1.2 * (1 - t * t), ax: 10 / 200, ay: 0.5 });
}

// 변신 스킬2: 하늘에서 폭탄이 떨어져 땅에 닿는 순간 터진다 (떨어지는 시간 260ms 뒤 폭발 판정)
const DMX_BOMB_FALL_MS = 260;
class DemolitionistBombDrop {
    constructor(owner, x, y, damage, radius, attacks) {
        this.owner = owner; this.posX = x; this.posY = y;
        this.explodeDamage = damage; this.radius = radius; this.attacks = attacks;
        this.damage = 0; this.hitPlayers = []; this.canPenetrateWalls = true;
        this.createdTime = Time.now; this.done = false;
    }
    update() {
        if (!this.done && Time.now - this.createdTime >= DMX_BOMB_FALL_MS) {
            this.done = true;
            this.attacks.push(new DemolitionistExplosionEffect(this.owner, this.posX, this.posY, this.explodeDamage, this.radius, DMX_RED, 200, 300, { vivid: true }));
        }
    }
    isExpired() { return this.done; }
    collidesWith() { return false; }
    draw(ctx) {
        const t = Math.min(1, (Time.now - this.createdTime) / DMX_BOMB_FALL_MS);
        const x = this.posX, y = this.posY;
        // 바닥: 조여드는 붉은 조준 고리 + 커지는 그림자
        dmxDraw(ctx, DMX_RING_IMAGE, x, y, this.radius * 0.9 * (1.4 - 0.6 * t), { lighter: true, tint: DMX_RED_HEX, alpha: 0.35 + 0.5 * t });
        ctx.save();
        ctx.fillStyle = `rgba(0, 0, 0, ${0.15 + 0.3 * t})`;
        ctx.beginPath(); ctx.ellipse(x, y, 6 + 12 * t, 3 + 5 * t, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        // 폭탄: 위에서 점점 빨라지며 떨어짐 + 꼬리 바람 줄
        const by = y - 120 * (1 - t * t);
        ctx.save();
        ctx.strokeStyle = `rgba(255, 220, 200, ${0.5 * t})`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(x - 5, by - 70); ctx.lineTo(x - 5, by - 34); ctx.moveTo(x + 5, by - 64); ctx.lineTo(x + 5, by - 34); ctx.stroke();
        ctx.restore();
        dmxDraw(ctx, DMX_BIGBOMB_IMAGE, x, by, 22, { ax: 0.5, ay: 62 / 64 });
    }
}

// ==========================================
// 폭발 이펙트 (벽 관통)
// ==========================================
class DemolitionistExplosionEffect {
    constructor(owner, x, y, damage, radius, color = DMX_ORANGE, maxAlpha = 230, lifespan = 300, { vivid = false, big = false } = {}) {
        this.owner = owner;
        this.posX = x;
        this.posY = y;
        this.damage = damage;
        this.radius = radius;
        this.color = color;
        this.maxAlpha = maxAlpha;
        this.createdTime = Time.now;
        this.lifespan = lifespan;
        this.hitPlayers = [];
        this.canPenetrateWalls = true;
        // 그림은 전부 DmxBoomVFX가 그린다 (변신/궁극기면 붉고 화려하게)
        Vfx.spawn(new DmxBoomVFX(x, y, radius, { red: vivid || color === DMX_RED, big }));
    }

    update() {}

    isExpired() { return Time.now - this.createdTime >= this.lifespan; }

    collidesWith(target) {
        return hitsInCircle(this, target, this.posX, this.posY, this.radius);
    }

    draw() {}
}

// ==========================================
// [평타] 유탄: 닿거나 사거리 끝/벽에서 터진다 (피해는 폭발이 준다)
// ==========================================
class DemolitionistBasicGrenade {
    constructor(owner, direction, attacks) {
        this.owner = owner;
        this.direction = direction;
        this.attacks = attacks;
        this.damage = 0;
        this.speed = 9.0;
        this.createdTime = Time.now;
        this.lifespan = 2000;
        this.hitPlayers = [];

        this.width = 12;
        this.height = 12;
        this.posX = owner.rect.centerx + direction[0] * 20;
        this.posY = owner.rect.centery + direction[1] * 20;
        this.startX = this.posX;
        this.startY = this.posY;

        const transformed = owner.isTransformed;
        this.maxRange = transformed ? 180 : 320;
        this.explosionRadius = transformed ? 90 : 60;
        this.explosionDamage = owner.baseAtk * 0.8;

        this.exploded = false;
        this.rect = this.getRect();
    }

    getRect() {
        return new Rect(Math.trunc(this.posX - this.width / 2), Math.trunc(this.posY - this.height / 2), this.width, this.height);
    }

    explode() {
        if (this.exploded) return;
        this.exploded = true;
        const red = this.owner.isTransformed;
        this.attacks.push(new DemolitionistExplosionEffect(this.owner, this.posX, this.posY, this.explosionDamage, this.explosionRadius,
            red ? DMX_RED : DMX_ORANGE, 230, 300, { vivid: red }));
    }

    update() {
        this.posX += this.direction[0] * this.speed * this.owner.timeScale;
        this.posY += this.direction[1] * this.speed * this.owner.timeScale;
        this.rect = this.getRect();

        if (Math.hypot(this.posX - this.startX, this.posY - this.startY) >= this.maxRange) {
            this.explode();
            return;
        }
        const core = wallCoreRect(this.rect); // 가운데 작은 판정이 벽에 닿을 때만
        for (const wall of CURRENT_WALLS) {
            if (wall.rect.colliderect(core)) {
                this.explode();
                return;
            }
        }
    }

    isExpired() { return this.exploded || Time.now - this.createdTime >= this.lifespan; }

    collidesWith(target) {
        if (this.exploded || !canBeHit(this, target)) return false;
        if (this.rect.colliderect(target.rect)) this.explode();
        return false;
    }

    draw(ctx) {
        if (this.exploded) return;
        // 꼬리 불똥 (코드) + 빙글 도는 유탄 (그림)
        const red = this.owner.isTransformed;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (let i = 1; i <= 3; i++) {
            ctx.fillStyle = `rgba(${red ? DMX_RED : DMX_ORANGE}, ${0.55 - i * 0.14})`;
            ctx.beginPath(); ctx.arc(this.posX - this.direction[0] * i * 7, this.posY - this.direction[1] * i * 7, 4 - i * 0.8, 0, Math.PI * 2); ctx.fill();
        }
        ctx.restore();
        dmxDraw(ctx, DMX_GRENADE_IMAGE, this.posX, this.posY, 17, { angle: (Time.now - this.createdTime) * 0.02 });
    }
}

class DemolitionistBasicSkill extends Skill {
    constructor() { super('Grenade Basic Attack', 400); }

    use(owner, direction, attacks) {
        this.lastUsed = Time.now;
        attacks.push(new DemolitionistBasicGrenade(owner, direction, attacks));
    }
}

// ==========================================
// [스킬 1] 사다리꼴 충격파 + 뒤로 튕겨나는 반동 (변신 중엔 반동 없이 더 크고 강하게)
// ==========================================

class DemolitionistSkill1Effect {
    constructor(owner, direction) {
        this.owner = owner;
        this.direction = direction;
        this.isTransformed = owner.isTransformed;
        this.damage = owner.baseAtk * (this.isTransformed ? 2.2 : 1.4);
        this.createdTime = Time.now;
        this.lifespan = 250;
        this.hitPlayers = [];
        this.posX = owner.rect.centerx + direction[0] * 35;
        this.posY = owner.rect.centery + direction[1] * 35;
        this.angle = directionToAngle(direction);
        this.screenAngle = Math.atan2(direction[1], direction[0]);
        // 화면 전용: 뿜는 자리(몸 앞)와 길이 (사다리꼴 앞 끝까지)
        this.fxX = owner.rect.centerx + direction[0] * 14;
        this.fxY = owner.rect.centery + direction[1] * 14;
        this.fxLen = this.isTransformed ? 125 : 95;

        const red = this.isTransformed;
        // 사용 순간: 앞으로 튀는 불똥 + 총구 연기
        Vfx.spawn(new DmxSparkBurstVFX(this.fxX, this.fxY, this.screenAngle, red));
        Vfx.spawn(new DmxPuffVFX(this.fxX + direction[0] * 10, this.fxY + direction[1] * 10, red ? 60 : 44,
            { vx: direction[0] * 40, vy: direction[1] * 40 - 20, duration: 0.6, alpha: 0.5, image: DMX_SMOKE_IMAGE }));

        if (red) {
            // 변신: 사다리꼴 안을 따라 뒤→앞 순서로 3번 터지는 폭발
            this.bursts = [0.2, 0.55, 0.9].map((t) => {
                const lx = -30 + t * 120, halfH = 25 + t * 40;
                const [wx, wy] = transformLocalPoints(this.posX, this.posY, this.angle, [[lx, 0]])[0];
                return { wx, wy, radius: halfH, at: t * 110, spawned: false };
            });
            Vfx.shake(4, 0.15);
        }
    }

    getTrapPoints() {
        const local = this.isTransformed
            ? [[-30, -25], [90, -65], [90, 65], [-30, 25]]
            : [[-20, -18], [60, -45], [60, 45], [-20, 18]];
        return transformLocalPoints(this.posX, this.posY, this.angle, local);
    }

    update() {
        // 변신 연쇄 폭발 그림을 시간차로 띄운다 (화면 전용)
        if (!this.bursts) return;
        const el = Time.now - this.createdTime;
        for (const b of this.bursts) {
            if (!b.spawned && el >= b.at) { b.spawned = true; Vfx.spawn(new DmxBoomVFX(b.wx, b.wy, b.radius, { red: true })); }
        }
    }

    isExpired() { return Time.now - this.createdTime >= this.lifespan; }

    collidesWith(target) {
        if (!canBeHit(this, target) || this.hitPlayers.includes(target)) return false;
        return checkPolygonCollision(this.getTrapPoints(), target.rect);
    }

    applyEffect(target) {
        const pushed = !this.isTransformed;
        if (pushed) forcedMove(target, 0.3, 350.0, this.direction);
        const color = this.isTransformed ? DMX_RED_HEX : DMX_ORANGE_HEX;
        Vfx.spawn(new HitSparkVFX(target.rect.centerx, target.rect.centery, { color, angle: this.screenAngle, count: pushed ? 14 : 12, size: pushed ? 26 : 22 }));
        if (pushed) {
            // 미는 충격: 상대 몸에 부딪히는 고리 + 밀려나는 바람 줄·먼지
            Vfx.spawn(new DmxRingHitVFX(target.rect.centerx, target.rect.centery, color));
            Vfx.spawn(new DmxPushTrailVFX(target, this.direction, '255, 220, 180'));
        }
    }

    draw(ctx) {
        const t = Math.min(1, (Time.now - this.createdTime) / this.lifespan);
        dmxDrawCone(ctx, this.isTransformed ? DMX_CONE_RED_IMAGE : DMX_CONE_IMAGE, this.fxX, this.fxY, this.screenAngle, this.fxLen, t);
    }
}

// 스킬1 사용 순간 앞으로 튀는 불똥 (화면 전용)
class DmxSparkBurstVFX extends SparkVFX {
    constructor(x, y, angle, red) {
        super(red ? '#ff6a3a' : '#ffc070');
        for (let i = 0; i < (red ? 22 : 14); i++) this.addSpark(x, y, angle + vfxRand(-0.55, 0.55), vfxRand(200, red ? 560 : 420), vfxRand(0.15, 0.35), vfxRand(1.4, 2.8));
    }
    get finished() { return this.sparksDone; }
    draw(ctx) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; this.drawSparks(ctx); ctx.restore(); }
}

// 상대가 밀리는 순간 몸에 부딪히는 작은 충격 고리 (화면 전용)
class DmxRingHitVFX {
    constructor(x, y, color) { this.x = x; this.y = y; this.color = color; this.duration = 0.22; this.elapsed = 0; }
    get finished() { return this.elapsed >= this.duration; }
    update(dt) { this.elapsed += dt; }
    draw(ctx) {
        const t = this.elapsed / this.duration;
        dmxDraw(ctx, DMX_RING_IMAGE, this.x, this.y, 30 + 50 * dmxEaseOut(t), { lighter: true, tint: this.color, alpha: 1.2 * (1 - t) });
    }
}

// 돌진/반동 공통: 일정 시간 owner를 direction으로 밀어낸다
class DemolitionistRecoilManager {
    constructor(owner, direction) {
        this.owner = owner;
        this.direction = [-direction[0], -direction[1]];
        this.dashSpeed = 14.0;
        this.dashDuration = 180;
        this.createdTime = Time.now;
        this.damage = 0;
        this.hitPlayers = [];
        this.isDash = true;
    }

    update(walls) {
        if (Time.now - this.createdTime < this.dashDuration) {
            slow(this.owner, 0.1, 100);
            silence(this.owner, 0.1);
            const ts = this.owner.timeScale;
            moveEntityWithWalls(this.owner, this.direction[0] * this.dashSpeed * ts, this.direction[1] * this.dashSpeed * ts, walls);
            // 발이 끌리며 남는 흙먼지 (화면 전용)
            if (Time.now - (this.lastPuff ?? -999) >= 45) {
                this.lastPuff = Time.now;
                const r = this.owner.rect;
                Vfx.spawn(new DmxPuffVFX(r.centerx, r.bottom - 4, 28, { vx: -this.direction[0] * 25, vy: -12, duration: 0.5, alpha: 0.4 }));
            }
        }
    }

    isExpired() {
        const expired = Time.now - this.createdTime >= this.dashDuration;
        if (expired) clearDashLock(this.owner, { silenceLock: true });
        return expired;
    }

    collidesWith() { return false; }

    // 뒤로 밀려나는 동안: 몸 앞쪽에서 뒤로 흐르는 바람 줄 (화면 전용)
    draw(ctx) {
        const t = Math.min(1, (Time.now - this.createdTime) / this.dashDuration);
        if (t >= 1 || this.owner.hidden) return;
        dmxDrawStreaks(ctx, this.owner.rect, [-this.direction[0], -this.direction[1]], 0.8 * (1 - t));
    }
}

// 변신 중 스킬1: 반동이 없는 대신 짧은 후딜레이(이동 불가·침묵)를 둔다
class DemolitionistSkill1PostDelay {
    constructor(owner) {
        this.owner = owner;
        this.createdTime = Time.now;
        this.postDelay = 400; // 후딜레이(ms)
        this.damage = 0;
        this.hitPlayers = [];
    }

    update() {
        if (Time.now - this.createdTime < this.postDelay) {
            slow(this.owner, 0.1, 100);
            silence(this.owner, 0.1);
        }
    }

    isExpired() {
        const expired = Time.now - this.createdTime >= this.postDelay;
        if (expired) clearDashLock(this.owner, { silenceLock: true });
        return expired;
    }

    collidesWith() { return false; }

    // 후딜레이 동안 몸에서 열기 연기가 피어오름 (그림 2장, 화면 전용)
    draw(ctx) {
        const t = Math.min(1, (Time.now - this.createdTime) / this.postDelay);
        if (t >= 1 || this.owner.hidden) return;
        const r = this.owner.rect;
        for (let i = 0; i < 2; i++) {
            const ph = (t * 1.6 + i * 0.5) % 1;
            dmxDraw(ctx, DMX_SMOKE_IMAGE, r.centerx + (i ? 8 : -8), r.top + 6 - ph * 26, 26 + ph * 20, { alpha: 0.9 * (1 - ph) * (1 - t * 0.5), angle: ph * 2 + i });
        }
    }
}

class DemolitionistSkill1 extends Skill {
    constructor() { super('Trapezoid Shockwave', 1500); }

    use(owner, direction, attacks) {
        this.lastUsed = Time.now;
        attacks.push(new DemolitionistSkill1Effect(owner, direction));
        if (!owner.isTransformed) attacks.push(new DemolitionistRecoilManager(owner, direction));
        else attacks.push(new DemolitionistSkill1PostDelay(owner));
    }
}

// ==========================================
// [스킬 2] (변신 중에만) 돌진하며 지나간 자리에 3번 폭발
// ==========================================
class DemolitionistSkill2DashManager {
    constructor(owner, direction, attacks) {
        this.owner = owner;
        this.direction = direction;
        this.attacks = attacks;
        this.dashSpeed = 10.0;
        this.dashDuration = 450;
        this.createdTime = Time.now;
        this.damage = 0;
        this.hitPlayers = [];
        this.isDash = true;
        this.triggered = [true, false, false];

        this.spawnExplosion(1.5, 80); // 첫 폭발은 바로
    }

    spawnExplosion(mult, radius) {
        // 지나간 자리에 하늘에서 폭탄이 떨어지고, 땅에 닿는 순간(DMX_BOMB_FALL_MS 뒤) 터진다
        const cx = this.owner.rect.centerx, cy = this.owner.rect.centery;
        this.attacks.push(new DemolitionistBombDrop(this.owner, cx, cy, this.owner.baseAtk * mult, radius, this.attacks));
    }

    update(walls) {
        const elapsed = Time.now - this.createdTime;
        if (elapsed < this.dashDuration) {
            slow(this.owner, 0.1, 100);
            const ts = this.owner.timeScale;
            moveEntityWithWalls(this.owner, this.direction[0] * this.dashSpeed * ts, this.direction[1] * this.dashSpeed * ts, walls);
        }
        if (!this.triggered[1] && elapsed >= 225) {
            this.triggered[1] = true;
            this.spawnExplosion(1.5, 80);
        }
    }

    isExpired() {
        const expired = Time.now - this.createdTime >= this.dashDuration;
        if (expired && !this.triggered[2]) {
            this.triggered[2] = true;
            this.spawnExplosion(2.0, 100);
            clearDashLock(this.owner);
        }
        return expired;
    }

    collidesWith() { return false; }

    draw() {}
}

class DemolitionistSkill2 extends Skill {
    constructor() {
        super('Transform Trail Bomb', 3500, ['dash']);
        this.owner = null;
    }

    canUse() {
        if (this.owner && !this.owner.isTransformed) return false;
        return super.canUse();
    }

    use(owner, direction, attacks) {
        this.owner = owner;
        if (!owner.isTransformed) return;
        this.lastUsed = Time.now;
        attacks.push(new DemolitionistSkill2DashManager(owner, direction, attacks));
    }
}

// ==========================================
// [궁극기] 2초 무적으로 기를 모은 뒤 대폭발 → 15초 변신 (스킬 강화)
// ==========================================
class DemolitionistTransformManager {
    constructor(owner) {
        this.owner = owner;
        this.startTime = Time.now;
        this.duration = 15000;
        this.damage = 0;
        this.hitPlayers = [];
    }

    update() {}

    isExpired() {
        if (Time.now - this.startTime >= this.duration) {
            this.owner.isTransformed = false;
            if (this.owner.originalColor !== undefined) this.owner.color = this.owner.originalColor;
            if (this.owner.originalUltChargeRate !== undefined) this.owner.ultChargeRate = this.owner.originalUltChargeRate;
            this.owner.ultChargeMultiplier = 2.5;
            return true;
        }
        return false;
    }

    collidesWith() { return false; }

    // 머리 위 남은 변신 시간 막대 + 몸 주위로 올라가는 붉은 불씨 (코드, 3개)
    draw(ctx) {
        if (!this.owner.hidden) {
            const r = this.owner.rect;
            ctx.save(); ctx.globalCompositeOperation = 'lighter';
            for (let i = 0; i < 3; i++) {
                const ph = (Time.now / 900 + i / 3) % 1;
                ctx.fillStyle = `rgba(${DMX_RED}, ${0.8 * (1 - ph)})`;
                ctx.beginPath(); ctx.arc(r.centerx + Math.sin(ph * 7 + i * 2) * (r.w / 2 + 2), r.bottom - ph * (r.h + 14), 2.2 - ph, 0, Math.PI * 2); ctx.fill();
            }
            ctx.restore();
        }
        const progress = Math.max(0.0, Math.min(1.0, 1.0 - (Time.now - this.startTime) / this.duration));
        const barW = 32;
        const barH = 4;
        const x = this.owner.rect.centerx - barW / 2;
        const y = this.owner.rect.top - 22;
        ctx.fillStyle = '#1e1e23';
        ctx.fillRect(x, y, barW, barH);
        ctx.strokeStyle = 'rgb(138, 43, 226)';
        ctx.lineWidth = 1;
        ctx.strokeRect(x + 0.5, y + 0.5, barW - 1, barH - 1);
        const fillW = Math.trunc(barW * progress);
        if (fillW > 0) {
            ctx.fillStyle = 'rgb(138, 43, 226)';
            ctx.fillRect(x, y, fillW, barH);
        }
    }
}

class DemolitionistUltDelayField {
    constructor(owner, attacks) {
        this.owner = owner;
        this.attacks = attacks;
        this.damage = 0;
        this.hitPlayers = [];
        this.startTime = Time.now;
        this.duration = 3000;  // 경고 지속시간 (원래 2000ms)
        this.maxRadius = 180;
        this.expandTime = 300; // 0.3초 만에 최대 범위까지 커지고, 나머지 시간은 그대로 깜빡인다
        this.triggered = false;
        this.forceExpire = false;
    }

    update() {
        // 3초간 무적 + 이동 불가 + 침묵
        defenseMod(this.owner, 0.2, 100);
        slow(this.owner, 0.1, 100);
        silence(this.owner, 0.1);

        if (Time.now - this.startTime >= this.duration && !this.triggered) {
            this.triggered = true;
            this.forceExpire = true;

            // 폭발과 동시에 바로 움직일 수 있게 잠금을 푼다
            clearDashLock(this.owner, { silenceLock: true });

            const owner = this.owner;
            this.attacks.push(new DemolitionistExplosionEffect(
                owner, owner.rect.centerx, owner.rect.centery, 45.0, this.maxRadius, DMX_RED, 220, 400, { vivid: true, big: true }));
            Vfx.spawn(new DmxTransformVFX(owner));

            owner.isTransformed = true;
            if (owner.originalColor === undefined) owner.originalColor = owner.color;
            owner.color = '#8a2be2';
            if (owner.originalUltChargeRate === undefined) owner.originalUltChargeRate = owner.ultChargeRate;
            owner.ultChargeRate = 0.0;
            owner.ultChargeMultiplier = 0.0;

            this.attacks.push(new DemolitionistTransformManager(owner));
        }
    }

    isExpired() { return this.forceExpire; }

    collidesWith() { return false; }

    // 화면 전용: 지금 반지름(살짝 넘쳤다 돌아오는 확장)과 깜빡임 진행도(0~1)
    radiusAndFlicker() {
        const elapsed = Time.now - this.startTime;
        if (elapsed < this.expandTime) {
            const e = elapsed / this.expandTime, c = 1.70158;
            const back = 1 + (c + 1) * (e - 1) ** 3 + c * (e - 1) ** 2; // 끝에서 살짝 넘침
            return { radius: this.maxRadius * Math.max(0, back), flickerT: 0 };
        }
        return { radius: this.maxRadius, flickerT: (elapsed - this.expandTime) / (this.duration - this.expandTime) };
    }

    draw(ctx) {
        const { radius, flickerT } = this.radiusAndFlicker();
        if (radius <= 0) return;
        const cx = this.owner.rect.centerx, cy = this.owner.rect.centery;

        // 깜빡임: 점점 빨라지고, 마지막 0.5초는 아주 빠르게
        const freq = 1.2 + flickerT * flickerT * 7;
        const on = flickerT === 0 ? 1 : 0.5 + 0.5 * Math.sin((Time.now - this.startTime) * 0.001 * Math.PI * 2 * freq);
        const lvl = 0.45 + 0.45 * flickerT;

        // 바닥 위험 지역 (옅은 붉은 원)
        ctx.save();
        ctx.fillStyle = `rgba(255, 40, 30, ${(0.03 + 0.07 * on) * lvl})`;
        ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        // 경고 고리 (그림): 천천히 돌고, 깜빡임
        dmxDraw(ctx, DMX_WARN_IMAGE, cx, cy, radius * 2 * 100 / 92, { lighter: true, tint: DMX_RED_HEX, angle: (Time.now - this.startTime) * 0.0006, alpha: 0.5 + 0.6 * on * lvl });
        // 가운데로 모여드는 불씨 (코드)
        if (flickerT > 0.2) {
            const k = (flickerT - 0.2) / 0.8, n = 12;
            ctx.save(); ctx.globalCompositeOperation = 'lighter';
            for (let i = 0; i < n; i++) {
                const ph = ((Time.now - this.startTime) / (500 - 300 * k) + i / n) % 1;
                const ang = i / n * Math.PI * 2 + i * 0.7;
                const d = radius * (1 - ph) * 0.95;
                ctx.fillStyle = `rgba(255, 150, 80, ${(1 - ph) * 0.9 * k})`;
                ctx.beginPath(); ctx.arc(cx + Math.cos(ang) * d, cy + Math.sin(ang) * d, 2 + 2.5 * ph, 0, Math.PI * 2); ctx.fill();
            }
            ctx.restore();
        }
        // 몸에 모이는 불덩이 (점점 커지고 밝아짐)
        dmxDraw(ctx, DMX_FIRE_RED_IMAGE, cx, cy, 30 + 50 * flickerT, { lighter: true, angle: Time.now * 0.004, alpha: 0.25 + 0.6 * flickerT * (0.6 + 0.4 * on) });
        // 남은 시간 3·2·1
        const left = Math.ceil((this.duration - (Time.now - this.startTime)) / 1000);
        if (left > 0 && left <= 3) drawText(ctx, String(left), cx, this.owner.rect.top - 30, 22, `rgba(255, 90, 60, ${0.6 + 0.4 * on})`, { bold: true, align: 'center', baseline: 'middle' });
    }
}

// 궁극기 폭발 순간 변신: 보라 고리가 터지며 몸이 바뀐다 (화면 전용)
class DmxTransformVFX {
    constructor(owner) { this.owner = owner; this.duration = 0.5; this.elapsed = 0; }
    get finished() { return this.elapsed >= this.duration; }
    update(dt) { this.elapsed += dt; }
    draw(ctx) {
        const t = this.elapsed / this.duration, r = this.owner.rect;
        dmxDraw(ctx, DMX_RING_IMAGE, r.centerx, r.centery, 40 + 120 * dmxEaseOut(t), { lighter: true, tint: '#b450ff', alpha: 1.3 * (1 - t) });
        dmxDraw(ctx, DMX_RING_IMAGE, r.centerx, r.centery, 30 + 60 * dmxEaseOut(t), { lighter: true, tint: DMX_RED_HEX, alpha: 1.0 * (1 - t) });
    }
}

class DemolitionistUltSkill extends Skill {
    constructor() {
        super('Mega Blast Transform', 500, ['ult'], -99999);
        this.owner = null;
    }

    canUse() {
        if (this.owner && this.owner.isTransformed) return false;
        return super.canUse();
    }

    use(owner, direction, attacks) {
        this.owner = owner;
        if (owner.isTransformed) return;
        this.lastUsed = Time.now;
        attacks.push(new DemolitionistUltDelayField(owner, attacks));
    }
}

// ==========================================
// 캐릭터 등록
// ==========================================
function applyDemolitionist(player) {
    player.baseAtk = 13;
    player.maxHp = 100;
    player.hp = 100;
    player.speed = 4.3;
    player.isTransformed = false;
    player.ultChargeMultiplier = 2.5; // 패시브: 준 피해로 궁극기가 2.5배 빨리 찬다

    const skill2 = new DemolitionistSkill2();
    skill2.owner = player;
    const ult = new DemolitionistUltSkill();
    ult.owner = player;

    player.abilities = [new DemolitionistBasicSkill(), new DemolitionistSkill1(), skill2, ult];
}

const DEMOLITIONIST_CHARACTER_DATA = {
    id: 'DEMOLITIONIST',
    fxColor: '#ff8a3c',
    name: '폭파광',
    desc: '평타: 폭발물을 쏩니다(10), 강화 평타: 공속이 빨라집니다, 스킬 1: 사다리꼴 범위로 적을 밉니다(18), 강화 평타: 더 넓은 범위와 강한 대미지로 적을 공격합니다(29), 스킬 2(변신 중에만 사용 가능): 돌진하며 경로에 연속 폭발을 일으킵니다(20/20/26), 궁극기: 무적 상태가 되며 변신을 하며 폭발하고 스킬이 강화됩니다(45)',
    apply: applyDemolitionist,
    thumbnail: null,
};

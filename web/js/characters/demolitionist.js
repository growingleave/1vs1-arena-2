// 폭파광 (abilities/demolitionist.py를 옮김)

// 원 범위 판정 공통: 중심에서 반지름 안에 상대 중심이 들어오면 맞음
function hitsInCircle(attack, target, x, y, radius) {
    if (!canBeHit(attack, target) || attack.hitPlayers.includes(target)) return false;
    return Math.hypot(target.rect.centerx - x, target.rect.centery - y) <= radius;
}

// 기본 색 (fxColor 기준 주황, 변신 중엔 색은 유지하고 화려함만 키운다)
const DMX_ORANGE = '255, 150, 60';
const DMX_RED = '255, 60, 30';

// 이펙트 그림 (tools/demolitionist_gen.js로 생성)
const DMX_BLAST_IMAGE = loadImage('assets/dmx_blast.png');         // 280x280 평소 폭발 번쩍임 (멀티컬러, 가운데=그림 가운데) — 'lighter' 원본 그대로
const DMX_BLAST_RED_IMAGE = loadImage('assets/dmx_blast_red.png'); // 280x280 변신/궁극기 폭발 번쩍임 (더 붉은 멀티컬러) — 'lighter' 원본 그대로
const DMX_ROCKS_IMAGE = loadImage('assets/dmx_rocks.png');         // 280x280 날아가는 암석 파편, 가운데=그림 가운데 — 보통
const DMX_SMOKE_IMAGE = loadImage('assets/dmx_smoke2.png');        // 280x350 치솟는 검은 연기, 바닥 기준점 x=140,y=325 — 보통
const DMX_CRATER_IMAGE = loadImage('assets/dmx_crater.png');       // 280x280 바닥 크레이터/균열, 가운데=그림 가운데 — 보통
const DMX_SHOCK_IMAGE = loadImage('assets/dmx_shock.png');         // 280x150 평소 충격파 글로우(흰 빛), 뒤쪽 기준점 (20,75) — 색 입혀 'lighter'
const DMX_PILLAR_IMAGE = loadImage('assets/dmx_pillar.png');       // 100x200 변신 스킬2 착탄 불기둥, 바닥 기준점 x=50,y=195 — 'lighter' 원본 그대로
const DMX_DUST_IMAGE = loadImage('assets/dmx_dust.png');           // 150x150 옅은 회갈색 먼지, 가운데=그림 가운데 (밀림/후딜 궤적용) — 보통

// 판정 반지름(radius)에 그림 크기를 맞추기 위한 배율. tools/demolitionist_gen.js가 굽는 치수 기준으로 계산:
//   blast(280x280): 바깥 충격파 링이 반지름 195/250(half 97.5/125) = half폭(140)의 약 0.89 지점 → size = radius*2/0.89 ≈ radius*2.25, 여유 포함 2.5
//   rocks(280x280): 파편이 중심에서 최대거리 340(half 170) = half폭(280)의 약 0.61 지점 → size ≈ radius*3.3
//   crater(280x280): 그을림 반지름 230(half 115) = half폭(280)의 약 0.41 지점 → size ≈ radius*4.9
//   smoke(280x350): 가로 퍼짐이 중심에서 약 220(half폭 280)의 0.79 지점 → width = radius*2.6이면 거의 그대로 radius와 맞음
const DMX_FLASH_SCALE = 2.5;
const DMX_ROCKS_SCALE = 3.3;
const DMX_CRATER_SCALE = 4.9;
const DMX_SMOKE_SCALE = 2.6;
const DMX_PILLAR_SCALE = 0.9; // 불기둥 너비 = radius * 이 값

// 색 입힌 글로우 그림을 (x,y) 중심에 angle 회전, size(지름)로 그린다 ('lighter')
function dmxDrawGlow(ctx, img, color, x, y, size, angle, alpha) {
    if (!isImageReady(img) || alpha <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(x, y); ctx.rotate(angle);
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(vfxTinted(img, color), -size / 2, -size / 2, size, size);
    ctx.restore();
}

// 이미 색이 섞여 구워진 그림을 원본 색 그대로 'lighter'로 그린다 (추가 tint 없음)
function dmxDrawRaw(ctx, img, x, y, size, angle, alpha) {
    if (!isImageReady(img) || alpha <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(x, y); ctx.rotate(angle);
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(img, -size / 2, -size / 2, size, size);
    ctx.restore();
}

// 충격파 그림: 뒤쪽 기준점(그림의 20,75)을 (x,y)에 맞춰 angle 방향으로 뻗어나가게 그린다
function dmxDrawShock(ctx, color, x, y, angle, scale, alpha) {
    if (!isImageReady(DMX_SHOCK_IMAGE) || alpha <= 0) return;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.translate(x, y); ctx.rotate(angle); ctx.scale(scale, scale);
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(vfxTinted(DMX_SHOCK_IMAGE, color), -20, -75);
    ctx.restore();
}

// 먼지바람 (보통으로, 밝기 조절만)
function dmxDrawDust(ctx, x, y, size, alpha) {
    if (!isImageReady(DMX_DUST_IMAGE) || alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(DMX_DUST_IMAGE, x - size / 2, y - size / 2, size, size);
    ctx.restore();
}

// 가운데=그림 가운데인 "보통" 합성 그림을 (x,y)에 size로 그린다 (암석 파편/크레이터용)
function dmxDrawPlainCentered(ctx, img, x, y, size, alpha) {
    if (!isImageReady(img) || alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
    ctx.restore();
}

// 바닥 기준점(그림 가운데 아래쪽)이 (x,y)가 되도록 위로 치솟는 그림(연기/불기둥)을 그린다
function dmxDrawRising(ctx, img, x, y, width, anchorYFrac, alpha, lighter) {
    if (!isImageReady(img) || alpha <= 0) return;
    const scale = width / img.naturalWidth;
    const h = img.naturalHeight * scale;
    ctx.save();
    if (lighter) ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(img, x - width / 2, y - h * anchorYFrac, width, h);
    ctx.restore();
}

// 폭발 공통: 크레이터 → 연기 뭉치 → 암석 파편 (화면 전용, 폭파 느낌의 바탕)
// 번쩍임(메인 플래시, lifespan 300~400ms)보다 훨씬 오래(1~1.5초) 남아 서서히 사라지는 "잔존" 레이어
class DmxCraterVFX {
    constructor(x, y, radius) { this.x = x; this.y = y; this.size = radius * DMX_CRATER_SCALE; this.duration = 1.3; this.elapsed = 0; }
    get finished() { return this.elapsed >= this.duration; }
    update(dt) { this.elapsed += dt; }
    draw(ctx) { dmxDrawPlainCentered(ctx, DMX_CRATER_IMAGE, this.x, this.y, this.size, 0.95 * (1 - this.elapsed / this.duration)); }
}

class DmxSmokeVFX {
    constructor(x, y, radius) { this.x = x; this.y = y; this.width = radius * DMX_SMOKE_SCALE; this.duration = 1.4; this.elapsed = 0; }
    get finished() { return this.elapsed >= this.duration; }
    update(dt) { this.elapsed += dt; }
    draw(ctx) {
        const t = this.elapsed / this.duration;
        const riseIn = t < 0.12 ? t / 0.12 : 1;
        dmxDrawRising(ctx, DMX_SMOKE_IMAGE, this.x, this.y - t * this.width * 0.5, this.width * (0.8 + 0.6 * t), 0.93, 0.72 * (1 - t) * riseIn, false);
    }
}

class DmxRocksVFX {
    constructor(x, y, radius, vivid) { this.x = x; this.y = y; this.size = radius * DMX_ROCKS_SCALE * (vivid ? 1.08 : 1); this.duration = 1.2; this.elapsed = 0; }
    get finished() { return this.elapsed >= this.duration; }
    update(dt) { this.elapsed += dt; }
    draw(ctx) {
        const t = this.elapsed / this.duration;
        const scale = 0.88 + 0.25 * Math.min(1, t * 2.5);
        const fade = t < 0.3 ? 1 : 1 - (t - 0.3) / 0.7; // 잠깐 또렷하게 머물다 서서히 사라짐
        dmxDrawPlainCentered(ctx, DMX_ROCKS_IMAGE, this.x, this.y, this.size * scale, fade);
    }
}

// 변신 스킬2 착탄 불기둥 (화면 전용)
class DmxPillarVFX {
    constructor(x, y, radius) { this.x = x; this.y = y; this.width = radius * DMX_PILLAR_SCALE; this.duration = 0.35; this.elapsed = 0; }
    get finished() { return this.elapsed >= this.duration; }
    update(dt) { this.elapsed += dt; }
    draw(ctx) {
        const t = this.elapsed / this.duration;
        dmxDrawRising(ctx, DMX_PILLAR_IMAGE, this.x, this.y, this.width * (1 - 0.2 * t), 0.975, 0.95 * (1 - t), true);
    }
}

// 폭발 중심에서 튀는 불똥 (화면 전용)
class DmxBlastSparkVFX extends SparkVFX {
    constructor(x, y, color, radius, vivid) {
        super(color);
        this.duration = 0.4;
        const n = vivid ? 18 : 10;
        for (let i = 0; i < n; i++) this.addSpark(x, y, vfxRand(0, Math.PI * 2), vfxRand(80, radius * 2.2), vfxRand(0.2, 0.45), vfxRand(1.5, 3));
    }
    get finished() { return this.elapsed >= this.duration && this.sparksDone; }
    draw(ctx) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; this.drawSparks(ctx); ctx.restore(); }
}

// 스킬1 사용 순간 앞으로 튀는 불똥 (화면 전용)
class DmxShockBurstVFX extends SparkVFX {
    constructor(x, y, angle, color, vivid) {
        super(color);
        this.duration = 0.3;
        const n = vivid ? 20 : 12;
        for (let i = 0; i < n; i++) this.addSpark(x, y, angle + vfxRand(-0.5, 0.5), vfxRand(150, vivid ? 480 : 340), vfxRand(0.18, 0.4), vfxRand(1.5, 3));
    }
    get finished() { return this.elapsed >= this.duration && this.sparksDone; }
    draw(ctx) { ctx.save(); ctx.globalCompositeOperation = 'lighter'; this.drawSparks(ctx); ctx.restore(); }
}

// 스킬1에 밀려나는 상대 뒤로 남는 먼지 궤적 (화면 전용, forcedMove 지속시간과 비슷하게 짧음)
class DmxPushTrailVFX {
    constructor(target, direction) {
        this.target = target; this.direction = direction; this.duration = 0.3; this.elapsed = 0;
    }
    get finished() { return this.elapsed >= this.duration || this.target.hidden; }
    update(dt) { this.elapsed += dt; }
    draw(ctx) {
        if (this.target.hidden) return;
        const r = this.target.rect, t = this.elapsed / this.duration;
        for (let i = 0; i < 3; i++) {
            const back = 10 + i * 14 + t * 10;
            dmxDrawDust(ctx, r.centerx - this.direction[0] * back, r.centery - this.direction[1] * back, 34 - i * 6, 0.35 * (1 - t));
        }
    }
}

// 변신 스킬2 폭발 전: 위에서 폭탄이 빠르게 떨어져 땅에 닿는 느낌의 짧은 선딜 연출 (화면 전용, 실제 폭발 타이밍은 그대로)
class DmxFallingBombVFX {
    constructor(x, y) {
        this.x = x; this.y = y; this.duration = 0.14; this.elapsed = 0; this.dropHeight = 130;
    }
    get finished() { return this.elapsed >= this.duration; }
    update(dt) { this.elapsed += dt; }
    draw(ctx) {
        const t = Math.min(1, this.elapsed / this.duration);
        const fall = 1 - t;
        const y = this.y - this.dropHeight * fall;
        const shadowScale = 0.3 + 0.7 * t;
        ctx.save();
        ctx.globalAlpha = 0.35 * (0.5 + 0.5 * t);
        ctx.fillStyle = '#000';
        ctx.beginPath(); ctx.ellipse(this.x, this.y, 16 * shadowScale, 7 * shadowScale, 0, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = 0.9 * t + 0.1;
        ctx.fillStyle = '#2b2b30';
        ctx.beginPath(); ctx.arc(this.x, y, 7, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(${DMX_RED}, ${0.5 * fall})`;
        ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(this.x, y - 14 * fall); ctx.lineTo(this.x, y); ctx.stroke();
        ctx.restore();
    }
}

// ==========================================
// 폭발 이펙트 (벽 관통)
// ==========================================
class DemolitionistExplosionEffect {
    constructor(owner, x, y, damage, radius, color = DMX_ORANGE, maxAlpha = 230, lifespan = 300, { vivid = false } = {}) {
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
        this.vivid = vivid; // 변신/궁극기: 더 붉은 멀티컬러 + 화려한 파티클
        this.useRed = color === DMX_RED;

        Vfx.spawn(new DmxCraterVFX(x, y, radius));
        Vfx.spawn(new DmxSmokeVFX(x, y, radius));
        Vfx.spawn(new DmxRocksVFX(x, y, radius, vivid));
        Vfx.spawn(new DmxBlastSparkVFX(x, y, `rgb(${color})`, radius, vivid));
    }

    update() {}

    isExpired() { return Time.now - this.createdTime >= this.lifespan; }

    collidesWith(target) {
        return hitsInCircle(this, target, this.posX, this.posY, this.radius);
    }

    draw(ctx) {
        const progress = Math.min(1.0, Math.max(0.0, (Time.now - this.createdTime) / this.lifespan));
        const grow = 1 - (1 - progress) ** 2; // 빠르게 커졌다가 서서히 사라짐
        const size = this.radius * DMX_FLASH_SCALE * (0.4 + 0.6 * grow);
        const alpha = (this.maxAlpha / 255) * (1 - progress) * (this.vivid ? 1.3 : 1);
        dmxDrawRaw(ctx, this.useRed ? DMX_BLAST_RED_IMAGE : DMX_BLAST_IMAGE, this.posX, this.posY, size, 0, alpha);
    }
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
        this.attacks.push(new DemolitionistExplosionEffect(this.owner, this.posX, this.posY, this.explosionDamage, this.explosionRadius));
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
        drawCircle(ctx, Math.trunc(this.posX), Math.trunc(this.posY), 6, 'rgb(100, 100, 100)');
        drawCircle(ctx, Math.trunc(this.posX), Math.trunc(this.posY), 3, 'rgb(255, 69, 0)');
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
// 변신 스킬1 사다리꼴 범위 안에서 "쪼개지는 폭발"을 연출할 지점들 (로컬 x: -30=뒤쪽 ~ 90=앞쪽 끝)
const DMX_SKILL1_BURST_T = [0.15, 0.5, 0.85];

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

        Vfx.spawn(new DmxShockBurstVFX(owner.rect.centerx, owner.rect.centery, this.screenAngle, `rgb(${DMX_ORANGE})`, this.isTransformed));

        if (this.isTransformed) {
            // 사다리꼴(로컬 x:-30~90, 반높이 25→65) 안을 따라 3곳이 순서대로 터지는 "폭파" 연출.
            // 암석 파편 + 연기는 메인 플래시보다 오래 남게(DmxRocksVFX/DmxSmokeVFX 자체 수명) 한 번만 생성.
            this.bursts = DMX_SKILL1_BURST_T.map((t) => {
                const lx = -30 + t * 120;
                const halfH = 25 + t * (65 - 25);
                const [wx, wy] = transformLocalPoints(this.posX, this.posY, this.angle, [[lx, 0]])[0];
                Vfx.spawn(new DmxRocksVFX(wx, wy, halfH, true));
                Vfx.spawn(new DmxSmokeVFX(wx, wy, halfH));
                return { wx, wy, radius: halfH };
            });
        }
    }

    getTrapPoints() {
        const local = this.isTransformed
            ? [[-30, -25], [90, -65], [90, 65], [-30, 25]]
            : [[-20, -18], [60, -45], [60, 45], [-20, 18]];
        return transformLocalPoints(this.posX, this.posY, this.angle, local);
    }

    update() {}

    isExpired() { return Time.now - this.createdTime >= this.lifespan; }

    collidesWith(target) {
        if (!canBeHit(this, target) || this.hitPlayers.includes(target)) return false;
        return checkPolygonCollision(this.getTrapPoints(), target.rect);
    }

    applyEffect(target) {
        const pushed = !this.isTransformed;
        if (pushed) forcedMove(target, 0.3, 350.0, this.direction);
        Vfx.spawn(new HitSparkVFX(target.rect.centerx, target.rect.centery, {
            color: this.isTransformed ? '#ffd27a' : `rgb(${DMX_ORANGE})`,
            angle: this.screenAngle, count: pushed ? 16 : 10, size: pushed ? 26 : 18,
        }));
        if (pushed) Vfx.spawn(new DmxPushTrailVFX(target, this.direction));
    }

    draw(ctx) {
        const progress = Math.min(1, Math.max(0, (Time.now - this.createdTime) / this.lifespan));
        if (this.isTransformed) {
            // 뒤쪽부터 앞쪽으로 순서대로 터지는 연쇄 폭발 (각 burst는 시간차를 두고 커졌다 사라진다)
            this.bursts.forEach((b, i) => {
                const stagger = i * 0.16;
                const localT = Math.min(1, Math.max(0, (progress - stagger) / (1 - stagger)));
                if (localT <= 0) return;
                const grow = 1 - (1 - localT) ** 2;
                const size = b.radius * DMX_FLASH_SCALE * 1.1 * (0.4 + 0.6 * grow);
                dmxDrawRaw(ctx, DMX_BLAST_RED_IMAGE, b.wx, b.wy, size, 0, 1.2 * (1 - localT));
            });
        } else {
            const fade = 1 - progress;
            const cx = this.owner.rect.centerx, cy = this.owner.rect.centery;
            const scale = 0.45 * (0.85 + 0.3 * progress);
            dmxDrawShock(ctx, `rgb(${DMX_ORANGE})`, cx, cy, this.screenAngle, scale, 1.1 * fade);
        }
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
        }
    }

    isExpired() {
        const expired = Time.now - this.createdTime >= this.dashDuration;
        if (expired) clearDashLock(this.owner, { silenceLock: true });
        return expired;
    }

    collidesWith() { return false; }

    // 뒤로 튕겨나가는 동안 본인 몸 뒤로 밀려나는 먼지 (화면 전용)
    draw(ctx) {
        const t = Math.min(1, (Time.now - this.createdTime) / this.dashDuration);
        if (t >= 1 || this.owner.hidden) return;
        const r = this.owner.rect;
        for (let i = 0; i < 3; i++) {
            const back = 6 + i * 12 + t * 14;
            dmxDrawDust(ctx, r.centerx - this.direction[0] * back, r.centery - this.direction[1] * back, 30 - i * 5, 0.3 * (1 - t));
        }
    }
}

// 변신 중 스킬1: 반동이 없는 대신 짧은 후딜레이(이동 불가·침묵)를 둔다
class DemolitionistSkill1PostDelay {
    constructor(owner) {
        this.owner = owner;
        this.createdTime = Time.now;
        this.postDelay = 220; // 후딜레이(ms)
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

    draw() {}
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
        // 폭탄이 위에서 떨어져 착탄하는 짧은 선딜 연출 + 불기둥 (화면 전용, 폭발 타이밍·판정은 그대로)
        const cx = this.owner.rect.centerx, cy = this.owner.rect.centery;
        Vfx.spawn(new DmxFallingBombVFX(cx, cy));
        Vfx.spawn(new DmxPillarVFX(cx, cy, radius));
        this.attacks.push(new DemolitionistExplosionEffect(
            this.owner, cx, cy, this.owner.baseAtk * mult, radius,
            DMX_RED, 200, 300, { vivid: true }));
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

    // 머리 위 남은 변신 시간 막대
    draw(ctx) {
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
        this.duration = 3000;      // 경고 지속시간 (2000 → 3000ms, 터지기 전 긴장감)
        this.maxRadius = 180;
        this.expandPortion = 0.25; // 앞쪽 25% 구간에서 빠르게 최대범위까지 확장, 나머지는 유지하며 깜빡임
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
                owner, owner.rect.centerx, owner.rect.centery, 45.0, this.maxRadius, DMX_RED, 220, 400, { vivid: true }));

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

    // 현재 반지름과 깜빡임 진행도(0~1, 확장 구간이면 0) — 화면 전용 계산
    radiusAndFlicker() {
        const elapsed = Time.now - this.startTime;
        const expandTime = this.duration * this.expandPortion;
        if (elapsed < expandTime) {
            const e = elapsed / expandTime;
            return { radius: this.maxRadius * (1 - (1 - e) ** 3), flickerT: 0 };
        }
        return { radius: this.maxRadius, flickerT: (elapsed - expandTime) / (this.duration - expandTime) };
    }

    draw(ctx) {
        const { radius, flickerT } = this.radiusAndFlicker();
        if (radius <= 0) return;
        const cx = this.owner.rect.centerx, cy = this.owner.rect.centery;

        // 점점 빨라지는 깜빡임 (터지기 직전이 가장 급박)
        const freq = 1.1 + flickerT * flickerT * 5.5;
        const pulse = flickerT > 0 ? (0.55 + 0.45 * Math.sin(Time.now * 0.001 * Math.PI * 2 * freq)) : 1;
        const baseAlpha = flickerT > 0 ? (0.45 + 0.4 * flickerT) : 0.35;
        const alpha = baseAlpha * pulse;

        drawCircle(ctx, cx, cy, radius - 1.5, null, `rgba(255, 90, 40, ${alpha})`, flickerT > 0.7 ? 4 : 3);

        // 가운데 코어 글로우 (구운 그림, 색 입혀 'lighter') — 깜빡일수록 밝아짐
        const coreAlpha = (flickerT > 0 ? 0.5 + 0.6 * flickerT * pulse : 0.3) * (radius / this.maxRadius);
        dmxDrawGlow(ctx, DMX_BLAST_IMAGE, '#ff5a30', cx, cy, radius * 1.1, 0, coreAlpha);

        // 터지기 직전: 범위 안에서만 안쪽으로 모여드는 불꽃 (화면 전체 번쩍임 없음)
        if (flickerT > 0.35) {
            const k = (flickerT - 0.35) / 0.65;
            const n = 10;
            for (let i = 0; i < n; i++) {
                const ph = (Time.now / (420 - 250 * k) + i / n) % 1;
                const ang = i / n * Math.PI * 2 + Time.now * 0.0015;
                const d = radius * (1 - ph) * 0.95;
                const a = (1 - ph) * 0.8 * k;
                ctx.fillStyle = `rgba(255, 170, 90, ${a})`;
                ctx.beginPath(); ctx.arc(cx + Math.cos(ang) * d, cy + Math.sin(ang) * d, 2.5 + 2 * ph, 0, Math.PI * 2); ctx.fill();
            }
        }
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

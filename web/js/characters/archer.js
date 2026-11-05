const ARCHER_IMAGE = loadImage('assets/archer.png'); // 몸 그림
// 궁수 (abilities/archer.py를 옮김)

// 평타 화살 종류: 충격(맞으면 밀쳐냄) → 폭파 → 감속 (원래 '철 화살' 자리를 충격 화살이 대신함)
const ARROW_TYPES = ['impact', 'explosive', 'slow'];
const ARROW_COLORS = { impact: '111, 180, 255', explosive: '255, 120, 40', slow: '127, 224, 255' };
const ARROW_LABELS = { impact: '충격 화살', explosive: '폭파 화살', slow: '감속 화살' };

// 그림 (tools/archer_gen.js로 생성, 물체 그림이라 보통으로)
const ARCHER_BOW_IMAGE = loadImage('assets/archer_bow.png');       // 132x322 갈색·초록 활 + 연두 빛 테두리, 쏘는 방향 = 오른쪽, 손잡이 (87,161), 줄 고리 위 (31,12)·아래 (31,310), 보석 (88,126)
const ARCHER_BOW_GLOW_IMAGE = loadImage('assets/archer_bow_glow.png'); // 132x322 당길수록 활 전체가 빛나는 그림 ('lighter', 같은 좌표)
const ARCHER_ARROW_IMAGES = {                                 // 120x24 화살, 오른쪽을 향함, 오늬 x 1, 촉 끝 x 118
    impact: loadImage('assets/archer_arrow_impact.png'),
    explosive: loadImage('assets/archer_arrow_explosive.png'),
    slow: loadImage('assets/archer_arrow_frost.png'),
    homing: loadImage('assets/archer_arrow_homing.png'),
};
const ARCHER_PURPLE = '#a55cff';

// 화살 그림: (x,y)가 화살 가운데, angle은 화면 각도(라디안), len은 그릴 화살 길이
// 그림은 화살(120x24) 둘레에 빛 테두리 여백 6px이 붙은 132x36 → 같은 배율로 여백까지 그린다. 세로는 1.35배 굵게
// trail이면 뒤로 화살 색 빛 꼬리를 짧게 그린다 (날아가는 화살)
const ARCHER_ARROW_GLOW = { impact: '111, 180, 255', explosive: '255, 138, 64', slow: '159, 236, 255', homing: '180, 120, 255' };
function drawArcherArrow(ctx, type, x, y, angle, len, trail = false) {
    const img = ARCHER_ARROW_IMAGES[type];
    if (!isImageReady(img)) return;
    const k = len / 120, sy = 1.35;
    ctx.save(); ctx.translate(x, y); ctx.rotate(angle);
    if (trail) {
        const g = ctx.createLinearGradient(-len * 1.3, 0, -len * 0.3, 0);
        g.addColorStop(0, `rgba(${ARCHER_ARROW_GLOW[type]}, 0)`); g.addColorStop(1, `rgba(${ARCHER_ARROW_GLOW[type]}, 0.55)`);
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = g; ctx.beginPath(); ctx.moveTo(-len * 1.3, 0); ctx.lineTo(-len * 0.35, -len * 0.05); ctx.lineTo(-len * 0.35, len * 0.05); ctx.closePath(); ctx.fill();
        ctx.restore();
    }
    ctx.drawImage(img, -66 * k, -18 * k * sy, 132 * k, 36 * k * sy);
    ctx.restore();
}

// 활 그림 + 코드로 그린 시위: 손잡이가 몸 앞 34px, 쏘는 방향을 보게. 활 몸체 높이 90px
// drawRatio(0~1)만큼 시위를 뒤로 당기고, 당길수록 시위·보석·활 전체가 붉게 빛난다. 화살 거는 곳을 돌려준다
function drawArcherBow(ctx, cx, cy, facing, drawRatio, alpha = 1) {
    const [fx, fy] = normalizeOr(facing);
    const ang = Math.atan2(fy, fx), k = 90 / 298;            // 그림 속 활 몸체 높이 298 → 90px
    const gx = cx + fx * 34, gy = cy + fy * 34;               // 손잡이 위치
    const local = (lx, ly) => [gx + (lx * Math.cos(ang) - ly * Math.sin(ang)) * k, gy + (lx * Math.sin(ang) + ly * Math.cos(ang)) * k];
    const tip1 = local(31 - 87, 12 - 161), tip2 = local(31 - 87, 310 - 161);
    const rest = local(31 - 87, 0);
    const pull = 28 * drawRatio;
    const nock = [rest[0] - fx * pull, rest[1] - fy * pull];
    const glow = drawRatio * drawRatio;
    ctx.save();
    ctx.globalAlpha = alpha;
    // 시위 (당길수록 붉은 빛)
    if (glow > 0) {
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(160, 240, 90, ${0.5 * glow * alpha})`; ctx.lineWidth = 4;
        ctx.beginPath(); ctx.moveTo(tip1[0], tip1[1]); ctx.lineTo(nock[0], nock[1]); ctx.lineTo(tip2[0], tip2[1]); ctx.stroke();
        ctx.restore();
    }
    ctx.strokeStyle = '#d8d8de'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(tip1[0], tip1[1]); ctx.lineTo(nock[0], nock[1]); ctx.lineTo(tip2[0], tip2[1]); ctx.stroke();
    ctx.translate(gx, gy); ctx.rotate(ang);
    if (isImageReady(ARCHER_BOW_IMAGE)) ctx.drawImage(ARCHER_BOW_IMAGE, -87 * k, -161 * k, 132 * k, 322 * k);
    if (glow > 0) {
        ctx.globalCompositeOperation = 'lighter';
        // 활 전체 빛 (다 당겨도 너무 밝지 않게 최대 0.5)
        if (isImageReady(ARCHER_BOW_GLOW_IMAGE)) { ctx.globalAlpha = alpha * 0.5 * glow; ctx.drawImage(ARCHER_BOW_GLOW_IMAGE, -87 * k, -161 * k, 132 * k, 322 * k); }
        // 손잡이 보석 빛
        const r = 4 + 9 * drawRatio, bx = 1 * k, by = -35 * k;
        const g = ctx.createRadialGradient(bx, by, 0, bx, by, r);
        g.addColorStop(0, 'rgba(230, 255, 200, 0.9)'); g.addColorStop(1, 'rgba(140, 230, 70, 0)');
        ctx.globalAlpha = alpha * drawRatio; ctx.fillStyle = g; ctx.beginPath(); ctx.arc(bx, by, r, 0, Math.PI * 2); ctx.fill();
    }
    ctx.restore();
    return nock;
}

// 충격 화살 적중: 파란 충격 고리가 퍼짐 (화면 전용)
class ArcherImpactVFX {
    constructor(x, y, angle) { this.x = x; this.y = y; this.angle = angle; this.elapsed = 0; this.duration = 0.28; }
    get finished() { return this.elapsed >= this.duration; }
    update(dt) { this.elapsed += dt; }
    draw(ctx) {
        const t = this.elapsed / this.duration, a = 1 - t;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.translate(this.x, this.y); ctx.rotate(this.angle);
        for (const [r0, w] of [[10, 3], [4, 2]]) {
            ctx.strokeStyle = `rgba(111, 180, 255, ${a})`; ctx.lineWidth = w * a + 1;
            ctx.beginPath(); ctx.ellipse(6 + 14 * t, 0, (r0 + 18 * t) * 0.55, r0 + 18 * t, 0, 0, Math.PI * 2); ctx.stroke();
        }
        ctx.restore();
    }
}
const MAX_CHARGE_TIME = 900; // 이 시간(ms) 이상 누르고 있으면 최대 충전

// 화면 밖도 벽으로 친다
function hitsScreenEdge(rect) {
    return rect.left < 0 || rect.right > WIDTH || rect.top < 0 || rect.bottom > HEIGHT;
}

// 벽·화면 끝 판정은 가운데 작은 판정으로 (world.js의 wallCoreRect)
function hitsAnyWall(rect) {
    const core = wallCoreRect(rect);
    return hitsScreenEdge(core) || CURRENT_WALLS.some(wall => core.colliderect(wall.rect));
}

function scaledDamage(owner, chargeRatio) {
    return owner.baseAtk * (0.5 + 1.5 * chargeRatio);
}

// ==========================================
// 폭파 화살의 폭발 (피해는 폭발이 준다)
// ==========================================
class ArcherExplosion {
    constructor(owner, x, y, damage, radius) {
        this.owner = owner;
        this.posX = x;
        this.posY = y;
        this.damage = damage;
        this.radius = radius;
        this.createdTime = Time.now;
        this.lifespan = 260;
        this.hitPlayers = [];
        this.canPenetrateWalls = true;
        Vfx.spawn(new DmxBoomVFX(x, y, radius, {})); // 폭발 그림은 폭파광과 같은 폭발 (화면 전용)
    }

    update() {}

    isExpired() { return Time.now - this.createdTime >= this.lifespan; }

    collidesWith(target) {
        if (!canBeHit(this, target)) return false;
        return Math.hypot(target.rect.centerx - this.posX, target.rect.centery - this.posY) <= this.radius;
    }

    draw() {}
}

// ==========================================
// 평타 화살 (충격/폭파/감속). 3연사로 쏜 화살은 벽에 3번 튕긴다
// ==========================================
class ArcherArrow {
    constructor(owner, direction, attacks, chargeRatio, arrowType, bounces = 0) {
        this.owner = owner;
        this.direction = direction;
        this.attacks = attacks;
        this.arrowType = arrowType;
        this.chargeRatio = chargeRatio;
        this.bouncesRemaining = bounces;
        this.hitPlayers = [];
        this.exploded = false;

        this.speed = 16.0;
        this.createdTime = Time.now;
        this.lifespan = 2000;
        this.maxRange = 250 + 500 * chargeRatio; // 짧게 당길수록 사거리도 짧다

        this.width = 14 + 14 * chargeRatio;
        this.height = 6 + 6 * chargeRatio;

        this.damage = arrowType === 'explosive' ? 0.0 : scaledDamage(owner, chargeRatio);
        this.explosionDamage = scaledDamage(owner, chargeRatio) * 1.3;
        this.explosionRadius = 40 + 50 * chargeRatio;

        this.posX = owner.rect.centerx + direction[0] * 22;
        this.posY = owner.rect.centery + direction[1] * 22;
        this.startX = this.posX;
        this.startY = this.posY;
        this.angle = directionToAngle(direction);
        this.canPenetrateWalls = true; // 벽 충돌(튕김/폭발)은 직접 처리한다
    }

    getRect() {
        return new Rect(Math.trunc(this.posX - this.width / 2), Math.trunc(this.posY - this.height / 2),
                        Math.max(1, Math.trunc(this.width)), Math.max(1, Math.trunc(this.height)));
    }

    explode() {
        if (this.exploded) return;
        this.exploded = true;
        this.lifespan = 0;
        this.attacks.push(new ArcherExplosion(this.owner, this.posX, this.posY, this.explosionDamage, this.explosionRadius));
    }

    registerWallHit() {
        if (this.bouncesRemaining > 0) {
            this.bouncesRemaining -= 1;
        } else if (this.arrowType === 'explosive') {
            this.explode(); // 더 튕길 수 없을 때만 터진다
        } else {
            this.lifespan = 0;
        }
    }

    update() {
        if (this.exploded) return;
        const ts = this.owner.timeScale;
        const dx = this.direction[0] * this.speed * ts;
        const dy = this.direction[1] * this.speed * ts;
        let hitWall = false;

        this.posX += dx;
        if (hitsAnyWall(this.getRect())) {
            this.posX -= dx;
            this.direction = [-this.direction[0], this.direction[1]];
            hitWall = true;
        }

        this.posY += dy;
        if (hitsAnyWall(this.getRect())) {
            this.posY -= dy;
            this.direction = [this.direction[0], -this.direction[1]];
            hitWall = true;
        }

        this.angle = directionToAngle(this.direction);
        if (hitWall) this.registerWallHit();
    }

    isExpired() {
        if (this.exploded) return true;
        const timeOver = Time.now - this.createdTime >= this.lifespan;
        const outOfRange = Math.hypot(this.posX - this.startX, this.posY - this.startY) >= this.maxRange;
        if (outOfRange && this.arrowType === 'explosive') {
            this.explode();
            return true;
        }
        return timeOver || outOfRange;
    }

    collidesWith(target) {
        if (this.exploded || !canBeHit(this, target)) return false;
        if (!this.getRect().colliderect(target.rect)) return false;
        if (this.arrowType === 'explosive') {
            this.explode(); // 직격해도 폭발로 처리
            return false;
        }
        return true;
    }

    applyEffect(target) {
        const ang = Math.atan2(this.direction[1], this.direction[0]);
        if (this.arrowType === 'slow') {
            slow(target, 1.6, 20 + 45 * this.chargeRatio);
            Vfx.spawn(new HitSparkVFX(target.rect.centerx, target.rect.centery, { color: '#bff4ff', angle: ang, count: 10, size: 20 }));
        } else if (this.arrowType === 'impact') {
            // 충격 화살: 맞은 상대를 화살 방향으로 밀쳐낸다 (많이 당길수록 멀리, 약 40~100px)
            forcedMove(target, 0.2, 200 + 300 * this.chargeRatio, [this.direction[0], this.direction[1]]);
            Vfx.spawn(new ArcherImpactVFX(target.rect.centerx, target.rect.centery, ang));
            Vfx.spawn(new HitSparkVFX(target.rect.centerx, target.rect.centery, { color: '#6fb4ff', angle: ang, count: 10, size: 20 }));
            Vfx.shake(2 + 2 * this.chargeRatio, 0.1);
        }
        this.lifespan = 0;
    }

    draw(ctx) {
        if (this.exploded) return;
        drawArcherArrow(ctx, this.arrowType, this.posX, this.posY, Math.atan2(this.direction[1], this.direction[0]), 50 + 20 * this.chargeRatio, true);
    }
}

// ==========================================
// [평타] 누르고 있으면 활을 당기고, 떼면 쏜다
// ==========================================
class ArcherChargeManager {
    constructor(owner, attacks) {
        this.owner = owner;
        this.attacks = attacks;
        this.startTime = Time.now;
        this.damage = 0;
        this.hitPlayers = [];
        owner.archerCharging = true;
        owner.archerChargeRatio = 0.0;
    }

    update() {
        const ratio = Math.min(1.0, (Time.now - this.startTime) / MAX_CHARGE_TIME);
        this.owner.archerChargeRatio = ratio;
        slow(this.owner, 0.15, 60.0 * ratio); // 당길수록 내가 느려진다 (최대 60%)
    }

    fire() {
        const owner = this.owner;
        const ratio = owner.archerChargeRatio;
        const type = owner.archerArrowType;
        const dir = owner.facing;

        if (owner.archerTripleShotPending) {
            owner.archerTripleShotPending = false;
            const base = Math.atan2(dir[1], dir[0]);
            for (const offset of [-12, 0, 12]) {
                const a = base + offset * Math.PI / 180;
                this.attacks.push(new ArcherArrow(owner, [Math.cos(a), Math.sin(a)], this.attacks, ratio, type, 3));
            }
        } else {
            this.attacks.push(new ArcherArrow(owner, dir, this.attacks, ratio, type, 0));
        }
    }

    isExpired() {
        if (this.owner.input.skills[0]) return false;
        this.fire();
        this.owner.archerCharging = false;
        this.owner.archerChargeRatio = 0.0;
        return true;
    }

    collidesWith() { return false; }

    draw() {}
}

class ArcherBasicSkill extends Skill {
    constructor(owner) {
        super('Charged Shot', 400, ['projectile']);
        this.owner = owner;
    }

    canUse() {
        if (this.owner && this.owner.archerCharging) return false;
        return super.canUse();
    }

    use(owner, direction, attacks) {
        this.owner = owner;
        this.lastUsed = Time.now;
        attacks.push(new ArcherChargeManager(owner, attacks));
    }
}

// ==========================================
// [스킬 1] 화살 종류 바꾸기 (철 → 폭파 → 감속)
// ==========================================
class ArcherSwitchArrowSkill extends Skill {
    constructor() { super('Switch Arrow', 350, ['buff']); }

    use(owner) {
        this.lastUsed = Time.now;
        const idx = ARROW_TYPES.indexOf(owner.archerArrowType);
        owner.archerArrowType = ARROW_TYPES[(idx + 1) % ARROW_TYPES.length];
        owner.archerSwitchTimer = Time.now;
    }
}

// ==========================================
// [스킬 2] 다음 평타를 3연사 + 벽 튕김 3회로
// ==========================================
class ArcherTripleShotSkill extends Skill {
    constructor() { super('Triple Volley', 6000, ['buff']); }

    use(owner) {
        this.lastUsed = Time.now;
        owner.archerTripleShotPending = true;
    }
}

// ==========================================
// [궁극기] 앞쪽 120도로 유도 화살 5발
// ==========================================
class ArcherHomingArrow {
    constructor(owner, direction, damage) {
        this.owner = owner;
        this.direction = direction;
        this.damage = damage;
        this.speed = 8.5;
        this.turnRate = 3.0; // 틱당 최대 회전각(도)
        this.createdTime = Time.now;
        this.lifespan = 2500;
        this.hitPlayers = [];
        this.width = 16;
        this.height = 8;
        this.posX = owner.rect.centerx + direction[0] * 25;
        this.posY = owner.rect.centery + direction[1] * 25;
        this.angle = directionToAngle(direction);
        this.canPenetrateWalls = true; // 벽은 직접 처리 (튕기지 않고 사라짐)
        this.target = owner.opponent;
    }

    getRect() {
        return new Rect(Math.trunc(this.posX - this.width / 2), Math.trunc(this.posY - this.height / 2), this.width, this.height);
    }

    update() {
        if (this.target && this.target.hp > 0) {
            const toX = this.target.rect.centerx - this.posX;
            const toY = this.target.rect.centery - this.posY;
            if (toX !== 0 || toY !== 0) {
                const desired = Math.atan2(toY, toX) * 180 / Math.PI;
                const cur = Math.atan2(this.direction[1], this.direction[0]) * 180 / Math.PI;
                const diff = ((((desired - cur + 180) % 360) + 360) % 360) - 180; // 파이썬 % 와 같게 (항상 양수)
                const turn = Math.max(-this.turnRate, Math.min(this.turnRate, diff));
                const next = (cur + turn) * Math.PI / 180;
                this.direction = [Math.cos(next), Math.sin(next)];
            }
        }

        const ts = this.owner.timeScale;
        this.posX += this.direction[0] * this.speed * ts;
        this.posY += this.direction[1] * this.speed * ts;
        this.angle = directionToAngle(this.direction);

        if (hitsAnyWall(this.getRect())) this.lifespan = 0;
    }

    isExpired() { return Time.now - this.createdTime >= this.lifespan; }

    collidesWith(target) {
        return canBeHit(this, target) && this.getRect().colliderect(target.rect);
    }

    applyEffect(target) {
        this.lifespan = 0;
        Vfx.spawn(new HitSparkVFX(target.rect.centerx, target.rect.centery, { color: ARCHER_PURPLE, angle: Math.atan2(this.direction[1], this.direction[0]), count: 10, size: 20 }));
    }

    // 보라 초능력 화살: 뒤로 흔들리는 보라 빛 꼬리 + 주위 기운
    draw(ctx) {
        const ang = Math.atan2(this.direction[1], this.direction[0]), t = Time.now - this.createdTime;
        const bx = -this.direction[0], by = -this.direction[1], px = -by, py = bx;
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        for (let i = 1; i <= 5; i++) {
            const w = Math.sin(t * 0.02 + i) * 3;
            ctx.fillStyle = `rgba(165, 92, 255, ${0.35 - i * 0.05})`;
            ctx.beginPath(); ctx.arc(this.posX + bx * i * 7 + px * w, this.posY + by * i * 7 + py * w, 6 - i * 0.7, 0, Math.PI * 2); ctx.fill();
        }
        ctx.fillStyle = 'rgba(165, 92, 255, 0.18)'; ctx.beginPath(); ctx.arc(this.posX, this.posY, 13 + Math.sin(t * 0.015) * 2, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        drawArcherArrow(ctx, 'homing', this.posX, this.posY, ang, 54);
    }
}

// 궁극기 쏠 때 큰 활이 번쩍이는 연출 (피해 없음)
class ArcherUltCastEffect {
    constructor(owner, direction) {
        this.owner = owner;
        this.direction = direction;
        this.createdTime = Time.now;
        this.lifespan = 350;
        this.damage = 0;
        this.hitPlayers = [];
    }

    update() {}

    isExpired() { return Time.now - this.createdTime >= this.lifespan; }

    collidesWith() { return false; }

    draw(ctx) {
        const p = Math.min(1.0, (Time.now - this.createdTime) / this.lifespan);
        const drawRatio = Math.max(0.0, 1.0 - p * 1.6); // 끝까지 당겼다가 빠르게 놓는다
        const alpha = Math.max(0, Math.trunc(255 * (1.0 - p))) / 255;
        const fx = Math.max(-1, Math.min(1, this.direction[0]));
        const fy = Math.max(-1, Math.min(1, this.direction[1]));
        const cx = this.owner.rect.centerx;
        const cy = this.owner.rect.centery;

        // 보라 기운이 퍼지며 활을 끝까지 당겼다 놓는다
        ctx.save(); ctx.globalCompositeOperation = 'lighter';
        ctx.strokeStyle = `rgba(165, 92, 255, ${alpha})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, 20 + 40 * p, 0, Math.PI * 2); ctx.stroke();
        ctx.fillStyle = `rgba(165, 92, 255, ${0.3 * (1 - p)})`; ctx.beginPath(); ctx.arc(cx, cy, 30, 0, Math.PI * 2); ctx.fill();
        ctx.restore();
        drawArcherBow(ctx, cx, cy, [fx, fy], drawRatio, alpha);
    }
}

class ArcherUltSkill extends Skill {
    constructor() {
        super('Arrow Storm', 500, ['ult', 'projectile'], -99999);
        this.ultChargeRate = ULT_PASSIVE_RATE;
    }

    use(owner, direction, attacks) {
        this.lastUsed = Time.now;
        attacks.push(new ArcherUltCastEffect(owner, direction));

        const base = Math.atan2(direction[1], direction[0]);
        const damage = owner.baseAtk * 0.6;
        for (const offset of [-60, -30, 0, 30, 60]) {
            const a = base + offset * Math.PI / 180;
            attacks.push(new ArcherHomingArrow(owner, [Math.cos(a), Math.sin(a)], damage));
        }
    }
}

// ==========================================
// 캐릭터 등록
// ==========================================
function applyArcher(player) {
    player.spriteImage = ARCHER_IMAGE;
    // 몸 그림: 바닥이 히트박스 바닥에 닿고, 모든 캐릭터가 같은 배율 (tools/portrait_gen.js 출력값)
    player.spriteSize = 59; // 15% 키움
    player.spriteAnchor = [0.563, 0.661];
    player.maxHp = 245;
    player.maxUltGauge = 90; // 궁극기 게이지 통 (검사 100 기준)
    player.hp = player.maxHp;
    player.baseAtk = 13;
    player.speed = 4.5;
    player.archerArrowType = 'impact';
    player.archerCharging = false;
    player.archerChargeRatio = 0.0;
    player.archerTripleShotPending = false;
    player.archerSwitchTimer = -99999;

    player.abilities = [
        new ArcherBasicSkill(player),    // 평타 (누르고 있다가 떼면 발사)
        new ArcherSwitchArrowSkill(),    // 스킬 1 (화살 종류 바꾸기)
        new ArcherTripleShotSkill(),     // 스킬 2 (3연사 + 벽 튕김)
        new ArcherUltSkill(),            // 궁극기 (유도 화살)
    ];
    player.ultChargeRate = player.abilities[3].ultChargeRate;

    player.postDrawHooks.push((ctx) => {
        const r = player.rect;
        const color = ARROW_COLORS[player.archerArrowType];

        if (player.archerCharging) {
            // 발밑에 가로 충전 막대 (화살 색으로 채움, 앞쪽의 활과 겹치지 않게)
            const ratio = player.archerChargeRatio;
            const barW = r.w, barH = 5, gx = r.x, gy = r.bottom + 5;
            ctx.fillStyle = '#1e1e23';
            ctx.fillRect(gx, gy, barW, barH);
            ctx.strokeStyle = 'rgb(200, 200, 200)';
            ctx.lineWidth = 1;
            ctx.strokeRect(gx + 0.5, gy + 0.5, barW - 1, barH - 1);
            const fillW = Math.trunc(barW * ratio);
            if (fillW > 0) {
                ctx.fillStyle = `rgb(${color})`;
                ctx.fillRect(gx, gy, fillW, barH);
            }

            // 활과 시위에 걸린 화살 (3연사 대기 중이면 3발)
            const nock = drawArcherBow(ctx, r.centerx, r.centery, player.facing, ratio);
            const [fx, fy] = normalizeOr(player.facing);
            const len = 46, base = Math.atan2(fy, fx);
            const offsets = player.archerTripleShotPending ? [-12, 0, 12] : [0];
            for (const offset of offsets) {
                const a = base + offset * Math.PI / 180;
                drawArcherArrow(ctx, player.archerArrowType, nock[0] + Math.cos(a) * len / 2, nock[1] + Math.sin(a) * len / 2, a, len);
            }
        }

        // 화살을 바꾸면 잠깐 이름 표시
        if (Time.now - player.archerSwitchTimer < 700) {
            drawText(ctx, ARROW_LABELS[player.archerArrowType], r.centerx, r.top - 20, 18, COLOR_WHITE,
                     { bold: true, align: 'center', baseline: 'middle' });
        }
    });
}

const ARCHER_CHARACTER_DATA = {
    id: 'ARCHER',
    fxColor: '#a8e070',
    name: '궁수',
    desc: '평타(0.4초): 누르고 있으면 활을 당기고(최대 0.9초) 떼면 쏩니다. 많이 당길수록 강하고 멀리 갑니다(6.5~26, 사거리 250~750). 당기는 동안 최대 60% 느려집니다, 스킬 1(0.35초): 화살 종류를 바꿉니다(충격 → 폭발 → 감속), 충격 화살: 맞은 적을 밀쳐냅니다(40~100px), 폭발 화살: 닿은 곳에서 터집니다(8.5~34, 반경 40~90), 감속 화살: 1.6초 동안 슬로우(20~65%), 스킬 2(6초): 다음 평타가 3발로 나가고 벽에 3번까지 튕깁니다, 궁극기: 앞쪽 120도로 보라색 유도 화살 5발을 쏩니다(7.8씩)',
    apply: applyArcher,
    thumbnail: ARCHER_IMAGE,
};

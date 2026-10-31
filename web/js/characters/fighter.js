// 무투가 (abilities/fighter.py를 옮김)

const FIGHTER_IMAGE = loadImage('assets/fighter.png');

// 무투가 이펙트 색: 연주황 (팀과 상관없이 같은 색)
const FIGHTER_COLOR = '#ffb070';
const FIGHTER_RGB = [255, 176, 112];
const fighterRgba = (a) => `rgba(${FIGHTER_RGB[0]},${FIGHTER_RGB[1]},${FIGHTER_RGB[2]},${a})`;

// 기(氣) 주먹 그림 (tools/fighter_fist_gen.js로 생성, 110x100, 주먹 마디가 오른쪽, 가운데 x 60 y 50, 색이 들어 있음)
const FIGHTER_FIST_IMAGE = loadImage('assets/fighter_fist.png');

// 주먹 그림을 (x, y)에 angle(라디안) 방향으로, 가로 size px 크기로
function drawFighterFist(ctx, x, y, angle, size, alpha) {
    if (!isImageReady(FIGHTER_FIST_IMAGE) || alpha <= 0) return;
    const k = size / 110;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(FIGHTER_FIST_IMAGE, -60 * k, -50 * k, 110 * k, 100 * k);
    ctx.restore();
}

// 평타 이펙트: 큰 주먹이 내려와(작아지며 진해짐) 바닥을 찍고, 충격파 고리·갈라짐·먼지
class FighterSlamVFX extends SparkVFX {
    constructor(x, y, angle, windup) {
        super(FIGHTER_COLOR);
        this.x = x; this.y = y; this.angle = angle;
        this.windup = windup;      // 내려오는 시간(초)
        this.duration = windup + 0.3;
        this.impacted = false;
        this.cracks = [];
        for (let i = 0; i < 6; i++) this.cracks.push({ a: angle + vfxRand(-Math.PI, Math.PI), len: vfxRand(14, 30) });
    }

    get finished() { return this.elapsed >= this.duration && this.sparksDone; }

    update(dt) {
        super.update(dt);
        if (!this.impacted && this.elapsed >= this.windup) {
            this.impacted = true;
            for (let i = 0; i < 8; i++) this.addSpark(this.x, this.y, vfxRand(0, Math.PI * 2), vfxRand(80, 200), vfxRand(0.12, 0.25), vfxRand(1, 2));
        }
    }

    draw(ctx) {
        const t = this.elapsed;
        ctx.save();
        if (t < this.windup) {
            const u = t / this.windup;
            drawFighterFist(ctx, this.x, this.y, this.angle, 70 - 26 * u, 0.35 + 0.65 * u);
        } else {
            const u = Math.min(1, (t - this.windup) / 0.3), a = 1 - u;
            drawFighterFist(ctx, this.x, this.y, this.angle, 44, a);
            ctx.globalCompositeOperation = 'lighter';
            ctx.lineWidth = 3 * a + 0.5;
            ctx.strokeStyle = fighterRgba(0.9 * a);
            ctx.beginPath(); ctx.ellipse(this.x, this.y, 14 + 34 * u, (14 + 34 * u) * 0.6, this.angle, 0, Math.PI * 2); ctx.stroke();
            ctx.lineWidth = 2;
            ctx.strokeStyle = fighterRgba(0.8 * a);
            for (const c of this.cracks) {
                const l = c.len * Math.min(1, u * 4);
                ctx.beginPath(); ctx.moveTo(this.x, this.y);
                ctx.lineTo(this.x + Math.cos(c.a) * l * 0.5 + Math.sin(c.a) * 3, this.y + Math.sin(c.a) * l * 0.5 - Math.cos(c.a) * 3);
                ctx.lineTo(this.x + Math.cos(c.a) * l, this.y + Math.sin(c.a) * l); ctx.stroke();
            }
            ctx.globalCompositeOperation = 'source-over';
            for (let i = 0; i < 6; i++) {
                const da = this.angle + i / 6 * Math.PI * 2, d = 20 + 22 * u;
                ctx.fillStyle = `rgba(210,190,170,${0.35 * a})`;
                ctx.beginPath(); ctx.arc(this.x + Math.cos(da) * d, this.y + Math.sin(da) * d * 0.7, 4 + 4 * u, 0, Math.PI * 2); ctx.fill();
            }
        }
        this.drawSparks(ctx);
        ctx.restore();
    }
}

// 돌려차기 이펙트: 발끝(빛나는 머리)이 플레이어 둘레를 한 바퀴 쓸고 지나간다
// - 굵은 호(꼬리일수록 옅고 가늘게) + 안팎의 가는 바람결 호 + 흰 날
// - 발끝에서 바깥(접선) 방향으로 튀는 불꽃
// - 다 돌면 충격파 고리 두 겹 + 바깥으로 뻗는 바람줄 + 바닥 먼지 고리
class FighterKickVFX extends SparkVFX {
    constructor(follow, startAngle, radius) {
        super(FIGHTER_COLOR);
        this.follow = follow; this.start = startAngle; this.radius = radius;
        this.sweep = 0.16; this.duration = 0.45;
        this.emitted = 0;
        this.winds = [];
        for (let i = 0; i < 10; i++) this.winds.push({ a: i / 10 * Math.PI * 2 + vfxRand(-0.2, 0.2), len: vfxRand(18, 34) });
    }

    get finished() { return this.elapsed >= this.duration && this.sparksDone; }

    update(dt) {
        super.update(dt);
        // 쓸고 지나가는 동안 발끝에서 불꽃 (접선 방향으로)
        const u = Math.min(1, this.elapsed / this.sweep);
        const cx = this.follow.rect.centerx, cy = this.follow.rect.centery;
        while (this.emitted < Math.round(16 * u)) {
            const a = this.start + Math.PI * 2 * (this.emitted / 16);
            const r = this.radius - 10;
            this.addSpark(cx + Math.cos(a) * r, cy + Math.sin(a) * r, a + Math.PI / 2 + vfxRand(-0.4, 0.4), vfxRand(120, 260), vfxRand(0.15, 0.3), vfxRand(1.2, 2.2));
            this.emitted++;
        }
    }

    draw(ctx) {
        const cx = this.follow.rect.centerx, cy = this.follow.rect.centery;
        const u = Math.min(1, this.elapsed / this.sweep);
        const fade = 1 - Math.max(0, (this.elapsed - this.sweep) / (this.duration - this.sweep));
        const head = this.start + Math.PI * 2 * u;
        const R = this.radius - 10;
        ctx.save();
        ctx.lineCap = 'round';
        // 바닥 먼지 고리 (다 돈 뒤)
        if (this.elapsed > this.sweep) {
            const w = Math.min(1, (this.elapsed - this.sweep) / 0.25);
            for (let i = 0; i < 12; i++) {
                const a = i / 12 * Math.PI * 2, d = R + 6 + 22 * w;
                ctx.fillStyle = `rgba(210,190,170,${0.3 * (1 - w)})`;
                ctx.beginPath(); ctx.arc(cx + Math.cos(a) * d, cy + Math.sin(a) * d, 4 + 5 * w, 0, Math.PI * 2); ctx.fill();
            }
        }
        ctx.globalCompositeOperation = 'lighter';
        // 굵은 호: 조각 14개, 꼬리일수록 옅고 가늘게
        for (let i = 0; i < 14; i++) {
            const a0 = head - (i + 1) * 0.3, a1 = head - i * 0.3;
            if (a1 < this.start) break;
            const k = 1 - i / 14;
            ctx.strokeStyle = fighterRgba(0.8 * k * fade);
            ctx.lineWidth = 3 + 18 * k;
            ctx.beginPath(); ctx.arc(cx, cy, R, Math.max(this.start, a0), a1); ctx.stroke();
        }
        // 안팎의 가는 바람결 호
        for (const [dr, len, a] of [[-16, 2.2, 0.55], [-8, 3.0, 0.7], [10, 2.6, 0.6], [18, 1.6, 0.4]]) {
            ctx.strokeStyle = fighterRgba(a * fade); ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(cx, cy, R + dr, Math.max(this.start, head - len), head - 0.15); ctx.stroke();
        }
        // 흰 날
        ctx.strokeStyle = `rgba(255,255,255,${0.9 * fade})`; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, R, Math.max(this.start, head - 1.2), head); ctx.stroke();
        // 발끝 빛
        if (u < 1) {
            const hx = cx + Math.cos(head) * R, hy = cy + Math.sin(head) * R;
            const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, 18);
            g.addColorStop(0, 'rgba(255,255,255,1)'); g.addColorStop(0.4, fighterRgba(0.8)); g.addColorStop(1, fighterRgba(0));
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(hx, hy, 18, 0, Math.PI * 2); ctx.fill();
        }
        // 다 돈 뒤: 충격파 고리 두 겹 + 바깥으로 뻗는 바람줄
        if (this.elapsed > this.sweep * 0.7) {
            const w = Math.min(1, (this.elapsed - this.sweep * 0.7) / 0.25), a = 1 - w;
            ctx.lineWidth = 3 * a + 0.5;
            ctx.strokeStyle = fighterRgba(0.8 * a);
            ctx.beginPath(); ctx.arc(cx, cy, this.radius * (0.8 + 0.6 * w), 0, Math.PI * 2); ctx.stroke();
            ctx.strokeStyle = `rgba(255,255,255,${0.5 * a})`;
            ctx.beginPath(); ctx.arc(cx, cy, this.radius * (0.7 + 0.4 * w), 0, Math.PI * 2); ctx.stroke();
            ctx.strokeStyle = fighterRgba(0.7 * a); ctx.lineWidth = 2;
            for (const wd of this.winds) {
                const r0 = this.radius * (0.9 + 0.5 * w);
                ctx.beginPath(); ctx.moveTo(cx + Math.cos(wd.a) * r0, cy + Math.sin(wd.a) * r0);
                ctx.lineTo(cx + Math.cos(wd.a) * (r0 + wd.len), cy + Math.sin(wd.a) * (r0 + wd.len)); ctx.stroke();
            }
        }
        this.drawSparks(ctx);
        ctx.restore();
    }
}

// 바람 휙: 쓰는 순간 몸 둘레로 가는 바람결 호 세 줄이 앞쪽으로 휙 쓸고, 앞으로 바람줄이 날아간다
class FighterWindVFX {
    constructor(follow, angle, scale = 1) {
        this.follow = follow; this.angle = angle; this.scale = scale;
        this.duration = 0.22; this.elapsed = 0;
        this.side = Math.random() < 0.5 ? 1 : -1; // 어느 쪽에서 감아 도는지
    }

    get finished() { return this.elapsed >= this.duration; }

    update(dt) { this.elapsed += dt; }

    draw(ctx) {
        const cx = this.follow.rect.centerx, cy = this.follow.rect.centery;
        const u = this.elapsed / this.duration, a = 1 - u;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        for (let i = 0; i < 3; i++) {
            const r = (26 + i * 9) * this.scale;
            const span = 1.8, head = this.angle + this.side * (-span / 2 + span * Math.min(1, u * 1.6 + i * 0.1));
            const tail = head - this.side * 0.9;
            ctx.strokeStyle = `rgba(255,240,225,${0.75 * a})`;
            ctx.lineWidth = 2.5 - i * 0.5;
            ctx.beginPath(); ctx.arc(cx, cy, r, Math.min(head, tail), Math.max(head, tail)); ctx.stroke();
        }
        // 앞으로 날아가는 바람줄
        const dx = Math.cos(this.angle), dy = Math.sin(this.angle);
        for (const off of [-10, 6]) {
            const d0 = (24 + 50 * u) * this.scale, d1 = d0 + 22 * this.scale;
            const px = -dy * off * this.scale, py = dx * off * this.scale;
            ctx.strokeStyle = fighterRgba(0.7 * a); ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(cx + dx * d0 + px, cy + dy * d0 + py); ctx.lineTo(cx + dx * d1 + px, cy + dy * d1 + py); ctx.stroke();
        }
        ctx.restore();
    }
}

// 맞은 자리 불꽃 (무투가 색)
function fighterHitSpark(target, angle, count, size) {
    Vfx.spawn(new HitSparkVFX(target.rect.centerx, target.rect.centery, { color: FIGHTER_COLOR, angle, count, size }));
}

// 연주황으로 칠한 무투가 그림 (돌진 잔상용, 한 번만 만든다)
let fighterTinted = null;
function fighterTintedSprite() {
    if (fighterTinted || !isImageReady(FIGHTER_IMAGE)) return fighterTinted;
    const c = document.createElement('canvas'); c.width = 48; c.height = 48;
    const x = c.getContext('2d');
    x.drawImage(FIGHTER_IMAGE, 2, 2, 44, 44);
    x.globalCompositeOperation = 'source-in'; x.fillStyle = FIGHTER_COLOR; x.fillRect(0, 0, 48, 48);
    fighterTinted = c;
    return c;
}

// 가운데 기준 w x h 사각형의 로컬 꼭짓점
function centeredRectLocal(w, h) {
    const hw = w / 2;
    const hh = h / 2;
    return [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
}

// ==========================================
// [평타] 기본 펀치
// ==========================================
class FighterBasicHitbox {
    constructor(owner, direction) {
        this.owner = owner;
        this.direction = direction;
        this.damage = owner.baseAtk;
        this.createdTime = Time.now;
        this.lifespan = 150;
        this.hitPlayers = [];

        this.width = 60;
        this.height = 40;
        this.posX = owner.rect.centerx + direction[0] * 30;
        this.posY = owner.rect.centery + direction[1] * 30;
    }

    getPolygonPoints() {
        return transformLocalPoints(this.posX, this.posY, directionToAngle(this.direction), centeredRectLocal(this.width, this.height));
    }

    update() {}

    isExpired() { return Time.now - this.createdTime >= this.lifespan; }

    collidesWith(target) {
        return canBeHit(this, target) && checkPolygonCollision(this.getPolygonPoints(), target.rect);
    }

    applyEffect(target) {
        fighterHitSpark(target, Math.atan2(this.direction[1], this.direction[0]), 12, 28);
    }

    // 내려찍는 주먹 이펙트(FighterSlamVFX)가 대신 보인다
    draw(ctx) {
        if (!isImageReady(FIGHTER_FIST_IMAGE)) drawPolygon(ctx, this.getPolygonPoints(), 'rgb(255, 180, 50)', COLOR_WHITE, 2);
    }
}

const FIGHTER_BASIC_WINDUP = 0.08; // 평타 선딜(초): 주먹이 내려오는 동안

class FighterBasicSkill extends Skill {
    constructor() { super('Punch', 400); }

    use(owner, direction, attacks) {
        this.lastUsed = Time.now;
        owner.castTimer = FIGHTER_BASIC_WINDUP;
        Vfx.spawn(new FighterWindVFX(owner, Math.atan2(direction[1], direction[0])));
        Vfx.spawn(new FighterSlamVFX(owner.rect.centerx + direction[0] * 30, owner.rect.centery + direction[1] * 30,
            Math.atan2(direction[1], direction[0]), FIGHTER_BASIC_WINDUP));
        owner.pendingAction = () => attacks.push(new FighterBasicHitbox(owner, direction));
    }
}

// ==========================================
// [스킬 1] 10개까지 모아두는 연속 펀치
// ==========================================
class FighterChargeHitbox {
    constructor(owner, direction) {
        this.owner = owner;
        this.hitPlayers = [];

        this.angle = directionToAngle(direction) + randomUniform(-20, 20);
        const rad = this.angle * Math.PI / 180;
        this.direction = [Math.cos(rad), -Math.sin(rad)];

        this.damage = owner.baseAtk * 0.5;
        this.speed = 6;
        this.createdTime = Time.now;
        this.lifespan = 800;

        this.width = 70;  // 기 주먹 크기에 맞춤 (원래 50x40)
        this.height = 56;
        this.posX = owner.rect.centerx;
        this.posY = owner.rect.centery;
        this.startX = this.posX;
        this.startY = this.posY;
        this.maxRange = 100;
    }

    getPolygonPoints() {
        return transformLocalPoints(this.posX, this.posY, this.angle, centeredRectLocal(this.width, this.height));
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

    applyEffect(target) {
        fighterHitSpark(target, Math.atan2(this.direction[1], this.direction[0]), 8, 22);
    }

    // 날아가는 기 주먹 + 뒤로 남는 바람줄
    draw(ctx) {
        if (!isImageReady(FIGHTER_FIST_IMAGE)) {
            drawPolygon(ctx, this.getPolygonPoints(), 'rgb(255, 140, 0)', COLOR_WHITE, 2);
            return;
        }
        const ang = Math.atan2(this.direction[1], this.direction[0]);
        const traveled = Math.hypot(this.posX - this.startX, this.posY - this.startY);
        const fade = 1 - Math.max(0, (traveled - 70) / 30); // 사거리 끝에서 흐려짐
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        for (const [off, len] of [[-14, 34], [0, 48], [14, 34]]) {
            const bx = this.posX - this.direction[0] * 22 - this.direction[1] * off;
            const by = this.posY - this.direction[1] * 22 + this.direction[0] * off;
            ctx.strokeStyle = fighterRgba(0.55 * fade); ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(bx, by); ctx.lineTo(bx - this.direction[0] * Math.min(len, traveled), by - this.direction[1] * Math.min(len, traveled)); ctx.stroke();
        }
        ctx.restore();
        drawFighterFist(ctx, this.posX, this.posY, ang, 62, fade);
    }
}

class FighterChargeSkill {
    constructor() {
        this.name = 'Heavy Smash';
        this.keywords = [];
        this.cooldownType = 'charges';
        this.maxCharges = 10;
        this.currentCharges = 10;
        this.chargeCooldown = 1500;
        this.lastChargeTime = Time.now;
        this.internalCooldown = 150;
        this.lastUsed = 0;
    }

    updateCharges() {
        if (this.currentCharges < this.maxCharges) {
            const elapsed = Time.now - this.lastChargeTime;
            if (elapsed >= this.chargeCooldown) {
                // 시간이 많이 지났으면 그만큼 한꺼번에 충전
                const add = Math.floor(elapsed / this.chargeCooldown);
                this.currentCharges = Math.min(this.maxCharges, this.currentCharges + add);
                this.lastChargeTime += add * this.chargeCooldown;
            }
        }
    }

    canUse() {
        this.updateCharges();
        return this.currentCharges > 0 && Time.now - this.lastUsed >= this.internalCooldown;
    }

    use(owner, direction, attacks) {
        this.currentCharges -= 1;
        this.lastUsed = Time.now;
        if (this.currentCharges === this.maxCharges - 1) this.lastChargeTime = Time.now;
        attacks.push(new FighterChargeHitbox(owner, direction));
        Vfx.spawn(new FighterWindVFX(owner, Math.atan2(direction[1], direction[0]), 0.8));
    }
}

// ==========================================
// [스킬 2] 돌진 후 발차기 (밀치기 + 1초 기절)
// ==========================================
// 돌려차기: 무투가 둘레 원형 범위, 맞은 상대를 무투가 반대쪽(바깥)으로 밀친다
class FighterDashSlamHitbox {
    constructor(owner) {
        this.owner = owner;
        this.damage = owner.baseAtk * 1.5;
        this.createdTime = Time.now;
        this.lifespan = 200;
        this.hitPlayers = [];
        this.radius = 70;
        this.posX = owner.rect.centerx;
        this.posY = owner.rect.centery;
        Vfx.spawn(new FighterKickVFX(owner, Math.atan2(owner.facing[1], owner.facing[0]), this.radius));
    }

    update() {
        this.posX = this.owner.rect.centerx;
        this.posY = this.owner.rect.centery;
    }

    isExpired() { return Time.now - this.createdTime >= this.lifespan; }

    // 원과 사각형: 원 중심에서 사각형의 가장 가까운 점까지 거리
    collidesWith(target) {
        if (!canBeHit(this, target)) return false;
        const r = target.rect;
        const nx = Math.max(r.left, Math.min(this.posX, r.right)), ny = Math.max(r.top, Math.min(this.posY, r.bottom));
        return (nx - this.posX) ** 2 + (ny - this.posY) ** 2 <= this.radius ** 2;
    }

    applyEffect(target) {
        const out = normalizeOr([target.rect.centerx - this.posX, target.rect.centery - this.posY], this.owner.facing);
        forcedMove(target, 0.2, 300, out);
        slow(target, 1.0, 100);
        silence(target, 1.0);
        Vfx.spawn(new HitSparkVFX(target.rect.centerx, target.rect.centery, { color: FIGHTER_COLOR, angle: Math.atan2(out[1], out[0]), count: 12, size: 26 }));
    }

    draw(ctx) {}
}

class FighterDashManager {
    constructor(owner, direction, attacks) {
        this.owner = owner;
        this.direction = direction;
        this.attacks = attacks;
        this.dashSpeed = 15.0;
        this.dashDuration = 150;
        this.createdTime = Time.now;
        this.damage = owner.baseAtk * 0.5; // 돌진하며 부딪히면 작은 피해 (한 번)
        this.hitPlayers = [];
        this.isDash = true;
        this.trail = []; // 잔상용 지나온 자리 (화면 전용)
    }

    update(walls) {
        if (Time.now - this.createdTime < this.dashDuration) {
            // 돌진 중에는 이동키·다른 스킬 잠금
            slow(this.owner, 0.1, 100);
            silence(this.owner, 0.1);
            const ts = this.owner.timeScale;
            moveEntityWithWalls(this.owner, this.direction[0] * this.dashSpeed * ts, this.direction[1] * this.dashSpeed * ts, walls);
        }
    }

    isExpired() {
        const expired = Time.now - this.createdTime >= this.dashDuration;
        if (expired) {
            clearDashLock(this.owner, { silenceLock: true });
            this.attacks.push(new FighterDashSlamHitbox(this.owner));
        }
        return expired;
    }

    collidesWith(target) {
        if (Time.now - this.createdTime >= this.dashDuration || !canBeHit(this, target)) return false;
        return this.owner.rect.inflate(10, 10).colliderect(target.rect);
    }

    applyEffect(target) {
        fighterHitSpark(target, Math.atan2(this.direction[1], this.direction[0]), 8, 22);
    }

    // 돌진 잔상: 지나온 자리에 연주황 무투가 그림자 + 바람줄
    draw(ctx) {
        const cx = this.owner.rect.centerx, cy = this.owner.rect.centery;
        const last = this.trail[this.trail.length - 1];
        if (!last || Math.hypot(last[0] - cx, last[1] - cy) > 10) this.trail.push([cx, cy]);
        if (this.trail.length > 6) this.trail.shift();
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const ghostImg = fighterTintedSprite();
        this.trail.forEach(([x, y], i) => {
            const a = (i + 1) / this.trail.length * 0.45;
            if (ghostImg) { ctx.globalAlpha = a; ctx.drawImage(ghostImg, x - 24, y - 24, 48, 48); ctx.globalAlpha = 1; }
            else { ctx.fillStyle = fighterRgba(a); ctx.beginPath(); ctx.roundRect(x - 18, y - 18, 36, 36, 8); ctx.fill(); }
        });
        ctx.strokeStyle = fighterRgba(0.6); ctx.lineWidth = 2; ctx.lineCap = 'round';
        for (const off of [-14, 0, 14]) {
            const bx = cx - this.direction[1] * off, by = cy + this.direction[0] * off;
            ctx.beginPath(); ctx.moveTo(bx - this.direction[0] * 20, by - this.direction[1] * 20); ctx.lineTo(bx - this.direction[0] * 60, by - this.direction[1] * 60); ctx.stroke();
        }
        ctx.restore();
    }
}

class FighterDashSkill extends Skill {
    constructor() { super('Dash Slam', 4000, ['dash']); }

    use(owner, direction, attacks) {
        this.lastUsed = Time.now;
        attacks.push(new FighterDashManager(owner, direction, attacks));
        Vfx.spawn(new FighterWindVFX(owner, Math.atan2(direction[1], direction[0]), 1.2));
    }
}

// ==========================================
// [궁극기] 기를 모아 거대 충격파 3연발
// ==========================================
// 기준점(시전 위치)에서 앞으로 width만큼 뻗는 사각형
function fighterUltPoints(posX, posY, angle, width, height) {
    const hh = height / 2;
    return transformLocalPoints(posX, posY, angle, [[0, -hh], [width, -hh], [width, hh], [0, hh]]);
}

class FighterUltHitbox {
    constructor(owner, angle, posX, posY) {
        this.owner = owner;
        this.angle = angle;
        this.posX = posX;
        this.posY = posY;
        this.damage = owner.baseAtk * 2.0;
        this.createdTime = Time.now;
        this.lifespan = 150;
        this.hitPlayers = [];
        this.canPenetrateWalls = true;
        this.width = 500;
        this.height = 400;
    }

    getPolygonPoints() {
        return fighterUltPoints(this.posX, this.posY, this.angle, this.width, this.height);
    }

    update() {}

    isExpired() { return Time.now - this.createdTime >= this.lifespan; }

    collidesWith(target) {
        if (!canBeHit(this, target)) return false;
        if (checkPolygonCollision(this.getPolygonPoints(), target.rect) && !this.hitPlayers.includes(target)) {
            this.hitPlayers.push(target);
            return true;
        }
        return false;
    }

    draw(ctx) {
        drawPolygon(ctx, this.getPolygonPoints(), 'rgb(255, 80, 50)', COLOR_WHITE, 3);
    }
}

class FighterUltManager {
    constructor(owner, direction, attacks) {
        this.owner = owner;
        this.attacks = attacks;
        this.createdTime = Time.now;
        this.strikesDone = 0;
        this.damage = 0;
        this.hitPlayers = [];
        this.width = 500;
        this.height = 400;
        this.angle = directionToAngle(direction);
        this.posX = owner.rect.centerx;
        this.posY = owner.rect.centery;
    }

    getPolygonPoints() {
        return fighterUltPoints(this.posX, this.posY, this.angle, this.width, this.height);
    }

    update() {
        const elapsed = Time.now - this.createdTime;

        // 3번째 충격파가 나갈 때까지 무적 + 행동 잠금
        if (elapsed < 1850) {
            defenseMod(this.owner, 0.1, 100);
            slow(this.owner, 0.1, 100);
            silence(this.owner, 0.1);
        }

        if (elapsed >= 1000 && this.strikesDone === 0) {
            this.spawnStrike();
            this.strikesDone = 1;
        } else if (elapsed >= 1300 && this.strikesDone === 1) {
            this.spawnStrike();
            this.strikesDone = 2;
        } else if (elapsed >= 1600 && this.strikesDone === 2) {
            this.spawnStrike();
            this.strikesDone = 3;
        }
    }

    spawnStrike() {
        this.attacks.push(new FighterUltHitbox(this.owner, this.angle, this.posX, this.posY));
    }

    isExpired() { return Time.now - this.createdTime >= 2500; }

    collidesWith() { return false; }

    draw(ctx) {
        const elapsed = Time.now - this.createdTime;
        if (elapsed >= 1000) return;

        // 기 모으는 중: 범위 깜빡임 + 줄어드는 금색 원
        if (Math.floor(elapsed / 100) % 2 === 0) {
            const pts = this.getPolygonPoints();
            ctx.beginPath();
            ctx.moveTo(pts[0][0], pts[0][1]);
            for (const [px, py] of pts.slice(1)) ctx.lineTo(px, py);
            ctx.closePath();
            ctx.strokeStyle = 'rgb(255, 50, 50)';
            ctx.lineWidth = 3;
            ctx.stroke();
        }
        const radius = Math.max(20, Math.trunc(150 * (1.0 - elapsed / 1000)));
        drawCircle(ctx, this.posX, this.posY, radius, null, COLOR_GOLD, 2);
    }
}

class FighterUltSkill extends Skill {
    constructor() { super('Raging Storm', 500, ['ult'], -99999); }

    use(owner, direction, attacks) {
        this.lastUsed = Time.now;
        attacks.push(new FighterUltManager(owner, direction, attacks));
    }
}

// ==========================================
// 캐릭터 등록
// ==========================================
function applyFighter(player) {
    player.baseAtk = 15;
    player.maxHp = 120;
    player.hp = 120;
    player.speed = 4.3;
    player.spriteImage = FIGHTER_IMAGE;
    player.abilities = [
        new FighterBasicSkill(),  // 평타
        new FighterChargeSkill(), // 스킬 1 (10개 충전)
        new FighterDashSkill(),   // 스킬 2 (돌진 발차기)
        new FighterUltSkill(),    // 궁극기 (거대 충격파 3연발)
    ];
}

const FIGHTER_CHARACTER_DATA = {
    id: 'FIGHTER',
    name: '무투가',
    desc: '평타: 기 주먹으로 앞 바닥을 내려찍습니다(15), 스킬 1: 기 주먹을 날립니다(8), 10개까지 모을 수 있습니다, 스킬 2: 돌진하며 부딪히면 피해(8)를 주고 돌려차기로 주변 상대를 바깥으로 밉니다(23), 1초간 기절, 궁극기: 기를 모으며 앞에 크기가 크고 쎈 충격파를 3번 쏩니다(한발당 30)',
    apply: applyFighter,
    thumbnail: FIGHTER_IMAGE,
};

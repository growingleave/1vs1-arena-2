// 무투가 (abilities/fighter.py를 옮김)

const FIGHTER_IMAGE = loadImage('assets/fighter.png');

// 무투가 이펙트 색: 연주황 (팀과 상관없이 같은 색)
const FIGHTER_COLOR = '#ffb070';
const FIGHTER_RGB = [255, 176, 112];
const fighterRgba = (a) => `rgba(${FIGHTER_RGB[0]},${FIGHTER_RGB[1]},${FIGHTER_RGB[2]},${a})`;

// 기(氣) 주먹 그림 (tools/fighter_fist_gen.js로 생성, 110x100, 주먹 마디가 오른쪽, 가운데 x 60 y 50, 색이 들어 있음)
const FIGHTER_FIST_IMAGE = loadImage('assets/fighter_fist.png');

// 그림 속 내용이 있는 영역 (빛 번짐 여백 조금 포함) — 범위를 꽉 채울 때 이 영역을 늘려 그린다
const FIGHTER_FIST_BOX = [3, 10, 98, 74];

// 그림을 시작점(x, y)에서 angle 방향으로 길이 length·폭 width인 사각형에 꽉 채워 그린다
// reach(0~1): 앞으로 뻗은 정도 (앞쪽 끝은 고정, 뒤쪽이 따라온다), flip: 위아래 뒤집기
function drawFighterFill(ctx, img, box, x, y, angle, length, width, alpha, { flip = false, reach = 1 } = {}) {
    if (!isImageReady(img) || alpha <= 0) return;
    const len = length * reach;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    if (flip) ctx.scale(1, -1);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(img, box[0], box[1], box[2], box[3], length - len, -width / 2, len, width);
    ctx.restore();
}

// 주먹 그림을 (x, y)에 angle(라디안) 방향으로, 가로 size px 크기로
function drawFighterFist(ctx, x, y, angle, size, alpha) {
    if (!isImageReady(FIGHTER_FIST_IMAGE) || alpha <= 0) return;
    const k = size / 110;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = Math.min(1, alpha);
    ctx.drawImage(FIGHTER_FIST_IMAGE, -52 * k, -47 * k, 110 * k, 100 * k); // 주먹 내용 가운데가 (x, y)
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
// [궁극기] 왼손 펀치 → 오른손 펀치 → 발차기
// 한 번마다: 조준(범위 표시, 오른쪽 키 = 시계 방향 / 왼쪽 키 = 반시계 방향으로 돌릴 수 있음)
//          → 고정(돌릴 수 없고 경고만) → 타격. 쓰는 동안 무적 + 제자리
// 펀치 20, 발차기 30 + 강하게 밀침. 밀려서 벽(맵 끝 포함)에 부딪히면 추가 피해
// ==========================================
const FIGHTER_ULT = {
    aim: 1000, lock: 550,           // ms (한 번에 1.55초)
    turnSpeed: 90,                  // 조준 중 회전 속도(도/초)
    length: 500,                    // 앞으로 뻗는 길이
    punchWidth: 220, kickWidth: 220, // 좌우 폭 (세 번 모두 같은 주먹)
    punchDamage: 20 / 15, kickDamage: 2.0, // baseAtk 배수 (15 기준 20 / 30)
    knockTime: 0.3, knockPower: 1000, // 발차기 밀치기 (초, px/초) → 약 300px
    wallDamage: 10,
};

// 기준점(시전 위치)에서 앞으로 width만큼 뻗는 사각형
function fighterUltPoints(posX, posY, angle, width, height) {
    const hh = height / 2;
    return transformLocalPoints(posX, posY, angle, [[0, -hh], [width, -hh], [width, hh], [0, hh]]);
}

class FighterUltHitbox {
    constructor(owner, angle, posX, posY, { width, damage, kick, manager }) {
        this.owner = owner;
        this.angle = angle;
        this.posX = posX;
        this.posY = posY;
        this.damage = owner.baseAtk * damage;
        this.kick = kick;
        this.manager = manager;
        this.createdTime = Time.now;
        this.lifespan = 150;
        this.hitPlayers = [];
        this.canPenetrateWalls = true;
        this.width = FIGHTER_ULT.length;
        this.height = width;
    }

    getPolygonPoints() {
        return fighterUltPoints(this.posX, this.posY, this.angle, this.width, this.height);
    }

    update() {}

    isExpired() { return Time.now - this.createdTime >= this.lifespan; }

    collidesWith(target) {
        return canBeHit(this, target) && checkPolygonCollision(this.getPolygonPoints(), target.rect);
    }

    applyEffect(target) {
        const rad = this.angle * Math.PI / 180, dir = [Math.cos(rad), -Math.sin(rad)];
        fighterHitSpark(target, Math.atan2(dir[1], dir[0]), this.kick ? 18 : 12, this.kick ? 38 : 28);
        if (this.kick) {
            forcedMove(target, FIGHTER_ULT.knockTime, FIGHTER_ULT.knockPower, dir);
            this.manager.trackKnockback(target, dir);
            Vfx.shake(7, 0.2);
        } else {
            Vfx.shake(4, 0.12);
        }
    }

    draw() {}
}

class FighterUltManager {
    constructor(owner, direction, attacks) {
        this.owner = owner;
        this.attacks = attacks;
        this.createdTime = Time.now;
        this.lastTick = Time.now;
        this.strikesDone = 0;
        this.damage = 0;
        this.hitPlayers = [];
        this.angle = directionToAngle(direction); // 위쪽이 + 인 각도(도)
        this.posX = owner.rect.centerx;
        this.posY = owner.rect.centery;
        this.knock = null; // 발차기로 밀리는 대상 { target, dir, until, lastX, lastY }
    }

    strikeWidth(i) { return i === 2 ? FIGHTER_ULT.kickWidth : FIGHTER_ULT.punchWidth; }

    getPolygonPoints(i = this.strikesDone) {
        return fighterUltPoints(this.posX, this.posY, this.angle, FIGHTER_ULT.length, this.strikeWidth(i));
    }

    // 지금 몇 번째 타격의 어느 단계인지: 'aim' | 'lock' | 'done'
    stage() {
        if (this.strikesDone >= 3) return 'done';
        const t = Time.now - this.createdTime - this.strikesDone * (FIGHTER_ULT.aim + FIGHTER_ULT.lock);
        return t < FIGHTER_ULT.aim ? 'aim' : 'lock';
    }

    update(walls) {
        const dt = (Time.now - this.lastTick) / 1000;
        this.lastTick = Time.now;
        const cycle = FIGHTER_ULT.aim + FIGHTER_ULT.lock;
        const elapsed = Time.now - this.createdTime;

        if (this.strikesDone < 3) {
            // 무적 + 제자리 + 다른 스킬 잠금
            defenseMod(this.owner, 0.1, 100);
            slow(this.owner, 0.1, 100);
            silence(this.owner, 0.1);
            this.posX = this.owner.rect.centerx;
            this.posY = this.owner.rect.centery;
            // 조준 중에만 방향 돌리기 (오른쪽 = 시계 방향, 왼쪽 = 반시계 방향)
            if (this.stage() === 'aim') {
                const input = this.owner.input || {};
                if (input.right) this.angle -= FIGHTER_ULT.turnSpeed * dt;
                if (input.left) this.angle += FIGHTER_ULT.turnSpeed * dt;
            }
            if (elapsed >= (this.strikesDone + 1) * cycle) this.strike();
        }
        this.updateKnockback(walls);
    }

    strike() {
        const i = this.strikesDone;
        const kick = i === 2;
        this.attacks.push(new FighterUltHitbox(this.owner, this.angle, this.posX, this.posY, {
            width: this.strikeWidth(i), damage: kick ? FIGHTER_ULT.kickDamage : FIGHTER_ULT.punchDamage, kick, manager: this,
        }));
        const rad = this.angle * Math.PI / 180;
        Vfx.spawn(new FighterUltStrikeVFX(this.posX, this.posY, Math.atan2(-Math.sin(rad), Math.cos(rad)), FIGHTER_ULT.length, this.strikeWidth(i), i));
        Vfx.spawn(new FighterWindVFX(this.owner, Math.atan2(-Math.sin(rad), Math.cos(rad)), 1.4));
        this.strikesDone++;
    }

    trackKnockback(target, dir) {
        this.knock = { target, dir, until: Time.now + FIGHTER_ULT.knockTime * 1000, lastX: target.rect.centerx, lastY: target.rect.centery };
    }

    // 밀려나다 벽(또는 맵 끝)에 막히면: 추가 피해 + 부딪힘 이펙트, 밀치기 끝
    updateKnockback(walls) {
        const k = this.knock;
        if (!k) return;
        if (Time.now > k.until || !k.target.statusEffects.forced_move) { this.knock = null; return; }
        const r = k.target.rect;
        const probe = new Rect(r.x + Math.sign(k.dir[0]) * 3, r.y + Math.sign(k.dir[1]) * 3, r.w, r.h);
        const hitWall = walls.some(w => probe.colliderect(w.rect)) ||
            probe.left < ARENA_RECT.left || probe.right > ARENA_RECT.right || probe.top < ARENA_RECT.top || probe.bottom > ARENA_RECT.bottom;
        const moved = Math.hypot(r.centerx - k.lastX, r.centery - k.lastY);
        k.lastX = r.centerx; k.lastY = r.centery;
        if (hitWall && moved < FIGHTER_ULT.knockPower / 60 * 0.6) {
            delete k.target.statusEffects.forced_move;
            if (canBeHit(this, k.target)) {
                const finalDamage = k.target.takeDamage(FIGHTER_ULT.wallDamage);
                this.owner.addUltGauge(finalDamage * this.owner.ultChargeMultiplier);
            }
            Vfx.spawn(new FighterWallHitVFX(r.centerx + k.dir[0] * r.w / 2, r.centery + k.dir[1] * r.h / 2, Math.atan2(k.dir[1], k.dir[0])));
            Vfx.shake(9, 0.25);
            this.knock = null;
        }
    }

    isExpired() {
        return this.strikesDone >= 3 && !this.knock && Time.now - this.createdTime >= 3 * (FIGHTER_ULT.aim + FIGHTER_ULT.lock) + 200;
    }

    collidesWith() { return false; }

    // 경고: 조준 중엔 범위가 옅게 깜빡이고(돌릴 수 있음), 고정되면 진하게 빠르게 깜빡이며 안쪽이 차오른다.
    // 범위 끝에 다음 타격 표시 (왼손 / 오른손 / 발)
    draw(ctx) {
        const st = this.stage();
        if (st === 'done') return;
        const pts = this.getPolygonPoints();
        const t = Time.now - this.createdTime - this.strikesDone * (FIGHTER_ULT.aim + FIGHTER_ULT.lock);
        const locked = st === 'lock';
        const fill = locked ? (t - FIGHTER_ULT.aim) / FIGHTER_ULT.lock : 0;
        const blink = locked ? Math.floor(Time.now / 60) % 2 === 0 : Math.floor(Time.now / 150) % 2 === 0;
        ctx.save();
        const path = () => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); for (const [x, y] of pts.slice(1)) ctx.lineTo(x, y); ctx.closePath(); };
        path(); ctx.fillStyle = locked ? `rgba(255, 90, 50, ${0.12 + 0.25 * fill})` : fighterRgba(0.08); ctx.fill();
        path(); ctx.strokeStyle = locked ? (blink ? 'rgb(255, 60, 40)' : 'rgba(255, 60, 40, 0.5)') : (blink ? fighterRgba(0.9) : fighterRgba(0.45));
        ctx.lineWidth = locked ? 4 : 2; ctx.stroke();
        // 조준 중: 돌릴 수 있다는 표시 (양쪽 화살표 호)
        const rad = this.angle * Math.PI / 180, ang = Math.atan2(-Math.sin(rad), Math.cos(rad));
        if (!locked) {
            ctx.strokeStyle = fighterRgba(0.7); ctx.lineWidth = 2;
            ctx.beginPath(); ctx.arc(this.posX, this.posY, 52, ang - 0.6, ang + 0.6); ctx.stroke();
        }
        // 다음 타격 표시: 플레이어 쪽(출발 자리)에 범위 폭만 한 옅은 주먹
        const fw = this.strikeWidth(this.strikesDone), fl = fw * FIGHTER_FIST_BOX[2] / FIGHTER_FIST_BOX[3];
        drawFighterFill(ctx, FIGHTER_FIST_IMAGE, FIGHTER_FIST_BOX, this.posX, this.posY, ang, fl, fw, 0.15 + 0.35 * fill);
        ctx.restore();
    }
}

// 궁극기 타격 이펙트: 범위 폭만 한 거대한 기 주먹이 플레이어 쪽에서 범위 끝까지 날아간다 (세 번 모두 같음)
// + 시작점 충격파 + 범위 따라 바람줄·불꽃
class FighterUltStrikeVFX extends SparkVFX {
    constructor(x, y, angle, length, width, index) {
        super(FIGHTER_COLOR);
        this.x = x; this.y = y; this.angle = angle; this.length = length; this.width = width; this.index = index;
        this.duration = 0.5;
        const dx = Math.cos(angle), dy = Math.sin(angle);
        for (let i = 0; i < 18; i++) {
            const d = vfxRand(40, length), side = vfxRand(-0.5, 0.5) * width;
            this.addSpark(x + dx * d - dy * side, y + dy * d + dx * side, angle + vfxRand(-0.3, 0.3), vfxRand(200, 420), vfxRand(0.15, 0.3), vfxRand(1.2, 2.4));
        }
    }

    get finished() { return this.elapsed >= this.duration && this.sparksDone; }

    draw(ctx) {
        const t = this.elapsed / this.duration;
        const dx = Math.cos(this.angle), dy = Math.sin(this.angle);
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        if (t < 1) {
            const a = 1 - t, go = Math.min(1, t * 2.5); // 앞으로 뻗는 정도
            // 범위 따라 바람줄
            ctx.lineCap = 'round';
            for (let i = 0; i < 9; i++) {
                const side = (i / 8 - 0.5) * this.width * 0.9;
                const d1 = this.length * go, d0 = Math.max(0, d1 - 160);
                ctx.strokeStyle = fighterRgba(0.55 * a); ctx.lineWidth = 2 + (i % 2) * 2;
                ctx.beginPath(); ctx.moveTo(this.x + dx * d0 - dy * side, this.y + dy * d0 + dx * side);
                ctx.lineTo(this.x + dx * d1 - dy * side, this.y + dy * d1 + dx * side); ctx.stroke();
            }
            // 범위 폭만 한 거대한 주먹이 플레이어 쪽에서 범위 끝까지 날아가고(잔상 3개), 끝에서 잠깐 남았다 사라진다
            const fw = this.width, fl = fw * FIGHTER_FIST_BOX[2] / FIGHTER_FIST_BOX[3];
            const travel = Math.max(0, this.length - fl);
            const move = Math.min(1, t / 0.4); // 전체 0.4 중 앞 40% 동안 이동
            const ease = 1 - (1 - move) * (1 - move);
            for (let g = 3; g >= 0; g--) {
                const e = Math.max(0, ease - g * 0.12);
                const al = g === 0 ? (t < 0.6 ? 1.2 : a * 2) : 0.35 * (1 - g / 4) * (move < 1 ? 1 : a);
                const off = travel * e;
                drawFighterFill(ctx, FIGHTER_FIST_IMAGE, FIGHTER_FIST_BOX, this.x + dx * off, this.y + dy * off, this.angle, fl, fw, al);
            }
            // 시작점 충격파
            ctx.strokeStyle = fighterRgba(0.8 * a); ctx.lineWidth = 4 * a + 1;
            ctx.beginPath(); ctx.arc(this.x, this.y, 20 + 60 * t, 0, Math.PI * 2); ctx.stroke();
        }
        this.drawSparks(ctx);
        ctx.restore();
    }
}

// 벽에 부딪힘: 벽 쪽으로 갈라지는 금 + 큰 섬광 + 먼지 + 파편
class FighterWallHitVFX extends SparkVFX {
    constructor(x, y, angle) {
        super(FIGHTER_COLOR);
        this.x = x; this.y = y; this.angle = angle;
        this.duration = 0.5;
        this.cracks = [];
        for (let i = 0; i < 8; i++) this.cracks.push({ a: angle + vfxRand(-1.3, 1.3), len: vfxRand(20, 50), bend: vfxRand(-0.4, 0.4) });
        for (let i = 0; i < 16; i++) this.addSpark(x, y, angle + Math.PI + vfxRand(-1.2, 1.2), vfxRand(120, 320), vfxRand(0.2, 0.4), vfxRand(1.5, 3));
    }

    get finished() { return this.elapsed >= this.duration && this.sparksDone; }

    draw(ctx) {
        const t = this.elapsed / this.duration, a = Math.max(0, 1 - t);
        ctx.save();
        // 먼지
        for (let i = 0; i < 8; i++) {
            const da = this.angle + Math.PI + (i / 7 - 0.5) * 2.4, d = 10 + 30 * t;
            ctx.fillStyle = `rgba(210,190,170,${0.4 * a})`;
            ctx.beginPath(); ctx.arc(this.x + Math.cos(da) * d, this.y + Math.sin(da) * d, 5 + 6 * t, 0, Math.PI * 2); ctx.fill();
        }
        ctx.globalCompositeOperation = 'lighter';
        // 섬광
        if (t < 0.4) {
            const f = 1 - t / 0.4;
            const g = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, 45);
            g.addColorStop(0, `rgba(255,255,255,${f})`); g.addColorStop(0.4, fighterRgba(0.7 * f)); g.addColorStop(1, fighterRgba(0));
            ctx.fillStyle = g; ctx.beginPath(); ctx.arc(this.x, this.y, 45, 0, Math.PI * 2); ctx.fill();
        }
        // 금 (빠르게 뻗고 천천히 사라짐)
        ctx.strokeStyle = fighterRgba(0.9 * a); ctx.lineWidth = 2.5;
        for (const c of this.cracks) {
            const l = c.len * Math.min(1, t * 6);
            ctx.beginPath(); ctx.moveTo(this.x, this.y);
            ctx.lineTo(this.x + Math.cos(c.a) * l * 0.5, this.y + Math.sin(c.a) * l * 0.5);
            ctx.lineTo(this.x + Math.cos(c.a + c.bend) * l, this.y + Math.sin(c.a + c.bend) * l); ctx.stroke();
        }
        this.drawSparks(ctx);
        ctx.restore();
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
    desc: '평타: 기 주먹으로 앞 바닥을 내려찍습니다(15), 스킬 1: 기 주먹을 날립니다(8), 10개까지 모을 수 있습니다, 스킬 2: 돌진하며 부딪히면 피해(8)를 주고 돌려차기로 주변 상대를 바깥으로 밉니다(23), 1초간 기절, 궁극기: 거대한 기 주먹을 세 번 날립니다(20, 20, 30), 마지막 주먹은 강하게 밀칩니다, 타격마다 범위를 좌우 키로 돌린 뒤 고정되면 들어가고, 밀려 벽에 부딪히면 추가 피해(10)',
    apply: applyFighter,
    thumbnail: FIGHTER_IMAGE,
};

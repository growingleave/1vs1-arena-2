// 궁수 (abilities/archer.py를 옮김)

const ARROW_TYPES = ['iron', 'explosive', 'slow'];
const ARROW_COLORS = { iron: '200, 200, 200', explosive: '255, 120, 40', slow: '100, 200, 255' };
const ARROW_LABELS = { iron: '철 화살', explosive: '폭파 화살', slow: '감속 화살' };
const MAX_CHARGE_TIME = 900; // 이 시간(ms) 이상 누르고 있으면 최대 충전

// 화면 밖도 벽으로 친다
function hitsScreenEdge(rect) {
    return rect.left < 0 || rect.right > WIDTH || rect.top < 0 || rect.bottom > HEIGHT;
}

function hitsAnyWall(rect) {
    return hitsScreenEdge(rect) || CURRENT_WALLS.some(wall => rect.colliderect(wall.rect));
}

function scaledDamage(owner, chargeRatio) {
    return owner.baseAtk * (0.5 + 1.5 * chargeRatio);
}

// 화살 모양 (화살대 + 촉 + 깃). (x, y)가 화살의 가운데, angleDeg는 위쪽이 + 인 각도
function drawArrowShape(ctx, x, y, angleDeg, length, color, thickness = 3) {
    length = Math.max(12, Math.trunc(length));
    thickness = Math.max(2, thickness);
    const headLen = Math.max(6, length * 0.3);
    const fletchLen = Math.max(5, length * 0.22);
    const surfH = Math.max(10, Math.trunc(thickness * 4));
    const midY = surfH / 2;
    const shaftStart = fletchLen * 0.6;
    const shaftEnd = length - headLen;

    ctx.save();
    ctx.translate(Math.trunc(x), Math.trunc(y));
    ctx.rotate(-angleDeg * Math.PI / 180);
    ctx.translate(-length / 2, -surfH / 2);

    drawLine(ctx, shaftStart, midY, shaftEnd, midY, `rgb(${color})`, Math.trunc(thickness));
    const head = [[length, midY], [shaftEnd, midY - thickness * 1.8], [shaftEnd, midY + thickness * 1.8]];
    drawPolygon(ctx, head, `rgb(${color})`, COLOR_WHITE, 1);
    fillPolygon(ctx, [[0, midY - thickness * 1.6], [shaftStart, midY], [0, midY - 1]], `rgb(${color})`);
    fillPolygon(ctx, [[0, midY + thickness * 1.6], [shaftStart, midY], [0, midY + 1]], `rgb(${color})`);
    ctx.restore();
}

// 플레이어 앞에 활을 그리고 drawRatio(0~1)만큼 시위를 당긴다. 화살을 거는 위치를 돌려준다
function drawBow(ctx, cx, cy, facing, drawRatio, limbColor, stringColor = 'rgb(225, 225, 215)') {
    const [fx, fy] = normalizeOr(facing);
    const px = -fy;
    const py = fx;
    const ox = cx + fx * 18;
    const oy = cy + fy * 18;
    const half = 32;

    const tip1 = [ox + px * half, oy + py * half];
    const tip2 = [ox - px * half, oy - py * half];
    const belly = [ox + fx * 10, oy + fy * 10];

    ctx.strokeStyle = limbColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let i = 0; i <= 8; i++) {
        const t = i / 8;
        const bx = (1 - t) ** 2 * tip1[0] + 2 * (1 - t) * t * belly[0] + t ** 2 * tip2[0];
        const by = (1 - t) ** 2 * tip1[1] + 2 * (1 - t) * t * belly[1] + t ** 2 * tip2[1];
        if (i === 0) ctx.moveTo(bx, by);
        else ctx.lineTo(bx, by);
    }
    ctx.stroke();

    const pull = 20 * drawRatio;
    const nock = [ox - fx * pull, oy - fy * pull];
    drawLine(ctx, tip1[0], tip1[1], nock[0], nock[1], stringColor, 2);
    drawLine(ctx, tip2[0], tip2[1], nock[0], nock[1], stringColor, 2);
    return nock;
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
    }

    update() {}

    isExpired() { return Time.now - this.createdTime >= this.lifespan; }

    collidesWith(target) {
        if (!canBeHit(this, target)) return false;
        return Math.hypot(target.rect.centerx - this.posX, target.rect.centery - this.posY) <= this.radius;
    }

    draw(ctx) {
        const p = Math.min(1.0, Math.max(0.0, (Time.now - this.createdTime) / this.lifespan));
        const alpha = Math.max(0, Math.trunc(200 * (1.0 - p))) / 255;
        drawCircle(ctx, this.posX, this.posY, Math.max(1, Math.trunc(this.radius * p)), `rgba(255, 140, 40, ${alpha})`);
    }
}

// ==========================================
// 평타 화살 (철/폭파/감속). 3연사로 쏜 화살은 벽에 3번 튕긴다
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
        if (this.arrowType === 'slow') slow(target, 1.6, 20 + 45 * this.chargeRatio);
        this.lifespan = 0;
    }

    draw(ctx) {
        if (this.exploded) return;
        drawArrowShape(ctx, this.posX, this.posY, this.angle, 22 + 18 * this.chargeRatio,
                       ARROW_COLORS[this.arrowType], 2 + 2 * this.chargeRatio);
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

    applyEffect() {
        this.lifespan = 0;
    }

    draw(ctx) {
        drawCircle(ctx, Math.trunc(this.posX), Math.trunc(this.posY), 14, `rgba(255, 215, 0, ${70 / 255})`);
        // 원본은 6도 단위로 회전한 그림을 캐싱해서 쓴다
        const bucket = (Math.round(this.angle / 6) * 6) % 360;
        drawArrowShape(ctx, this.posX, this.posY, bucket, 26, '255, 215, 0', 3);
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

        drawCircle(ctx, cx, cy, Math.trunc(34 * (1.0 - p * 0.5)), `rgba(255, 215, 0, ${Math.trunc(90 * (1.0 - p)) / 255})`);
        drawBow(ctx, cx, cy, [fx, fy], drawRatio, `rgba(255, 215, 0, ${alpha})`, `rgba(255, 255, 255, ${alpha})`);
    }
}

class ArcherUltSkill extends Skill {
    constructor() {
        super('Arrow Storm', 500, ['ult', 'projectile'], -99999);
        this.ultChargeRate = 3.0;
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
    player.maxHp = 95;
    player.hp = player.maxHp;
    player.baseAtk = 13;
    player.speed = 4.5;
    player.archerArrowType = 'iron';
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
            // 옆에 충전 막대 (화살 색으로 채움)
            const ratio = player.archerChargeRatio;
            const barW = 8;
            const barH = 44;
            const gx = r.right + 8;
            const gy = r.centery - Math.floor(barH / 2);
            ctx.fillStyle = '#1e1e23';
            ctx.fillRect(gx, gy, barW, barH);
            ctx.strokeStyle = 'rgb(200, 200, 200)';
            ctx.lineWidth = 1;
            ctx.strokeRect(gx + 0.5, gy + 0.5, barW - 1, barH - 1);
            const fillH = Math.trunc(barH * ratio);
            if (fillH > 0) {
                ctx.fillStyle = `rgb(${color})`;
                ctx.fillRect(gx, gy + barH - fillH, barW, fillH);
            }

            // 활과 시위에 걸린 화살 (3연사 대기 중이면 3발)
            const nock = drawBow(ctx, r.centerx, r.centery, player.facing, ratio, 'rgb(120, 80, 40)');
            const [fx, fy] = player.facing;
            const tipDist = 16 + 10 * ratio;
            if (player.archerTripleShotPending) {
                const base = Math.atan2(fy, fx);
                for (const offset of [-12, 0, 12]) {
                    const a = base + offset * Math.PI / 180;
                    drawLine(ctx, nock[0], nock[1], nock[0] + Math.cos(a) * tipDist, nock[1] + Math.sin(a) * tipDist, `rgb(${color})`, 3);
                }
            } else {
                drawLine(ctx, nock[0], nock[1], nock[0] + fx * tipDist, nock[1] + fy * tipDist, `rgb(${color})`, 3);
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
    name: '궁수',
    desc: '평타: 활을 쏩니다(최대 26, 최소 7), 스킬 1: 화살 종류를 바꿀 수 있습니다(감속 화살, 폭발 화살, 철 화살), 스킬 2: 화살을 3개로 바꿔주고 벽에 닿으면 3번 튕깁니다, 궁극기: 부채꼴로 유도 화살 5개를 쏩니다(한발당 8)',
    apply: applyArcher,
    thumbnail: null,
};

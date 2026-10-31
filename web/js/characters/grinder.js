// 분쇄자 (abilities/grinder.py를 옮김)

// ==========================================
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
            slow(this.target, 0.1, 100);
            silence(this.target, 0.1);
        }
    }

    isExpired() {
        if (!this.target) return true;
        return Time.now - this.createdTime >= this.duration || this.distance() <= 40;
    }

    collidesWith() { return false; }

    draw(ctx) {
        if (this.target) {
            drawLine(ctx, this.owner.rect.centerx, this.owner.rect.centery, this.target.rect.centerx, this.target.rect.centery,
                     'rgb(160, 160, 160)', 4);
        }
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
        this.lifespan = 0;
    }

    draw(ctx) {
        drawLine(ctx, this.owner.rect.centerx, this.owner.rect.centery, Math.trunc(this.posX), Math.trunc(this.posY), 'rgb(160, 160, 160)', 4);
        drawPolygon(ctx, this.getPolygonPoints(), 'rgb(180, 50, 50)', COLOR_WHITE, 1);
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

    draw(ctx) {
        const r = this.rect;
        const warning = Time.now - this.createdTime < this.delay;
        ctx.fillStyle = warning ? `rgba(200, 50, 50, ${80 / 255})` : `rgba(220, 50, 50, ${210 / 255})`;
        ctx.beginPath();
        ctx.roundRect(r.x, r.y, r.w, r.h, 6);
        ctx.fill();
        const lw = warning ? 2 : 3;
        ctx.strokeStyle = warning ? `rgba(255, 100, 100, ${180 / 255})` : COLOR_WHITE;
        ctx.lineWidth = lw;
        ctx.beginPath();
        ctx.roundRect(r.x + lw / 2, r.y + lw / 2, r.w - lw, r.h - lw, 6);
        ctx.stroke();
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
    }

    draw(ctx) {
        const w = this.width;
        ctx.save();
        ctx.translate(Math.trunc(this.posX), Math.trunc(this.posY));
        ctx.rotate(-this.angle * Math.PI / 180);
        ctx.fillStyle = 'rgb(210, 100, 30)';
        ctx.fillRect(-w / 2, -w / 2, w, w);
        ctx.strokeStyle = COLOR_WHITE;
        ctx.lineWidth = 1;
        ctx.strokeRect(-w / 2 + 0.5, -w / 2 + 0.5, w - 1, w - 1);
        ctx.restore();
    }
}

class GrinderUltimateManager {
    constructor(owner, direction, attacks) {
        this.owner = owner;
        this.direction = direction;
        this.attacks = attacks;
        this.totalBullets = 15;
        this.firedCount = 0;
        this.interval = 60;
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
        }
    }

    isExpired() { return this.firedCount >= this.totalBullets; }

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

        this.radius = 45;
        this.dist = 55;
        this.dirVec = normalizeOr(direction);
        this.posX = owner.rect.centerx + this.dirVec[0] * this.dist;
        this.posY = owner.rect.centery + this.dirVec[1] * this.dist;
        this.effectAngle = 0.0;
    }

    update() {
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
    }

    // 평타 키를 떼거나 3초가 지나면 끝
    isExpired() {
        const keyPressed = this.owner.input.skills[0];
        if (!keyPressed || Time.now - this.createdTime >= 3000) {
            this.owner.grinderSpinActive = false;
            return true;
        }
        return false;
    }

    collidesWith(target) {
        if (!canBeHit(this, target)) return false;
        return Math.hypot(target.rect.centerx - this.posX, target.rect.centery - this.posY) <=
               this.radius + Math.max(target.rect.w, target.rect.h) / 2;
    }

    applyEffect(target) {
        this.hitPlayersTime.set(target, Time.now);
    }

    draw(ctx) {
        const x = this.posX;
        const y = this.posY;
        const r = this.radius;
        drawCircle(ctx, x, y, r, `rgba(200, 100, 50, ${100 / 255})`);
        drawCircle(ctx, x, y, r - 1, null, `rgba(255, 255, 255, ${200 / 255})`, 2);
        for (let i = 0; i < 4; i++) {
            const ang = (this.effectAngle + i * 90) * Math.PI / 180;
            drawLine(ctx, x, y, x + Math.cos(ang) * (r - 5), y + Math.sin(ang) * (r - 5), `rgba(255, 255, 255, ${220 / 255})`, 3);
        }
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
    player.maxHp = 130;
    player.hp = 130;
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
    desc: '평타: 톱을 돌려 범위 내에 대미지를 줍니다(9, 0.3초마다), 스킬 1: 그랩을 써 상대를 끌고 대미지를 줍니다(24), 약 1초간 이동불가+침묵, 스킬 2: 전방에 제어 슬램을 쓰고 대미지를 줍니다(32), 1초간 기절, 궁극기: 부채꼴로 투사체를 난사합니다(15발, 한발당 5)',
    apply: applyGrinder,
    thumbnail: null,
};

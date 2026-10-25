// 무투가 (abilities/fighter.py를 옮김)

const FIGHTER_IMAGE = loadImage('assets/fighter.png');

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

    draw(ctx) {
        drawPolygon(ctx, this.getPolygonPoints(), 'rgb(255, 180, 50)', COLOR_WHITE, 2);
    }
}

class FighterBasicSkill extends Skill {
    constructor() { super('Punch', 400); }

    use(owner, direction, attacks) {
        this.lastUsed = Time.now;
        attacks.push(new FighterBasicHitbox(owner, direction));
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

        this.width = 50;
        this.height = 40;
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

    draw(ctx) {
        drawPolygon(ctx, this.getPolygonPoints(), 'rgb(255, 140, 0)', COLOR_WHITE, 2);
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
    }
}

// ==========================================
// [스킬 2] 돌진 후 발차기 (밀치기 + 1초 기절)
// ==========================================
class FighterDashSlamHitbox {
    constructor(owner) {
        this.owner = owner;
        this.damage = owner.baseAtk * 1.5;
        this.createdTime = Time.now;
        this.lifespan = 200;
        this.hitPlayers = [];

        this.width = 70;
        this.height = 70;
        this.direction = owner.facing;
        this.posX = owner.rect.centerx + this.direction[0] * 35;
        this.posY = owner.rect.centery + this.direction[1] * 35;
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
        forcedMove(target, 0.2, 300, this.direction);
        slow(target, 1.0, 100);
        silence(target, 1.0);
    }

    draw(ctx) {
        drawPolygon(ctx, this.getPolygonPoints(), 'rgb(50, 150, 255)', COLOR_WHITE, 2);
    }
}

class FighterDashManager {
    constructor(owner, direction, attacks) {
        this.owner = owner;
        this.direction = direction;
        this.attacks = attacks;
        this.dashSpeed = 15.0;
        this.dashDuration = 150;
        this.createdTime = Time.now;
        this.damage = 0;
        this.hitPlayers = [];
        this.isDash = true;
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

    collidesWith() { return false; }

    draw() {}
}

class FighterDashSkill extends Skill {
    constructor() { super('Dash Slam', 4000, ['dash']); }

    use(owner, direction, attacks) {
        this.lastUsed = Time.now;
        attacks.push(new FighterDashManager(owner, direction, attacks));
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
    desc: '평타: 연속으로 주먹을 가까운 적에게 날립니다(15), 스킬 1: 연속펀치를 날립니다(8), 10개까지 모을 수 있습니다, 스킬 2: 발차기를 하며 도착 지점에 상대를 밉니다(23), 1초간 기절, 궁극기: 기를 모으며 앞에 크기가 크고 쎈 충격파를 3번 쏩니다(한발당 30)',
    apply: applyFighter,
    thumbnail: FIGHTER_IMAGE,
};

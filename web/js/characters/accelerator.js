// 가속자 (abilities/accelerator.py를 옮김)

const ACCELERATOR_IMAGE = loadImage('assets/accelerator.png');

// 잔상: 지나간 자리에 색 사각형이 잠깐 남는다
function drawAfterimages(ctx, afterimages, life, maxAlpha, outline) {
    for (const img of afterimages) {
        const alpha = Math.max(0, Math.trunc(maxAlpha * (1.0 - (Time.now - img.time) / life))) / 255;
        if (alpha <= 0) continue;
        const r = img.rect;
        ctx.fillStyle = `rgba(${img.color[0]}, ${img.color[1]}, ${img.color[2]}, ${alpha})`;
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = `rgba(${outline}, ${alpha})`;
        ctx.lineWidth = 1;
        ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
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

    draw(ctx) {
        drawPolygon(ctx, this.getPolygonPoints(), 'rgb(100, 220, 255)', COLOR_WHITE, 1);
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
class AcceleratorTimeField {
    constructor(owner, skill) {
        this.owner = owner;
        this.skill = skill;
        this.damage = 0;
        this.hitPlayers = [];
        this.forceExpire = false;
        this.afterimages = [];
        this.lastAfterimageTime = 0;
    }

    update() {
        if (!this.skill.isActive || this.owner.isUltActive) {
            this.forceExpire = true;
            return;
        }

        speedUp(this.owner, 0.3, 20);

        if (Time.now - this.lastAfterimageTime >= 80) {
            this.afterimages.push({ rect: this.owner.rect.copy(), time: Time.now, color: [100, 220, 255] });
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
        }
        return false;
    }

    draw(ctx) {
        ctx.fillStyle = `rgba(100, 200, 255, ${12 / 255})`;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        drawAfterimages(ctx, this.afterimages, 220, 160, '220, 245, 255');
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
        if (this.isActive) attacks.push(new AcceleratorTimeField(owner, this));
    }
}

// ==========================================
// [스킬 2] 시간 안정화: 체력 회복 + 과열 감소 + 궁극기 종료
// ==========================================
class AcceleratorHealEffect {
    constructor(owner) {
        this.owner = owner;
        this.createdTime = Time.now;
        this.lifespan = 500;
        this.damage = 0;
        this.hitPlayers = [];
    }

    update() {}

    isExpired() { return Time.now - this.createdTime >= this.lifespan; }

    collidesWith() { return false; }

    draw(ctx) {
        const progress = (Time.now - this.createdTime) / this.lifespan;
        const radius = Math.trunc(25 + 45 * progress);
        const alpha = Math.max(0, Math.trunc(220 * (1.0 - progress))) / 255;
        drawCircle(ctx, this.owner.rect.centerx, this.owner.rect.centery, radius - 2, null, `rgba(50, 255, 120, ${alpha})`, 4);
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
        attacks.push(new AcceleratorHealEffect(owner));
    }
}

// ==========================================
// [궁극기] 산데비스탄 오버드라이브: 공격력·속도 증가, 상대 감속. 시간이 지날수록 자기 체력이 깎인다
// ==========================================
const ACCELERATOR_BLUE_PALETTE = [
    [100, 220, 255], [0, 255, 200], [50, 150, 255],
    [140, 120, 255], [200, 240, 255], [0, 120, 255],
];

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
        this.flashTimer = 0;
    }

    update() {
        if (this.forceExpire) return;
        const elapsed = Time.now - this.startTime;

        speedUp(this.owner, 0.3, 30);

        if (Time.now - this.lastAfterimageTime >= 50) {
            const color = ACCELERATOR_BLUE_PALETTE[randomInt(0, ACCELERATOR_BLUE_PALETTE.length - 1)];
            this.afterimages.push({ rect: this.owner.rect.copy(), time: Time.now, color });
            this.lastAfterimageTime = Time.now;
        }
        this.afterimages = this.afterimages.filter(img => Time.now - img.time < 240);

        // 2.5초 뒤부터 점점 짧은 간격으로 자기 체력이 깎인다
        if (elapsed >= this.delayBeforeDamage && Time.now - this.lastDamageTick >= this.damageInterval) {
            this.owner.takeDamage(4.0);
            this.lastDamageTick = Time.now;
            this.flashTimer = 180;
            this.damageInterval = Math.max(200, this.damageInterval - 150);
        }

        if (this.flashTimer > 0) this.flashTimer -= 16;
    }

    isExpired() {
        if (this.forceExpire || Time.now - this.startTime >= this.lifespan) {
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
        }
        return false;
    }

    draw(ctx) {
        ctx.fillStyle = `rgba(40, 100, 200, ${20 / 255})`;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);

        if (this.flashTimer > 0) {
            ctx.fillStyle = `rgba(255, 40, 40, ${Math.trunc(100 * (this.flashTimer / 180)) / 255})`;
            ctx.fillRect(0, 0, WIDTH, HEIGHT);
        }

        drawAfterimages(ctx, this.afterimages, 240, 180, '255, 255, 255');
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
    name: '가속자',
    desc: '평타: 투사체를 빠르게 쏩니다(6, 2발 연속), 스킬 1: 가속을 하며 상대보다 이동속도가 증가합니다(상대 슬로우/쿨타임 지연 40%), 스킬 2: 체력을 일정 채워주며 가속을 멈출 수 있습니다(25%), 궁극기: 폭주를 하며 대미지와 속도가 증가합니다(각 30%, 상대 슬로우/쿨타임 지연 50%), 스킬 2를 눌러 취소할 수 있습니다',
    apply: applyAccelerator,
    thumbnail: ACCELERATOR_IMAGE,
};

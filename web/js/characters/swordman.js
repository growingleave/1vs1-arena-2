// 검사 (abilities/swordman.py를 옮김)

// ==========================================
// [검사 - 기본 참격] 부채꼴 근접 베기 (플레이어를 따라다님)
// ==========================================
class SwordmanSlashAttack {
    constructor(owner, direction, color) {
        this.owner = owner;
        this.color = color;
        this.damage = owner.baseAtk * 1.5;

        this.radius = 60;
        this.arcAngle = 120;
        this.duration = 150;
        this.startTime = Time.now;
        this.hitPlayers = [];

        this.canPenetrateWalls = true;
        this.baseAngle = directionToAngle(direction);
        this.update();
    }

    update() {
        this.ownerX = this.owner.rect.centerx;
        this.ownerY = this.owner.rect.centery;
    }


    isExpired() { return Time.now - this.startTime >= this.duration; }

    getPoints() {
        const progress = Math.min(1.0, (Time.now - this.startTime) / this.duration);
        const currentArc = this.arcAngle * progress;
        const startAngle = this.baseAngle - this.arcAngle / 2;

        const points = [[this.ownerX, this.ownerY]];
        const steps = 10;
        for (let i = 0; i <= steps; i++) {
            const rad = (startAngle + currentArc * (i / steps)) * Math.PI / 180;
            points.push([this.ownerX + this.radius * Math.cos(rad), this.ownerY - this.radius * Math.sin(rad)]);
        }
        return points;
    }

    collidesWith(target) {
        return canBeHit(this, target) && checkPolygonCollision(this.getPoints(), target.rect);
    }

    // 칼 이펙트(SlashVFX)가 주인공이라, 판정 범위는 옅게만 보여준다
    draw(ctx) {
        drawPolygon(ctx, this.getPoints(), withAlpha(this.color, 0.22), 'rgba(255, 255, 255, 0.35)', 1);
    }
}

// 평타 칼 이펙트: 부채꼴 그림(assets/swordman_slash.png)을 판정 부채꼴과 같은 방향으로 쓸며 드러낸다.
// 화면 효과 전용이라 게임 결과와는 무관하다 (vfx.js 설명 참고)
const SWORDMAN_SLASH_IMAGE = loadImage('assets/swordman_slash.png');
// 그림 정보 (400×222): 부채꼴 꼭짓점 위치(비율), 그림 속 반지름(px), 오른쪽/왼쪽 반지름 각도와 가운데 방향
const SWORDMAN_SLASH_APEX = [0.5034, 0.9953];
const SWORDMAN_SLASH_IMAGE_RADIUS = 221;
const SWORDMAN_SLASH_RIGHT = -19.2 * Math.PI / 180;
const SWORDMAN_SLASH_LEFT = -161.7 * Math.PI / 180;
const SWORDMAN_SLASH_CENTER = (SWORDMAN_SLASH_RIGHT + SWORDMAN_SLASH_LEFT) / 2;
const SWORDMAN_SLASH_RADIUS = 60; // 판정 반지름과 같게

function spawnSwordmanSlashVfx(owner, direction) {
    const faceAngle = Math.atan2(direction[1], direction[0]); // 화면 좌표 기준 바라보는 방향
    const k = SWORDMAN_SLASH_RADIUS / SWORDMAN_SLASH_IMAGE_RADIUS;
    Vfx.spawn(new RingSlashVFX(0, 0, {
        image: SWORDMAN_SLASH_IMAGE,
        follow: owner,
        width: 400 * k,
        height: 222 * k,
        anchorX: SWORDMAN_SLASH_APEX[0],
        anchorY: SWORDMAN_SLASH_APEX[1],
        color: owner.playerNum === 2 ? '#3c8cff' : '#ff4d40',
        rotation: faceAngle - SWORDMAN_SLASH_CENTER,
        // 판정처럼 오른쪽(바라보는 방향 +60도 쪽)에서 왼쪽으로 쓸고 지나간다
        startAngle: SWORDMAN_SLASH_RIGHT,
        sweepAngle: SWORDMAN_SLASH_LEFT - SWORDMAN_SLASH_RIGHT,
        sweep: 0.15,          // 판정 부채꼴(150ms)과 같은 속도
        fade: 0.3,
        spinTotal: 0,
        ghosts: 0,
        revealEase: 'linear',
        revealMode: 'rotate', // 그림이 돌면서 시작선 뒤에서 빠져나온다
        softEdge: 20 * Math.PI / 180,
    }));
}

// ==========================================
// [검사 - 강화 검기] 앞으로 날아가는 직사각형 (슬로우 30%)
// ==========================================
class SwordmanProjectileAttack {
    constructor(owner, direction, color) {
        this.owner = owner;
        this.direction = direction;
        this.color = color;
        this.damage = owner.baseAtk * 1.2;
        this.speed = 10.0;

        this.width = 15;
        this.height = 60;
        this.angle = directionToAngle(direction);

        this.posX = owner.rect.centerx;
        this.posY = owner.rect.centery;

        this.hitPlayers = [];
        this.createdTime = Time.now;
        this.lifespan = 1500;
        this.canPenetrateWalls = false;
    }

    getPolygonPoints() {
        return rotatedRectPoints(this.posX, this.posY, this.width, this.height, this.angle);
    }

    update() {
        const timeScale = this.owner.timeScale;
        this.posX += this.direction[0] * this.speed * timeScale;
        this.posY += this.direction[1] * this.speed * timeScale;
    }


    isExpired() {
        const outOfBounds = this.posX < -100 || this.posX > 1380 || this.posY < -100 || this.posY > 820;
        return outOfBounds || Time.now - this.createdTime >= this.lifespan;
    }

    collidesWith(target) {
        return canBeHit(this, target) && checkPolygonCollision(this.getPolygonPoints(), target.rect);
    }

    applyEffect(target) {
        slow(target, 2.0, 30);
    }

    draw(ctx) {
        drawPolygon(ctx, this.getPolygonPoints(), this.color, COLOR_WHITE, 2);
    }
}

// 돌진 공통: 돌진하는 동안 이동키로 더 움직이지 않게 슬로우 100%를 걸고, 끝나면 풀어준다
function finishDash(owner) {
    delete owner.statusEffects.slow;
    owner.speedMultiplier = 1.0;
}

// ==========================================
// [검사 - 스킬 1] 돌진 베기
// ==========================================
class SwordmanDashAttack {
    constructor(owner, direction, color) {
        this.owner = owner;
        this.direction = direction;
        this.color = color;
        this.damage = owner.baseAtk * 2.0;

        this.dashSpeed = 18.0;
        this.duration = 200;
        this.startTime = Time.now;
        this.hitPlayers = [];

        this.boxSize = 60;
        this.rect = new Rect(0, 0, this.boxSize, this.boxSize);
        this.rect.setCenter(owner.rect.centerx, owner.rect.centery);

        this.isDash = true;
        this.canPenetrateWalls = false;
    }

    update(walls) {
        slow(this.owner, 0.1, 100);
        const timeScale = this.owner.timeScale;
        moveEntityWithWalls(this.owner,
            this.direction[0] * this.dashSpeed * timeScale,
            this.direction[1] * this.dashSpeed * timeScale, walls);
        this.rect.setCenter(this.owner.rect.centerx, this.owner.rect.centery);
    }


    isExpired() {
        const expired = Time.now - this.startTime >= this.duration;
        if (expired) finishDash(this.owner);
        return expired;
    }

    collidesWith(target) {
        return canBeHit(this, target) && this.rect.colliderect(target.rect);
    }

    draw(ctx) {
        const r = this.rect;
        ctx.fillStyle = withAlpha(this.color, 100 / 255);
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = COLOR_WHITE;
        ctx.lineWidth = 2;
        ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    }
}

// ==========================================
// [검사 - 궁극기] 일섬 거대 돌진
// ==========================================
class SwordmanUltDashAttack {
    constructor(owner, direction, color) {
        this.owner = owner;
        this.direction = direction;
        this.color = color;
        this.damage = owner.baseAtk * 4.5;

        this.dashSpeed = 22.0;
        this.duration = 350;
        this.startTime = Time.now;
        this.hitPlayers = [];

        this.width = 70;
        this.height = 150;
        this.angle = directionToAngle(direction);
        this.posX = owner.rect.centerx;
        this.posY = owner.rect.centery;

        this.isDash = true;
        this.canPenetrateWalls = false;
    }

    update(walls) {
        slow(this.owner, 0.1, 100);
        const timeScale = this.owner.timeScale;
        moveEntityWithWalls(this.owner,
            this.direction[0] * this.dashSpeed * timeScale,
            this.direction[1] * this.dashSpeed * timeScale, walls);
        this.posX = this.owner.rect.centerx;
        this.posY = this.owner.rect.centery;
    }


    isExpired() {
        const expired = Time.now - this.startTime >= this.duration;
        if (expired) finishDash(this.owner);
        return expired;
    }

    getPolygonPoints() {
        return rotatedRectPoints(this.posX, this.posY, this.width, this.height, this.angle);
    }

    collidesWith(target) {
        return canBeHit(this, target) && checkPolygonCollision(this.getPolygonPoints(), target.rect);
    }

    draw(ctx) {
        drawPolygon(ctx, this.getPolygonPoints(), `rgba(255, 215, 0, ${90 / 255})`, COLOR_WHITE, 3);
    }
}

// ==========================================
// 스킬
// ==========================================
class SwordmanBasicSlash extends Skill {
    constructor() { super('Basic Slash', 400, ['melee', 'projectile']); }

    use(owner, direction, attacks, color) {
        this.lastUsed = Time.now;
        attacks.push(new SwordmanSlashAttack(owner, direction, color));
        spawnSwordmanSlashVfx(owner, direction);

        if (owner.slashEnhanceCount > 0) {
            attacks.push(new SwordmanProjectileAttack(owner, direction, color));
            owner.slashEnhanceCount -= 1;
        }
    }
}

class SwordmanDashSkill extends Skill {
    constructor() { super('Swordman Dash', 1500, ['dash']); } // 속박 시 사용 불가

    use(owner, direction, attacks, color) {
        this.lastUsed = Time.now;
        attacks.push(new SwordmanDashAttack(owner, direction, color));
    }
}

class SwordmanEnhanceSkill extends Skill {
    constructor() { super('Sword Enhance', 6000, ['buff']); }

    use(owner) {
        this.lastUsed = Time.now;
        owner.slashEnhanceCount = 3;
    }
}

class SwordmanUltSkill extends Skill {
    constructor() {
        super('Massive Ult Dash', 500, ['dash', 'ult'], -99999);
        this.ultChargeRate = 10.0;
    }

    use(owner, direction, attacks, color) {
        owner.castTimer = 1.0;
        defenseMod(owner, 1.0, 100); // 1초 기 모으는 동안 무적
        owner.pendingAction = () => {
            this.lastUsed = Time.now;
            attacks.push(new SwordmanUltDashAttack(owner, direction, color));
        };
    }
}

// ==========================================
// 캐릭터 등록
// ==========================================
function applySwordmanToPlayer(player) {
    player.maxHp = 100;
    player.hp = player.maxHp;
    player.baseAtk = 10;
    player.speed = 4.3;
    player.slashEnhanceCount = 0;

    player.abilities = [
        new SwordmanBasicSlash(),   // 평타
        new SwordmanDashSkill(),    // 스킬 1 (돌진)
        new SwordmanEnhanceSkill(), // 스킬 2 (검기 강화)
        new SwordmanUltSkill(),     // 궁극기 (일섬 돌진)
    ];
    player.ultChargeRate = player.abilities[3].ultChargeRate;
}

const SWORDMAN_CHARACTER_DATA = {
    id: 'SWORDMAN',
    name: '검사',
    desc: '평타: 부채꼴로 가까운 적을 공격합니다(15), 스킬 1(1.5초): 앞으로 돌진합니다(20), 스킬 2(6초): 평타 강화로 슬로우를 묻히는 검기 3개가 나옴(슬로우 30% 2초, 검기 12), 궁극기: 앞으로 강하게 돌진합니다(45)',
    apply: applySwordmanToPlayer,
    thumbnail: null,
};

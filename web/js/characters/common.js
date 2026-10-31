// 캐릭터들이 같이 쓰는 스킬 기본 틀과 그리기 도구

// 모든 스킬의 공통 부분: 쿨타임 확인
class Skill {
    constructor(name, cooldown, keywords = [], lastUsed = 0) {
        this.name = name;
        this.cooldown = cooldown;
        this.lastUsed = lastUsed;
        this.keywords = keywords;
    }

    canUse() {
        return Time.now - this.lastUsed >= this.cooldown;
    }
}

// 공격 판정이 상대를 맞힐 수 있는 상태인지 (무적/방어력 100이면 불가)
function canBeHit(attack, target) {
    return target !== attack.owner && !target.invincible && target.defense < 100.0;
}

function drawPolygon(ctx, points, fill, stroke, lineWidth) {
    if (points.length < 3) return;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
}

// 테두리 없이 채우기만 하는 다각형
function fillPolygon(ctx, points, fill) {
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
}

// (posX, posY)를 기준점으로, angleDeg(위쪽이 + 인 각도)만큼 돌린 로컬 좌표 점들을 실제 좌표로 바꾼다.
// 원본 코드의 get_polygon_points()가 하는 계산과 같다.
function transformLocalPoints(posX, posY, angleDeg, localPts) {
    const rad = angleDeg * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    return localPts.map(([lx, ly]) => [posX + (lx * cos - ly * sin), posY - (lx * sin + ly * cos)]);
}

function randomUniform(min, max) {
    return min + gameRandom() * (max - min);
}

function randomInt(min, max) { // min 이상 max 이하 정수 (파이썬 random.randint와 같음)
    return min + Math.floor(gameRandom() * (max - min + 1));
}

function drawCircle(ctx, x, y, radius, fill, stroke, lineWidth = 1) {
    ctx.beginPath();
    ctx.arc(x, y, Math.max(0, radius), 0, Math.PI * 2);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = lineWidth; ctx.stroke(); }
}

function drawLine(ctx, x1, y1, x2, y2, color, width = 1) {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
}

// 돌진류 스킬이 끝날 때 걸어둔 이동 잠금(슬로우 100%)과 침묵을 풀어준다
function clearDashLock(owner, { slowLock = true, silenceLock = false } = {}) {
    if (slowLock) {
        delete owner.statusEffects.slow;
        owner.speedMultiplier = 1.0;
    }
    if (silenceLock) {
        delete owner.statusEffects.silence;
        owner.silenced = false;
    }
}

// (x, y)가 가운데인 size x size 정사각형
function squareRect(x, y, size) {
    return new Rect(Math.trunc(x - size / 2), Math.trunc(y - size / 2), size, size);
}

// 방향 벡터를 길이 1로 (길이가 0이면 fallback)
function normalizeOr(direction, fallback = [1, 0]) {
    const len = Math.hypot(direction[0], direction[1]);
    return len === 0 ? fallback : [direction[0] / len, direction[1] / len];
}

// 방향(dirVec) 기준으로 길이 length, 폭 width인 직사각형 꼭짓점
function beamPoints(cx, cy, dirVec, perpVec, length, width) {
    const hl = length / 2;
    const hw = width / 2;
    const [dx, dy] = dirVec;
    const [px, py] = perpVec;
    return [
        [cx + dx * hl + px * hw, cy + dy * hl + py * hw],
        [cx + dx * hl - px * hw, cy + dy * hl - py * hw],
        [cx - dx * hl - px * hw, cy - dy * hl - py * hw],
        [cx - dx * hl + px * hw, cy - dy * hl + py * hw],
    ];
}

// 레이저 공통 (샌즈 블래스터, 마법사 관통 레이저):
// 쏜 자리 앞에 길이 length·폭 width인 직사각형. delay 동안은 경고만, 그 뒤 activeDuration 동안 판정
class BeamLaser {
    constructor(owner, direction, { damageMult, delay, activeDuration, width, length }) {
        this.owner = owner;
        this.damage = owner.baseAtk * damageMult;
        this.createdTime = Time.now;
        this.delay = delay;
        this.activeDuration = activeDuration;
        this.lifespan = delay + activeDuration;
        this.hitPlayers = [];
        this.canPenetrateWalls = true;
        this.width = width;
        this.length = length;
        this.dirVec = normalizeOr(direction);
        this.perpVec = [-this.dirVec[1], this.dirVec[0]];
        const forward = Math.floor(length / 2) + 30;
        this.posX = owner.rect.centerx + this.dirVec[0] * forward;
        this.posY = owner.rect.centery + this.dirVec[1] * forward;
    }

    getPolygonPoints() {
        return beamPoints(this.posX, this.posY, this.dirVec, this.perpVec, this.length, this.width);
    }

    corePoints() {
        return beamPoints(this.posX, this.posY, this.dirVec, this.perpVec, this.length, this.width / 2);
    }

    isWarning() { return Time.now - this.createdTime < this.delay; }

    update() {}

    isExpired() { return Time.now - this.createdTime >= this.lifespan; }

    collidesWith(target) {
        if (this.isWarning() || !canBeHit(this, target)) return false;
        return checkPolygonCollision(this.getPolygonPoints(), target.rect);
    }
}

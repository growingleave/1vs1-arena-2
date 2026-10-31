// 검사 (abilities/swordman.py를 옮김)

// 검사 이펙트 색: 은빛 칼날 (팀과 상관없이 같은 색, 캐릭터마다 고유 색을 쓴다)
const SWORDMAN_COLOR = '#c4d0e0';

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
        color: SWORDMAN_COLOR,
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
    // 칼끝이 지나가는 자리에서 튀는 불꽃 (그림과 같은 각도·속도로 지나간다)
    const rotation = faceAngle - SWORDMAN_SLASH_CENTER;
    Vfx.spawn(new SweepSparkVFX({
        follow: owner,
        color: SWORDMAN_COLOR,
        radius: SWORDMAN_SLASH_RADIUS,
        fromAngle: rotation + SWORDMAN_SLASH_RIGHT,
        toAngle: rotation + SWORDMAN_SLASH_LEFT,
        sweep: 0.15,
        count: 14,
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

        this.width = 24;  // 진행 방향 두께 (원래 15)
        this.height = 96; // 진행 방향과 수직인 길이 (원래 60)
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
        // 맞은 자리 불꽃 (화면 효과라 게임 결과와는 무관)
        Vfx.spawn(new HitSparkVFX(
            (this.posX + target.rect.centerx) / 2, (this.posY + target.rect.centery) / 2,
            { color: SWORDMAN_COLOR,
              angle: Math.atan2(this.direction[1], this.direction[0]), count: 12, size: 22 },
        ));
    }

    // 초승달 검기 그림을 판정 사각형에 맞춰 그린다 (그림이 아직 안 불러와졌으면 사각형)
    draw(ctx) {
        if (!isImageReady(SWORDMAN_WAVE_IMAGE)) {
            drawPolygon(ctx, this.getPolygonPoints(), this.color, COLOR_WHITE, 2);
            return;
        }
        // 그림 크기와 회전 중심을 판정 사각형에 맞춘다 (판정을 바꾸면 그림도 같이 커진다)
        const k = this.height / SWORDMAN_WAVE_SPAN;            // 화면 px / 그림 px
        const w = SWORDMAN_WAVE_W * k, h = SWORDMAN_WAVE_H * k;
        const anchorX = SWORDMAN_WAVE_FRONT - (this.width / 2) / k; // 판정 가운데 = 앞날에서 두께 절반 뒤
        const color = SWORDMAN_COLOR;
        ctx.save();
        ctx.translate(this.posX, this.posY);
        ctx.rotate(-this.angle * Math.PI / 180); // angle은 위쪽이 + 기준이라 화면 회전은 반대
        ctx.globalCompositeOperation = 'lighter';
        const x = -anchorX * k, y = -h / 2;
        ctx.drawImage(vfxTinted(SWORDMAN_WAVE_IMAGE, color), x, y, w, h);
        ctx.globalAlpha = 0.55;
        ctx.drawImage(SWORDMAN_WAVE_IMAGE, x, y, w, h); // 흰 그림을 겹쳐 앞날을 밝게
        ctx.restore();
    }
}

// 검기 그림 (assets/swordman_wave.png, 오른쪽으로 날아가는 초승달)
// 원본 900x1024 기준: 초승달 끝~끝 940px(판정 길이에 맞춤), 가운데 앞날 x 780
const SWORDMAN_WAVE_IMAGE = loadImage('assets/swordman_wave.png');
const SWORDMAN_WAVE_W = 900, SWORDMAN_WAVE_H = 1024;
const SWORDMAN_WAVE_SPAN = 940;
const SWORDMAN_WAVE_FRONT = 780;

// 돌진 베기 그림 (assets/swordman_dash.png 375x180, 오른쪽으로 긋는 일섬, tools/swordman_dash_gen.js로 생성)
// 그림 속 꼬리 x 35 ~ 앞끝 x 325, 가운데 선 y 90. 세로는 원본 설계 배율(돌진 276px ↔ 그림 290px)을 그대로 쓴다
const SWORDMAN_DASH_IMAGE = loadImage('assets/swordman_dash.png');
const SWORDMAN_DASH_X0 = 35, SWORDMAN_DASH_X1 = 325, SWORDMAN_DASH_CY = 90;
const SWORDMAN_DASH_SCALE_Y = 276 / 290;

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

        // 돌진 베기 그림: 출발점에서 플레이어가 지나간 만큼 드러난다 (화면 효과라 게임 결과와는 무관)
        Vfx.spawn(new StretchSlashVFX({
            image: SWORDMAN_DASH_IMAGE,
            follow: owner,
            isActive: () => Time.now - this.startTime < this.duration, // 벽에 막히면 startTime이 당겨져 일찍 끝난다
            angle: Math.atan2(direction[1], direction[0]),
            imageX0: SWORDMAN_DASH_X0, imageX1: SWORDMAN_DASH_X1, imageCY: SWORDMAN_DASH_CY,
            scaleY: SWORDMAN_DASH_SCALE_Y,
            back: 30, front: 30, // 판정 상자 절반만큼 앞뒤로
            // 그림은 끝까지 돌진한 크기(18px x 12틱)로 고정하고, 지나간 만큼 천천히 드러낸다
            fullDist: this.dashSpeed * this.duration / (1000 / 60),
            softEdge: 40,
            color: SWORDMAN_COLOR,
            fade: 0.3,
        }));
        // 돌진 꼬리: 뒤로 흩날리는 은빛 불꽃
        Vfx.spawn(new TrailSparkVFX(owner, () => Time.now - this.startTime < this.duration,
            { color: SWORDMAN_COLOR, angle: Math.atan2(direction[1], direction[0]), rate: 90, side: 18 }));
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

    applyEffect(target) {
        Vfx.spawn(new HitSparkVFX(target.rect.centerx, target.rect.centery,
            { color: SWORDMAN_COLOR, angle: Math.atan2(this.direction[1], this.direction[0]), count: 14, size: 30 }));
    }

    // 돌진 베기 그림(StretchSlashVFX)이 대신 보여서, 그림이 아직 안 불러와졌을 때만 상자를 그린다
    draw(ctx) {
        if (isImageReady(SWORDMAN_DASH_IMAGE)) return;
        const r = this.rect;
        ctx.fillStyle = withAlpha(this.color, 100 / 255);
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = COLOR_WHITE;
        ctx.lineWidth = 2;
        ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    }
}

// ==========================================
// [검사 - 궁극기] 일섬: 선딜 → 전방 돌진(닿은 적 기절) → 납도 → 지나온 길이 베이며 피해
// ==========================================
const SWORDMAN_ULT_WINDUP = 0.6;  // 선딜(초), 무적
const SWORDMAN_ULT_SHEATH = 0.6;  // 납도 연출(초), 못 움직이고 무적
const SWORDMAN_ULT_STUN_AFTER = 0.5; // 마지막 참격 뒤에도 남는 기절(초)
const SWORDMAN_ULT_HITS = 9;         // 납도 끝에 빠바박 들어가는 참격 수 (피해를 나눠서)
const SWORDMAN_ULT_HIT_GAP = 60;     // 참격 간격(ms)

// 납도 그림 (tools/swordman_sheath_gen.js로 생성, 가로, 입구·손잡이가 오른쪽)
//   칼집 190x30 (입구 x 185) / 칼 260x30 (칼날이 끝나는 곳 x 178)
const SWORDMAN_SCABBARD_IMAGE = loadImage('assets/swordman_scabbard.png');
const SWORDMAN_SWORD_IMAGE = loadImage('assets/swordman_sword.png');
const SWORDMAN_SHEATH_SCALE = 0.45; // 그림 px → 화면 px (칼집 약 85px)

// 납도: 검사 앞에 칼집과 칼이 가로로 나타나고, 칼이 처음엔 천천히·끝에서 빠르게 칼집으로 들어간다.
// 들어가는 동안 입구에서 쇳가루 불꽃, 다 들어가면 "찰칵" 섬광·고리·불꽃 (화면 효과 전용)
class SwordmanSheathVFX extends SparkVFX {
    constructor(follow, duration) {
        super(SWORDMAN_COLOR);
        this.follow = follow;
        this.duration = duration;      // 납도 시간 (찰칵은 80% 지점)
        this.clickAt = duration * 0.8;
        this.appear = 0.08;
        this.fadeOut = 0.25;
        this.carry = 0;
        this.clicked = false;
    }

    get finished() { return this.elapsed >= this.duration + this.fadeOut && this.sparksDone; }

    // 칼집 왼쪽 끝 x, 입구 x, 높이 y
    layout() {
        const k = SWORDMAN_SHEATH_SCALE;
        const cx = this.follow.rect.centerx, y = this.follow.rect.centery + 10;
        const x0 = cx - 190 * k / 2 - 10;
        return { k, x0, mouth: x0 + 185 * k, y };
    }

    update(dt) {
        super.update(dt);
        const { mouth, y } = this.layout();
        if (this.elapsed > this.appear && this.elapsed < this.clickAt) {
            this.carry += 45 * dt; // 들어가는 동안 입구에서 쇳가루 불꽃
            while (this.carry >= 1) {
                this.carry -= 1;
                this.addSpark(mouth + 2, y + vfxRand(-3, 3), -Math.PI / 2 + vfxRand(-1, 1) + 0.4, vfxRand(40, 140), vfxRand(0.12, 0.25), vfxRand(0.8, 1.5));
            }
        }
        if (!this.clicked && this.elapsed >= this.clickAt) {
            this.clicked = true;
            for (let i = 0; i < 12; i++) this.addSpark(mouth, y, Math.random() * Math.PI * 2, vfxRand(80, 220), vfxRand(0.15, 0.35), vfxRand(1, 2));
        }
    }

    draw(ctx) {
        const { k, x0, mouth, y } = this.layout();
        const t = this.elapsed;
        const alpha = Math.min(1, t / this.appear) * (t > this.duration ? Math.max(0, 1 - (t - this.duration) / this.fadeOut) : 1);
        ctx.save();
        if (alpha > 0 && isImageReady(SWORDMAN_SWORD_IMAGE) && isImageReady(SWORDMAN_SCABBARD_IMAGE)) {
            // 다 들어간 자리 = 칼날 끝(178)이 입구에 오는 곳. 처음엔 칼날 대부분이 밖에 나와 있다
            const u = Math.min(1, Math.max(0, (t - this.appear) / (this.clickAt - this.appear)));
            const out = 150 * k * (1 - u * u * u);
            ctx.globalAlpha = alpha;
            ctx.drawImage(SWORDMAN_SWORD_IMAGE, mouth - 178 * k + out, y - 15 * k, 260 * k, 30 * k);
            ctx.drawImage(SWORDMAN_SCABBARD_IMAGE, x0, y - 15 * k, 190 * k, 30 * k); // 칼집이 위 → 속 칼날은 가려짐
            ctx.globalAlpha = 1;
            if (u < 1) { // 칼날 위를 지나가는 반짝임
                const gx = mouth + out * (0.3 + 0.7 * ((t * 4) % 1));
                const g = ctx.createRadialGradient(gx, y, 0, gx, y, 7);
                g.addColorStop(0, 'rgba(255,255,255,0.9)'); g.addColorStop(1, 'rgba(255,255,255,0)');
                ctx.globalCompositeOperation = 'lighter';
                ctx.fillStyle = g; ctx.beginPath(); ctx.arc(gx, y, 7, 0, Math.PI * 2); ctx.fill();
                ctx.globalCompositeOperation = 'source-over';
            }
        }
        if (this.clicked) { // 찰칵: 입구에서 섬광 + 퍼지는 고리
            const c = Math.min(1, (t - this.clickAt) / 0.25), a = 1 - c;
            if (a > 0) {
                const [r, g, b] = this.rgb;
                ctx.globalCompositeOperation = 'lighter';
                ctx.strokeStyle = `rgba(${r},${g},${b},${a * 0.9})`; ctx.lineWidth = 3 * a + 0.5;
                ctx.beginPath(); ctx.arc(mouth, y, 6 + 34 * c, 0, Math.PI * 2); ctx.stroke();
                const fl = ctx.createRadialGradient(mouth, y, 0, mouth, y, 22);
                fl.addColorStop(0, `rgba(255,255,255,${a})`); fl.addColorStop(1, `rgba(${r},${g},${b},0)`);
                ctx.fillStyle = fl; ctx.beginPath(); ctx.arc(mouth, y, 22, 0, Math.PI * 2); ctx.fill();
            }
        }
        ctx.globalCompositeOperation = 'lighter';
        this.drawSparks(ctx);
        ctx.restore();
    }
}

// 궁극기 그림 (tools/swordman_ult_gen.js로 생성, 은색과 색 번짐이 이미 들어 있고 글리치만 다른 2장씩)
//   돌진: 800x210, 길 x 60~690, 가운데 y 105 / 베기: 800x400, 길 x 40~760, 가운데 y 200
const swordmanUltImages = (kind) => [0, 1].map(i => loadImage(`assets/swordman_ult_${kind}_silver_${i}.png`));
const SWORDMAN_ULT_DASH_IMAGES = swordmanUltImages('dash');
const SWORDMAN_ULT_CUT_IMAGES = swordmanUltImages('cut');

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
        this.marked = [];      // 돌진에 닿아 기절한 대상 (납도가 끝나면 피해)
        this.phase = 'dash';   // 'dash' → 'sheath' → 'cut'
        this.cutStart = 0;
        this.hitsDone = 0;
        this.sheathStart = 0;

        this.width = 70;
        this.height = 150;
        this.angle = directionToAngle(direction);
        this.startX = owner.rect.centerx;
        this.startY = owner.rect.centery;
        this.posX = this.startX;
        this.posY = this.startY;

        this.isDash = true;
        this.canPenetrateWalls = false;

        // 돌진 자국: 가는 가로줄 + 글리치, 지나간 만큼 드러난다
        const fullDist = this.dashSpeed * this.duration / (1000 / 60);
        Vfx.spawn(new StretchSlashVFX({
            images: SWORDMAN_ULT_DASH_IMAGES,
            frameTime: 0.05,
            colored: true,
            follow: owner,
            isActive: () => this.phase === 'dash',
            angle: Math.atan2(direction[1], direction[0]),
            imageX0: 60, imageX1: 690, imageCY: 105,
            scaleY: (fullDist + 70) / 630, // 가로와 같은 배율 (찌그러지지 않게)
            back: 35, front: 35,
            fullDist,
            softEdge: 50,
            fade: SWORDMAN_ULT_SHEATH, // 납도하는 동안 서서히 사라진다
        }));
        Vfx.spawn(new TrailSparkVFX(owner, () => this.phase === 'dash',
            { color: SWORDMAN_COLOR, angle: Math.atan2(direction[1], direction[0]), rate: 160, side: 60, spread: 0.4, size: 1.3 }));
    }

    update(walls) {
        if (this.phase !== 'dash') return;
        slow(this.owner, 0.1, 100);
        const timeScale = this.owner.timeScale;
        moveEntityWithWalls(this.owner,
            this.direction[0] * this.dashSpeed * timeScale,
            this.direction[1] * this.dashSpeed * timeScale, walls);
        this.posX = this.owner.rect.centerx;
        this.posY = this.owner.rect.centery;
    }

    // 돌진이 끝나면 납도, 납도가 끝나면 베기. 납도가 끝나야 사라진다
    isExpired() {
        if (this.phase === 'dash') {
            if (Time.now - this.startTime < this.duration) return false; // 벽에 막히면 startTime이 당겨져 일찍 끝난다
            this.startSheath();
            return false;
        }
        if (this.phase === 'sheath') {
            if (Time.now - this.sheathStart < SWORDMAN_ULT_SHEATH * 1000) return false;
            this.startCut();
        }
        // 참격: 간격마다 한 번씩, 다 들어가면 끝
        while (this.hitsDone < SWORDMAN_ULT_HITS && Time.now - this.cutStart >= this.hitsDone * SWORDMAN_ULT_HIT_GAP) {
            this.slashHit();
        }
        return this.hitsDone >= SWORDMAN_ULT_HITS;
    }

    startSheath() {
        this.phase = 'sheath';
        this.sheathStart = Time.now;
        finishDash(this.owner);
        this.owner.castTimer = SWORDMAN_ULT_SHEATH;          // 납도하는 동안 아무것도 못 함
        defenseMod(this.owner, SWORDMAN_ULT_SHEATH, 100);    // 무적
        Vfx.spawn(new SwordmanSheathVFX(this.owner, SWORDMAN_ULT_SHEATH));
    }

    // 납도 끝: 지나온 길이 베이고, 기절시킨 대상에게 피해
    // 납도 끝: 맞힌 적이 있을 때만 지나온 길이 베이는 그림 (빗나가면 아무것도 안 나온다)
    startCut() {
        this.phase = 'cut';
        this.cutStart = Time.now;
        this.hitsDone = 0;
        if (this.marked.length === 0) {
            this.hitsDone = SWORDMAN_ULT_HITS; // 빗나감: 참격 없이 끝
            return;
        }
        Vfx.spawn(new CutBurstVFX(this.startX, this.startY, this.posX, this.posY, {
            images: SWORDMAN_ULT_CUT_IMAGES,
            frameTime: 0.04,
            imageX0: 40, imageX1: 760, imageCY: 200,
            margin: 35, scaleY: 0.8, duration: 0.55, darken: 0.4,
        }));
        // 지나온 길을 따라 은빛 불꽃이 터진다
        for (let n = 0; n < 6; n++) {
            const u = (n + 0.5) / 6;
            Vfx.spawn(new HitSparkVFX(this.startX + (this.posX - this.startX) * u, this.startY + (this.posY - this.startY) * u,
                { color: SWORDMAN_COLOR, angle: Math.atan2(this.direction[1], this.direction[0]) + (n % 2 ? 1.2 : -1.2), count: 10, size: 24 }));
        }
        Vfx.shake(7, 0.2);
    }

    // 참격 한 번: 맞힌 적마다 직선 참격 이펙트 + 피해 (전체 피해를 참격 수로 나눔)
    slashHit() {
        this.hitsDone++;
        const color = SWORDMAN_COLOR;
        for (const target of this.marked) {
            if (!canBeHit(this, target)) continue;
            const finalDamage = target.takeDamage(this.damage / SWORDMAN_ULT_HITS);
            this.owner.addUltGauge(finalDamage * this.owner.ultChargeMultiplier);
            Vfx.spawn(new StraightSlashVFX(target.rect.centerx, target.rect.centery, { color, length: 190 }));
        }
        Vfx.shake(4, 0.08);
    }

    getPolygonPoints() {
        return rotatedRectPoints(this.posX, this.posY, this.width, this.height, this.angle);
    }

    // 돌진 중 닿으면 피해 없이 기절만 건다 (피해는 납도가 끝난 뒤 slashHit()에서 나눠서).
    // 그래서 game.js가 바로 피해를 주지 않도록 항상 false를 돌려준다
    collidesWith(target) {
        if (this.phase !== 'dash' || this.marked.includes(target)) return false;
        if (canBeHit(this, target) && checkPolygonCollision(this.getPolygonPoints(), target.rect)) {
            const remain = Math.max(0, this.duration - (Time.now - this.startTime)) / 1000;
            const hitsTime = (SWORDMAN_ULT_HITS - 1) * SWORDMAN_ULT_HIT_GAP / 1000;
            const stunTime = remain + SWORDMAN_ULT_SHEATH + hitsTime + SWORDMAN_ULT_STUN_AFTER;
            slow(target, stunTime, 100);
            silence(target, stunTime); // 이동 불가 + 침묵 = 기절
            this.marked.push(target);
            Vfx.spawn(new HitSparkVFX(target.rect.centerx, target.rect.centery,
                { color: SWORDMAN_COLOR, angle: Math.atan2(this.direction[1], this.direction[0]), count: 16, size: 34 }));
        }
        return false;
    }

    // 그림(돌진 자국, 납도, 베기)이 대신 보여서 판정 범위는 그리지 않는다
    draw(ctx) {
        if (isImageReady(SWORDMAN_DASH_IMAGE)) return;
        if (this.phase === 'dash') drawPolygon(ctx, this.getPolygonPoints(), `rgba(255, 215, 0, ${90 / 255})`, COLOR_WHITE, 3);
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
        owner.castTimer = SWORDMAN_ULT_WINDUP;
        defenseMod(owner, SWORDMAN_ULT_WINDUP, 100); // 기 모으는 동안 무적
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
    desc: '평타: 부채꼴로 가까운 적을 공격합니다(15), 스킬 1(1.5초): 앞으로 돌진합니다(20), 스킬 2(6초): 평타 강화로 슬로우를 묻히는 검기 3개가 나옴(슬로우 30% 2초, 검기 12), 궁극기: 0.6초 기를 모은 뒤 앞으로 돌진해 닿은 적을 기절시키고, 검을 넣는 순간 지나온 길이 베이며 9번 연속 참격이 들어갑니다(5x9)',
    apply: applySwordmanToPlayer,
    thumbnail: null,
};

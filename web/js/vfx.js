// 화면 효과(VFX) 전용. 게임 계산과 완전히 따로 돌아간다.
//
// - 게임 상태(피해, 위치, 쿨타임)를 바꾸지 않고, gameRandom()도 쓰지 않는다 (Math.random()은 써도 된다).
//   그래서 온라인 대전에서 두 기기의 이펙트 모양이 조금 달라도 게임 결과는 항상 같다.
// - 실제 흐른 시간(초)으로 움직이고, 화면을 그릴 때마다 갱신된다.
// - 동시에 남는 개수에 상한을 둬서 렉을 막는다 (넘으면 가장 오래된 것부터 지운다).

const VFX_MAX_ACTIVE = 16;

const Vfx = {
    active: [],

    spawn(effect) {
        this.active.push(effect);
        if (this.active.length > VFX_MAX_ACTIVE) this.active.shift();
    },

    update(dtSec) {
        for (const v of this.active) v.update(dtSec);
        this.active = this.active.filter(v => !v.finished);
    },

    draw(ctx) {
        for (const v of this.active) v.draw(ctx);
    },

    clear() {
        this.active = [];
    },
};

// ==========================================
// SlashVFX: 칼로 베는 이펙트 (궤적 + 튀는 불꽃 + 가운데 섬광)
// 보내주신 slash-vfx.js를 우리 게임 형식(일반 <script>)에 맞게 옮긴 것.
// 바뀐 점: export 제거, curve(휘는 정도·방향)와 sweep(그어지는 시간)을 옵션으로 정할 수 있게 함, 빨간 색 추가
//
// 옵션
//   palette:  'blue' | 'orange' | 'purple' | 'red' | { core, mid, edge } (#rrggbb)
//   angle:    궤적이 지나가는 방향(라디안, 화면 좌표: 오른쪽 0, 아래쪽 +)
//   length:   궤적 길이(px, scale이 곱해진다)
//   curve:    궤적이 휘는 정도(px). +면 angle의 왼쪽 법선 방향으로 휜다. 없으면 무작위
//   scale:    전체 크기 배율 (기본 1)
//   duration: 궤적이 사라질 때까지 걸리는 시간(초, 기본 0.9)
//   sweep:    궤적이 끝까지 그어지는 시간(초). 없으면 원본처럼 duration에 맞춰 그어진다
// ==========================================
const SLASH_PALETTES = {
    blue:   { core: '#eaf7ff', mid: '#6fd8ff', edge: '#1c6f9e' },
    orange: { core: '#fff3ea', mid: '#ff9a5c', edge: '#8a3d14' },
    purple: { core: '#f3eaff', mid: '#b98bff', edge: '#4a2a8a' },
    red:    { core: '#fff0ee', mid: '#ff6b5c', edge: '#8a1c14' },
};

function vfxRand(a, b) { return a + Math.random() * (b - a); }

function vfxHexToRgb(hex) {
    const n = parseInt(hex.slice(1), 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

// 섬광용 원형 그라데이션은 매번 만들면 비싸서, 색마다 한 번만 그려두고 재사용한다
const VFX_GLOW_SIZE = 256;
const vfxGlowCache = new Map();

function vfxGlowSprite(coreHex) {
    let sprite = vfxGlowCache.get(coreHex);
    if (sprite) return sprite;

    sprite = document.createElement('canvas');
    sprite.width = sprite.height = VFX_GLOW_SIZE;
    const octx = sprite.getContext('2d');
    const [r, g, b] = vfxHexToRgb(coreHex);
    const half = VFX_GLOW_SIZE / 2;
    const grad = octx.createRadialGradient(half, half, 0, half, half, half);
    grad.addColorStop(0, `rgba(${r},${g},${b},0.8)`);
    grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
    octx.fillStyle = grad;
    octx.fillRect(0, 0, VFX_GLOW_SIZE, VFX_GLOW_SIZE);

    vfxGlowCache.set(coreHex, sprite);
    return sprite;
}

class SlashVFX {
    constructor(x, y, options = {}) {
        const scale = options.scale ?? 1;
        this.palette = typeof options.palette === 'object'
            ? options.palette
            : (SLASH_PALETTES[options.palette] ?? SLASH_PALETTES.blue);

        this.duration = options.duration ?? 0.9;
        this.t = 0; // 0..1 전체 진행도 (사라지는 정도)
        // 궤적 끝(u)이 1에 닿는 시간. 원본은 t + 0.18 >= 1, 즉 duration의 82% 시점
        this.sweep = options.sweep ?? this.duration * 0.82;
        this.elapsed = 0;

        const angle = options.angle ?? (vfxRand(-0.5, 0.5) - Math.PI / 4);
        const length = (options.length ?? vfxRand(260, 380)) * scale;
        const curve = options.curve ?? vfxRand(60, 130) * scale * (Math.random() < 0.5 ? 1 : -1);

        this.x0 = x - Math.cos(angle) * length * 0.5;
        this.y0 = y - Math.sin(angle) * length * 0.5;
        this.x1 = x + Math.cos(angle) * length * 0.5;
        this.y1 = y + Math.sin(angle) * length * 0.5;
        const nx = -Math.sin(angle);
        const ny = Math.cos(angle);
        this.mx = (this.x0 + this.x1) / 2 + nx * curve;
        this.my = (this.y0 + this.y1) / 2 + ny * curve;
        this.width = vfxRand(10, 16) * scale;

        // 궤적을 따라 바깥으로 튀는 불꽃
        this.sparks = [];
        const shardCount = Math.round(22 * scale);
        for (let i = 0; i < shardCount; i++) {
            const u = i / shardCount + vfxRand(-0.03, 0.03);
            const bx = (1 - u) * (1 - u) * this.x0 + 2 * (1 - u) * u * this.mx + u * u * this.x1;
            const by = (1 - u) * (1 - u) * this.y0 + 2 * (1 - u) * u * this.my + u * u * this.y1;
            const outAngle = Math.atan2(by - y, bx - x) + vfxRand(-0.4, 0.4);
            const speed = vfxRand(2, 7) * 60; // px/초
            this.sparks.push({
                x: bx, y: by,
                vx: Math.cos(outAngle) * speed,
                vy: Math.sin(outAngle) * speed - vfxRand(0, 90),
                life: 1,
                decay: vfxRand(0.8, 2.0), // 초당
                size: vfxRand(1.5, 4.5) * scale,
                spin: vfxRand(-0.2, 0.2),
            });
        }

        this.flash = { r: 0, maxR: vfxRand(70, 110) * scale, life: 1, x, y };

        // 색 문자열을 매 프레임 새로 계산하지 않게 미리 만들어 둔다
        this.rgb = {
            edge: vfxHexToRgb(this.palette.edge),
            mid: vfxHexToRgb(this.palette.mid),
            core: vfxHexToRgb(this.palette.core),
        };
    }

    get finished() {
        return this.t >= 1.1 && this.flash.life <= 0 && this.sparks.every(s => s.life <= 0);
    }

    update(dt) {
        this.t += dt / this.duration;
        this.elapsed += dt;

        this.flash.r += (this.flash.maxR - this.flash.r) * Math.min(1, dt * 15);
        this.flash.life -= dt * 4;

        for (const s of this.sparks) {
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            s.vy += 48 * dt; // 중력
            s.vx *= Math.pow(0.98, dt * 60);
            s.life -= s.decay * dt;
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter'; // 겹칠수록 밝아지게

        this.drawTrail(ctx);
        if (this.flash.life > 0) this.drawFlash(ctx);
        for (const s of this.sparks) if (s.life > 0) this.drawSpark(ctx, s);

        ctx.restore();
    }

    drawTrail(ctx) {
        const { x0, y0, x1, y1, mx, my, t, width } = this;
        const fade = Math.max(0, 1 - t * 1.4);
        if (fade <= 0) return;

        const steps = 40;
        const head = Math.min(1, this.elapsed / this.sweep); // 궤적이 지금 어디까지 그어졌는지
        const passes = [
            [this.rgb.edge, 2.6, 0.22],
            [this.rgb.mid, 1.4, 0.5],
            [this.rgb.core, 0.5, 0.9],
        ];
        for (const [[r, g, b], widthMul, alphaMul] of passes) {
            ctx.beginPath();
            for (let i = 0; i <= steps; i++) {
                const u = i / steps;
                if (u > head + 0.01) break;
                const bx = (1 - u) * (1 - u) * x0 + 2 * (1 - u) * u * mx + u * u * x1;
                const by = (1 - u) * (1 - u) * y0 + 2 * (1 - u) * u * my + u * u * y1;
                if (i === 0) ctx.moveTo(bx, by);
                else ctx.lineTo(bx, by);
            }
            ctx.lineWidth = width * widthMul;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            ctx.strokeStyle = `rgba(${r},${g},${b},${fade * alphaMul})`;
            ctx.stroke();
        }
    }

    drawSpark(ctx, s) {
        const [r, g, b] = this.rgb.mid;
        ctx.save();
        ctx.translate(s.x, s.y);
        ctx.rotate(s.spin * s.life * 20);
        ctx.fillStyle = `rgba(${r},${g},${b},${Math.max(0, s.life)})`;
        ctx.beginPath();
        ctx.moveTo(0, -s.size * 2);
        ctx.lineTo(s.size * 0.6, 0);
        ctx.lineTo(0, s.size * 2);
        ctx.lineTo(-s.size * 0.6, 0);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    drawFlash(ctx) {
        const f = this.flash;
        const d = f.r * 2;
        ctx.globalAlpha = Math.max(0, f.life);
        ctx.drawImage(vfxGlowSprite(this.palette.core), f.x - f.r, f.y - f.r, d, d);
        ctx.globalAlpha = 1;
    }
}

// ==========================================
// RingSlashVFX: 그림 한 장(흰색, 배경 투명)으로 만드는 회전 베기 이펙트
// 1. 부채꼴로 가린 뒤 그 부채꼴을 돌리면서 그림을 조금씩 드러낸다 (칼이 그어지는 느낌)
// 2. 그동안 그림 전체가 같은 방향으로 돌고(처음엔 빠르게), 잔상이 뒤따라온다
// 3. 다 드러나면 살짝 커지면서 흐려진다
// 그림은 흰색이라 색을 입혀 쓴다 (색 입힌 그림 + 흰 그림을 겹쳐 가운데가 하얗게 빛나게)
//
// 옵션
//   image:     흰색 그림 (loadImage로 불러온 것)
//   follow:    이 대상(플레이어)의 가운데를 따라다닌다 (없으면 x, y 고정)
//   size:      그림을 그릴 크기(px, 정사각형)
//   color:     '#rrggbb'
//   rotation:  그림 전체를 돌리는 각도(라디안)
//   startAngle: 드러나기 시작하는 각도(라디안, 그림 기준)
//   sweepAngle: 드러나는 총 각도 (기본 2π, 음수면 반대 방향)
//   sweep:     다 드러나는 데 걸리는 시간(초)
//   fade:      그 뒤 사라지는 데 걸리는 시간(초)
//   spinTotal: 전체 시간 동안 그림이 도는 각도(라디안, 기본 π). 처음엔 빠르게, 끝으로 갈수록 느리게
//   ghosts:    뒤따라오는 잔상 수 (기본 3)
//   revealEase: 'easeOut'(기본, 처음엔 빠르게) 또는 'linear'(막대가 일정한 속도로 돈다)
//   softEdge:  드러나는 경계를 흐리게 할 각도(라디안, 기본 0)
//   afterSpin: 다 드러난 뒤 사라지는 동안 대상을 중심으로 더 도는 각도(라디안, 기본 0). 처음엔 빠르게 점점 느리게
// ==========================================
const vfxTintCache = new Map();

// 흰색 그림을 color로 물들인 복사본 (색마다 한 번만 만든다)
function vfxTinted(image, color) {
    const key = `${image.src}|${color}`;
    let tinted = vfxTintCache.get(key);
    if (tinted) return tinted;
    tinted = document.createElement('canvas');
    tinted.width = image.naturalWidth;
    tinted.height = image.naturalHeight;
    const tctx = tinted.getContext('2d');
    tctx.drawImage(image, 0, 0);
    tctx.globalCompositeOperation = 'source-in';
    tctx.fillStyle = color;
    tctx.fillRect(0, 0, tinted.width, tinted.height);
    vfxTintCache.set(key, tinted);
    return tinted;
}

class RingSlashVFX {
    constructor(x, y, options) {
        this.image = options.image;
        this.follow = options.follow || null;
        this.x = x;
        this.y = y;
        this.size = options.size ?? 140;
        this.width = options.width ?? this.size;   // 그림 크기 (기본은 size×size 정사각형)
        this.height = options.height ?? this.size;
        this.anchorX = options.anchorX ?? 0.5;     // 그림에서 회전 중심(플레이어 위치)이 있는 곳 (0~1)
        this.anchorY = options.anchorY ?? 0.5;
        this.color = options.color ?? '#ffffff';
        this.rotation = options.rotation ?? 0;
        this.startAngle = options.startAngle ?? 0;
        this.sweepAngle = options.sweepAngle ?? Math.PI * 2;
        this.sweep = options.sweep ?? 0.2;
        this.fade = options.fade ?? 0.25;
        this.spinTotal = options.spinTotal ?? Math.PI;  // 전체 시간 동안 그림이 도는 각도 (sweepAngle과 같은 방향)
        this.ghosts = options.ghosts ?? 3;              // 뒤따라오는 잔상 수
        this.revealEase = options.revealEase ?? 'easeOut'; // 'linear'면 막대가 일정한 속도로 돈다
        this.softEdge = options.softEdge ?? 0;          // 드러나는 경계를 이 각도(라디안)만큼 흐리게
        this.afterSpin = options.afterSpin ?? 0;        // 다 드러난 뒤 사라지는 동안 더 도는 각도
        // 'wipe': 그림은 가만히, 막대가 돌며 드러냄 / 'rotate': 그림이 돌면서 시작선 뒤에서 빠져나옴
        this.revealMode = options.revealMode ?? 'wipe';
        this.elapsed = 0;
    }

    get finished() {
        return this.elapsed >= this.sweep + this.fade;
    }

    update(dt) {
        this.elapsed += dt;
    }

    // 시각 t(초)에 그림이 얼마나 돌아가 있는지. 처음엔 빠르게, 끝으로 갈수록 느려진다
    spinAt(t) {
        const dir = this.sweepAngle < 0 ? -1 : 1;
        const life = Math.min(1, Math.max(0, t / (this.sweep + this.fade)));
        const after = Math.min(1, Math.max(0, (t - this.sweep) / this.fade)); // 다 드러난 뒤 진행도
        return dir * (this.spinTotal * (1 - (1 - life) ** 3) + this.afterSpin * (1 - (1 - after) ** 3));
    }

    // 지금 그림이 돌고 있는지 (잔상은 돌 때만 그린다)
    isSpinning() {
        if (this.spinTotal !== 0) return true;
        return this.afterSpin !== 0 && this.elapsed > this.sweep;
    }

    draw(ctx) {
        if (!isImageReady(this.image)) return;
        const cx = this.follow ? this.follow.rect.centerx : this.x;
        const cy = this.follow ? this.follow.rect.centery : this.y;

        const reveal = Math.min(1, this.elapsed / this.sweep);                  // 0 → 1: 그어지는 중
        const fadeT = Math.max(0, (this.elapsed - this.sweep) / this.fade);      // 0 → 1: 사라지는 중
        // 드러난 정도: 기본은 처음엔 빠르게 끝에서 부드럽게, 'linear'면 일정한 속도
        const ease = this.revealEase === 'linear' ? reveal : 1 - (1 - reveal) ** 2;
        const alpha = 1 - fadeT;
        if (alpha <= 0) return;

        const scale = 1 + 0.15 * fadeT;                       // 사라지면서 살짝 커진다
        const tinted = vfxTinted(this.image, this.color);

        ctx.save();
        ctx.translate(cx, cy);
        ctx.globalCompositeOperation = 'lighter';

        // 잔상: 조금 전 시각의 회전 각도로, 점점 옅게 (빠르게 도는 느낌)
        const ghosts = this.isSpinning() ? this.ghosts : 0;
        for (let i = ghosts; i >= 1; i--) {
            const angle = this.spinAt(this.elapsed - i * 0.03);
            this.drawLayer(ctx, tinted, angle, scale, ease, reveal, alpha * (0.45 - 0.12 * i), false);
        }
        this.drawLayer(ctx, tinted, this.spinAt(this.elapsed), scale, ease, reveal, alpha, true);
        ctx.restore();
    }

    // 그림 한 장 그리기. withCore면 흰 그림을 겹쳐 가운데를 밝게 한다
    drawLayer(ctx, tinted, spin, scale, ease, reveal, alpha, withCore) {
        if (alpha <= 0) return;
        ctx.save();
        ctx.rotate(this.rotation + spin);

        if (reveal >= 1) {
            this.drawImages(ctx, tinted, scale, alpha, withCore);
        } else if (this.revealMode === 'rotate') {
            // 그림을 덜 돌아간 만큼 뒤로 돌려 두고, 시작선 앞쪽만 보여준다 (칼끝이 앞장서고 꼬리가 뒤따라 나옴)
            const dir = this.sweepAngle < 0 ? -1 : 1;
            const back = -this.sweepAngle * (1 - ease);
            const s0 = this.startAngle, end = this.startAngle + this.sweepAngle + 0.3 * dir;
            const soft = this.softEdge * dir;
            // 시작선 근처는 옅게 두 겹 → 뒤에서 스며 나오는 느낌
            this.drawWedge(ctx, tinted, scale, s0 + soft, end, alpha, withCore, back);
            if (this.softEdge > 0) {
                this.drawWedge(ctx, tinted, scale, s0 + soft / 2, s0 + soft, alpha * 0.5, false, back);
                this.drawWedge(ctx, tinted, scale, s0, s0 + soft / 2, alpha * 0.2, false, back);
            }
        } else {
            // 보이지 않는 막대가 startAngle에서 돌아가며 지나간 자리만 드러낸다 (부채꼴로 자르기)
            const dir = this.sweepAngle < 0 ? -1 : 1;
            const edge = this.startAngle + this.sweepAngle * ease; // 막대가 지금 있는 각도
            this.drawWedge(ctx, tinted, scale, this.startAngle, edge, alpha, withCore);
            // 경계를 흐리게: 막대 바로 앞을 옅게 두 겹 (칼끝이 쓸고 지나가는 느낌)
            if (this.softEdge > 0) {
                const half = this.softEdge / 2 * dir;
                this.drawWedge(ctx, tinted, scale, edge, edge + half, alpha * 0.5, false);
                this.drawWedge(ctx, tinted, scale, edge + half, edge + half * 2, alpha * 0.2, false);
            }
        }
        ctx.restore();
    }

    // from~to 각도 부채꼴 안에만 그림 그리기
    drawWedge(ctx, tinted, scale, from, to, alpha, withCore, imageTurn = 0) {
        if (alpha <= 0 || from === to) return;
        const reach = Math.hypot(this.width, this.height) * scale; // 그림 전체를 덮는 반지름
        ctx.save();
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.arc(0, 0, reach, from, to, to < from);
        ctx.closePath();
        ctx.clip();
        if (imageTurn) ctx.rotate(imageTurn);
        this.drawImages(ctx, tinted, scale, alpha, withCore);
        ctx.restore();
    }

    // 색 입힌 그림 + (withCore면) 흰 그림을 겹쳐 가운데를 밝게
    drawImages(ctx, tinted, scale, alpha, withCore) {
        const w = this.width * scale, h = this.height * scale;
        const x = -w * this.anchorX, y = -h * this.anchorY;
        ctx.globalAlpha = alpha;
        ctx.drawImage(tinted, x, y, w, h);
        if (withCore) {
            ctx.globalAlpha = alpha * 0.55;
            ctx.drawImage(this.image, x, y, w, h);
        }
    }
}

// ==========================================
// 튀는 불꽃 (짧은 빛줄기). SweepSparkVFX와 HitSparkVFX가 같이 쓴다
// ==========================================
class SparkVFX {
    constructor(color) {
        this.rgb = vfxHexToRgb(color);
        this.sparks = [];
        this.elapsed = 0;
    }

    // x, y에서 angle 방향으로 speed(px/초)만큼 튀는 불꽃 하나
    addSpark(x, y, angle, speed, life, size) {
        this.sparks.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life, maxLife: life, size });
    }

    get sparksDone() {
        return this.sparks.every(s => s.life <= 0);
    }

    update(dt) {
        this.elapsed += dt;
        const drag = Math.exp(-5 * dt); // 공기 저항처럼 점점 느려진다
        for (const s of this.sparks) {
            if (s.life <= 0) continue;
            s.x += s.vx * dt;
            s.y += s.vy * dt;
            s.vx *= drag;
            s.vy *= drag;
            s.life -= dt;
        }
    }

    // 지나온 자리로 꼬리를 그린다: 바깥은 색, 가운데는 흰색
    drawSparks(ctx) {
        const [r, g, b] = this.rgb;
        ctx.lineCap = 'round';
        for (const s of this.sparks) {
            if (s.life <= 0) continue;
            const a = s.life / s.maxLife;
            const tx = s.x - s.vx * 0.04, ty = s.y - s.vy * 0.04;
            ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(tx, ty);
            ctx.strokeStyle = `rgba(${r},${g},${b},${a * 0.8})`;
            ctx.lineWidth = s.size * 1.8 * (0.5 + 0.5 * a);
            ctx.stroke();
            ctx.strokeStyle = `rgba(255,255,255,${a})`;
            ctx.lineWidth = s.size * 0.6;
            ctx.stroke();
        }
    }
}

// 칼끝이 지나가는 자리에서 불꽃이 차례로 튄다 (휘두르는 동안 계속 뿌림)
//   follow:    따라다닐 대상 (휘두르는 사람)
//   radius:    칼끝까지 거리
//   fromAngle, toAngle: 칼끝이 지나가는 화면 각도 (라디안)
//   sweep:     지나가는 시간(초), count: 뿌릴 불꽃 수
class SweepSparkVFX extends SparkVFX {
    constructor(options) {
        super(options.color ?? '#ffffff');
        this.follow = options.follow;
        this.radius = options.radius ?? 60;
        this.fromAngle = options.fromAngle;
        this.toAngle = options.toAngle;
        this.sweep = options.sweep ?? 0.15;
        this.count = options.count ?? 14;
        this.emitted = 0;
    }

    get finished() {
        return this.elapsed >= this.sweep && this.sparksDone;
    }

    update(dt) {
        super.update(dt);
        const progress = Math.min(1, this.elapsed / this.sweep);
        const dir = this.toAngle > this.fromAngle ? 1 : -1;
        while (this.emitted < Math.round(this.count * progress)) {
            const u = (this.emitted + Math.random()) / this.count;
            const edge = this.fromAngle + (this.toAngle - this.fromAngle) * u;
            const r = this.radius * vfxRand(0.75, 1.05);
            const cx = this.follow.rect.centerx, cy = this.follow.rect.centery;
            // 바깥쪽과 휘두르는 방향 사이로 튄다
            this.addSpark(cx + Math.cos(edge) * r, cy + Math.sin(edge) * r,
                edge + dir * vfxRand(0.3, 1.2), vfxRand(150, 380), vfxRand(0.18, 0.4), vfxRand(1.2, 2.4));
            this.emitted++;
        }
    }

    draw(ctx) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        this.drawSparks(ctx);
        ctx.restore();
    }
}

// 맞은 자리에서 작게 번쩍이며 진행 방향 쪽으로 불꽃이 튄다
//   angle: 날아온 방향 (라디안), count: 불꽃 수, size: 섬광 크기
class HitSparkVFX extends SparkVFX {
    constructor(x, y, options) {
        super(options.color ?? '#ffffff');
        this.x = x;
        this.y = y;
        this.flashSize = options.size ?? 22;
        this.flashTime = 0.18;
        const angle = options.angle ?? 0;
        const count = options.count ?? 12;
        for (let i = 0; i < count; i++) {
            this.addSpark(x, y, angle + vfxRand(-1.1, 1.1), vfxRand(120, 340), vfxRand(0.15, 0.35), vfxRand(1, 2.2));
        }
    }

    get finished() {
        return this.elapsed >= this.flashTime && this.sparksDone;
    }

    draw(ctx) {
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        const t = this.elapsed / this.flashTime;
        if (t < 1) {
            const [r, g, b] = this.rgb;
            const a = 1 - t;
            // 가운데 섬광
            const grad = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, this.flashSize);
            grad.addColorStop(0, `rgba(255,255,255,${a})`);
            grad.addColorStop(0.35, `rgba(${r},${g},${b},${a * 0.7})`);
            grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
            ctx.fillStyle = grad;
            ctx.beginPath(); ctx.arc(this.x, this.y, this.flashSize, 0, Math.PI * 2); ctx.fill();
            // 퍼지는 고리
            ctx.strokeStyle = `rgba(${r},${g},${b},${a * 0.8})`;
            ctx.lineWidth = 2 * a + 0.5;
            ctx.beginPath(); ctx.arc(this.x, this.y, this.flashSize * (0.3 + 0.9 * t), 0, Math.PI * 2); ctx.stroke();
        }
        this.drawSparks(ctx);
        ctx.restore();
    }
}

// ==========================================
// 돌진하며 그어지는 베기
// 출발점(꼬리)은 그 자리에 두고, 돌진하는 사람이 지나간 만큼 그림이 나온다.
// - fullDist를 주면: 그림은 끝까지 돌진했을 때 크기로 고정, 지나간 자리까지만 천천히 드러난다
// - 안 주면: 그림을 지나온 거리에 맞춰 가로로 늘린다
// 돌진이 끝나면(벽에 막혀 일찍 끝나도) 그 자리에 멈춰서 사라진다.
//   image:   흰색 그림, 진행 방향 = 오른쪽
//   follow:  돌진하는 사람, isActive(): 돌진 중인지 (게임 상태를 읽기만 한다)
//   angle:   진행 방향 (화면 각도, 라디안)
//   imageX0, imageX1, imageCY: 그림 속 꼬리·앞끝 x, 가운데 선 y
//   scaleY:  세로 배율 (가로는 지나온 거리에 맞춰 늘어난다)
//   back, front: 출발점 뒤로 / 지금 위치 앞으로 얼마나 더 그릴지(px)
//   fullDist: 끝까지 돌진하는 거리(px), softEdge: 드러나는 경계를 흐리게 할 길이(px)
// ==========================================
class StretchSlashVFX {
    constructor(options) {
        this.image = options.image;
        this.follow = options.follow;
        this.isActive = options.isActive;
        this.angle = options.angle;
        this.imageX0 = options.imageX0;
        this.imageX1 = options.imageX1;
        this.imageCY = options.imageCY;
        this.scaleY = options.scaleY;
        this.back = options.back ?? 30;
        this.front = options.front ?? 30;
        this.color = options.color ?? '#ffffff';
        this.fade = options.fade ?? 0.3;
        this.fullDist = options.fullDist ?? 0;
        this.softEdge = options.softEdge ?? 30;
        this.startX = this.follow.rect.centerx;
        this.startY = this.follow.rect.centery;
        this.dist = 0;
        this.fadeT = -1; // 멈춘 뒤 흐른 시간 (-1이면 아직 돌진 중)
    }

    get finished() {
        return this.fadeT >= this.fade;
    }

    update(dt) {
        if (this.fadeT < 0) {
            const dx = this.follow.rect.centerx - this.startX, dy = this.follow.rect.centery - this.startY;
            this.dist = Math.max(this.dist, dx * Math.cos(this.angle) + dy * Math.sin(this.angle));
            if (!this.isActive()) this.fadeT = 0;
        } else {
            this.fadeT += dt;
        }
    }

    draw(ctx) {
        if (!isImageReady(this.image)) return;
        const alpha = this.fadeT < 0 ? 1 : 1 - this.fadeT / this.fade;
        if (alpha <= 0) return;
        const reach = this.back + this.dist + this.front;           // 꼬리에서 지금 앞끝까지 (화면 px)
        const length = this.fullDist > 0 ? this.back + this.fullDist + this.front : reach;
        const kx = length / (this.imageX1 - this.imageX0), ky = this.scaleY;
        const tinted = vfxTinted(this.image, this.color);
        ctx.save();
        ctx.translate(this.startX - Math.cos(this.angle) * this.back, this.startY - Math.sin(this.angle) * this.back);
        ctx.rotate(this.angle);
        ctx.globalCompositeOperation = 'lighter';
        if (this.fullDist > 0) {
            // 지나간 자리까지만 보이게 자르고, 경계는 두 겹으로 흐리게
            const soft = Math.min(this.softEdge, reach);
            this.drawClipped(ctx, tinted, kx, ky, reach - soft, alpha);
            this.drawClipped(ctx, tinted, kx, ky, reach - soft / 2, alpha * 0.5, reach - soft);
            this.drawClipped(ctx, tinted, kx, ky, reach, alpha * 0.2, reach - soft / 2);
        } else {
            this.drawImages(ctx, tinted, kx, ky, alpha);
        }
        ctx.restore();
    }

    // 꼬리 기준 from~to(px) 구간만 그리기 (from이 없으면 처음부터)
    drawClipped(ctx, tinted, kx, ky, to, alpha, from = -1000) {
        if (to <= from || alpha <= 0) return;
        ctx.save();
        ctx.beginPath();
        ctx.rect(from, -1000, to - from, 2000);
        ctx.clip();
        this.drawImages(ctx, tinted, kx, ky, alpha);
        ctx.restore();
    }

    drawImages(ctx, tinted, kx, ky, alpha) {
        const w = this.image.naturalWidth * kx, h = this.image.naturalHeight * ky;
        const x = -this.imageX0 * kx, y = -this.imageCY * ky;
        ctx.globalAlpha = alpha;
        ctx.drawImage(tinted, x, y, w, h);
        ctx.globalAlpha = alpha * 0.55;
        ctx.drawImage(this.image, x, y, w, h); // 흰 그림을 겹쳐 칼날을 밝게
    }
}

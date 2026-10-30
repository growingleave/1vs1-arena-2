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

// 게임 전체에서 쓰는 공통 도구: 화면 크기, 게임 시간, 사각형(Rect), 충돌 판정, 글자/소리.
// pygame 버전의 pygame.Rect, pygame.time.get_ticks(), utils.py, fonts.py, sound_manager.py 역할을 한다.

const WIDTH = 1280;
const HEIGHT = 720;

const COLOR_BG = '#141419';
const COLOR_CARD_BG = '#23232d';
const COLOR_WHITE = '#ffffff';
const COLOR_GRAY = '#64646e';
const COLOR_RED = '#e63c3c';
const COLOR_BLUE = '#3c78e6';
const COLOR_GREEN = '#50dc64';
const COLOR_GOLD = '#ffd700';

// pygame.time.get_ticks() 대신 쓰는 "게임 시간"(ms).
// 실제 시계가 아니라 게임이 한 틱(1/60초) 진행될 때마다 늘어난다.
// 나중에 온라인 대전을 붙일 때 모든 기기가 같은 시간 기준으로 계산하게 하려는 것.
const Time = {
    now: 0,
};

// 색 문자열(#rrggbb)에 투명도를 붙인 rgba() 문자열을 만든다 (alpha: 0~1)
function withAlpha(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// pygame.Rect와 같은 동작을 하는 사각형. x/y/w/h는 항상 정수로 유지한다.
class Rect {
    constructor(x, y, w, h) {
        this.x = Math.round(x);
        this.y = Math.round(y);
        this.w = Math.round(w);
        this.h = Math.round(h);
    }

    get left() { return this.x; }
    set left(v) { this.x = Math.round(v); }
    get top() { return this.y; }
    set top(v) { this.y = Math.round(v); }
    get right() { return this.x + this.w; }
    set right(v) { this.x = Math.round(v) - this.w; }
    get bottom() { return this.y + this.h; }
    set bottom(v) { this.y = Math.round(v) - this.h; }
    get centerx() { return this.x + Math.floor(this.w / 2); }
    set centerx(v) { this.x = Math.round(v) - Math.floor(this.w / 2); }
    get centery() { return this.y + Math.floor(this.h / 2); }
    set centery(v) { this.y = Math.round(v) - Math.floor(this.h / 2); }

    setCenter(cx, cy) {
        this.centerx = cx;
        this.centery = cy;
    }

    // pygame과 똑같이, 변이 딱 맞닿기만 한 경우는 충돌로 보지 않는다
    colliderect(other) {
        return this.x < other.x + other.w && other.x < this.x + this.w &&
               this.y < other.y + other.h && other.y < this.y + this.h;
    }

    // 사각형을 영역 안으로 밀어 넣는다 (pygame clamp_ip)
    clampIp(area) {
        if (this.w >= area.w) this.x = area.x + Math.floor((area.w - this.w) / 2);
        else if (this.x < area.x) this.x = area.x;
        else if (this.x + this.w > area.x + area.w) this.x = area.x + area.w - this.w;

        if (this.h >= area.h) this.y = area.y + Math.floor((area.h - this.h) / 2);
        else if (this.y < area.y) this.y = area.y;
        else if (this.y + this.h > area.y + area.h) this.y = area.y + area.h - this.h;
    }

    // 가운데는 그대로 두고 크기만 키운 새 사각형 (pygame inflate)
    inflate(dw, dh) {
        return new Rect(this.x - Math.floor(dw / 2), this.y - Math.floor(dh / 2), this.w + dw, this.h + dh);
    }
}

const ARENA_RECT = new Rect(0, 0, WIDTH, HEIGHT);

// ------------------------------------------
// 다각형 vs 사각형 충돌 판정 (분리축 정리, utils.py와 동일)
// ------------------------------------------
function _project(points, ax, ay) {
    let min = Infinity;
    let max = -Infinity;
    for (const [px, py] of points) {
        const d = px * ax + py * ay;
        if (d < min) min = d;
        if (d > max) max = d;
    }
    return [min, max];
}

function checkPolygonCollision(polygon, rect) {
    if (polygon.length < 3) return false;

    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const [px, py] of polygon) {
        if (px < minX) minX = px;
        if (py < minY) minY = py;
        if (px > maxX) maxX = px;
        if (py > maxY) maxY = py;
    }
    const bounding = new Rect(minX, minY, maxX - minX, maxY - minY);
    if (!bounding.colliderect(rect)) return false;

    const rectPoints = [
        [rect.left, rect.top], [rect.right, rect.top],
        [rect.right, rect.bottom], [rect.left, rect.bottom],
    ];

    const axes = [[1, 0], [0, 1]];
    for (let i = 0; i < polygon.length; i++) {
        const [x1, y1] = polygon[i];
        const [x2, y2] = polygon[(i + 1) % polygon.length];
        const ex = x2 - x1;
        const ey = y2 - y1;
        const len = Math.hypot(ex, ey);
        if (len === 0) continue;
        axes.push([-ey / len, ex / len]);
    }

    for (const [ax, ay] of axes) {
        const [min1, max1] = _project(polygon, ax, ay);
        const [min2, max2] = _project(rectPoints, ax, ay);
        if (max1 < min2 || max2 < min1) return false;
    }
    return true;
}

// 가운데 (cx, cy)에서 angleDeg(위쪽이 +인 수학 각도)만큼 돌아간 w x h 사각형의 네 꼭짓점.
// 검사 검기/궁극기, 마법사 빔의 판정 모양을 만들 때 쓴다.
function rotatedRectPoints(cx, cy, w, h, angleDeg) {
    const rad = angleDeg * Math.PI / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const hw = w / 2;
    const hh = h / 2;
    const local = [[-hw, -hh], [hw, -hh], [hw, hh], [-hw, hh]];
    return local.map(([lx, ly]) => [
        cx + (lx * cos - ly * sin),
        cy - (lx * sin + ly * cos),
    ]);
}

// 진행 방향 벡터 (dx, dy)를 pygame 코드와 같은 "위쪽이 +" 각도(도)로 바꾼다
function directionToAngle(dir) {
    return Math.atan2(-dir[1], dir[0]) * 180 / Math.PI;
}

// ------------------------------------------
// 글자 그리기
// ------------------------------------------
const FONT_FAMILY = '"Noto Sans KR", "Noto Sans CJK KR", "Apple SD Gothic Neo", "Malgun Gothic", sans-serif';

function setFont(ctx, size, bold) {
    ctx.font = `${bold ? 'bold ' : ''}${size}px ${FONT_FAMILY}`;
}

function textWidth(ctx, text, size, bold = false) {
    setFont(ctx, size, bold);
    return ctx.measureText(text).width;
}

// pygame의 screen.blit(font.render(...), (x, y))처럼 (x, y)를 글자의 왼쪽 위로 보고 그린다.
// align: 'left' | 'center' | 'right' (x가 각각 왼쪽 끝/가운데/오른쪽 끝)
function drawText(ctx, text, x, y, size, color, opts = {}) {
    setFont(ctx, size, opts.bold);
    ctx.textAlign = opts.align || 'left';
    ctx.textBaseline = opts.baseline || 'top';
    ctx.fillStyle = color;
    if (opts.alpha !== undefined) ctx.globalAlpha = opts.alpha;
    ctx.fillText(text, x, y);
    ctx.globalAlpha = 1;
}

// ------------------------------------------
// 이미지 / 소리
// ------------------------------------------
function loadImage(src) {
    const img = new Image();
    img.src = src;
    return img;
}

function isImageReady(img) {
    return img && img.complete && img.naturalWidth > 0;
}

const _hitSound = new Audio('assets/hit.ogg');
_hitSound.preload = 'auto';

// 피격 소리의 앞 0.18초만 재생. 피해가 작을수록 작게 (sound_manager.py와 동일)
function playHitSound(intensity = 1.0) {
    const volume = Math.max(0.25, Math.min(1.0, intensity));
    try {
        const s = _hitSound.cloneNode();
        s.volume = volume;
        const p = s.play();
        if (p && p.catch) p.catch(() => {});
        setTimeout(() => s.pause(), 180);
    } catch (e) {
        // 소리가 안 나도 게임은 계속 돌아가야 한다
    }
}

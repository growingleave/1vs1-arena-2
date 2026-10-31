// 벽, 회복/궁극기 구슬, 맵 (wall.py, pickup.py, map.py를 옮김)

class Wall {
    constructor(x, y, w, h, color = '#646464') {
        this.rect = new Rect(x, y, w, h);
        this.color = color;
    }

    draw(ctx) {
        const r = this.rect;
        ctx.fillStyle = this.color;
        ctx.fillRect(r.x, r.y, r.w, r.h);
        ctx.strokeStyle = '#323232';
        ctx.lineWidth = 2;
        ctx.strokeRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    }
}

// 엔티티를 이동시키되 벽에 막히게 한다. 빠르게 움직여도 벽을 뚫지 않도록 1픽셀 단위로 나눠 움직인다.
function moveEntityWithWalls(entity, totalDx, totalDy, walls) {
    if (entity.ignoreWalls) {
        entity.rect.x = Math.round(entity.rect.x + totalDx);
        entity.rect.y = Math.round(entity.rect.y + totalDy);
        entity.rect.clampIp(ARENA_RECT);
        return;
    }

    const steps = Math.max(Math.trunc(Math.max(Math.abs(totalDx), Math.abs(totalDy))), 1);
    const stepDx = totalDx / steps;
    const stepDy = totalDy / steps;

    for (let i = 0; i < steps; i++) {
        entity.rect.x = Math.round(entity.rect.x + stepDx);
        for (const wall of walls) {
            if (entity.rect.colliderect(wall.rect)) {
                if (stepDx > 0) entity.rect.right = wall.rect.left;
                else if (stepDx < 0) entity.rect.left = wall.rect.right;
            }
        }

        entity.rect.y = Math.round(entity.rect.y + stepDy);
        for (const wall of walls) {
            if (entity.rect.colliderect(wall.rect)) {
                if (stepDy > 0) entity.rect.bottom = wall.rect.top;
                else if (stepDy < 0) entity.rect.top = wall.rect.bottom;
            }
        }
    }

    entity.rect.clampIp(ARENA_RECT);
}

// 벽에 부딪힌 공격은 남은 시간을 0으로 만들어 바로 사라지게 한다.
// 원본(wall.py)과 똑같이, 공격이 가진 시간 값(startTime/duration 또는 createdTime/lifespan)을 보고 처리한다.
function _expireBy(attack, timeKey, lengthKey) {
    if (attack[timeKey] === undefined || attack[lengthKey] === undefined) return false;
    attack[timeKey] = Time.now - attack[lengthKey];
    return true;
}

// 벽 통과가 안 되는 투사체는 판정 전체가 아니라 가운데의 작은 판정(가로·세로 35%, 최소 8px)이 벽에 닿을 때만 막힌다.
// (판정 가장자리가 벽을 살짝 스치기만 해도 사라지지 않게)
const WALL_CORE_RATIO = 0.35;

function wallCoreRect(rect) {
    const w = Math.max(8, Math.trunc(rect.w * WALL_CORE_RATIO));
    const h = Math.max(8, Math.trunc(rect.h * WALL_CORE_RATIO));
    return new Rect(Math.trunc(rect.centerx - w / 2), Math.trunc(rect.centery - h / 2), w, h);
}

function wallCorePoints(points) {
    const cx = points.reduce((t, p) => t + p[0], 0) / points.length;
    const cy = points.reduce((t, p) => t + p[1], 0) / points.length;
    return points.map(([x, y]) => [cx + (x - cx) * WALL_CORE_RATIO, cy + (y - cy) * WALL_CORE_RATIO]);
}

function handleAttackWallCollisions(attacks, walls) {
    for (const attack of attacks) {
        if (attack.canPenetrateWalls) continue;

        for (const wall of walls) {
            if (attack.isDash) {
                if (attack.owner && attack.owner.rect.colliderect(wall.rect) &&
                    _expireBy(attack, 'startTime', 'duration')) break;
            } else if (attack.rect) {
                if (wallCoreRect(attack.rect).colliderect(wall.rect) && _expireBy(attack, 'startTime', 'duration')) break;
            } else if (attack.getPolygonPoints) {
                if (checkPolygonCollision(wallCorePoints(attack.getPolygonPoints()), wall.rect) &&
                    (_expireBy(attack, 'createdTime', 'lifespan') || _expireBy(attack, 'startTime', 'duration'))) break;
            }
        }
    }
}

// 지금 전투(또는 연습장)에서 쓰는 벽 목록. 일부 스킬이 벽 위치를 직접 확인할 때 쓴다.
// (원본의 sys.modules['__main__'].walls 역할) game.js가 매 틱 갱신한다.
let CURRENT_WALLS = [];

// ------------------------------------------
// 회복 / 궁극기 구슬
// ------------------------------------------
const COLOR_HEAL = '#50dc64';
const COLOR_ULT = '#3c96e6';

class Pickup {
    constructor(x, y, kind) {
        this.x = x;
        this.y = y;
        this.kind = kind; // 'heal' 또는 'ult'
        this.color = kind === 'heal' ? COLOR_HEAL : COLOR_ULT;
        this.radius = 20;
        this.healAmount = 15.0;
        this.ultAmount = 15.0;
        this.respawnTime = 12000; // ms

        this.available = true;
        this.respawnStart = 0;
    }

    isNeededBy(player) {
        if (this.kind === 'heal') return player.hp < player.maxHp;
        return player.ultGauge < 100.0;
    }

    collidesWithPlayer(player) {
        if (!this.available || !this.isNeededBy(player)) return false;
        const dx = player.rect.centerx - this.x;
        const dy = player.rect.centery - this.y;
        const hitRadius = this.radius + Math.max(player.rect.w, player.rect.h) / 2;
        return Math.hypot(dx, dy) <= hitRadius;
    }

    collect(player) {
        if (!this.available) return;
        if (this.kind === 'heal') {
            player.hp = Math.min(player.maxHp, player.hp + this.healAmount);
        } else {
            player.addUltGauge(this.ultAmount);
        }
        this.available = false;
        this.respawnStart = Time.now;
    }

    update() {
        if (!this.available && Time.now - this.respawnStart >= this.respawnTime) {
            this.available = true;
        }
    }

    draw(ctx) {
        const { x, y, radius } = this;

        if (this.available) {
            ctx.beginPath();
            ctx.arc(x, y, radius, 0, Math.PI * 2);
            ctx.fillStyle = this.color;
            ctx.fill();
            ctx.strokeStyle = COLOR_WHITE;
            ctx.lineWidth = 2;
            ctx.stroke();
            return;
        }

        const progress = Math.min(1.0, (Time.now - this.respawnStart) / this.respawnTime);

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fillStyle = '#28282d';
        ctx.fill();

        // 다시 생길 때까지 시계 방향으로 차오르는 부채꼴
        if (progress > 0) {
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.arc(x, y, radius, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * progress);
            ctx.closePath();
            ctx.fillStyle = this.color;
            ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.strokeStyle = progress >= 1 ? COLOR_WHITE : '#787882';
        ctx.lineWidth = progress >= 1 ? 3 : 1;
        ctx.stroke();
    }
}

// ------------------------------------------
// 맵 (map.py를 옮김, 좌표는 1280x720 기준)
// 맵마다 buildWalls / buildPickups, 필요하면 buildHazards(고정 지형) / buildEvents(반복 이벤트)를 둔다.
// 지형 클래스는 terrain.js에 있다.
// ------------------------------------------
function coloredWalls(color, list) {
    return list.map(([x, y, w, h]) => new Wall(x, y, w, h, color));
}

const MAPS = [
    {
        name: '클래식 아레나',
        bgColor: COLOR_BG,
        buildWalls: () => [
            // 좌상단 ㄴ자
            new Wall(260, 90, 50, 220),
            new Wall(110, 270, 200, 50),
            // 우상단 ㄱ자
            new Wall(850, 90, 220, 50),
            new Wall(1020, 90, 50, 220),
            // 중앙 세로 벽
            new Wall(615, 260, 50, 200),
            // 좌하단 ㄴ자
            new Wall(210, 410, 50, 220),
            new Wall(210, 580, 220, 50),
            // 우하단 ㄱ자
            new Wall(970, 410, 50, 220),
            new Wall(970, 400, 200, 50),
            // 화면 상/하단 중앙 엄폐 기둥
            new Wall(590, 30, 100, 30),
            new Wall(590, 660, 100, 30),
            // 좌우 측면 엄폐 기둥
            new Wall(40, 340, 40, 40),
            new Wall(1200, 340, 40, 40),
            // 중앙 대각선 엄폐 블록
            new Wall(430, 330, 60, 60),
            new Wall(790, 330, 60, 60),
        ],
        buildPickups: () => [
            new Pickup(200, 200, 'heal'),
            new Pickup(960, 175, 'ult'),
            new Pickup(320, 550, 'ult'),
            new Pickup(1080, 520, 'heal'),
        ],
    },
    {
        name: '용암 구덩이',
        bgColor: '#230e0c',
        buildWalls: () => coloredWalls('#3c231e', [ // 그을린 화산암
            // 모서리 바위
            [100, 100, 160, 40], [1020, 100, 160, 40], [100, 580, 160, 40], [1020, 580, 160, 40],
            // 좌우 측면 통로 엄폐 바위
            [40, 320, 40, 80], [1200, 320, 40, 80],
            // 상/하단 중앙 진입로 엄폐 바위
            [600, 40, 80, 30], [600, 650, 80, 30],
            // 가운데 용암 구덩이를 둘러싼 바위 무더기 (완전히 막지 않고 우회로를 남김)
            [430, 170, 50, 50], [480, 220, 50, 50],
            [800, 170, 50, 50], [750, 220, 50, 50],
            [430, 500, 50, 50], [480, 450, 50, 50],
            [800, 500, 50, 50], [750, 450, 50, 50],
        ]),
        buildPickups: () => [
            new Pickup(150, 150, 'heal'),
            new Pickup(1130, 150, 'ult'),
            new Pickup(150, 570, 'ult'),
            new Pickup(1130, 570, 'heal'),
        ],
        buildHazards: () => [new LavaPit(640, 360, 90, 4)],
        // 화면 가장자리와 가운데 용암 구덩이 근처는 피해서 떨어진다
        buildEvents: () => [new LavaFallEvent(new Rect(140, 140, 1280 - 280, 720 - 280), {
            radius: 70, tickDamage: 4, intervalRange: [2.0, 4.0], warningDuration: 1.3, activeDuration: 6.0,
            avoidZones: [[640, 360, 170]], dropsPerWave: 2,
        })],
    },
    {
        name: '설원',
        bgColor: '#121a26',
        buildWalls: () => coloredWalls('#b4cddc', [ // 옅은 청빙색
            // 모서리 얼음 무더기
            [80, 80, 160, 50], [80, 80, 50, 160],
            [1040, 80, 160, 50], [1150, 80, 50, 160],
            [80, 590, 160, 50], [80, 480, 50, 160],
            [1040, 590, 160, 50], [1150, 480, 50, 160],
            // 가운데 얼음 기둥 2개 (사이는 뚫려 있다)
            [520, 310, 40, 100], [720, 310, 40, 100],
            // 좌우 측면 얼음벽
            [40, 310, 40, 100], [1200, 310, 40, 100],
            // 상/하단 중앙 진입로 엄폐 얼음
            [600, 40, 80, 30], [600, 650, 80, 30],
        ]),
        buildPickups: () => [
            new Pickup(200, 360, 'heal'),
            new Pickup(1080, 360, 'ult'),
            new Pickup(640, 140, 'ult'),
            new Pickup(640, 580, 'heal'),
        ],
        // 가운데 두 기둥 바깥쪽에 세로로 긴 큰 빙판 (밟으면 미끄러진다, 피해 없음)
        buildHazards: () => [
            new IcePatch(new Rect(280, 120, 240, 480), 0.05),
            new IcePatch(new Rect(760, 120, 240, 480), 0.05),
        ],
        // 화톳불: 네 모서리 빈 공간 + 가운데
        buildEvents: () => [new BlizzardEvent(
            [[200, 200], [1080, 200], [200, 520], [1080, 520], [640, 360]],
            { safeRadius: 130, stormTickDamage: 6, stormSlowPower: 35, intervalRange: [10.0, 15.0],
              announceDuration: 2.5, prepareDuration: 4.0, stormDuration: 7.0 },
        )],
    },
];

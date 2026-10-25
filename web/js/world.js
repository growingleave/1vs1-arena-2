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

// 벽에 부딪힌 공격은 남은 시간을 0으로 만들어 바로 사라지게 한다
function handleAttackWallCollisions(attacks, walls) {
    for (const attack of attacks) {
        if (attack.canPenetrateWalls) continue;

        for (const wall of walls) {
            let hit = false;
            if (attack.isDash) {
                hit = attack.owner && attack.owner.rect.colliderect(wall.rect);
            } else if (attack.rect) {
                hit = attack.rect.colliderect(wall.rect);
            } else if (attack.getPolygonPoints) {
                hit = checkPolygonCollision(attack.getPolygonPoints(), wall.rect);
            }

            if (hit) {
                attack.expireNow();
                break;
            }
        }
    }
}

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
// 맵 (좌표는 1280x720 기준)
// 지금은 클래식 아레나만 옮겼다. 용암 구덩이/설원은 다음 단계에서 추가한다.
// ------------------------------------------
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
];

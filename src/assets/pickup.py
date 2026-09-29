import math
import pygame

COLOR_HEAL = (80, 220, 100)
COLOR_ULT = (60, 150, 230)


class Pickup:
    """맵에 놓인 회복/궁극기 게이지 구슬. 먹으면 사라지고 그 자리에 같은 색
    타이머가 차오르다가, 다 차면 테두리가 생기며 다시 구슬로 돌아온다."""

    def __init__(self, x, y, kind):
        self.x = x
        self.y = y
        self.kind = kind  # 'heal' 또는 'ult'
        self.color = COLOR_HEAL if kind == 'heal' else COLOR_ULT
        self.radius = 20
        self.heal_amount = 15.0
        self.ult_amount = 15.0
        self.respawn_time = 12000  # ms

        self.available = True
        self.respawn_start = 0

    def is_needed_by(self, player):
        if self.kind == 'heal':
            return player.hp < player.max_hp
        return player.ult_gauge < 100.0

    def collides_with_player(self, player):
        if not self.available or not self.is_needed_by(player):
            return False
        dx = player.rect.centerx - self.x
        dy = player.rect.centery - self.y
        hit_radius = self.radius + max(player.rect.width, player.rect.height) / 2
        return math.hypot(dx, dy) <= hit_radius

    def collect(self, player):
        if not self.available:
            return
        if self.kind == 'heal':
            player.hp = min(player.max_hp, player.hp + self.heal_amount)
        else:
            player.add_ult_gauge(self.ult_amount)

        self.available = False
        self.respawn_start = pygame.time.get_ticks()

    def update(self):
        if not self.available:
            now = pygame.time.get_ticks()
            if now - self.respawn_start >= self.respawn_time:
                self.available = True

    def draw(self, surface):
        cx, cy = int(self.x), int(self.y)

        if self.available:
            pygame.draw.circle(surface, self.color, (cx, cy), self.radius)
            pygame.draw.circle(surface, (255, 255, 255), (cx, cy), self.radius, 2)
            return

        now = pygame.time.get_ticks()
        progress = min(1.0, (now - self.respawn_start) / self.respawn_time)

        pygame.draw.circle(surface, (40, 40, 45), (cx, cy), self.radius)

        if progress > 0.0:
            steps = max(3, int(36 * progress))
            start_angle = -math.pi / 2
            points = [(cx, cy)]
            for i in range(steps + 1):
                angle = start_angle + (2 * math.pi * progress) * (i / steps)
                points.append((cx + self.radius * math.cos(angle), cy + self.radius * math.sin(angle)))
            if len(points) >= 3:
                pygame.draw.polygon(surface, self.color, points)

        if progress >= 1.0:
            pygame.draw.circle(surface, (255, 255, 255), (cx, cy), self.radius, 3)
        else:
            pygame.draw.circle(surface, (120, 120, 130), (cx, cy), self.radius, 1)


def create_default_pickups():
    return [
        Pickup(200, 200, 'heal'),
        Pickup(960, 175, 'ult'),
        Pickup(320, 550, 'ult'),
        Pickup(1080, 520, 'heal'),
    ]

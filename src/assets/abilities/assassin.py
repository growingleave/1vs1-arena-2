import sys
import pygame
import math
from utils import check_polygon_collision
from wall import move_entity_with_walls
from status_effects import slow, silence

MAX_ASSASSIN_CHARGE = 3
ULT_SLASH_PHASE_DURATION = 260  # X자 참격 한 획이 지나가는 시간(ms), AssassinXSlashAttack과 공유


def _add_assassin_charge(owner):
    current = getattr(owner, 'assassin_charge', 0)
    owner.assassin_charge = min(MAX_ASSASSIN_CHARGE, current + 1)


# ==========================================
# [최적화] X자 참격은 화면 전체가 아니라 시전 중심부의 고정된 영역 안에서만 그려지므로
# 풀스크린 서피스 대신 그 영역 크기만큼의 캐시 서피스를 재사용한다.
# ==========================================
_X_SLASH_BOX = 800

_x_slash_overlay = None
def _get_x_slash_overlay():
    global _x_slash_overlay
    if _x_slash_overlay is None:
        _x_slash_overlay = pygame.Surface((_X_SLASH_BOX, _X_SLASH_BOX), pygame.SRCALPHA)
    else:
        _x_slash_overlay.fill((0, 0, 0, 0))
    return _x_slash_overlay


# ==========================================
# [평타 - 찌르기] 전방 짧은 찌르기
# ==========================================
class AssassinThrustAttack:
    def __init__(self, owner, direction):
        self.owner = owner
        self.direction = direction
        self.damage = owner.base_atk
        self.created_time = pygame.time.get_ticks()
        self.lifespan = 130
        self.hit_players = []

        self.width = 46
        self.height = 16
        offset = 28
        self.pos_x = float(owner.rect.centerx + direction[0] * offset)
        self.pos_y = float(owner.rect.centery + direction[1] * offset)
        self.angle = math.degrees(math.atan2(-direction[1], direction[0]))

    def get_polygon_points(self):
        rad = math.radians(self.angle)
        cos_a, sin_a = math.cos(rad), math.sin(rad)
        hw, hh = self.width / 2, self.height / 2
        local_pts = [(-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh)]
        return [
            (self.pos_x + lx * cos_a - ly * sin_a, self.pos_y - (lx * sin_a + ly * cos_a))
            for lx, ly in local_pts
        ]

    def update(self):
        pass

    def is_expired(self):
        return pygame.time.get_ticks() - self.created_time >= self.lifespan

    def collides_with(self, target):
        if target == self.owner or getattr(target, 'invincible', False) or target.defense >= 100.0:
            return False
        return check_polygon_collision(self.get_polygon_points(), target.rect)

    def apply_effect(self, target):
        pass

    def draw(self, surface):
        pts = [(int(p[0]), int(p[1])) for p in self.get_polygon_points()]
        pygame.draw.polygon(surface, (220, 220, 230), pts)
        pygame.draw.polygon(surface, (255, 255, 255), pts, 1)


# ==========================================
# [평타 - 충전 소모] 360도 회전 베기
# ==========================================
class AssassinSpinAttack:
    def __init__(self, owner):
        self.owner = owner
        self.damage = owner.base_atk * 1.2
        self.radius = 56
        self.created_time = pygame.time.get_ticks()
        self.lifespan = 220
        self.hit_players = []
        self.can_penetrate_walls = True
        self.effect_angle = 0.0

    def update(self):
        # 짧은 지속시간 동안 빠르게 여러 바퀴 도는 느낌을 주기 위해 프레임당 회전각을 크게 잡음
        self.effect_angle += 40.0
        if self.effect_angle >= 360:
            self.effect_angle -= 360

    def is_expired(self):
        return pygame.time.get_ticks() - self.created_time >= self.lifespan

    def collides_with(self, target):
        if target == self.owner or getattr(target, 'invincible', False) or target.defense >= 100.0:
            return False
        dx = target.rect.centerx - self.owner.rect.centerx
        dy = target.rect.centery - self.owner.rect.centery
        return math.hypot(dx, dy) <= self.radius

    def apply_effect(self, target):
        pass

    def draw(self, surface):
        now = pygame.time.get_ticks()
        progress = min(1.0, (now - self.created_time) / self.lifespan)
        alpha = max(0, int(210 * (1.0 - progress)))
        cx, cy = self.owner.rect.center
        r = max(1, int(self.radius))

        surf = pygame.Surface((r * 2, r * 2), pygame.SRCALPHA)
        pygame.draw.circle(surf, (230, 230, 240, alpha), (r, r), r, 5)

        # 회전하는 칼날 스포크로 도는 느낌 표현
        blade_count = 3
        for i in range(blade_count):
            ang = math.radians(self.effect_angle + i * (360.0 / blade_count))
            inner = pygame.math.Vector2(math.cos(ang), math.sin(ang)) * (r * 0.25)
            outer = pygame.math.Vector2(math.cos(ang), math.sin(ang)) * r
            pygame.draw.line(surf, (255, 255, 255, alpha), (r + inner.x, r + inner.y), (r + outer.x, r + outer.y), 4)

        surface.blit(surf, (cx - r, cy - r))


class AssassinBasicSkill:
    def __init__(self, owner=None):
        self.owner = owner
        self.name = "Thrust / Spin Slash"
        self.cooldown = 350
        self.last_used = 0
        self.keywords = ['melee']

    def can_use(self):
        return pygame.time.get_ticks() - self.last_used >= self.cooldown

    def use(self, owner, direction, attacks_list, color):
        self.owner = owner
        self.last_used = pygame.time.get_ticks()

        charges = getattr(owner, 'assassin_charge', 0)
        if charges > 0:
            # 충전 하나당 강화 평타(회전 베기) 한 번 - 여러 개면 여러 번 쓸 수 있음
            owner.assassin_charge = charges - 1
            attacks_list.append(AssassinSpinAttack(owner))
        else:
            attacks_list.append(AssassinThrustAttack(owner, direction))


# ==========================================
# [스킬 1] 짧은 대쉬 (쿨타임 짧음)
# ==========================================
class AssassinDashManager:
    def __init__(self, owner, direction):
        self.owner = owner
        self.direction = direction
        self.dash_speed = 20.0
        self.dash_duration = 60  # 엄청 짧은 대쉬
        self.created_time = pygame.time.get_ticks()
        self.damage = 0
        self.hit_players = []
        self.is_dash = True

    def update(self, walls=None):
        now = pygame.time.get_ticks()
        if now - self.created_time < self.dash_duration:
            slow(self.owner, 0.1, 100)
            silence(self.owner, 0.1)

            time_scale = getattr(self.owner, 'time_scale', 1.0)
            dx = self.direction[0] * self.dash_speed * time_scale
            dy = self.direction[1] * self.dash_speed * time_scale

            if walls is not None:
                move_entity_with_walls(self.owner, dx, dy, walls)
            else:
                self.owner.rect.x += int(dx)
                self.owner.rect.y += int(dy)

    def is_expired(self):
        expired = (pygame.time.get_ticks() - self.created_time >= self.dash_duration)
        if expired:
            if hasattr(self.owner, 'status_effects'):
                self.owner.status_effects.pop('slow', None)
                self.owner.status_effects.pop('silence', None)
            self.owner.silenced = False
            self.owner.speed_multiplier = 1.0
        return expired

    def collides_with(self, target):
        return False

    def apply_effect(self, target):
        pass

    def draw(self, surface):
        pass


class AssassinDashSkill:
    def __init__(self):
        self.name = "Quick Step"
        self.cooldown = 600  # 짧은 쿨타임
        self.last_used = 0
        self.keywords = ['dash']

    def can_use(self):
        return pygame.time.get_ticks() - self.last_used >= self.cooldown

    def use(self, owner, direction, attacks_list, color):
        self.last_used = pygame.time.get_ticks()
        _add_assassin_charge(owner)
        attacks_list.append(AssassinDashManager(owner, direction))


# ==========================================
# [스킬 2] 갈고리 - 벽 적중 시 그 위치로, 상대 적중 시 상대에게 이동 후 기절
# ==========================================
class AssassinHookPullManager:
    """갈고리가 벽에 맞았을 때: 그 지점까지 시간에 걸쳐 이동(순간이동 아님)"""
    def __init__(self, owner, direction, distance):
        self.owner = owner
        self.direction = direction
        self.dash_speed = 26.0
        # 이동 거리에 비례한 소요 시간 역산 (최소 시간 보장)
        frames_needed = max(1.0, distance / self.dash_speed)
        self.duration = max(120, int(frames_needed * (1000.0 / 60.0)))
        self.created_time = pygame.time.get_ticks()
        self.damage = 0
        self.hit_players = []
        self.is_dash = True

    def update(self, walls=None):
        now = pygame.time.get_ticks()
        if now - self.created_time < self.duration:
            slow(self.owner, 0.1, 100)
            silence(self.owner, 0.1)

            time_scale = getattr(self.owner, 'time_scale', 1.0)
            dx = self.direction[0] * self.dash_speed * time_scale
            dy = self.direction[1] * self.dash_speed * time_scale

            if walls is not None:
                move_entity_with_walls(self.owner, dx, dy, walls)
            else:
                self.owner.rect.x += int(dx)
                self.owner.rect.y += int(dy)

    def is_expired(self):
        expired = (pygame.time.get_ticks() - self.created_time >= self.duration)
        if expired:
            if hasattr(self.owner, 'status_effects'):
                self.owner.status_effects.pop('slow', None)
                self.owner.status_effects.pop('silence', None)
            self.owner.silenced = False
            self.owner.speed_multiplier = 1.0
        return expired

    def collides_with(self, target):
        return False

    def apply_effect(self, target):
        pass

    def draw(self, surface):
        pass


class AssassinHookGrappleToTarget:
    """갈고리가 상대에게 맞았을 때: 상대 쪽으로 시간에 걸쳐 이동한 뒤(순간이동 아님) 기절 부여"""
    def __init__(self, owner, target):
        self.owner = owner
        self.target = target
        self.dash_speed = 26.0
        self.created_time = pygame.time.get_ticks()
        self.max_duration = 500  # 안전장치(최대 이동 시간)
        self.arrive_distance = 46
        self.resolved = False
        self.damage = 0
        self.hit_players = []
        self.is_dash = True

    def _finish(self, apply_stun):
        self.resolved = True
        if hasattr(self.owner, 'status_effects'):
            self.owner.status_effects.pop('slow', None)
            self.owner.status_effects.pop('silence', None)
        self.owner.silenced = False
        self.owner.speed_multiplier = 1.0

        if apply_stun and self.target:
            # 기절 합성: 슬로우 100% + 침묵
            slow(self.target, 1.0, 100)
            silence(self.target, 1.0)

    def update(self, walls=None):
        if self.resolved:
            return
        now = pygame.time.get_ticks()
        if now - self.created_time >= self.max_duration:
            self._finish(apply_stun=False)
            return
        if not self.target or not hasattr(self.target, 'rect'):
            self._finish(apply_stun=False)
            return

        dx = self.target.rect.centerx - self.owner.rect.centerx
        dy = self.target.rect.centery - self.owner.rect.centery
        dist = math.hypot(dx, dy)

        if dist <= self.arrive_distance:
            self._finish(apply_stun=True)
            return

        slow(self.owner, 0.1, 100)
        silence(self.owner, 0.1)

        dir_x, dir_y = dx / dist, dy / dist
        time_scale = getattr(self.owner, 'time_scale', 1.0)
        step_x = dir_x * self.dash_speed * time_scale
        step_y = dir_y * self.dash_speed * time_scale

        if walls is not None:
            move_entity_with_walls(self.owner, step_x, step_y, walls)
        else:
            self.owner.rect.x += int(step_x)
            self.owner.rect.y += int(step_y)

    def is_expired(self):
        return self.resolved

    def collides_with(self, target):
        return False

    def apply_effect(self, target):
        pass

    def draw(self, surface):
        if not self.resolved and self.target and hasattr(self.target, 'rect'):
            pygame.draw.line(surface, (180, 40, 40), self.owner.rect.center, self.target.rect.center, 3)


class AssassinHookProjectile:
    def __init__(self, owner, direction, attacks_list):
        self.owner = owner
        self.direction = direction
        self.attacks_list = attacks_list
        self.damage = 0  # 갈고리 자체는 직접 데미지 없음 (이동/기절 전용)
        self.speed = 20.0
        self.created_time = pygame.time.get_ticks()
        self.lifespan = 1200
        self.hit_players = []

        self.width = 14
        self.height = 14
        self.pos_x = float(owner.rect.centerx + direction[0] * 22)
        self.pos_y = float(owner.rect.centery + direction[1] * 22)
        self.start_x = self.pos_x
        self.start_y = self.pos_y
        self.max_range = 480

        self.resolved = False
        # 벽 충돌은 직접 처리(도착 지점 계산을 위해) 하므로 공용 시스템은 건너뜀
        self.can_penetrate_walls = True

    def get_rect(self):
        return pygame.Rect(int(self.pos_x - self.width / 2), int(self.pos_y - self.height / 2),
                            self.width, self.height)

    def _resolve_wall_hit(self):
        self.resolved = True
        self.lifespan = 0
        traveled = math.hypot(self.pos_x - self.start_x, self.pos_y - self.start_y)
        self.attacks_list.append(AssassinHookPullManager(self.owner, self.direction, traveled))

    def _resolve_player_hit(self, target):
        self.resolved = True
        self.lifespan = 0
        self.attacks_list.append(AssassinHookGrappleToTarget(self.owner, target))

    def update(self):
        if self.resolved:
            return

        time_scale = getattr(self.owner, 'time_scale', 1.0)
        self.pos_x += self.direction[0] * self.speed * time_scale
        self.pos_y += self.direction[1] * self.speed * time_scale

        main_module = sys.modules.get('__main__')
        walls = getattr(main_module, 'walls', []) if main_module else []
        rect = self.get_rect()
        for wall in walls:
            if rect.colliderect(wall.rect):
                self._resolve_wall_hit()
                return

    def is_expired(self):
        if self.resolved:
            return True
        time_over = pygame.time.get_ticks() - self.created_time >= self.lifespan
        out_of_range = math.hypot(self.pos_x - self.start_x, self.pos_y - self.start_y) >= self.max_range
        return time_over or out_of_range

    def collides_with(self, target):
        if self.resolved:
            return False
        if target == self.owner or getattr(target, 'invincible', False) or target.defense >= 100.0:
            return False
        if self.get_rect().colliderect(target.rect):
            self._resolve_player_hit(target)
        return False  # 갈고리 자체는 직접 피해/궁극기 충전을 주지 않음

    def apply_effect(self, target):
        pass

    def draw(self, surface):
        if self.resolved:
            return
        pygame.draw.line(surface, (150, 150, 150), self.owner.rect.center, (int(self.pos_x), int(self.pos_y)), 2)
        pygame.draw.circle(surface, (90, 90, 100), (int(self.pos_x), int(self.pos_y)), 6)
        pygame.draw.circle(surface, (220, 220, 220), (int(self.pos_x), int(self.pos_y)), 6, 2)


class AssassinHookSkill:
    def __init__(self):
        self.name = "Grapple Hook"
        self.cooldown = 4500
        self.last_used = 0

    def can_use(self):
        return pygame.time.get_ticks() - self.last_used >= self.cooldown

    def use(self, owner, direction, attacks_list, color):
        self.last_used = pygame.time.get_ticks()
        _add_assassin_charge(owner)
        attacks_list.append(AssassinHookProjectile(owner, direction, attacks_list))


# ==========================================
# [궁극기] 은신(무적 + 피격판정 제외) 후 정면 X자 참격
# ==========================================
class AssassinXSlashAttack:
    """정면 기준 오른쪽 대각선 -> 왼쪽 대각선 순으로 두 번의 참격이 이어지며,
    칼날이 지나간 자리에 잔상이 남아 X자 궤적을 그린다."""
    def __init__(self, owner, direction, owner_color, origin=None):
        self.owner = owner
        self.color = owner_color
        self.damage = owner.base_atk * 3.0
        self.created_time = pygame.time.get_ticks()
        if origin is None:
            origin = owner.rect.center

        self.size = 520
        self.blade_len = 62
        self.blade_width = 45
        self.phase_duration = ULT_SLASH_PHASE_DURATION  # 획 하나가 지나가는 데 걸리는 시간 (느리게 그려지도록)
        self.afterimage_fade = 260  # 칼날을 따라 도는 잔상(스치는 궤적)이 옅어지는 시간
        self.ground_trail_fade = 900  # 바닥에 남는 칼자국은 훨씬 오래 유지
        self.lifespan = self.phase_duration * 2 + max(self.afterimage_fade, self.ground_trail_fade) + 20

        # X자 중심을 캐릭터보다 앞쪽으로 내밀어 생성
        forward_offset = 160
        self.pos_x = float(origin[0] + direction[0] * forward_offset)
        self.pos_y = float(origin[1] + direction[1] * forward_offset)

        base_angle = math.degrees(math.atan2(-direction[1], direction[0]))
        # 1획: 오른쪽 대각선을 오른쪽 -> 왼쪽으로 // 2획: 왼쪽 대각선을 왼쪽 -> 오른쪽으로
        self.stroke_angles = [base_angle - 45, base_angle + 45]

        self.hit_players = []
        self.can_penetrate_walls = True

        self.afterimages = []  # [{'pts': [...], 'time': ms}]
        self.last_after_time = 0
        self.current_blade_pts = None
        self.current_blade_center = None  # 칼날을 따라 움직이는 잔영(가짜 플레이어 사각형) 위치
        self.phantom_size = owner.rect.width

        # 칼로 그은 듯한 바닥의 얇고 긴 흔적 (획별로 시작~끝 지점을 기록)
        self.ground_trail_start = [None, None]
        self.ground_trail_end = [None, None]

    def _stroke_progress(self, now):
        elapsed = now - self.created_time
        if elapsed < self.phase_duration:
            return 0, min(1.0, elapsed / self.phase_duration)
        if elapsed < self.phase_duration * 2:
            return 1, min(1.0, (elapsed - self.phase_duration) / self.phase_duration)
        return -1, 1.0

    def _blade_center(self, stroke_idx, t):
        angle_deg = self.stroke_angles[stroke_idx]
        rad = math.radians(angle_deg)
        cos_a, sin_a = math.cos(rad), math.sin(rad)

        # t=0: 시작 지점(오른쪽/왼쪽으로 size/2만큼 떨어진 곳) -> t=1: 시작점 반대편(그만큼 이동)
        dist = (self.size / 2) * (1.0 - 2.0 * t)
        return self.pos_x + cos_a * dist, self.pos_y - sin_a * dist, angle_deg

    def _blade_points(self, cx, cy, angle_deg):
        rad = math.radians(angle_deg)
        cos_a, sin_a = math.cos(rad), math.sin(rad)
        half_len, half_w = self.blade_len, self.blade_width / 2
        local_pts = [(-half_len, -half_w), (half_len, -half_w), (half_len, half_w), (-half_len, half_w)]
        return [
            (cx + lx * cos_a - ly * sin_a, cy - (lx * sin_a + ly * cos_a))
            for lx, ly in local_pts
        ]

    def update(self):
        now = pygame.time.get_ticks()
        stroke_idx, t = self._stroke_progress(now)

        if stroke_idx == -1:
            self.current_blade_pts = None
            self.current_blade_center = None
        else:
            cx, cy, angle_deg = self._blade_center(stroke_idx, t)
            self.current_blade_pts = self._blade_points(cx, cy, angle_deg)
            self.current_blade_center = (cx, cy)
            if now - self.last_after_time >= 30:  # [최적화] 매 프레임 대신 30ms 간격으로 쌓아 개수를 줄임 (체감 밀도는 거의 동일)
                self.afterimages.append({'pts': self.current_blade_pts, 'time': now})
                self.last_after_time = now

            if self.ground_trail_start[stroke_idx] is None:
                self.ground_trail_start[stroke_idx] = (cx, cy)
            self.ground_trail_end[stroke_idx] = (cx, cy)

        self.afterimages = [img for img in self.afterimages if now - img['time'] < self.afterimage_fade]

    def is_expired(self):
        return pygame.time.get_ticks() - self.created_time >= self.lifespan

    def collides_with(self, target):
        if target == self.owner or getattr(target, 'invincible', False) or target.defense >= 100.0:
            return False
        if self.current_blade_pts is None:
            return False
        return check_polygon_collision(self.current_blade_pts, target.rect)

    def apply_effect(self, target):
        pass

    def _get_phantom_surf(self):
        # [최적화] 크기/색이 시전 내내 고정이므로 한 번만 만들어 재사용
        cached = getattr(self, '_phantom_surf_cache', None)
        if cached is None:
            cached = pygame.Surface((self.phantom_size, self.phantom_size), pygame.SRCALPHA)
            cached.fill(self.color + (150,))
            self._phantom_surf_cache = cached
        return cached

    def draw(self, surface):
        now = pygame.time.get_ticks()
        half = _X_SLASH_BOX // 2
        ox, oy = self.pos_x - half, self.pos_y - half
        surf = _get_x_slash_overlay()

        # 바닥에 칼로 그은 듯한 얇고 긴 흔적 (각 획의 시작~끝 지점을 실제보다 조금 더 늘려서 표시)
        elapsed = now - self.created_time
        total_stroke_time = self.phase_duration * 2
        if elapsed <= total_stroke_time:
            trail_alpha = 210
        else:
            fade_elapsed = elapsed - total_stroke_time
            trail_alpha = max(0, int(210 * (1.0 - fade_elapsed / self.ground_trail_fade)))

        if trail_alpha > 0:
            for idx in range(2):
                if self.ground_trail_start[idx] is None:
                    continue
                sx, sy = self.ground_trail_start[idx]
                ex, ey = self.ground_trail_end[idx]
                dx, dy = ex - sx, ey - sy
                dist = math.hypot(dx, dy)
                if dist > 0:
                    ux, uy = dx / dist, dy / dist
                    extend = 30
                    sx -= ux * extend
                    sy -= uy * extend
                    ex += ux * extend
                    ey += uy * extend
                pygame.draw.line(surf, (255, 255, 255, trail_alpha), (sx - ox, sy - oy), (ex - ox, ey - oy), 3)
                pygame.draw.line(surf, self.color + (trail_alpha,), (sx - ox, sy - oy), (ex - ox, ey - oy), 1)

        for img in self.afterimages:
            age = now - img['time']
            alpha = max(0, int(220 * (1.0 - age / self.afterimage_fade)))
            if alpha <= 0:
                continue
            pts = [(int(p[0] - ox), int(p[1] - oy)) for p in img['pts']]
            pygame.draw.polygon(surf, self.color + (alpha,), pts)
            pygame.draw.polygon(surf, (255, 255, 255, alpha), pts, 1)

        if self.current_blade_pts is not None:
            pts = [(int(p[0] - ox), int(p[1] - oy)) for p in self.current_blade_pts]
            pygame.draw.polygon(surf, (255, 255, 255, 255), pts)
            pygame.draw.polygon(surf, self.color + (255,), pts, 2)

        # 칼날을 따라 움직이는 가짜 플레이어 사각형 - 실제 충돌체는 아니고,
        # "이 녀석이 베고 있다"는 느낌만 주는 잔영
        if self.current_blade_center is not None:
            s = self.phantom_size
            cx, cy = self.current_blade_center
            phantom_rect = pygame.Rect(0, 0, s, s)
            phantom_rect.center = (int(cx - ox), int(cy - oy))
            surf.blit(self._get_phantom_surf(), phantom_rect.topleft)
            pygame.draw.rect(surf, (255, 255, 255, 200), phantom_rect, 2)

        surface.blit(surf, (int(ox), int(oy)))


class AssassinStealthManager:
    """잠시 사라지고(무적 + 피격판정 제외) 종료 시점에 X자 참격을 날림.
    참격의 위치와 방향 모두 사용 당시(은신 시작 시점) 기준으로 고정되며, 은신 중
    캐릭터가 이동하거나 방향을 돌려도 바뀌지 않는다."""
    def __init__(self, owner, attacks_list, color):
        self.owner = owner
        self.attacks_list = attacks_list
        self.color = color
        self.created_time = pygame.time.get_ticks()
        self.duration = 500
        self.damage = 0
        self.hit_players = []
        self.cast_direction = owner.facing  # 사용 당시 방향으로 고정
        self.cast_position = owner.rect.center  # 사용 당시 위치로 고정

        owner.invincible = True
        owner.is_invisible = True
        # 은신~참격이 끝날 때까지 다른 스킬을 같이 못 쓰게 자가 침묵
        silence(owner, (self.duration + ULT_SLASH_PHASE_DURATION * 2) / 1000.0)

    def update(self):
        pass

    def is_expired(self):
        if pygame.time.get_ticks() - self.created_time >= self.duration:
            self.owner.invincible = False
            self.owner.is_invisible = False
            self.owner.assassin_jump_time = pygame.time.get_ticks()  # 재등장과 함께 뛰어오르는 연출
            self.attacks_list.append(AssassinXSlashAttack(
                self.owner, self.cast_direction, self.color, origin=self.cast_position))
            return True
        return False

    def collides_with(self, target):
        return False

    def apply_effect(self, target):
        pass

    def draw(self, surface):
        pass


class AssassinUltSkill:
    def __init__(self):
        self.name = "Vanish Strike"
        self.cooldown = 500  # 궁극기 100% 게이지 즉시 발동
        self.last_used = -99999
        self.ult_charge_rate = 5.0
        self.keywords = ['ult']

    def can_use(self):
        return pygame.time.get_ticks() - self.last_used >= self.cooldown

    def use(self, owner, direction, attacks_list, color):
        self.last_used = pygame.time.get_ticks()
        _add_assassin_charge(owner)
        attacks_list.append(AssassinStealthManager(owner, attacks_list, color))


# ==========================================
# 어쌔신(Assassin) 캐릭터 데이터 등록 매핑
# ==========================================
def apply_assassin_to_player(player):
    player.max_hp = 85
    player.hp = player.max_hp
    player.base_atk = 14
    player.speed = 5.1
    player.is_assassin = True
    player.assassin_charge = 0
    player.is_invisible = False
    player.assassin_jump_time = -99999

    basic_skill = AssassinBasicSkill(player)

    player.abilities = [
        basic_skill,          # 평타 (찌르기 / 충전 3개 소모 시 360도 베기)
        AssassinDashSkill(),  # 1스킬 (짧은 대쉬, 짧은 쿨타임)
        AssassinHookSkill(),  # 2스킬 (갈고리: 벽 적중 시 이동 / 적중 시 상대에게 이동+기절)
        AssassinUltSkill(),   # 궁극기 (은신 후 X자 참격)
    ]

    if len(player.abilities) >= 4 and hasattr(player.abilities[3], 'ult_charge_rate'):
        player.ult_charge_rate = player.abilities[3].ult_charge_rate

    original_draw = player.draw

    def custom_draw(surface):
        if getattr(player, 'is_invisible', False):
            return

        # 궁극기로 재등장할 때 살짝 뛰어오르는 듯한 포물선 연출
        jump_duration = 260
        jump_height = 26
        jump_elapsed = pygame.time.get_ticks() - getattr(player, 'assassin_jump_time', -99999)

        if 0 <= jump_elapsed < jump_duration:
            p = jump_elapsed / jump_duration
            offset_y = -jump_height * 4.0 * p * (1.0 - p)  # 포물선(뛰었다가 착지)
            original_y = player.rect.y
            player.rect.y = original_y + int(offset_y)
            original_draw(surface)
            player.rect.y = original_y
        else:
            original_draw(surface)

    player.draw = custom_draw

    def custom_reset():
        player.is_assassin = False
        player.assassin_charge = 0
        player.is_invisible = False
        player.invincible = False
        player.assassin_jump_time = -99999

    player.custom_reset = custom_reset


ASSASSIN_CHARACTER_DATA = {
    "id": "ASSASSIN",
    "name": "어쌔신",
    "desc": "평타: 단검으로 적을 찌릅니다(14), 스킬 1: 짧게 돌진하고 평타를 강화합니다(최대 3번), 강화 평타: 원형으로 검을 돌립니다(17), 스킬 2: 갈고리를 던져 벽이나 상대로 이동할 수 있습니다, 상대를 맞추면 1초간 기절시킵니다, 궁극기: x자로 크게 그어 큰 대미지를 줍니다(42)",
    "apply": apply_assassin_to_player
}

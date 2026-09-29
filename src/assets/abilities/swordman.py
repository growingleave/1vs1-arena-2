import pygame
import math
from utils import check_polygon_collision
from wall import move_entity_with_walls
from status_effects import slow, defense_mod, silence

# ==========================================
# [검사 - 기본 참격] 부채꼴 근접 베기 (플레이어 위치 추적)
# ==========================================
class SwordmanSlashAttack:
    def __init__(self, owner, direction, owner_color):
        self.owner = owner
        self.direction = direction
        self.color = owner_color
        self.damage = owner.base_atk * 1.5
        
        self.radius = 60
        self.arc_angle = 120
        self.duration = 150
        self.start_time = pygame.time.get_ticks()
        self.hit_players = []

        self.can_penetrate_walls = True
        self.base_angle = math.degrees(math.atan2(-direction[1], direction[0]))
        
        # [수정] 초기 좌표 선언 (AttributeError 방지)
        self.owner_x = float(self.owner.rect.centerx)
        self.owner_y = float(self.owner.rect.centery)

    def update(self):
        self.owner_x = float(self.owner.rect.centerx)
        self.owner_y = float(self.owner.rect.centery)

    def is_expired(self):
        return pygame.time.get_ticks() - self.start_time >= self.duration

    def get_points(self):
        elapsed = pygame.time.get_ticks() - self.start_time
        progress = min(1.0, elapsed / self.duration)
        
        current_arc = self.arc_angle * progress
        start_angle = self.base_angle - (self.arc_angle / 2)
        end_angle = start_angle + current_arc

        points = [(self.owner_x, self.owner_y)]
        steps = 10
        for i in range(steps + 1):
            angle_rad = math.radians(start_angle + (end_angle - start_angle) * (i / steps))
            px = self.owner_x + self.radius * math.cos(angle_rad)
            py = self.owner_y - self.radius * math.sin(angle_rad)
            points.append((px, py))
        return points

    def collides_with(self, target_player):
        if target_player == self.owner or getattr(target_player, 'invincible', False) or target_player.defense >= 100.0:
            return False
        return check_polygon_collision(self.get_points(), target_player.rect)

    def apply_effect(self, target):
        pass

    def draw(self, surface):
        points = self.get_points()
        if len(points) >= 3:
            pygame.draw.polygon(surface, self.color, points)
            pygame.draw.polygon(surface, (255, 255, 255), points, 2)


# ==========================================
# [검사 - 강화 검기] 전방 발사 직사각형 투사체 (슬로우 30%)
# ==========================================
class SwordmanProjectileAttack:
    def __init__(self, owner, direction, owner_color):
        self.owner = owner
        self.direction = direction
        self.color = owner_color
        self.damage = owner.base_atk * 1.2
        self.speed = 10.0
        
        self.width = 15
        self.height = 60
        self.angle = math.degrees(math.atan2(-direction[1], direction[0]))
        
        self.pos_x = float(owner.rect.centerx)
        self.pos_y = float(owner.rect.centery)
        
        self.hit_players = []
        self.created_time = pygame.time.get_ticks()
        self.lifespan = 1500
        self.can_penetrate_walls = False

    def get_polygon_points(self):
        rad = math.radians(self.angle)
        cos_a = math.cos(rad)
        sin_a = math.sin(rad)

        hw = self.width / 2
        hh = self.height / 2

        local_pts = [(-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh)]
        world_pts = []
        for lx, ly in local_pts:
            rx = lx * cos_a - ly * sin_a
            ry = -(lx * sin_a + ly * cos_a)
            world_pts.append((self.pos_x + rx, self.pos_y + ry))
        return world_pts

    def update(self):
        # [수정] time_scale 연동
        time_scale = getattr(self.owner, 'time_scale', 1.0)
        self.pos_x += self.direction[0] * self.speed * time_scale
        self.pos_y += self.direction[1] * self.speed * time_scale

    def is_expired(self):
        out_of_bounds = (self.pos_x < -100 or self.pos_x > 1380 or self.pos_y < -100 or self.pos_y > 820)
        time_over = (pygame.time.get_ticks() - self.created_time >= self.lifespan)
        return out_of_bounds or time_over

    def collides_with(self, target_player):
        if target_player == self.owner or getattr(target_player, 'invincible', False) or target_player.defense >= 100.0:
            return False
        return check_polygon_collision(self.get_polygon_points(), target_player.rect)

    def apply_effect(self, target):
        slow(target, 2.0, 30)

    def draw(self, surface):
        pts = self.get_polygon_points()
        pygame.draw.polygon(surface, self.color, pts)
        pygame.draw.polygon(surface, (255, 255, 255), pts, 2)


# ==========================================
# [검사 - 스킬 1] 돌진 베기 (이중 가속 방지 & 벽 충돌 연동)
# ==========================================
class SwordmanDashAttack:
    def __init__(self, owner, direction, owner_color):
        self.owner = owner
        self.direction = direction
        self.color = owner_color
        self.damage = owner.base_atk * 2.0
        
        self.dash_speed = 18.0
        self.duration = 200
        self.start_time = pygame.time.get_ticks()
        self.hit_players = []

        self.box_size = 60
        self.rect = pygame.Rect(0, 0, self.box_size, self.box_size)
        self.update_position()

        self.is_dash = True
        self.can_penetrate_walls = False

    def update_position(self):
        self.rect.center = self.owner.rect.center

    def update(self, walls):
        # [수정] 돌진 중 자체 이동키 중첩 방지 (슬로우 100%)
        slow(self.owner, 0.1, 100)

        time_scale = getattr(self.owner, 'time_scale', 1.0)
        dx = self.direction[0] * self.dash_speed * time_scale
        dy = self.direction[1] * self.dash_speed * time_scale
        move_entity_with_walls(self.owner, dx, dy, walls)
        self.update_position()

    def is_expired(self):
        expired = (pygame.time.get_ticks() - self.start_time >= self.duration)
        if expired:
            if hasattr(self.owner, 'status_effects'):
                self.owner.status_effects.pop('slow', None)
            self.owner.speed_multiplier = 1.0
        return expired

    def collides_with(self, target_player):
        if target_player == self.owner or getattr(target_player, 'invincible', False) or target_player.defense >= 100.0:
            return False
        return self.rect.colliderect(target_player.rect)

    def apply_effect(self, target):
        pass

    def draw(self, surface):
        dash_surf = pygame.Surface((self.box_size, self.box_size), pygame.SRCALPHA)
        dash_surf.fill((*self.color[:3], 100))
        surface.blit(dash_surf, self.rect.topleft)
        pygame.draw.rect(surface, (255, 255, 255), self.rect, 2)


# ==========================================
# [검사 - 궁극기] 일섬 거대 돌진 (벽 충돌 연동 & 다각형 판정)
# ==========================================
class SwordmanUltDashAttack:
    def __init__(self, owner, direction, owner_color):
        self.owner = owner
        self.direction = direction
        self.color = owner_color
        self.damage = owner.base_atk * 4.5
        
        self.dash_speed = 22.0  
        self.duration = 350   
        self.start_time = pygame.time.get_ticks()
        self.hit_players = []

        self.width = 70
        self.height = 150
        
        self.angle = math.degrees(math.atan2(-direction[1], direction[0]))
        self.pos_x = float(self.owner.rect.centerx)
        self.pos_y = float(self.owner.rect.centery)

        self.is_dash = True
        self.can_penetrate_walls = False

    def update_position(self):
        self.pos_x = float(self.owner.rect.centerx)
        self.pos_y = float(self.owner.rect.centery)

    def update(self, walls):
        # [수정] 궁극기 돌진 중 조작 잠금 유지
        slow(self.owner, 0.1, 100)

        time_scale = getattr(self.owner, 'time_scale', 1.0)
        dx = self.direction[0] * self.dash_speed * time_scale
        dy = self.direction[1] * self.dash_speed * time_scale
        move_entity_with_walls(self.owner, dx, dy, walls)
        self.update_position()

    def is_expired(self):
        expired = (pygame.time.get_ticks() - self.start_time >= self.duration)
        if expired:
            if hasattr(self.owner, 'status_effects'):
                self.owner.status_effects.pop('slow', None)
            self.owner.speed_multiplier = 1.0
        return expired

    def get_polygon_points(self):
        rad = math.radians(self.angle)
        cos_a = math.cos(rad)
        sin_a = math.sin(rad)

        hw = self.width / 2
        hh = self.height / 2

        local_pts = [(-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh)]
        world_pts = []
        for lx, ly in local_pts:
            rx = lx * cos_a - ly * sin_a
            ry = -(lx * sin_a + ly * cos_a)
            world_pts.append((self.pos_x + rx, self.pos_y + ry))
        return world_pts

    def collides_with(self, target_player):
        if target_player == self.owner or getattr(target_player, 'invincible', False) or target_player.defense >= 100.0:
            return False
        return check_polygon_collision(self.get_polygon_points(), target_player.rect)

    def apply_effect(self, target):
        pass

    def draw(self, surface):
        pts = self.get_polygon_points()
        if len(pts) >= 3:
            xs = [p[0] for p in pts]
            ys = [p[1] for p in pts]
            min_x, min_y = min(xs), min(ys)
            w, h = max(max(xs) - min_x, 1), max(max(ys) - min_y, 1)

            ult_surf = pygame.Surface((int(w), int(h)), pygame.SRCALPHA)
            local_pts = [(p[0] - min_x, p[1] - min_y) for p in pts]

            pygame.draw.polygon(ult_surf, (255, 215, 0, 90), local_pts)
            surface.blit(ult_surf, (int(min_x), int(min_y)))

            pygame.draw.polygon(surface, (255, 255, 255), pts, 3)


# ==========================================
# 스킬 클래스 (키워드 및 연계 시스템)
# ==========================================

class SwordmanBasicSlash:
    def __init__(self):
        self.name = "Basic Slash"
        self.cooldown = 400
        self.last_used = 0
        self.keywords = ['melee', 'projectile']

    def can_use(self):
        return pygame.time.get_ticks() - self.last_used >= self.cooldown

    def use(self, owner, direction, attacks_list, color):
        self.last_used = pygame.time.get_ticks()
        slash = SwordmanSlashAttack(owner, direction, color)
        slash.update()
        attacks_list.append(slash)
        
        enhanced_count = getattr(owner, 'slash_enhance_count', 0)
        if enhanced_count > 0:
            projectile = SwordmanProjectileAttack(owner, direction, color)
            attacks_list.append(projectile)
            owner.slash_enhance_count -= 1


class SwordmanDashSkill:
    def __init__(self):
        self.name = "Swordman Dash"
        self.cooldown = 1500
        self.last_used = 0
        self.keywords = ['dash']  # 속박(bind) 시 사용 차단

    def can_use(self):
        return pygame.time.get_ticks() - self.last_used >= self.cooldown

    def use(self, owner, direction, attacks_list, color):
        self.last_used = pygame.time.get_ticks()
        dash = SwordmanDashAttack(owner, direction, color)
        attacks_list.append(dash)


class SwordmanEnhanceSkill:
    def __init__(self):
        self.name = "Sword Enhance"
        self.cooldown = 6000
        self.last_used = 0
        self.keywords = ['buff']

    def can_use(self):
        return pygame.time.get_ticks() - self.last_used >= self.cooldown

    def use(self, owner, direction, attacks_list, color):
        self.last_used = pygame.time.get_ticks()
        owner.slash_enhance_count = 3


class SwordmanUltSkill:
    def __init__(self):
        self.name = "Massive Ult Dash"
        self.cooldown = 500  # 궁극기 100% 즉시 발동
        self.last_used = -99999
        self.ult_charge_rate = 10.0
        self.keywords = ['dash', 'ult']

    def can_use(self):
        return pygame.time.get_ticks() - self.last_used >= self.cooldown

    def use(self, owner, direction, attacks_list, color):
        owner.cast_timer = 1.0
        defense_mod(owner, 1.0, 100)  # [수정] 1초 집중(선딜레이) 동안 완전 무적 부여
        
        def execute_ult():
            self.last_used = pygame.time.get_ticks()
            ult_dash = SwordmanUltDashAttack(owner, direction, color)
            attacks_list.append(ult_dash)

        owner.pending_action = execute_ult


# ==========================================
# 검사(Swordman) 캐릭터 데이터 등록 매핑
# ==========================================
def apply_swordman_to_player(player):
    player.max_hp = 100
    player.hp = player.max_hp
    player.base_atk = 10
    player.speed = 4.3
    player.slash_enhance_count = 0  # [수정] 기본 강화 스택 초기화
    
    player.abilities = [
        SwordmanBasicSlash(),    # 평타
        SwordmanDashSkill(),     # 1스킬 (돌진)
        SwordmanEnhanceSkill(),  # 2스킬 (검기 강화)
        SwordmanUltSkill()       # 궁극기 (일섬 돌진)
    ]
    
    if len(player.abilities) >= 4 and hasattr(player.abilities[3], 'ult_charge_rate'):
        player.ult_charge_rate = player.abilities[3].ult_charge_rate

    def custom_reset():
        player.slash_enhance_count = 0
    player.custom_reset = custom_reset


SWORDMAN_CHARACTER_DATA = {
    "id": "SWORDMAN",
    "name": "검사",
    "desc": "평타: 부채꼴로 가까운 적을 공격합니다(15), 스킬 1(1.5초): 앞으로 돌진합니다(20), 스킬 2(6초): 평타 강화로 슬로우를 묻히는 검기 3개가 나옴(슬로우 30% 2초, 검기 12), 궁극기: 앞으로 강하게 돌진합니다(45)",
    "apply": apply_swordman_to_player
}
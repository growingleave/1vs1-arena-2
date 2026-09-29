import pygame
import math
import random
from utils import check_polygon_collision, get_character_sprite, get_character_thumbnail
from wall import move_entity_with_walls
from status_effects import silence, slow, forced_move, defense_mod, bind


# ==========================================
# [스킬 1 - J키] 기본 펀치 공격
# ==========================================
class FighterBasicHitbox:
    def __init__(self, owner, direction):
        self.owner = owner
        self.direction = direction
        self.damage = owner.base_atk
        self.created_time = pygame.time.get_ticks()
        self.lifespan = 150  
        self.hit_players = []

        self.width = 60
        self.height = 40

        offset_distance = 30
        self.pos_x = float(owner.rect.centerx + direction[0] * offset_distance)
        self.pos_y = float(owner.rect.centery + direction[1] * offset_distance)

    def get_polygon_points(self):
        angle = math.degrees(math.atan2(-self.direction[1], self.direction[0]))
        rad = math.radians(angle)
        cos_a = math.cos(rad)
        sin_a = math.sin(rad)
        
        hw = self.width / 2
        hh = self.height / 2
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
        pygame.draw.polygon(surface, (255, 180, 50), pts)
        pygame.draw.polygon(surface, (255, 255, 255), pts, 2)


class FighterBasicSkill:
    def __init__(self):
        self.name = "Punch"
        self.cooldown = 400
        self.last_used = 0

    def can_use(self):
        return pygame.time.get_ticks() - self.last_used >= self.cooldown

    def use(self, owner, direction, attacks_list, color):
        self.last_used = pygame.time.get_ticks()
        attacks_list.append(FighterBasicHitbox(owner, direction))


# ==========================================
# [스킬 2 - K키] 10스택 충전식 투사체 연타
# ==========================================
class FighterChargeHitbox:
    def __init__(self, owner, direction):
        self.owner = owner
        self.hit_players = []
        
        base_angle = math.degrees(math.atan2(-direction[1], direction[0]))
        self.angle = base_angle + random.uniform(-20, 20)
        
        rad = math.radians(self.angle)
        self.direction = (math.cos(rad), -math.sin(rad))
        
        self.damage = owner.base_atk * 0.5
        self.speed = 6
        self.created_time = pygame.time.get_ticks()
        self.lifespan = 800  
        
        self.width = 50
        self.height = 40
        
        self.pos_x = float(owner.rect.centerx)
        self.pos_y = float(owner.rect.centery)
        self.start_x = self.pos_x
        self.start_y = self.pos_y
        self.max_range = 100  

    def get_polygon_points(self):
        rad = math.radians(self.angle)
        cos_a, sin_a = math.cos(rad), math.sin(rad)
        
        hw = self.width / 2
        hh = self.height / 2
        local_pts = [(-hw, -hh), (hw, -hh), (hw, hh), (-hw, hh)]
        
        return [
            (self.pos_x + lx * cos_a - ly * sin_a, self.pos_y - (lx * sin_a + ly * cos_a))
            for lx, ly in local_pts
        ]

    def update(self):
        time_scale = getattr(self.owner, 'time_scale', 1.0)
        self.pos_x += self.direction[0] * self.speed * time_scale
        self.pos_y += self.direction[1] * self.speed * time_scale

    def is_expired(self):
        time_over = pygame.time.get_ticks() - self.created_time >= self.lifespan
        out_of_range = math.hypot(self.pos_x - self.start_x, self.pos_y - self.start_y) >= self.max_range
        return time_over or out_of_range

    def collides_with(self, target):
        if target == self.owner or getattr(target, 'invincible', False) or target.defense >= 100.0:
            return False
        return check_polygon_collision(self.get_polygon_points(), target.rect)

    def apply_effect(self, target):
        pass

    def draw(self, surface):
        pts = [(int(p[0]), int(p[1])) for p in self.get_polygon_points()]
        pygame.draw.polygon(surface, (255, 140, 0), pts)
        pygame.draw.polygon(surface, (255, 255, 255), pts, 2)


class FighterChargeSkill:
    def __init__(self):
        self.name = "Heavy Smash"
        self.cooldown_type = 'charges'
        self.max_charges = 10
        self.current_charges = 10
        self.charge_cooldown = 1500  
        self.last_charge_time = pygame.time.get_ticks()
        
        self.internal_cooldown = 150 
        self.last_used = 0

    def update_charges(self):
        now = pygame.time.get_ticks()
        if self.current_charges < self.max_charges:
            elapsed = now - self.last_charge_time
            if elapsed >= self.charge_cooldown:
                # [개선] 시간이 많이 지났을 경우 누적 충전량 일괄 계산
                charges_to_add = elapsed // self.charge_cooldown
                self.current_charges = min(self.max_charges, self.current_charges + charges_to_add)
                self.last_charge_time += charges_to_add * self.charge_cooldown

    def can_use(self):
        self.update_charges()
        now = pygame.time.get_ticks()
        return self.current_charges > 0 and (now - self.last_used >= self.internal_cooldown)

    def use(self, owner, direction, attacks_list, color):
        self.current_charges -= 1
        self.last_used = pygame.time.get_ticks()
        if self.current_charges == self.max_charges - 1:
            self.last_charge_time = pygame.time.get_ticks()
            
        attacks_list.append(FighterChargeHitbox(owner, direction))


# ==========================================
# [스킬 3 - L키] 대시 후 슬램
# ==========================================
class FighterDashSlamHitbox:
    def __init__(self, owner):
        self.owner = owner
        self.damage = owner.base_atk * 1.5
        self.created_time = pygame.time.get_ticks()
        self.lifespan = 200
        self.hit_players = []
        
        self.width = 70
        self.height = 70

        offset_distance = 35
        self.direction = owner.facing
        self.pos_x = float(owner.rect.centerx + self.direction[0] * offset_distance)
        self.pos_y = float(owner.rect.centery + self.direction[1] * offset_distance)

    def get_polygon_points(self):
        angle = math.degrees(math.atan2(-self.direction[1], self.direction[0]))
        rad = math.radians(angle)
        cos_a = math.cos(rad)
        sin_a = math.sin(rad)
        
        hw = self.width / 2
        hh = self.height / 2
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
        forced_move(target, 0.2, 300, self.direction)
        slow(target, 1.0, 100)
        silence(target, 1.0)

    def draw(self, surface):
        pts = [(int(p[0]), int(p[1])) for p in self.get_polygon_points()]
        pygame.draw.polygon(surface, (50, 150, 255), pts, 0)
        pygame.draw.polygon(surface, (255, 255, 255), pts, 2)


class FighterDashManager:
    def __init__(self, owner, direction, attacks_list):
        self.owner = owner
        self.direction = direction
        self.attacks_list = attacks_list
        self.dash_speed = 15.0
        self.dash_duration = 150
        self.created_time = pygame.time.get_ticks()
        self.damage = 0
        self.hit_players = [] 
        self.is_dash = True

    def update(self, walls=None):
        now = pygame.time.get_ticks()
        if now - self.created_time < self.dash_duration:
            # [수정] 돌진 중 기본 이동 조작 및 스킬 중복 입력 잠금 (이중 가속 방지)
            slow(self.owner, 0.1, 100)
            silence(self.owner, 0.1)

            dx = self.direction[0] * self.dash_speed * getattr(self.owner, 'time_scale', 1.0)
            dy = self.direction[1] * self.dash_speed * getattr(self.owner, 'time_scale', 1.0)
            
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
            self.attacks_list.append(FighterDashSlamHitbox(self.owner))
        return expired

    def collides_with(self, target):
        return False
        
    def apply_effect(self, target):
        pass

    def draw(self, surface):
        pass


class FighterDashSkill:
    def __init__(self):
        self.name = "Dash Slam"
        self.cooldown = 4000
        self.last_used = 0
        self.keywords = ['dash']

    def can_use(self):
        return pygame.time.get_ticks() - self.last_used >= self.cooldown

    def use(self, owner, direction, attacks_list, color):
        self.last_used = pygame.time.get_ticks()
        attacks_list.append(FighterDashManager(owner, direction, attacks_list))


# ==========================================
# [궁극기 - O키] 3연속 거대 폭발
# ==========================================
class FighterUltHitbox:
    def __init__(self, owner, angle, pos_x, pos_y):
        self.owner = owner
        self.angle = angle
        self.pos_x = pos_x
        self.pos_y = pos_y
        self.damage = owner.base_atk * 2.0  
        self.created_time = pygame.time.get_ticks()
        self.lifespan = 150  
        self.hit_players = []
        self.can_penetrate_walls = True  # [수정] 거대 폭발 벽 관통 (벽 접촉 시 즉시 증발 방지)

        self.width = 500
        self.height = 400

    def get_polygon_points(self):
        rad = math.radians(self.angle)
        cos_a = math.cos(rad)
        sin_a = math.sin(rad)
        
        hh = self.height / 2
        local_pts = [(0, -hh), (self.width, -hh), (self.width, hh), (0, hh)]
        
        world_pts = []
        for lx, ly in local_pts:
            rx = lx * cos_a - ly * sin_a
            ry = -(lx * sin_a + ly * cos_a)
            world_pts.append((self.pos_x + rx, self.pos_y + ry))
        return world_pts

    def update(self):
        pass

    def is_expired(self):
        return pygame.time.get_ticks() - self.created_time >= self.lifespan

    def collides_with(self, target):
        if target == self.owner or getattr(target, 'invincible', False) or target.defense >= 100.0:
            return False
        hit = check_polygon_collision(self.get_polygon_points(), target.rect)
        if hit and target not in self.hit_players:
            self.hit_players.append(target)
            return True
        return False
        
    def apply_effect(self, target):
        pass

    def draw(self, surface):
        pts = self.get_polygon_points()
        int_pts = [(int(p[0]), int(p[1])) for p in pts]
        pygame.draw.polygon(surface, (255, 80, 50), int_pts)
        pygame.draw.polygon(surface, (255, 255, 255), int_pts, 3)


class FighterUltManager:
    def __init__(self, owner, direction, attacks_list):
        self.owner = owner
        self.direction = direction
        self.attacks_list = attacks_list
        self.created_time = pygame.time.get_ticks()
        self.strikes_done = 0
        self.damage = 0
        self.hit_players = []
        
        self.width = 500
        self.height = 400
        
        self.angle = math.degrees(math.atan2(-direction[1], direction[0]))
        self.pos_x = float(owner.rect.centerx)
        self.pos_y = float(owner.rect.centery)

    def get_polygon_points(self):
        rad = math.radians(self.angle)
        cos_a = math.cos(rad)
        sin_a = math.sin(rad)
        
        hh = self.height / 2
        local_pts = [(0, -hh), (self.width, -hh), (self.width, hh), (0, hh)]
        
        world_pts = []
        for lx, ly in local_pts:
            rx = lx * cos_a - ly * sin_a
            ry = -(lx * sin_a + ly * cos_a)
            world_pts.append((self.pos_x + rx, self.pos_y + ry))
        return world_pts

    def update(self):
        now = pygame.time.get_ticks()
        elapsed = now - self.created_time
        
        # [수정] 3타 발사까지 무적/행동 잠금 지속 유지
        if elapsed < 1850:
            defense_mod(self.owner, 0.1, 100)
            slow(self.owner, 0.1, 100)
            silence(self.owner, 0.1)

        if elapsed >= 1000 and self.strikes_done == 0:
            self._spawn_strike()
            self.strikes_done = 1
        elif elapsed >= 1300 and self.strikes_done == 1:
            self._spawn_strike()
            self.strikes_done = 2
        elif elapsed >= 1600 and self.strikes_done == 2:
            self._spawn_strike()
            self.strikes_done = 3

    def _spawn_strike(self):
        hitbox = FighterUltHitbox(self.owner, self.angle, self.pos_x, self.pos_y)
        self.attacks_list.append(hitbox)

    def is_expired(self):
        return (pygame.time.get_ticks() - self.created_time >= 2500)

    def collides_with(self, target):
        return False

    def apply_effect(self, target):
        pass

    def draw(self, surface):
        now = pygame.time.get_ticks()
        elapsed = now - self.created_time
        
        if elapsed < 1000:
            pts = self.get_polygon_points()
            int_pts = [(int(p[0]), int(p[1])) for p in pts]
            
            if (elapsed // 100) % 2 == 0:
                pygame.draw.polygon(surface, (255, 50, 50), int_pts, 3)
            
            progress = elapsed / 1000.0
            radius = max(20, int(150 * (1.0 - progress)))
            pygame.draw.circle(surface, (255, 215, 0), (int(self.pos_x), int(self.pos_y)), radius, 2)


class FighterUltSkill:
    def __init__(self):
        self.name = "Raging Storm"
        self.cooldown = 500  # 궁극기 100% 즉시 발동
        self.last_used = -99999
        self.keywords = ['ult']

    def can_use(self):
        return pygame.time.get_ticks() - self.last_used >= self.cooldown

    def use(self, owner, direction, attacks_list, color):
        self.last_used = pygame.time.get_ticks()
        ult_manager = FighterUltManager(owner, direction, attacks_list)
        attacks_list.append(ult_manager)


# ==========================================
# 무투가(Fighter) 캐릭터 데이터 등록 매핑
# ==========================================
def apply_fighter(player):
    player.base_atk = 15
    player.max_hp = 120
    player.hp = 120
    player.speed = 4.3
    player.sprite_image, player.sprite_image_flipped = get_character_sprite('fighter.png')
    player.abilities = [
        FighterBasicSkill(),    # 평타
        FighterChargeSkill(),   # 1스킬 (10스택 충전)
        FighterDashSkill(),     # 2스킬 (돌진 슬램)
        FighterUltSkill()       # 궁극기 (3연속 거대 폭발)
    ]

FIGHTER_CHARACTER_DATA = {
    "name": "무투가",
    "desc": "평타: 연속으로 주먹을 가까운 적에게 날립니다(15), 스킬 1: 연속펀치를 날립니다(8), 10개까지 모을 수 있습니다, 스킬 2: 발차기를 하며 도착 지점에 상대를 밉니다(23), 1초간 기절, 궁극기: 기를 모으며 앞에 크기가 크고 쎈 충격파를 3번 쏩니다(한발당 30)",
    "apply": apply_fighter,
    "get_thumbnail": lambda size=40: get_character_thumbnail('fighter.png', size)
}
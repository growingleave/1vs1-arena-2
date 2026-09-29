import sys
import pygame
import math
import random
from utils import check_polygon_collision
from wall import move_entity_with_walls
from status_effects import silence, slow, forced_move, defense_mod, bind, time_slow, speed_up

# ==========================================
# [폭파광 - 폭발 이펙트] 단일 피해 및 벽 관통 처리
# ==========================================
class DemolitionistExplosionEffect:
    def __init__(self, owner, x, y, damage, radius):
        self.owner = owner
        self.pos_x = x
        self.pos_y = y
        self.damage = damage
        self.radius = radius
        self.created_time = pygame.time.get_ticks()
        self.lifespan = 300
        self.hit_players = []
        self.can_penetrate_walls = True  # 폭발 범위는 벽을 관통하여 타격

    def update(self):
        pass

    def is_expired(self):
        return pygame.time.get_ticks() - self.created_time >= self.lifespan

    def collides_with(self, target):
        if target == self.owner or target in self.hit_players or getattr(target, 'invincible', False) or target.defense >= 100.0:
            return False
        dx = target.rect.centerx - self.pos_x
        dy = target.rect.centery - self.pos_y
        return math.hypot(dx, dy) <= self.radius

    def apply_effect(self, target):
        pass

    def draw(self, surface):
        now = pygame.time.get_ticks()
        progress = min(1.0, max(0.0, (now - self.created_time) / self.lifespan))
        curr_radius = int(self.radius * progress)
        alpha = max(0, int(200 * (1.0 - progress)))
        
        surf = pygame.Surface((self.radius * 2, self.radius * 2), pygame.SRCALPHA)
        pygame.draw.circle(surf, (255, 69, 0, alpha), (self.radius, self.radius), curr_radius)
        surface.blit(surf, (int(self.pos_x - self.radius), int(self.pos_y - self.radius)))


# ==========================================
# [폭파광 - 기본 공격] 유탄 투사체 (직격 시 2중 데미지 방지)
# ==========================================
class DemolitionistBasicGrenade:
    def __init__(self, owner, direction, attacks_list):
        self.owner = owner
        self.direction = direction
        self.attacks_list = attacks_list
        self.damage = 0  # [수정] 직격 피해를 0으로 두고 소환되는 폭발이 데미지 처리 (2중 데미지 방지)
        self.speed = 9.0
        self.created_time = pygame.time.get_ticks()
        self.lifespan = 2000
        self.hit_players = []
        
        self.width = 12
        self.height = 12
        self.pos_x = float(owner.rect.centerx + direction[0] * 20)
        self.pos_y = float(owner.rect.centery + direction[1] * 20)
        self.start_x = self.pos_x
        self.start_y = self.pos_y
        
        is_transformed = getattr(owner, 'is_transformed', False)
        self.max_range = 180 if is_transformed else 320         
        self.explosion_radius = 90 if is_transformed else 60    
        self.explosion_damage = owner.base_atk * 0.8
        
        self.exploded = False
        self.rect = self.get_rect()

    def get_rect(self):
        return pygame.Rect(int(self.pos_x - self.width // 2), int(self.pos_y - self.height // 2), self.width, self.height)

    def explode(self):
        if not self.exploded:
            self.exploded = True
            self.attacks_list.append(DemolitionistExplosionEffect(
                self.owner, self.pos_x, self.pos_y, self.explosion_damage, radius=self.explosion_radius
            ))

    def update(self):
        time_scale = getattr(self.owner, 'time_scale', 1.0)
        self.pos_x += self.direction[0] * self.speed * time_scale
        self.pos_y += self.direction[1] * self.speed * time_scale
        self.rect = self.get_rect()

        if math.hypot(self.pos_x - self.start_x, self.pos_y - self.start_y) >= self.max_range:
            self.explode()
            return

        main_module = sys.modules.get('__main__')
        if main_module:
            walls = getattr(main_module, 'walls', [])
            for wall in walls:
                if wall.rect.colliderect(self.rect):
                    self.explode()
                    return

    def is_expired(self):
        return self.exploded or (pygame.time.get_ticks() - self.created_time >= self.lifespan)

    def collides_with(self, target):
        if self.exploded:
            return False
        if target == self.owner or getattr(target, 'invincible', False) or target.defense >= 100.0:
            return False
        if self.rect.colliderect(target.rect):
            self.explode()
            return False  # 폭발 객체로 타격을 넘기므로 본체는 충돌 무효 반환
        return False

    def apply_effect(self, target):
        pass

    def draw(self, surface):
        if not self.exploded:
            pygame.draw.circle(surface, (100, 100, 100), (int(self.pos_x), int(self.pos_y)), 6)
            pygame.draw.circle(surface, (255, 69, 0), (int(self.pos_x), int(self.pos_y)), 3)


class DemolitionistBasicSkill:
    def __init__(self):
        self.name = "Grenade Basic Attack"
        self.cooldown = 400
        self.last_used = 0

    def can_use(self):
        return pygame.time.get_ticks() - self.last_used >= self.cooldown

    def use(self, owner, direction, attacks_list, color):
        self.last_used = pygame.time.get_ticks()
        attacks_list.append(DemolitionistBasicGrenade(owner, direction, attacks_list))


# ==========================================
# [스킬 1] 등변사다리꼴 충격파 & 반동 매니저
# ==========================================
class DemolitionistSkill1Effect:
    def __init__(self, owner, direction):
        self.owner = owner
        self.direction = direction
        self.is_transformed = getattr(owner, 'is_transformed', False)
        
        damage_multiplier = 2.2 if self.is_transformed else 1.4
        self.damage = owner.base_atk * damage_multiplier
        
        self.created_time = pygame.time.get_ticks()
        self.lifespan = 250  
        self.hit_players = []
        
        offset_dist = 35
        self.pos_x = float(owner.rect.centerx + direction[0] * offset_dist)
        self.pos_y = float(owner.rect.centery + direction[1] * offset_dist)
        self.angle = math.degrees(math.atan2(-direction[1], direction[0]))

    def get_trap_points(self):  
        rad = math.radians(self.angle)
        cos_a, sin_a = math.cos(rad), math.sin(rad)
        
        if self.is_transformed:
            local_pts = [
                (-30, -25),  
                (90, -65),   
                (90, 65),    
                (-30, 25)    
            ]
        else:
            local_pts = [
                (-20, -18),  
                (60, -45),   
                (60, 45),    
                (-20, 18)    
            ]
        
        return [
            (self.pos_x + lx * cos_a - ly * sin_a, self.pos_y - (lx * sin_a + ly * cos_a))
            for lx, ly in local_pts
        ]

    def update(self):
        pass

    def is_expired(self):
        return pygame.time.get_ticks() - self.created_time >= self.lifespan

    def collides_with(self, target):
        if target == self.owner or target in self.hit_players or getattr(target, 'invincible', False) or target.defense >= 100.0:
            return False
        return check_polygon_collision(self.get_trap_points(), target.rect)

    def apply_effect(self, target):
        if not self.is_transformed:
            forced_move(target, 0.3, 350.0, pygame.math.Vector2(self.direction[0], self.direction[1]))

    def draw(self, surface):
        pts = [(int(p[0]), int(p[1])) for p in self.get_trap_points()]
        surf = pygame.Surface((surface.get_width(), surface.get_height()), pygame.SRCALPHA)
        color = (180, 50, 255, 200) if self.is_transformed else (255, 140, 0, 200)
        pygame.draw.polygon(surf, color, pts)
        pygame.draw.polygon(surf, (255, 255, 255, 240), pts, 2)
        surface.blit(surf, (0, 0))


class DemolitionistRecoilManager:
    def __init__(self, owner, direction, attacks_list):
        self.owner = owner
        self.direction = (-direction[0], -direction[1])  
        self.attacks_list = attacks_list
        self.dash_speed = 14.0       
        self.dash_duration = 180     
        self.created_time = pygame.time.get_ticks()
        self.damage = 0
        self.hit_players = []
        self.is_dash = True

    def update(self, walls=None):
        now = pygame.time.get_ticks()
        if now - self.created_time < self.dash_duration:
            # [수정] 반동 지속 시간 동안 조작 및 스킬 완벽 차단
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


class DemolitionistSkill1:
    def __init__(self):
        self.name = "Trapezoid Shockwave"
        self.cooldown = 1500
        self.last_used = 0

    def can_use(self):
        return pygame.time.get_ticks() - self.last_used >= self.cooldown

    def use(self, owner, direction, attacks_list, color):
        self.last_used = pygame.time.get_ticks()
        attacks_list.append(DemolitionistSkill1Effect(owner, direction))
        if not getattr(owner, 'is_transformed', False):
            attacks_list.append(DemolitionistRecoilManager(owner, direction, attacks_list))


# ==========================================
# [스킬 2] 변신 전용 돌진 경로 3연속 폭파 매니저
# ==========================================
class DemolitionistSkill2DashManager:
    def __init__(self, owner, direction, attacks_list):
        self.owner = owner
        self.direction = direction
        self.attacks_list = attacks_list
        self.dash_speed = 10.0       
        self.dash_duration = 450     
        self.created_time = pygame.time.get_ticks()
        self.damage = 0
        self.hit_players = []
        self.is_dash = True
        
        self.explosion_times = [0, 225, 450]
        self.triggered_explosions = [False, False, False]
        
        # 첫 번째 폭발 즉시 생성 (0ms)
        self.triggered_explosions[0] = True
        self.attacks_list.append(DemolitionistExplosionEffect(
            self.owner, self.owner.rect.centerx, self.owner.rect.centery, self.owner.base_atk * 1.5, radius=80
        ))

    def update(self, walls=None):
        now = pygame.time.get_ticks()
        elapsed = now - self.created_time
        
        if elapsed < self.dash_duration:
            slow(self.owner, 0.1, 100)
            
            time_scale = getattr(self.owner, 'time_scale', 1.0)
            dx = self.direction[0] * self.dash_speed * time_scale
            dy = self.direction[1] * self.dash_speed * time_scale
            
            if walls is not None:
                move_entity_with_walls(self.owner, dx, dy, walls)
            else:
                self.owner.rect.x += int(dx)
                self.owner.rect.y += int(dy)
                
        # 두 번째 폭발 (225ms)
        if not self.triggered_explosions[1] and elapsed >= self.explosion_times[1]:
            self.triggered_explosions[1] = True
            self.attacks_list.append(DemolitionistExplosionEffect(
                self.owner, self.owner.rect.centerx, self.owner.rect.centery, self.owner.base_atk * 1.5, radius=80
            ))

    def is_expired(self):
        now = pygame.time.get_ticks()
        elapsed = now - self.created_time
        expired = (elapsed >= self.dash_duration)
        
        # 세 번째 폭발 (450ms)
        if expired and not self.triggered_explosions[2]:
            self.triggered_explosions[2] = True
            self.attacks_list.append(DemolitionistExplosionEffect(
                self.owner, self.owner.rect.centerx, self.owner.rect.centery, self.owner.base_atk * 2.0, radius=100
            ))
            if hasattr(self.owner, 'status_effects'):
                self.owner.status_effects.pop('slow', None)
            self.owner.speed_multiplier = 1.0
        return expired

    def collides_with(self, target):
        return False

    def apply_effect(self, target):
        pass

    def draw(self, surface):
        pass


class DemolitionistSkill2:
    def __init__(self):
        self.name = "Transform Trail Bomb"
        self.cooldown = 3500
        self.last_used = 0
        self.keywords = ['dash']  # 속박 시 사용 불가 키워드 연동
        self.owner = None

    def can_use(self):
        if self.owner and not getattr(self.owner, 'is_transformed', False):
            return False
        return pygame.time.get_ticks() - self.last_used >= self.cooldown

    def use(self, owner, direction, attacks_list, color):
        self.owner = owner
        if not getattr(owner, 'is_transformed', False):
            return
        self.last_used = pygame.time.get_ticks()
        attacks_list.append(DemolitionistSkill2DashManager(owner, direction, attacks_list))


# ==========================================
# [궁극기] 변신 타이머 바 & 지연 폭발 필드
# ==========================================
class DemolitionistTransformManager:
    def __init__(self, owner):
        self.owner = owner
        self.start_time = pygame.time.get_ticks()
        self.duration = 15000  
        self.damage = 0
        self.hit_players = []

    def update(self):
        pass

    def is_expired(self):
        if pygame.time.get_ticks() - self.start_time >= self.duration:
            self.owner.is_transformed = False
            if hasattr(self.owner, 'original_color'):
                self.owner.color = self.owner.original_color
            if hasattr(self.owner, 'original_ult_charge_rate'):
                self.owner.ult_charge_rate = self.owner.original_ult_charge_rate
            self.owner.ult_charge_multiplier = 2.5  
            return True
        return False

    def collides_with(self, target):
        return False

    def apply_effect(self, target):
        pass

    def draw(self, surface):
        now = pygame.time.get_ticks()
        elapsed = now - self.start_time
        progress = max(0.0, min(1.0, 1.0 - (elapsed / self.duration)))
        
        cx, cy = self.owner.rect.centerx, self.owner.rect.top - 22
        bar_w, bar_h = 32, 4
        
        bar_rect = pygame.Rect(cx - bar_w // 2, cy, bar_w, bar_h)
        pygame.draw.rect(surface, (30, 30, 35), bar_rect)
        pygame.draw.rect(surface, (138, 43, 226), bar_rect, 1)
        
        fill_w = int(bar_w * progress)
        if fill_w > 0:
            fill_rect = pygame.Rect(bar_rect.x, bar_rect.y, fill_w, bar_h)
            pygame.draw.rect(surface, (138, 43, 226), fill_rect)


class DemolitionistUltExplosion:
    def __init__(self, owner, x, y):
        self.owner = owner
        self.pos_x = x
        self.pos_y = y
        self.damage = 45.0
        self.radius = 180
        self.created_time = pygame.time.get_ticks()
        self.lifespan = 400
        self.hit_players = []
        self.can_penetrate_walls = True

    def update(self):
        pass

    def is_expired(self):
        return pygame.time.get_ticks() - self.created_time >= self.lifespan

    def collides_with(self, target):
        if target == self.owner or target in self.hit_players or getattr(target, 'invincible', False) or target.defense >= 100.0:
            return False
        dx = target.rect.centerx - self.pos_x
        dy = target.rect.centery - self.pos_y
        return math.hypot(dx, dy) <= self.radius

    def apply_effect(self, target):
        pass

    def draw(self, surface):
        now = pygame.time.get_ticks()
        progress = min(1.0, max(0.0, (now - self.created_time) / self.lifespan))
        curr_radius = int(self.radius * progress)
        alpha = max(0, int(220 * (1.0 - progress)))
        
        surf = pygame.Surface((self.radius * 2, self.radius * 2), pygame.SRCALPHA)
        pygame.draw.circle(surf, (255, 0, 0, alpha), (self.radius, self.radius), curr_radius)
        surface.blit(surf, (int(self.pos_x - self.radius), int(self.pos_y - self.radius)))


class DemolitionistUltDelayField:
    def __init__(self, owner, attacks_list):
        self.owner = owner
        self.attacks_list = attacks_list
        self.damage = 0
        self.hit_players = []
        self.start_time = pygame.time.get_ticks()
        self.duration = 2000  
        self.triggered = False
        self.force_expire = False

    def update(self):
        now = pygame.time.get_ticks()
        
        # [수정] 2초간 무적 + 이동 불가 + 침묵
        defense_mod(self.owner, 0.2, 100)
        slow(self.owner, 0.1, 100)
        silence(self.owner, 0.1)

        if now - self.start_time >= self.duration and not self.triggered:
            self.triggered = True
            self.force_expire = True
            
            # [수정] 폭발 시점에 슬로우 및 침묵 즉시 완전 정화 (변신 후 즉각 기동 가능)
            if hasattr(self.owner, 'status_effects'):
                self.owner.status_effects.pop('slow', None)
                self.owner.status_effects.pop('silence', None)
            self.owner.silenced = False
            self.owner.speed_multiplier = 1.0
            
            self.attacks_list.append(DemolitionistUltExplosion(self.owner, self.owner.rect.centerx, self.owner.rect.centery))
            
            self.owner.is_transformed = True
            if not hasattr(self.owner, 'original_color'):
                self.owner.original_color = self.owner.color
            self.owner.color = (138, 43, 226)  
            
            if not hasattr(self.owner, 'original_ult_charge_rate'):
                self.owner.original_ult_charge_rate = self.owner.ult_charge_rate
            self.owner.ult_charge_rate = 0.0
            self.owner.ult_charge_multiplier = 0.0
            
            self.attacks_list.append(DemolitionistTransformManager(self.owner))

    def is_expired(self):
        return self.force_expire

    def collides_with(self, target):
        return False

    def apply_effect(self, target):
        pass

    def draw(self, surface):
        now = pygame.time.get_ticks()
        elapsed = now - self.start_time
        progress = min(1.0, elapsed / self.duration)
        
        cx, cy = self.owner.rect.centerx, self.owner.rect.centery
        max_r = 180
        curr_r = int(max_r * progress)
        
        surf = pygame.Surface((max_r * 2, max_r * 2), pygame.SRCALPHA)
        pygame.draw.circle(surf, (255, 69, 0, 60), (max_r, max_r), curr_r, 3)
        surface.blit(surf, (cx - max_r, cy - max_r))


class DemolitionistUltSkill:
    def __init__(self):
        self.name = "Mega Blast Transform"
        self.cooldown = 500
        self.last_used = -99999
        self.keywords = ['ult']
        self.owner = None

    def can_use(self):
        if self.owner and getattr(self.owner, 'is_transformed', False):
            return False
        return pygame.time.get_ticks() - self.last_used >= self.cooldown

    def use(self, owner, direction, attacks_list, color):
        self.owner = owner
        if getattr(owner, 'is_transformed', False):
            return
        self.last_used = pygame.time.get_ticks()
        attacks_list.append(DemolitionistUltDelayField(owner, attacks_list))


# ==========================================
# 폭파광(Demolitionist) 캐릭터 데이터 등록 매핑
# ==========================================
def apply_demolitionist(player):
    player.base_atk = 13
    player.max_hp = 100
    player.hp = 100
    player.speed = 4.3
    player.is_demolitionist = True
    player.is_transformed = False
    player.ult_charge_multiplier = 2.5  
    
    ult_skill = DemolitionistUltSkill()
    ult_skill.owner = player
    
    skill2 = DemolitionistSkill2()
    skill2.owner = player
    
    player.abilities = [
        DemolitionistBasicSkill(),    # 평타
        DemolitionistSkill1(),        # 1스킬
        skill2,                       # 2스킬
        ult_skill                     # 궁극기
    ]
    
    def custom_reset():
        player.is_demolitionist = False
        player.is_transformed = False
        player.ult_charge_rate = 3.0
        player.ult_charge_multiplier = 2.5  # [수정] 2.5배 패시브 정상 유지
        if hasattr(player, 'original_color'):
            player.color = player.original_color
        if hasattr(player, 'original_ult_charge_rate'):
            delattr(player, 'original_ult_charge_rate')

    player.custom_reset = custom_reset

DEMOLITIONIST_CHARACTER_DATA = {
    "name": "폭파광",
    "desc": "평타: 폭발물을 쏩니다(10), 강화 평타: 공속이 빨라집니다, 스킬 1: 사다리꼴 범위로 적을 밉니다(18), 강화 평타: 더 넓은 범위와 강한 대미지로 적을 공격합니다(29), 스킬 2(변신 중에만 사용 가능): 돌진하며 경로에 연속 폭발을 일으킵니다(20/20/26), 궁극기: 무적 상태가 되며 변신을 하며 폭발하고 스킬이 강화됩니다(45)",
    "apply": apply_demolitionist
}
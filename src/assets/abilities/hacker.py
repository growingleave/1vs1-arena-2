import sys
import pygame
import math
import random
from utils import check_polygon_collision, get_character_sprite, get_character_thumbnail
from status_effects import silence, slow, forced_move, defense_mod, bind, time_slow, speed_up, burn, bleed, confuse
from fonts import get_font

# ==========================================
# [해커 - 형광초록색 대형 도넛 게이지 및 시간 비례 감소 시스템]
# ==========================================
def trigger_full_hack(owner, target):
    """해킹 게이지 100% 도달 시 공통 발동 효과 (침묵/슬로우/화상 + 스킬1 강화용 해킹 상태 부여)"""
    target.hacker_gauge = 0.0
    target.hacker_text_timer = pygame.time.get_ticks()
    silence(target, 2.5)
    slow(target, 2.5, 50)
    burn(target, 6.0, owner.base_atk * 0.25)
    target.hacked_until = pygame.time.get_ticks() + 6000


def draw_clockwise_donut(surface, x, y, radius, percent):
    pygame.draw.circle(surface, (120, 130, 150), (x, y), radius, 3)
    
    if percent > 0:
        start_angle = -math.pi / 2  
        angle_span = 2 * math.pi * (percent / 100.0)
        
        points = [(x, y)]
        steps = max(20, int(percent / 1.5))
        for i in range(steps + 1):
            current_angle = start_angle + angle_span * (i / steps)
            px = x + (radius - 2) * math.cos(current_angle)
            py = y + (radius - 2) * math.sin(current_angle)
            points.append((px, py))
        
        if len(points) > 2:
            pygame.draw.polygon(surface, (0, 255, 150), points)
    
    pygame.draw.circle(surface, (120, 130, 150), (x, y), radius - 6, 2)


class HackerGaugeManager:
    def __init__(self, target):
        self.target = target
        if not hasattr(target, 'hacker_gauge'):
            target.hacker_gauge = 0.0
        if not hasattr(target, 'last_gauge_increase_time'):
            target.last_gauge_increase_time = pygame.time.get_ticks()
        if not hasattr(target, 'hacker_text_timer'):
            target.hacker_text_timer = 0
        if not hasattr(target, '_last_gauge_decay_tick'):
            target._last_gauge_decay_tick = pygame.time.get_ticks()

        # [안정성 개선] 몽키패칭 중복 래핑 방지
        if not getattr(target, '_has_hacker_hooks', False):
            target._has_hacker_hooks = True
            
            old_update = target.update
            def new_update(*args, **kwargs):
                now = pygame.time.get_ticks()
                gauge = getattr(target, 'hacker_gauge', 0.0)
                last_time = getattr(target, 'last_gauge_increase_time', now)
                last_tick = getattr(target, '_last_gauge_decay_tick', now)
                dt_sec = max(0.0, (now - last_tick) / 1000.0)
                target._last_gauge_decay_tick = now
                
                # 4초 무활동 시 초당 15%씩 자연 감소 (프레임 독립적)
                if gauge > 0 and (now - last_time > 4000):
                    target.hacker_gauge = max(0.0, gauge - 15.0 * dt_sec)

                # [버그 수정] 공격력 30% 감소 디버프 2초 후 자동 복구
                if hasattr(target, 'atk_debuff_timer') and now >= target.atk_debuff_timer:
                    if hasattr(target, 'original_base_atk'):
                        target.base_atk = target.original_base_atk
                        delattr(target, 'original_base_atk')
                    delattr(target, 'atk_debuff_timer')
                    
                return old_update(*args, **kwargs)
            target.update = new_update

            old_draw = target.draw
            def new_draw(surface, *args, **kwargs):
                old_draw(surface, *args, **kwargs)
                gauge = getattr(target, 'hacker_gauge', 0.0)
                
                if gauge > 0:
                    draw_clockwise_donut(surface, target.rect.centerx + 50, target.rect.top - 18, 26, gauge)
                
                if pygame.time.get_ticks() - getattr(target, 'hacker_text_timer', 0) < 2000:
                    font = get_font(24, bold=True)
                    text_surf = font.render("해킹!", True, (0, 255, 150))
                    text_rect = text_surf.get_rect(center=(target.rect.centerx + 50, target.rect.top - 58))
                    surface.blit(text_surf, text_rect)

                # [추가] 해킹 상태 중 스킬1 적중으로 부여된 강한 보라색 도트 피해 이펙트
                corrupt_until = getattr(target, 'hacker_corrupt_until', 0)
                now_c = pygame.time.get_ticks()
                if corrupt_until > now_c:
                    remaining = corrupt_until - now_c
                    fade = min(1.0, remaining / 600.0)
                    alpha = int(200 * fade)
                    pulse = 4 * math.sin(now_c / 120.0)
                    radius = int(max(target.rect.width, target.rect.height) * 0.65 + pulse)

                    purple_surf = pygame.Surface(surface.get_size(), pygame.SRCALPHA)
                    pygame.draw.circle(purple_surf, (170, 60, 255, alpha), target.rect.center, radius, 3)
                    for i in range(6):
                        ang = (now_c / 200.0) + i * (2 * math.pi / 6)
                        px = target.rect.centerx + math.cos(ang) * (radius - 6)
                        py = target.rect.centery + math.sin(ang) * (radius - 6)
                        pygame.draw.circle(purple_surf, (210, 130, 255, alpha), (int(px), int(py)), 3)
                    surface.blit(purple_surf, (0, 0))

            target.draw = new_draw


# ==========================================
# [해커 - 스킬 1] 대형 정육면체 큐브 투사체
# ==========================================
class HackerCubeBullet:
    def __init__(self, owner, direction):
        self.owner = owner
        self.direction = direction
        self.damage = owner.base_atk * 0.9  
        self.speed = 9.0
        self.created_time = pygame.time.get_ticks()
        self.lifespan = 1500
        self.hit_players = []
        
        self.size = 48  
        self.pos_x = float(owner.rect.centerx + direction[0] * 35)
        self.pos_y = float(owner.rect.centery + direction[1] * 35)
        self.start_x = self.pos_x
        self.start_y = self.pos_y
        self.max_range = 450
        self.angle = 0.0
        self.rect = self.get_rect()

    def get_rect(self):
        return pygame.Rect(int(self.pos_x - self.size // 2), int(self.pos_y - self.size // 2), self.size, self.size)

    def get_map_collision_rect(self):
        return pygame.Rect(int(self.pos_x - 7), int(self.pos_y - 7), 14, 14)

    def update(self):
        time_scale = getattr(self.owner, 'time_scale', 1.0)
        old_x, old_y = self.pos_x, self.pos_y

        self.pos_x += self.direction[0] * self.speed * time_scale
        self.pos_y += self.direction[1] * self.speed * time_scale
        self.angle += 4.0
        self.rect = self.get_rect()

        # [수정] 벽 충돌 판정 (작은 판정 범위 사용, 너무 일찍 막히는 것 방지)
        main_module = sys.modules.get('__main__')
        walls = getattr(main_module, 'walls', []) if main_module else []
        collision_rect = self.get_map_collision_rect()
        for wall in walls:
            if collision_rect.colliderect(wall.rect):
                self.pos_x, self.pos_y = old_x, old_y
                self.rect = self.get_rect()
                self.created_time = pygame.time.get_ticks() - self.lifespan
                break

    def is_expired(self):
        time_over = pygame.time.get_ticks() - self.created_time >= self.lifespan
        out_of_range = math.hypot(self.pos_x - self.start_x, self.pos_y - self.start_y) >= self.max_range
        return time_over or out_of_range

    def collides_with(self, target):
        if target == self.owner or getattr(target, 'invincible', False) or target.defense >= 100.0:
            return False
        return self.rect.colliderect(target.rect)

    def apply_effect(self, target):
        # [버그 수정] main.py가 정규 데미지와 궁극기 충전을 처리하므로 수동 체력 차감 제거
        HackerGaugeManager(target)
        now = pygame.time.get_ticks()
        was_hacked = getattr(target, 'hacked_until', 0) > now

        target.hacker_gauge = min(100.0, getattr(target, 'hacker_gauge', 0.0) + 50.0)
        target.last_gauge_increase_time = now

        # 2초간 공격력 30% 감소 디버프 부여
        if not hasattr(target, 'original_base_atk'):
            target.original_base_atk = target.base_atk
        target.base_atk = target.original_base_atk * 0.7
        target.atk_debuff_timer = now + 2000

        slow(target, 1.5, 50)

        # 100% 도달 시 해킹 풀 트리거 발동
        if target.hacker_gauge >= 100.0:
            trigger_full_hack(self.owner, target)

        # [추가] 상대가 이미 해킹 상태일 때 적중하면 더 강한 보라색 도트 피해 부여
        if was_hacked:
            bleed(target, 4.0, self.owner.base_atk * 0.6)
            target.hacker_corrupt_until = now + 4000

        self.lifespan = 0

    def draw(self, surface):
        surf = pygame.Surface((self.size, self.size), pygame.SRCALPHA)
        pygame.draw.rect(surf, (0, 255, 150), (0, 0, self.size, self.size), 3, border_radius=6)
        inner_size = self.size // 2
        pygame.draw.rect(surf, (0, 255, 200), (inner_size // 2, inner_size // 2, inner_size, inner_size), 2, border_radius=4)
        
        rotated_surf = pygame.transform.rotate(surf, self.angle)
        rect = rotated_surf.get_rect(center=(int(self.pos_x), int(self.pos_y)))
        surface.blit(rotated_surf, rect.topleft)


class HackerSkill1:
    def __init__(self):
        self.name = "Data Cube"
        self.cooldown = 4000
        self.last_used = 0

    def can_use(self):
        return pygame.time.get_ticks() - self.last_used >= self.cooldown

    def use(self, owner, direction, attacks_list, color):
        self.last_used = pygame.time.get_ticks()
        attacks_list.append(HackerCubeBullet(owner, direction))


# ==========================================
# [해커 - 스킬 2] 정사각형 텔레포트 투사체
# ==========================================
class HackerTeleportSquareBullet:
    def __init__(self, owner, direction):
        self.owner = owner
        self.direction = direction
        self.damage = 0  
        self.speed = 13.0
        self.created_time = pygame.time.get_ticks()
        self.lifespan = 1200
        self.hit_players = []
        
        self.size = 28
        self.pos_x = float(owner.rect.centerx + direction[0] * 25)
        self.pos_y = float(owner.rect.centery + direction[1] * 25)
        self.start_x = self.pos_x
        self.start_y = self.pos_y
        self.max_range = 400
        self.teleported = False
        self.rect = self.get_rect()

    def get_rect(self):
        return pygame.Rect(int(self.pos_x - self.size // 2), int(self.pos_y - self.size // 2), self.size, self.size)

    def teleport(self):
        if not self.teleported:
            self.teleported = True
            dir_vec = pygame.math.Vector2(self.direction[0], self.direction[1])
            if dir_vec.length_squared() > 0:
                dir_vec = dir_vec.normalize()
            else:
                dir_vec = pygame.math.Vector2(1, 0)
            
            safe_x = self.pos_x - dir_vec.x * 25
            safe_y = self.pos_y - dir_vec.y * 25
            
            self.owner.rect.centerx = int(safe_x)
            self.owner.rect.centery = int(safe_y)
            self.owner.rect.clamp_ip(pygame.Rect(0, 0, 1280, 720))

            # [버그 수정] 벽 내부 갇힘 방지 밀어내기
            main_module = sys.modules.get('__main__')
            if main_module:
                walls = getattr(main_module, 'walls', [])
                for wall in walls:
                    if self.owner.rect.colliderect(wall.rect):
                        overlap_x = min(self.owner.rect.right - wall.rect.left, wall.rect.right - self.owner.rect.left)
                        overlap_y = min(self.owner.rect.bottom - wall.rect.top, wall.rect.bottom - self.owner.rect.top)
                        if overlap_x < overlap_y:
                            if self.owner.rect.centerx < wall.rect.centerx:
                                self.owner.rect.right = wall.rect.left
                            else:
                                self.owner.rect.left = wall.rect.right
                        else:
                            if self.owner.rect.centery < wall.rect.centery:
                                self.owner.rect.bottom = wall.rect.top
                            else:
                                self.owner.rect.top = wall.rect.bottom
            self.owner.rect.clamp_ip(pygame.Rect(0, 0, 1280, 720))

    def get_map_collision_rect(self):
        return pygame.Rect(int(self.pos_x - 7), int(self.pos_y - 7), 14, 14)

    def update(self):
        time_scale = getattr(self.owner, 'time_scale', 1.0)
        old_x, old_y = self.pos_x, self.pos_y

        self.pos_x += self.direction[0] * self.speed * time_scale
        self.pos_y += self.direction[1] * self.speed * time_scale
        self.rect = self.get_rect()

        # [수정] 벽 충돌 판정 (작은 판정 범위 사용, 너무 일찍 막히는 것 방지). 벽에 막히면 그 자리에서 텔레포트.
        main_module = sys.modules.get('__main__')
        walls = getattr(main_module, 'walls', []) if main_module else []
        collision_rect = self.get_map_collision_rect()
        for wall in walls:
            if collision_rect.colliderect(wall.rect):
                self.pos_x, self.pos_y = old_x, old_y
                self.rect = self.get_rect()
                self.teleport()
                break

    def is_expired(self):
        time_over = pygame.time.get_ticks() - self.created_time >= self.lifespan
        out_of_range = math.hypot(self.pos_x - self.start_x, self.pos_y - self.start_y) >= self.max_range
        if time_over or out_of_range:
            self.teleport()
            return True
        return self.teleported

    def collides_with(self, target):
        if target == self.owner or getattr(target, 'invincible', False) or target.defense >= 100.0:
            return False
        return self.rect.colliderect(target.rect)

    def apply_effect(self, target):
        self.teleport()
        self.lifespan = 0

    def draw(self, surface):
        surf = pygame.Surface((self.size, self.size), pygame.SRCALPHA)
        pygame.draw.rect(surf, (0, 255, 185), (0, 0, self.size, self.size), 3, border_radius=4)
        pygame.draw.rect(surf, (0, 255, 120, 100), (3, 3, self.size - 6, self.size - 6), border_radius=2)
        surface.blit(surf, (int(self.pos_x - self.size // 2), int(self.pos_y - self.size // 2)))


class HackerSkill2:
    def __init__(self):
        self.name = "Teleport Square"
        self.cooldown = 5000
        self.last_used = 0

    def can_use(self):
        return pygame.time.get_ticks() - self.last_used >= self.cooldown

    def use(self, owner, direction, attacks_list, color):
        self.last_used = pygame.time.get_ticks()
        attacks_list.append(HackerTeleportSquareBullet(owner, direction))


# ==========================================
# [해커 - 궁극기] 주위 원 범위 해킹 게이지 100% 및 제어 효과 부여
# ==========================================
class HackerUltimateArea:
    def __init__(self, owner):
        self.owner = owner
        self.damage = 0
        self.created_time = pygame.time.get_ticks()
        self.duration = 400  
        self.radius = 280  
        self.hit_players = []

    def update(self):
        pass

    def is_expired(self):
        return pygame.time.get_ticks() - self.created_time >= self.duration

    def collides_with(self, target):
        if target == self.owner or target in self.hit_players or getattr(target, 'invincible', False) or target.defense >= 100.0:
            return False
        dist = math.hypot(target.rect.centerx - self.owner.rect.centerx, target.rect.centery - self.owner.rect.centery)
        return dist <= self.radius

    def apply_effect(self, target):
        HackerGaugeManager(target)
        target.last_gauge_increase_time = pygame.time.get_ticks()

        trigger_full_hack(self.owner, target)
        confuse(target, 3.5)

    def draw(self, surface):
        elapsed = pygame.time.get_ticks() - self.created_time
        current_radius = int(self.radius * (elapsed / self.duration))
        
        surf = pygame.Surface(surface.get_size(), pygame.SRCALPHA)
        pygame.draw.circle(surf, (0, 255, 150, 45), (self.owner.rect.centerx, self.owner.rect.centery), current_radius)
        pygame.draw.circle(surf, (0, 255, 200, 200), (self.owner.rect.centerx, self.owner.rect.centery), current_radius, 4)
        surface.blit(surf, (0, 0))


class HackerUltimate:
    def __init__(self):
        self.name = "Cyber Overload"
        self.cooldown = 500  # [수정] 100% 게이지 즉시 발동을 위해 이중 잠금 해제
        self.last_used = -99999
        self.keywords = ['ult']

    def can_use(self):
        return pygame.time.get_ticks() - self.last_used >= self.cooldown

    def use(self, owner, direction, attacks_list, color):
        self.last_used = pygame.time.get_ticks()
        attacks_list.append(HackerUltimateArea(owner))


# ==========================================
# [해커 - 평타] 투명한 15도 부채꼴 스캔 (데미지 없음, 범위 안에 있는 동안 해킹 게이지 지속 충전)
# ==========================================
class HackerScanEffect:
    def __init__(self, owner, direction):
        self.owner = owner
        self.direction = direction
        self.damage = 0
        self.created_time = pygame.time.get_ticks()
        self.duration = 2000
        self.lifespan = 2000
        self.range = 520
        self.half_angle = 7.5

        self.hit_players = []
        self.last_tick_time = pygame.time.get_ticks()

    def update(self):
        now = pygame.time.get_ticks()
        dt = now - self.last_tick_time
        self.last_tick_time = now

        dir_vec = pygame.math.Vector2(self.direction[0], self.direction[1])
        if dir_vec.length_squared() == 0:
            dir_vec = pygame.math.Vector2(1, 0)
        else:
            dir_vec = dir_vec.normalize()

        opponent = getattr(self.owner, 'opponent', None)
        targets = [opponent] if opponent else []

        for target in targets:
            if getattr(target, 'invincible', False) or target.defense >= 100.0:
                continue

            to_target = pygame.math.Vector2(target.rect.centerx - self.owner.rect.centerx, target.rect.centery - self.owner.rect.centery)
            dist = to_target.length()

            is_inside = False
            if 0 < dist <= self.range:
                if to_target.length_squared() > 0:
                    to_target_norm = to_target.normalize()
                    dot = dir_vec.dot(to_target_norm)
                    angle = math.degrees(math.acos(max(-1.0, min(1.0, dot))))
                    if angle <= self.half_angle:
                        is_inside = True

            if not is_inside:
                continue

            # [수정] 데미지 없이, 부채꼴 범위 안에 머무는 동안 초당 40%씩 해킹 게이지 지속 충전 (더 빠른 충전 속도)
            HackerGaugeManager(target)
            gauge_gain = 40.0 * (dt / 1000.0)
            target.hacker_gauge = min(100.0, getattr(target, 'hacker_gauge', 0.0) + gauge_gain)
            target.last_gauge_increase_time = now

            if target.hacker_gauge >= 100.0:
                trigger_full_hack(self.owner, target)

    def is_expired(self):
        return pygame.time.get_ticks() - self.created_time >= self.duration

    def collides_with(self, target):
        return False

    def apply_effect(self, target):
        pass

    def draw(self, surface):
        owner_pos = pygame.math.Vector2(self.owner.rect.centerx, self.owner.rect.centery)
        dir_vec = pygame.math.Vector2(self.direction[0], self.direction[1])
        if dir_vec.length_squared() == 0:
            dir_vec = pygame.math.Vector2(1, 0)
        else:
            dir_vec = dir_vec.normalize()

        base_angle = math.atan2(dir_vec.y, dir_vec.x)

        points = [owner_pos]
        steps = 12
        for i in range(steps + 1):
            angle = base_angle - math.radians(self.half_angle) + (math.radians(self.half_angle * 2) * i / steps)
            p = owner_pos + pygame.math.Vector2(math.cos(angle), math.sin(angle)) * self.range
            points.append((p.x, p.y))

        surf = pygame.Surface(surface.get_size(), pygame.SRCALPHA)
        pygame.draw.polygon(surf, (0, 255, 120, 15), points)
        pygame.draw.polygon(surf, (0, 255, 180, 80), points, 2)

        surface.blit(surf, (0, 0))


class HackerBasicAttack:
    def __init__(self):
        self.name = "Data Scan Cone"
        self.cooldown = 1500
        self.last_used = 0

    def can_use(self):
        return pygame.time.get_ticks() - self.last_used >= self.cooldown

    def use(self, owner, direction, attacks_list, color):
        self.last_used = pygame.time.get_ticks()
        attacks_list.append(HackerScanEffect(owner, direction))


# ==========================================
# 해커 캐릭터 데이터 등록 매핑
# ==========================================
def apply_hacker(player):
    player.base_atk = 18
    player.max_hp = 110
    player.hp = 110
    player.speed = 4.3
    player.is_hacker = True
    player.sprite_image, player.sprite_image_flipped = get_character_sprite('hacker.png')

    player.abilities = [
        HackerBasicAttack(),  # 평타 (스캔)
        HackerSkill1(),       # 1스킬 (데이터 큐브)
        HackerSkill2(),       # 2스킬 (텔레포트 스퀘어)
        HackerUltimate()      # 궁극기 (사이버 오버로드)
    ]
    
    def custom_reset():
        player.is_hacker = False
        if hasattr(player, 'hacker_gauge'):
            player.hacker_gauge = 0.0
        if hasattr(player, 'original_base_atk'):
            player.base_atk = player.original_base_atk
            delattr(player, 'original_base_atk')
        if hasattr(player, 'atk_debuff_timer'):
            delattr(player, 'atk_debuff_timer')

    player.custom_reset = custom_reset

HACKER_CHARACTER_DATA = {
    "name": "해커",
    "desc": "부채꼴 스캔 평타, 대형 큐브 1스킬, 안전한 텔레포트 2스킬, 광역 해킹 및 제어 효과의 궁극기를 지닌 캐릭터",
    "apply": apply_hacker,
    "get_thumbnail": lambda size=40: get_character_thumbnail('hacker.png', size)
}
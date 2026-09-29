import sys
import pygame
import math
from utils import check_polygon_collision, get_character_sprite, get_character_thumbnail
from status_effects import silence, slow, forced_move, defense_mod, bind, time_slow, speed_up, ghost
from fonts import get_font

# ==========================================
# [DIO - 스킬 1 전용] 직사각형 칼 투사체 (벽 충돌 지원)
# ==========================================
class DioKnifeBullet:
    def __init__(self, owner, direction):
        self.owner = owner
        self.direction = direction
        self.damage = owner.base_atk * 0.8
        self.speed = 18.0
        self.created_time = pygame.time.get_ticks()
        self.lifespan = 8000  
        self.hit_players = []
        
        self.width = 16
        self.height = 6
        self.pos_x = float(owner.rect.centerx + direction[0] * 20)
        self.pos_y = float(owner.rect.centery + direction[1] * 20)
        self.start_x = self.pos_x
        self.start_y = self.pos_y
        self.max_range = 700
        self.angle = math.degrees(math.atan2(-direction[1], direction[0]))

    def get_rect(self):
        return pygame.Rect(int(self.pos_x - self.width//2), int(self.pos_y - self.height//2), self.width, self.height)

    def update(self):
        current_speed = self.speed
        if getattr(self.owner, 'dio_knife_stopped', False):
            current_speed = 0.0

        time_scale = getattr(self.owner, 'time_scale', 1.0)
        self.pos_x += self.direction[0] * current_speed * time_scale
        self.pos_y += self.direction[1] * current_speed * time_scale

        main_module = sys.modules.get('__main__')
        if main_module:
            walls = getattr(main_module, 'walls', [])
            knife_rect = self.get_rect()
            for wall in walls:
                if wall.rect.colliderect(knife_rect):
                    self.lifespan = 0  
                    break

    def is_expired(self):
        time_over = pygame.time.get_ticks() - self.created_time >= self.lifespan
        out_of_range = math.hypot(self.pos_x - self.start_x, self.pos_y - self.start_y) >= self.max_range
        return time_over or out_of_range

    def collides_with(self, target):
        if target == self.owner or getattr(target, 'invincible', False) or target.defense >= 100.0:
            return False
        return self.get_rect().colliderect(target.rect)

    def apply_effect(self, target):
        self.owner.dio_last_hit_time = pygame.time.get_ticks()

    def draw(self, surface):
        surf = pygame.Surface((self.width, self.height), pygame.SRCALPHA)
        pygame.draw.rect(surf, (220, 220, 240), (0, 0, self.width, self.height))
        pygame.draw.rect(surf, (50, 50, 50), (0, 0, self.width, self.height), 1)
        
        rotated_surf = pygame.transform.rotate(surf, self.angle)
        rect = rotated_surf.get_rect(center=(int(self.pos_x), int(self.pos_y)))
        surface.blit(rotated_surf, rect.topleft)


# ==========================================
# [펀치 충격파] 주먹이 최대로 뻗은 순간 나오는 범위 판정 이펙트 (확장되는 반경만큼 데미지 적용)
# ==========================================
class DioPunchShockwave:
    def __init__(self, owner, x, y, dir_vec, base_size, damage):
        self.owner = owner
        self.pos_x = x
        self.pos_y = y
        self.dir_vec = dir_vec
        self.base_size = base_size
        self.damage = damage
        self.created_time = pygame.time.get_ticks()
        self.lifespan = 260
        self.max_radius = int(base_size * 1.3)  # [수정] 기존보다 좀 더 작게 퍼지는 범위
        self.hit_players = []

    def _current_radius(self):
        now = pygame.time.get_ticks()
        progress = min(1.0, (now - self.created_time) / self.lifespan)
        return self.base_size * 0.5 + self.max_radius * progress

    def update(self):
        pass

    def is_expired(self):
        return pygame.time.get_ticks() - self.created_time >= self.lifespan

    def collides_with(self, target):
        if target == self.owner or getattr(target, 'invincible', False) or target.defense >= 100.0:
            return False
        dist = math.hypot(target.rect.centerx - self.pos_x, target.rect.centery - self.pos_y)
        return dist <= self._current_radius()

    def apply_effect(self, target):
        pass

    def draw(self, surface):
        now = pygame.time.get_ticks()
        progress = min(1.0, (now - self.created_time) / self.lifespan)
        radius = int(self._current_radius())
        if radius <= 0:
            return
        alpha = max(0, int(210 * (1.0 - progress)))
        if alpha <= 0:
            return

        size = radius * 2 + 4
        surf = pygame.Surface((size, size), pygame.SRCALPHA)
        center = (radius + 2, radius + 2)
        ring_w = max(2, int(7 * (1.0 - progress)))
        pygame.draw.circle(surf, (255, 255, 255, alpha), center, radius, ring_w)
        pygame.draw.circle(surf, (255, 215, 0, alpha // 2), center, max(0, radius - 8), 2)
        surface.blit(surf, (int(self.pos_x - center[0]), int(self.pos_y - center[1])))


# ==========================================
# [평타 - J키] 정사각형(스탠드) 양옆에서 작은 사각형(주먹)이 전방으로 뻗었다 돌아오는 잽 콤보 (인덱스 0)
# ==========================================
class DioPunchHitbox:
    def __init__(self, owner, origin_x, origin_y, dir_vec, travel_dist, width, height, damage, attacks_list=None):
        self.owner = owner
        self.origin_x = origin_x
        self.origin_y = origin_y
        self.dir_vec = dir_vec
        self.travel_dist = travel_dist
        self.pos_x = origin_x
        self.pos_y = origin_y
        self.width = width
        self.height = height
        self.damage = damage
        self.created_time = pygame.time.get_ticks()
        self.lifespan = 150
        self.hit_players = []
        self.attacks_list = attacks_list
        self.shockwave_spawned = False

    def get_rect(self):
        return pygame.Rect(int(self.pos_x - self.width//2), int(self.pos_y - self.height//2), self.width, self.height)

    def update(self):
        now = pygame.time.get_ticks()
        elapsed = now - self.created_time
        progress = min(1.0, elapsed / self.lifespan)
        # 0 -> 1 -> 0 으로 앞으로 뻗었다가 다시 돌아오는 잽 모션
        extend = math.sin(progress * math.pi)
        self.pos_x = self.origin_x + self.dir_vec.x * self.travel_dist * extend
        self.pos_y = self.origin_y + self.dir_vec.y * self.travel_dist * extend

        # [추가] 주먹이 거의 최대로 뻗은 순간 충격파 이펙트 생성 (데미지/판정은 그대로, 시각 효과만 추가)
        if not self.shockwave_spawned and extend >= 0.92 and self.attacks_list is not None:
            self.shockwave_spawned = True
            self.attacks_list.append(DioPunchShockwave(
                self.owner, self.pos_x, self.pos_y, self.dir_vec, max(self.width, self.height), self.damage
            ))

    def is_expired(self):
        return pygame.time.get_ticks() - self.created_time >= self.lifespan

    def collides_with(self, target):
        if target == self.owner or getattr(target, 'invincible', False) or target.defense >= 100.0:
            return False
        return self.get_rect().colliderect(target.rect)

    def apply_effect(self, target):
        self.owner.dio_last_hit_time = pygame.time.get_ticks()

    def draw(self, surface):
        rect = self.get_rect()
        surf = pygame.Surface((self.width, self.height), pygame.SRCALPHA)
        pygame.draw.rect(surf, (255, 255, 255, 230), (0, 0, self.width, self.height), border_radius=4)
        pygame.draw.rect(surf, (255, 215, 0, 255), (0, 0, self.width, self.height), 2, border_radius=4)
        surface.blit(surf, rect.topleft)


class DioStandField:
    """정해진 위치에 스탠드 사각형을 소환해 계속 잽을 날리는 지속형 평타.
    평타를 다시 사용하면 기존 스탠드는 사라지고 새 위치에 다시 소환된다."""
    def __init__(self, owner, direction, attacks_list):
        self.owner = owner
        self.attacks_list = attacks_list
        self.damage = owner.base_atk * 0.4  # 지속타이므로 개별 타격력은 낮게
        self.created_time = pygame.time.get_ticks()
        self.hit_players = []
        self.force_expire = False

        # [수정] 스탠드(몸통) 사각형 크기를 캐릭터와 동일하게
        self.box_size = owner.rect.width

        # 방향 벡터 및 직교(좌우) 벡터 계산 (소환 시점 방향으로 고정)
        dir_vec = pygame.math.Vector2(direction[0], direction[1])
        if dir_vec.length_squared() == 0:
            dir_vec = pygame.math.Vector2(1, 0)
        else:
            dir_vec = dir_vec.normalize()
        self.dir_vec = dir_vec
        self.perp_vec = pygame.math.Vector2(-dir_vec.y, dir_vec.x)

        # 사각형 박스의 중심 좌표 (캐릭터 전방, 소환 당시 위치에 고정)
        dist = 45 + self.box_size // 2
        self.box_x = float(owner.rect.centerx + dir_vec.x * dist)
        self.box_y = float(owner.rect.centery + dir_vec.y * dist)

        # [수정] 주먹은 몸통보다 작은 사각형으로, 뻗어나가는 사거리는 확대
        offset = self.box_size * 0.55
        self.fist_w = int(self.box_size * 0.4)
        self.fist_h = int(self.box_size * 0.4)
        self.travel_dist = self.box_size * 0.85

        self.fist_origins = [
            (self.box_x + self.perp_vec.x * offset, self.box_y + self.perp_vec.y * offset),
            (self.box_x - self.perp_vec.x * offset, self.box_y - self.perp_vec.y * offset),
        ]

        self.punch_interval = 240  # 좌/우 번갈아 나가는 잽 사이 간격
        self.next_punch_side = 0
        self.last_punch_time = 0  # 소환 즉시 첫 타격이 나가도록

    def get_box_rect(self):
        return pygame.Rect(int(self.box_x - self.box_size//2), int(self.box_y - self.box_size//2), self.box_size, self.box_size)

    def update(self):
        now = pygame.time.get_ticks()
        if now - self.last_punch_time >= self.punch_interval:
            self.last_punch_time = now
            ox, oy = self.fist_origins[self.next_punch_side]
            self.attacks_list.append(DioPunchHitbox(
                self.owner, ox, oy, self.dir_vec, self.travel_dist,
                self.fist_w, self.fist_h, self.damage, self.attacks_list
            ))
            self.next_punch_side = 1 - self.next_punch_side

    def is_expired(self):
        return self.force_expire

    def collides_with(self, target):
        return False

    def apply_effect(self, target):
        pass

    def draw(self, surface):
        # 전방에 소환된 정사각형 박스(스탠드 몸통) 렌더링 (개별 주먹은 DioPunchHitbox가 각자 그림)
        box_rect = self.get_box_rect()
        normal_img, flipped_img = get_character_sprite('dio(skill1).png', self.box_size)
        stand_img = flipped_img if self.dir_vec.x < 0 else normal_img
        surface.blit(stand_img, box_rect.topleft)
        pygame.draw.rect(surface, (255, 255, 255), box_rect, 2)


class DioBasicAttack:
    def __init__(self):
        self.name = "Stand Barrage"
        self.cooldown = 480  # 스탠드 재소환(위치 이동) 대기시간
        self.last_used = 0

    def can_use(self):
        return pygame.time.get_ticks() - self.last_used >= self.cooldown

    def use(self, owner, direction, attacks_list, color):
        self.last_used = pygame.time.get_ticks()

        # 기존 스탠드가 있다면 제거하고 새 위치에 다시 소환
        old_stand = getattr(owner, 'dio_stand_ref', None)
        if old_stand is not None:
            old_stand.force_expire = True

        stand = DioStandField(owner, direction, attacks_list)
        owner.dio_stand_ref = stand
        attacks_list.append(stand)


# ==========================================
# [스킬 1 - K키] 최대 5개 충전형 칼 던지기 (인덱스 1)
# ==========================================
class DioSkill1:
    def __init__(self):
        self.name = "Knife Throw (Charge)"
        self.cooldown = 250        
        self.last_used = 0
        self.max_charges = 5       
        self.current_charges = 5   
        self.charge_cooldown = 1500  
        self.last_charge_time = pygame.time.get_ticks()
        
        self.cooldown_type = 'charges'

    def update_charges(self):
        now = pygame.time.get_ticks()
        if self.current_charges < self.max_charges:
            if now - self.last_charge_time >= self.charge_cooldown:
                self.current_charges += 1
                self.last_charge_time = now

    def can_use(self):
        self.update_charges()
        return self.current_charges > 0 and (pygame.time.get_ticks() - self.last_used >= self.cooldown)

    def use(self, owner, direction, attacks_list, color):
        self.update_charges()
        if self.current_charges > 0:
            self.last_used = pygame.time.get_ticks()
            self.current_charges -= 1
            if self.current_charges == self.max_charges - 1:
                self.last_charge_time = pygame.time.get_ticks()
            attacks_list.append(DioKnifeBullet(owner, direction))


# ==========================================
# [스킬 2 - L키] THE WORLD (인덱스 2)
# ==========================================
class DioTimeStopEffect:
    def __init__(self, owner, target, duration_sec):
        self.owner = owner
        self.target = target
        self.duration = duration_sec
        self.created_time = pygame.time.get_ticks()
        self.hit_players = []
        self.force_expire = False

    def update(self, walls=None):
        # [추가] 시간 정지 중 상대에게 피해를 입히면(=주먹/칼이 명중하면) 시간 정지 즉시 종료
        if getattr(self.owner, 'dio_last_hit_time', 0) > self.created_time:
            self.force_expire = True

    def is_expired(self):
        elapsed_sec = (pygame.time.get_ticks() - self.created_time) / 1000.0
        expired = self.force_expire or elapsed_sec >= self.duration
        if expired:
            if self.target:
                self.target.stunned = False
                # [추가] 조기 종료 시 남은 슬로우/침묵/시간감속도 함께 풀어 시간이 바로 다시 흐르게 함
                if self.force_expire:
                    if hasattr(self.target, 'status_effects'):
                        self.target.status_effects.pop('time_slow', None)
                        self.target.status_effects.pop('slow', None)
                        self.target.status_effects.pop('silence', None)
                    self.target.silenced = False
            if self.owner:
                self.owner.dio_knife_stopped = False
        return expired

    def collides_with(self, target):
        return False

    def apply_effect(self, target):
        pass

    def draw(self, surface):
        surf = pygame.Surface((surface.get_width(), surface.get_height()), pygame.SRCALPHA)
        surf.fill((10, 10, 30, 120))
        surface.blit(surf, (0, 0))


class DioSkill2:
    def __init__(self):
        self.name = "The World (Time Stop)"
        self.cooldown = 12000
        self.last_used = 0
        self.owner = None
        self.skill1_ref = None  

    def can_use(self):
        return pygame.time.get_ticks() - self.last_used >= self.cooldown

    def use(self, owner, direction, attacks_list, color):
        self.owner = owner
        self.last_used = pygame.time.get_ticks()
        
        if self.skill1_ref:
            self.skill1_ref.current_charges = 5
            self.skill1_ref.last_charge_time = pygame.time.get_ticks()
        
        target = getattr(owner, 'opponent', None)
        if target:
            duration_sec = 3.0
            power_val = 100.0

            time_slow(target, duration_sec, power_val)
            slow(target, duration_sec, power_val)
            silence(target, duration_sec)
            target.stunned = True

            owner.dio_knife_stopped = True

            attacks_list.append(DioTimeStopEffect(owner, target, duration_sec))


# ==========================================
# [궁극기 - O키] 하늘로 날아올라 무적+망령화 상태로 자유롭게 이동하다가
# 느낌표가 반짝이는 원이 뜨면 그 자리에서 단 한 번 강타 (인덱스 3)
# 마법사 궁극기(SniperUltManager)와 동일한 구조이며, 3연발이 아니라 1발인 것만 다르다.
# ==========================================
class DioRoadRollerManager:
    def __init__(self, owner, color):
        self.owner = owner
        self.color = color
        self.shots_remaining = 1  # [DIO 전용] 마법사는 3발이지만 DIO는 1발만
        self.phase = 1
        self.phase_start_time = pygame.time.get_ticks()
        self.expired = False
        self.can_penetrate_walls = True
        self.hit_players = []
        self.damage = 0

        self.radius = 85
        self.last_key_down = True  # 초기 시전 키 눌림 중복 방지

        self.original_charge_rate = getattr(owner, 'ult_charge_rate', 8.0)
        owner.ult_charge_rate = 0.0

        # 하늘로 날아올라 무적 + 피격 불가(망령화) 상태가 되며 화면에서 사라짐 (자유 이동 가능)
        self.owner.invincible = True
        self.owner.is_dio_ult_airborne = True

        silence(self.owner, 15.0)
        ghost(self.owner, 15.0)

    def trigger_shot(self):
        if self.phase == 1:
            self.phase = 2
            self.phase_start_time = pygame.time.get_ticks()
            slow(self.owner, 0.5, 100)

    def update(self):
        if getattr(self.owner, 'hp', 1) <= 0:
            self.finish()
            return

        # 궁극기 상태 중 수동 즉시 발사(궁극기 키 재입력) 감지
        keys = pygame.key.get_pressed()
        ult_key = None
        if hasattr(self.owner, 'controls') and 'skills' in self.owner.controls and len(self.owner.controls['skills']) > 3:
            ult_key = self.owner.controls['skills'][3]

        key_down = False
        if ult_key is not None and keys[ult_key]:
            key_down = True

        if self.owner.joystick:
            joy = self.owner.joystick
            joy_name = joy.get_name().lower()
            if getattr(self.owner, 'is_combined', False):
                if self.owner.player_num == 1:
                    if joy.get_numhats() > 0 and joy.get_hat(0)[0] == 1: key_down = True
                    elif joy.get_numbuttons() > 14 and joy.get_button(14): key_down = True
                else:
                    if joy.get_numbuttons() > 3 and joy.get_button(3): key_down = True
            else:
                if "(r)" in joy_name or "right" in joy_name:
                    if joy.get_numbuttons() > 3 and joy.get_button(3): key_down = True
                else:
                    if joy.get_numbuttons() > 15 and joy.get_button(15): key_down = True

        if not self.last_key_down and key_down:
            self.trigger_shot()
        self.last_key_down = key_down

        current_time = pygame.time.get_ticks()
        elapsed = current_time - self.phase_start_time

        if self.phase == 1:
            self.damage = 0
            if elapsed >= 3000:
                self.phase = 2
                self.phase_start_time = current_time
                slow(self.owner, 0.5, 100)
        elif self.phase == 2:
            self.damage = 0
            if elapsed >= 500:
                self.phase = 3
                self.damage = self.owner.base_atk * 2.0
                self.phase_start_time = current_time
        elif self.phase == 3:
            if elapsed >= 200:
                self.shots_remaining -= 1
                if self.shots_remaining > 0:
                    self.phase = 1
                    self.damage = 0
                    self.phase_start_time = current_time
                    self.hit_players = []
                else:
                    self.finish()

    def finish(self):
        self.owner.invincible = False
        self.owner.is_dio_ult_airborne = False
        self.owner.ult_charge_rate = self.original_charge_rate

        if hasattr(self.owner, 'status_effects'):
            self.owner.status_effects.pop('silence', None)
            self.owner.status_effects.pop('ghost', None)
        self.owner.silenced = False

        self.expired = True

    def is_expired(self):
        return self.expired

    def collides_with(self, target_player):
        if self.phase != 3 or target_player == self.owner:
            return False
        if getattr(target_player, 'invincible', False) or target_player.defense >= 100.0:
            return False
        cx, cy = self.owner.rect.center
        dist_sq = (target_player.rect.centerx - cx) ** 2 + (target_player.rect.centery - cy) ** 2
        return dist_sq <= self.radius ** 2

    def apply_effect(self, target):
        pass

    def draw(self, surface):
        if self.expired:
            return

        cx, cy = self.owner.rect.center
        current_time = pygame.time.get_ticks()
        ind_surf = pygame.Surface((surface.get_width(), surface.get_height()), pygame.SRCALPHA)

        if self.phase == 2:
            # 반짝이는 느낌표 경고
            pulse_val = (math.sin(current_time * 0.02) + 1) * 0.5
            warn_alpha = int(180 + 75 * pulse_val)
            pygame.draw.circle(ind_surf, (255, 60, 40, warn_alpha), (cx, cy), self.radius)
            pygame.draw.circle(ind_surf, (255, 220, 60, 255), (cx, cy), self.radius, 4)

            if (current_time // 150) % 2 == 0:
                font = get_font(48, bold=True)
                text_surf = font.render("!", True, (255, 220, 60))
                text_rect = text_surf.get_rect(center=(cx, cy - self.radius - 30))
                ind_surf.blit(text_surf, text_rect)
        elif self.phase == 3:
            pygame.draw.circle(ind_surf, (255, 255, 255, 220), (cx, cy), int(self.radius * 0.8))
            pygame.draw.circle(ind_surf, (255, 120, 40, 255), (cx, cy), self.radius, 6)
        else:
            pulse = (math.sin(current_time * 0.015) + 1) * 0.5
            current_r = int(self.radius * (0.9 + 0.1 * pulse))
            pygame.draw.circle(ind_surf, (255, 120, 40, 160), (cx, cy), current_r, 2)

        surface.blit(ind_surf, (0, 0))


class DioUltimateSkill:
    def __init__(self):
        self.name = "Road Roller"
        self.cooldown = 500  # 궁극기 게이지 100% 즉시 발동을 위해 이중 잠금 해제
        self.last_used = -99999
        self.ult_charge_rate = 8.0
        self.keywords = ['ult']

    def can_use(self):
        return pygame.time.get_ticks() - self.last_used >= self.cooldown

    def use(self, owner, direction, attacks_list, color):
        self.last_used = pygame.time.get_ticks()
        manager = DioRoadRollerManager(owner, color)
        attacks_list.append(manager)


# ==========================================
# DIO 캐릭터 데이터 등록 매핑
# ==========================================
def apply_dio(player):
    player.base_atk = 15
    player.max_hp = 100
    player.hp = 100
    player.speed = 4.7
    player.is_dio = True
    player.dio_knife_stopped = False
    player.dio_last_hit_time = 0
    player.dio_stand_ref = None
    player.is_dio_ult_airborne = False
    player.sprite_image, player.sprite_image_flipped = get_character_sprite('dio.png')

    # [추가] 궁극기로 하늘에 떠 있는 동안 화면에서 사라지도록 처리 (마법사 궁극기와 동일한 방식)
    original_draw = player.draw
    def custom_draw(surface):
        if getattr(player, 'is_dio_ult_airborne', False):
            pass
        else:
            original_draw(surface)
    player.draw = custom_draw

    skill1 = DioSkill1()
    skill2 = DioSkill2()
    skill2.skill1_ref = skill1

    player.abilities = [
        DioBasicAttack(),      # 인덱스 0: 평타 - 전방에 스탠드를 소환해 그 자리에서 계속 잽을 날림, 재사용 시 위치 이동 (J키)
        skill1,                # 인덱스 1: 스킬 1 - 5개 충전형 칼 던지기 (K키)
        skill2,                # 인덱스 2: 스킬 2 - 시간 정지 + 칼 즉시 5개 충전 (L키, 명중 시 조기 종료)
        DioUltimateSkill()     # 인덱스 3: 궁극기 - 하늘로 날아올라 무적+망령화로 자유 이동 후 단 한 번 강타 (O키)
    ]

    if len(player.abilities) >= 4 and hasattr(player.abilities[3], 'ult_charge_rate'):
        player.ult_charge_rate = player.abilities[3].ult_charge_rate

    def custom_reset():
        player.is_dio = False
        player.dio_knife_stopped = False
        player.dio_last_hit_time = 0
        player.is_dio_ult_airborne = False
        player.invincible = False
        stand = getattr(player, 'dio_stand_ref', None)
        if stand is not None:
            stand.force_expire = True
        player.dio_stand_ref = None
        player.custom_reset = None

    player.custom_reset = custom_reset

DIO_CHARACTER_DATA = {
    "name": "DIO",
    "desc": "전방에 스탠드를 소환해 그 자리에서 계속 잽을 날리는 평타(재사용 시 위치 이동), 충전형 칼 던지기(스킬 1), 5초간 시간 정지(스킬 2), 하늘로 날아올라 무적 상태로 자유롭게 이동하다 단 한 번 강타하는 궁극기를 지닌 흡혈귀",
    "apply": apply_dio,
    "get_thumbnail": lambda size=40: get_character_thumbnail('dio.png', size)
}
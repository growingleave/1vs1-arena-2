import sys
import math
import asyncio
import pygame
from wall import Wall, move_entity_with_walls, handle_attack_wall_collisions
from character_manager import CHARACTER_REGISTRY, get_character_data
from status_effects import update_status_effects
from player import Player
from pickup import Pickup
from fonts import get_font, render_text_cached
from map import MAPS, get_map

pygame.init()
pygame.joystick.init()


pygame.event.set_allowed([pygame.QUIT, pygame.KEYDOWN, pygame.KEYUP])


WIDTH, HEIGHT = 1280, 720

IS_WEB = sys.platform == "emscripten"
if IS_WEB:
    REAL_WIDTH, REAL_HEIGHT = WIDTH, HEIGHT
    real_screen = pygame.display.set_mode((REAL_WIDTH, REAL_HEIGHT))
else:
    _display_info = pygame.display.Info()
    REAL_WIDTH, REAL_HEIGHT = _display_info.current_w, _display_info.current_h
    real_screen = pygame.display.set_mode((REAL_WIDTH, REAL_HEIGHT), pygame.FULLSCREEN)
pygame.display.set_caption("1v1 Top-Down Arena")

# 실제 그림은 1280x720 내부 서피스에 그린 뒤, 매 프레임 real_screen에 레터박스로 옮긴다.
screen = pygame.Surface((WIDTH, HEIGHT))

async def main(pygame, sys, math, asyncio, Wall, move_entity_with_walls, handle_attack_wall_collisions,
                CHARACTER_REGISTRY, get_character_data, update_status_effects, Player,
                MAPS, get_map, Pickup, get_font, render_text_cached, screen, WIDTH, HEIGHT,
                real_screen, REAL_WIDTH, REAL_HEIGHT):
    clock = pygame.time.Clock()

    # --- 레터박스 배율/오프셋 미리 계산 (화면 비율이 16:9가 아니어도 찌그러지지 않게) ---
    letterbox_scale = min(REAL_WIDTH / WIDTH, REAL_HEIGHT / HEIGHT)
    letterbox_size = (int(WIDTH * letterbox_scale), int(HEIGHT * letterbox_scale))
    letterbox_offset = ((REAL_WIDTH - letterbox_size[0]) // 2, (REAL_HEIGHT - letterbox_size[1]) // 2)
    real_screen.fill((0, 0, 0))  # 남는 여백은 검은 띠로

    # --- 연결된 조이스틱 안전하게 미리 등록하기 ---
    joysticks = []
    for i in range(pygame.joystick.get_count()):
        try:
            joy = pygame.joystick.Joystick(i)
            joy.init()
            joysticks.append(joy)
            print(f"조이스틱 {i}번 감지 완료: {joy.get_name()}")
        except Exception as e:
            print(f"조이스틱 {i}번 감지 실패: {e}")

    font_huge = get_font(140, bold=True)
    font_large = get_font(40, bold=True)
    font_medium = get_font(24, bold=True)
    font_small = get_font(16)
    font_icon = get_font(11, bold=True)

    COLOR_BG = (20, 20, 25)
    COLOR_CARD_BG = (35, 35, 45)
    COLOR_WHITE = (255, 255, 255)
    COLOR_GRAY = (100, 100, 110)
    COLOR_RED = (230, 60, 60)
    COLOR_BLUE = (60, 120, 230)
    COLOR_GREEN = (80, 220, 100)
    COLOR_GOLD = (255, 215, 0)

    def draw_skill_icon_with_clock(surface, x, y, size, skill, label_text, color):
        icon_rect = pygame.Rect(x, y, size, size)
        pygame.draw.rect(surface, (30, 30, 35), icon_rect)
        pygame.draw.rect(surface, COLOR_GRAY, icon_rect, 1)

        now = pygame.time.get_ticks()
        center_x, center_y = x + size // 2, y + size // 2
        radius = (size // 2) - 4

        is_buff_active = hasattr(skill, 'buff_end_time') and now < skill.buff_end_time
        is_charge_type = getattr(skill, 'cooldown_type', None) == 'charges'

        if is_buff_active:
            buff_left = skill.buff_end_time - now
            overlay = pygame.Surface((size, size), pygame.SRCALPHA)
            overlay.fill((50, 220, 100, 100))
            surface.blit(overlay, (x, y))
            pygame.draw.rect(surface, COLOR_GREEN, icon_rect, 2)
            sec_str = f"{max(0.1, buff_left / 1000.0):.1f}s"
            sec_surf = font_icon.render(sec_str, True, COLOR_WHITE)
            surface.blit(sec_surf, (x + size // 2 - sec_surf.get_width() // 2, y + size // 2 - 4))

        elif is_charge_type:
            if hasattr(skill, 'update_charges'):
                skill.update_charges()

            if skill.current_charges < skill.max_charges:
                elapsed = now - skill.last_charge_time
                progress = min(1.0, elapsed / skill.charge_cooldown)

                overlay = pygame.Surface((size, size), pygame.SRCALPHA)
                overlay.fill((0, 0, 0, int(150 * (1.0 - progress))))
                surface.blit(overlay, (x, y))
                pygame.draw.rect(surface, COLOR_GRAY, icon_rect, 2)
            else:
                pygame.draw.rect(surface, color, icon_rect, 2)

            charge_str = f"{skill.current_charges}"
            charge_surf = font_medium.render(charge_str, True, COLOR_GOLD if skill.current_charges == skill.max_charges else COLOR_WHITE)
            surface.blit(charge_surf, (center_x - charge_surf.get_width() // 2, center_y - charge_surf.get_height() // 2))

        elif hasattr(skill, 'cooldown') and hasattr(skill, 'last_used'):
            elapsed = now - skill.last_used
            progress = min(1.0, elapsed / skill.cooldown) if skill.cooldown > 0 else 1.0

            if progress < 1.0:
                angle_deg = -90 + (progress * 360)
                angle_rad = math.radians(angle_deg)
                hand_x = center_x + radius * math.cos(angle_rad)
                hand_y = center_y + radius * math.sin(angle_rad)

                pygame.draw.line(surface, (255, 200, 50), (center_x, center_y), (hand_x, hand_y), 2)
                pygame.draw.circle(surface, COLOR_WHITE, (center_x, center_y), 2)

                overlay = pygame.Surface((size, size), pygame.SRCALPHA)
                overlay.fill((0, 0, 0, 120))
                surface.blit(overlay, (x, y))
            else:
                pygame.draw.line(surface, color, (center_x, center_y), (center_x, center_y - radius), 2)
                pygame.draw.circle(surface, COLOR_WHITE, (center_x, center_y), 2)
                pygame.draw.rect(surface, color, icon_rect, 2)

        txt_surf = font_icon.render(label_text, True, (220, 220, 220))
        surface.blit(txt_surf, (x + 3, y + 2))

    def draw_ult_icon(surface, x, y, size, gauge_percent, label_text, color):
        icon_rect = pygame.Rect(x, y, size, size)
        pygame.draw.rect(surface, (30, 30, 35), icon_rect)

        pct = min(100.0, max(0.0, gauge_percent))
        fill_h = int((size - 2) * (pct / 100.0))

        if fill_h > 0:
            fill_rect = pygame.Rect(x + 1, y + size - 1 - fill_h, size - 2, fill_h)
            pygame.draw.rect(surface, (120, 80, 200) if pct < 100 else COLOR_GOLD, fill_rect)

        if pct >= 100.0:
            pygame.draw.rect(surface, COLOR_GOLD, icon_rect, 2)
        else:
            pygame.draw.rect(surface, COLOR_GRAY, icon_rect, 1)

        txt_surf = font_icon.render(label_text, True, COLOR_WHITE)
        surface.blit(txt_surf, (x + 3, y + 2))

        pct_str = f"{int(pct)}%"
        pct_surf = font_icon.render(pct_str, True, COLOR_WHITE if pct < 100 else (0, 0, 0))
        surface.blit(pct_surf, (x + size // 2 - pct_surf.get_width() // 2, y + size // 2 - 4))

    # 게임 초기 설정
    CHARACTERS = CHARACTER_REGISTRY
    # 캐릭터 선택 팻말용 썸네일 이미지 (있는 캐릭터만) - 최초 1회만 만들어서 캐싱
    pedestal_thumbnails = {}
    for _idx, _char_data in enumerate(CHARACTERS):
        _thumb_getter = _char_data.get('get_thumbnail')
        if _thumb_getter:
            pedestal_thumbnails[_idx] = _thumb_getter(40)

    def get_character_portrait(char_idx, size):
        """대난투 스타일 VS 화면용 초상화. 이미지가 없는 캐릭터는 None을 반환해서
        호출부가 기본 색상 사각형으로 대체하도록 한다."""
        getter = CHARACTERS[char_idx].get('get_thumbnail')
        return getter(size) if getter else None

    game_state = "TITLE"

    DUMMY_COLOR = (140, 140, 150)
    LOADOUT_DIVIDER_X = 637

    P1_CONTROLS = {'up': pygame.K_w, 'down': pygame.K_s, 'left': pygame.K_a, 'right': pygame.K_d,
                   'skills': []}
    P2_CONTROLS = {'up': pygame.K_UP, 'down': pygame.K_DOWN, 'left': pygame.K_LEFT, 'right': pygame.K_RIGHT,
                   'skills': []}

    # 시작 화면에서 노트북/크롬북 버전을 고르면 스킬키가 여기에 맞춰 적용된다
    CONTROL_SCHEMES = {
        'laptop': {
            'label': '노트북 버전 (P1: H J K U ・ P2: 숫자패드 1 2 3 5)',
            'p1_skills': [pygame.K_h, pygame.K_j, pygame.K_k, pygame.K_u],
            'p2_skills': [pygame.K_KP1, pygame.K_KP2, pygame.K_KP3, pygame.K_KP5],
        },
        'chromebook': {
            'label': "크롬북 버전 (P1: G H J Y ・ P2: L ; ' P)",
            'p1_skills': [pygame.K_g, pygame.K_h, pygame.K_j, pygame.K_y],
            'p2_skills': [pygame.K_l, pygame.K_SEMICOLON, pygame.K_QUOTE, pygame.K_p],
        },
    }

    def apply_control_scheme(name):
        scheme = CONTROL_SCHEMES[name]
        P1_CONTROLS['skills'] = scheme['p1_skills']
        P2_CONTROLS['skills'] = scheme['p2_skills']

    apply_control_scheme('laptop')

    def spawn_character_player(x, y, color, controls, char_idx, joystick=None, player_num=1, is_combined=False):
        """캐릭터를 적용한 새 플레이어를 만든다. (기존 캐릭터의 draw/update 몽키패치가 겹쳐 쌓이지
        않도록, 캐릭터를 바꿀 때는 항상 새 Player 인스턴스에 적용한다.)"""
        p = Player(x=x, y=y, color=color, controls=controls, joystick=joystick,
                   player_num=player_num, is_combined=is_combined)
        p.color = color
        get_character_data(char_idx)["apply"](p)
        return p

    def create_practice_dummy(x, y):
        """능력 시험용 허수아비. 조작을 받지 않고, 사실상 죽지 않는다."""
        dummy = Player(
            x=x, y=y, color=DUMMY_COLOR,
            controls={'up': pygame.K_UNKNOWN, 'down': pygame.K_UNKNOWN,
                      'left': pygame.K_UNKNOWN, 'right': pygame.K_UNKNOWN, 'skills': []},
            player_num=0
        )
        dummy.max_hp = 99999
        dummy.hp = dummy.max_hp
        dummy.base_atk = 0
        dummy.speed = 0
        dummy.abilities = []
        return dummy

    def create_loadout_orbs():
        orbs = [Pickup(320, 300, 'ult'), Pickup(960, 300, 'ult')]
        for orb in orbs:
            orb.respawn_time = 1200  # 엄청 짧은 쿨타임 - 반복해서 바로바로 궁극기 테스트 가능
        return orbs

    def build_pedestals(zone_x_offset):
        """캐릭터 팻말 배치: 밟으면 그 캐릭터로 즉시 교체된다."""
        pedestals = []
        cols = 5
        start_x = zone_x_offset + 40
        start_y = 500
        spacing_x = 115
        spacing_y = 60
        size = 46
        for i in range(len(CHARACTERS)):
            row = i // cols
            col = i % cols
            px = start_x + col * spacing_x
            py = start_y + row * spacing_y
            pedestals.append({'index': i, 'rect': pygame.Rect(px, py, size, size)})
        return pedestals

    # 전투맵은 map.py에서 관리한다 (여러 맵을 등록해두고 맵 선택 화면에서 고른다)
    selected_map_idx = 0
    hazards = []
    map_events = []
    battle_bg_color = COLOR_BG
    preview_cache = {'idx': -1, 'hazards': [], 'events': []}  # 맵 선택 화면 미리보기용 캐시

    loadout_walls = [
        Wall(LOADOUT_DIVIDER_X, 0, 6, HEIGHT),  # 중앙 분리벽 (P1/P2 구역 분리)
        Wall(150, 430, 140, 40),                # P1 연습용 벽
        Wall(990, 430, 140, 40),                # P2 연습용 벽 (대칭)
    ]

    pedestals_p1 = build_pedestals(0)
    pedestals_p2 = build_pedestals(LOADOUT_DIVIDER_X + 6)

    p1_char_idx = 0
    p2_char_idx = 0

    pickups = get_map(selected_map_idx)['build_pickups']()
    walls = loadout_walls

    winner_text = ""
    attacks = []
    p1_ready = False
    p2_ready = False
    player1 = None
    player2 = None
    dummy1 = None
    dummy2 = None
    loadout_orbs = []
    versus_start_time = 0

    def enter_loadout():
        nonlocal player1, player2, dummy1, dummy2, loadout_orbs, walls, p1_ready, p2_ready, attacks
        walls = loadout_walls
        dummy1 = create_practice_dummy(320, 220)
        dummy2 = create_practice_dummy(960, 220)
        loadout_orbs = create_loadout_orbs()
        player1 = spawn_character_player(150, 380, COLOR_RED, P1_CONTROLS, p1_char_idx, player_num=1)
        player2 = spawn_character_player(1130, 380, COLOR_BLUE, P2_CONTROLS, p2_char_idx, player_num=2)
        # 로드아웃에서는 "상대"가 자기 쪽 허수아비 (실제 상대 플레이어를 건드리지 않도록)
        player1.opponent = dummy1
        player2.opponent = dummy2
        p1_ready = False
        p2_ready = False
        attacks = []

    enter_loadout()

    # --- 메인 루프 ---
    # 브라우저(emscripten) 빌드에서는 pygame.key.get_pressed()가 내부적으로
    # SDL 키보드 상태 배열에 의존하는데, 이 배열이 일부 키(예: W/A)에서
    # 브라우저의 자동 반복(auto-repeat) keydown 이벤트와 어긋나 눌림 상태를
    # 잘못 갱신하는 문제가 있었다(같은 시간 눌러도 특정 키만 훨씬 더 이동).
    # 그래서 get_pressed() 대신 KEYDOWN/KEYUP 이벤트로 직접 눌림 상태를
    # 추적해 신뢰성을 높인다. dict라 Player 코드의 keys[...] 참조와 호환된다.
    pressed_keys = {}

    class _KeyState:
        def __getitem__(self, key):
            return pressed_keys.get(key, False)

    key_state = _KeyState()

    running = True
    while running:
        dt = clock.tick(60)
        dt_sec = dt / 1000.0

        # 일부 캐릭터 스킬(archer/dio/hacker/sans/grinder/demolitionist/assassin)이
        # sys.modules['__main__'].walls로 현재 벽 목록을 참조하므로, main() 내부
        # 지역변수인 walls를 매 프레임 모듈 속성으로도 동기화해둔다.
        sys.modules['__main__'].walls = walls

        # 🌟 파이게임 조이콘 유령 신호 버그(SystemError/KeyError) 완벽 방어!
        try:
            current_events = pygame.event.get()
        except Exception:
            # C엔진 내부에서 에러가 터져도 무시하고 빈 리스트로 넘김
            current_events = []

        for event in current_events:
            if event.type == pygame.QUIT:
                running = False

            if event.type == pygame.KEYDOWN:
                pressed_keys[event.key] = True
            elif event.type == pygame.KEYUP:
                pressed_keys[event.key] = False

            # 전체화면이라 창 닫기 버튼이 없으므로 ESC로 언제든 종료할 수 있게 한다.
            if event.type == pygame.KEYDOWN and event.key == pygame.K_ESCAPE:
                running = False

            if game_state == "TITLE":
                if event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_1:
                        apply_control_scheme('laptop')
                        enter_loadout()
                        game_state = "LOADOUT"
                    elif event.key == pygame.K_2:
                        apply_control_scheme('chromebook')
                        enter_loadout()
                        game_state = "LOADOUT"

            elif game_state == "LOADOUT":
                if event.type == pygame.KEYDOWN:
                    if event.key == pygame.K_SPACE:  # 1P 확정 키 (Space) - 다시 누르면 취소
                        p1_ready = not p1_ready
                    if event.key == pygame.K_RETURN:  # 2P 확정 키 (Enter) - 다시 누르면 취소
                        p2_ready = not p2_ready

            elif game_state == "MAP_SELECT":
                if event.type == pygame.KEYDOWN:
                    if event.key in (pygame.K_LEFT, pygame.K_a):
                        selected_map_idx = (selected_map_idx - 1) % len(MAPS)
                    elif event.key in (pygame.K_RIGHT, pygame.K_d):
                        selected_map_idx = (selected_map_idx + 1) % len(MAPS)
                    elif event.key in (pygame.K_SPACE, pygame.K_RETURN):
                        current_map = get_map(selected_map_idx)
                        walls = current_map['build_walls']()
                        pickups = current_map['build_pickups']()
                        hazard_builder = current_map.get('build_hazards')
                        hazards = hazard_builder() if hazard_builder else []
                        event_builder = current_map.get('build_events')
                        map_events = event_builder() if event_builder else []
                        battle_bg_color = current_map.get('bg_color', COLOR_BG)
                        attacks.clear()
                        game_state = "BATTLE"

            elif game_state == "GAMEOVER":
                if event.type == pygame.KEYDOWN and event.key == pygame.K_SPACE:
                    enter_loadout()
                    game_state = "LOADOUT"

        if game_state == "TITLE":
            screen.fill(COLOR_BG)
            title_txt = render_text_cached(font_large, "1v1 TOP-DOWN ARENA", COLOR_WHITE)
            screen.blit(title_txt, (WIDTH // 2 - title_txt.get_width() // 2, HEIGHT // 2 - 100))

            option1_txt = render_text_cached(font_medium, f"[1] {CONTROL_SCHEMES['laptop']['label']}", COLOR_WHITE)
            option2_txt = render_text_cached(font_medium, f"[2] {CONTROL_SCHEMES['chromebook']['label']}", COLOR_WHITE)
            screen.blit(option1_txt, (WIDTH // 2 - option1_txt.get_width() // 2, HEIGHT // 2))
            screen.blit(option2_txt, (WIDTH // 2 - option2_txt.get_width() // 2, HEIGHT // 2 + 40))

            if (pygame.time.get_ticks() // 500) % 2 == 0:
                prompt_txt = render_text_cached(font_small, "사용 중인 기기에 맞는 번호를 눌러 시작하세요", COLOR_GRAY)
                screen.blit(prompt_txt, (WIDTH // 2 - prompt_txt.get_width() // 2, HEIGHT // 2 + 100))

        elif game_state == "LOADOUT":
            keys = key_state

            if not p1_ready:
                player1.update(dt_sec, keys, attacks, player1.color, loadout_walls)
            if not p2_ready:
                player2.update(dt_sec, keys, attacks, player2.color, loadout_walls)

            dummy1.update(dt_sec, keys, attacks, dummy1.color, loadout_walls)
            dummy2.update(dt_sec, keys, attacks, dummy2.color, loadout_walls)


            for attack in attacks[:]:
                if hasattr(attack, 'dash_speed'):
                    attack.update(loadout_walls)
                else:
                    attack.update()

                if attack.owner == player1:
                    target = dummy1
                elif attack.owner == player2:
                    target = dummy2
                else:
                    target = None

                if target is not None and target not in attack.hit_players and attack.collides_with(target):
                    raw_dmg = attack.damage
                    final_damage = target.take_damage(raw_dmg)
                    attack.hit_players.append(target)

                    multiplier = getattr(attack.owner, 'ult_charge_multiplier', 1.0)
                    attack.owner.add_ult_gauge(final_damage * multiplier)

                    if hasattr(attack, 'apply_effect'):
                        attack.apply_effect(target)

                if attack.is_expired():
                    attacks.remove(attack)

            handle_attack_wall_collisions(attacks, loadout_walls)

            for orb in loadout_orbs:
                orb.update()
                if orb.collides_with_player(player1):
                    orb.collect(player1)
                elif orb.collides_with_player(player2):
                    orb.collect(player2)

            # 팻말을 밟으면 그 캐릭터로 즉시 교체 (확정 전까지만)
            if not p1_ready:
                for pedestal in pedestals_p1:
                    if pedestal['index'] != p1_char_idx and player1.rect.colliderect(pedestal['rect']):
                        p1_char_idx = pedestal['index']
                        old_center = player1.rect.center
                        player1 = spawn_character_player(old_center[0], old_center[1], COLOR_RED,
                                                           P1_CONTROLS, p1_char_idx, player_num=1)
                        player1.rect.center = old_center
                        player1.opponent = dummy1
                        break

            if not p2_ready:
                for pedestal in pedestals_p2:
                    if pedestal['index'] != p2_char_idx and player2.rect.colliderect(pedestal['rect']):
                        p2_char_idx = pedestal['index']
                        old_center = player2.rect.center
                        player2 = spawn_character_player(old_center[0], old_center[1], COLOR_BLUE,
                                                           P2_CONTROLS, p2_char_idx, player_num=2)
                        player2.rect.center = old_center
                        player2.opponent = dummy2
                        break

            if p1_ready and p2_ready:
                # --- 조이콘(통합/분리) 자동 감지 및 스마트 할당 ---
                is_combined = False
                p1_joy = None
                p2_joy = None

                # 통합된 (L/R) 모드라면
                if len(joysticks) == 1 and "(l/r)" in joysticks[0].get_name().lower():
                    is_combined = True
                    p1_joy = joysticks[0]
                    p2_joy = joysticks[0]
                # 따로 분리된 (L), (R) 모드라면
                elif len(joysticks) >= 2:
                    for joy in joysticks:
                        name = joy.get_name().lower()
                        if "(l)" in name or "left" in name:
                            p1_joy = joy
                        elif "(r)" in name or "right" in name:
                            p2_joy = joy

                    if not p1_joy: p1_joy = joysticks[0]
                    if not p2_joy: p2_joy = joysticks[1]

                player1 = spawn_character_player(200, 360, COLOR_RED, P1_CONTROLS, p1_char_idx,
                                                  joystick=p1_joy, player_num=1, is_combined=is_combined)
                player2 = spawn_character_player(1040, 360, COLOR_BLUE, P2_CONTROLS, p2_char_idx,
                                                  joystick=p2_joy, player_num=2, is_combined=is_combined)
                player1.opponent = player2
                player2.opponent = player1

                attacks.clear()
                versus_start_time = pygame.time.get_ticks()
                game_state = "VERSUS"

            # --- 렌더링 ---
            screen.fill(COLOR_BG)

            for wall in loadout_walls:
                wall.draw(screen)

            for orb in loadout_orbs:
                orb.draw(screen)

            for pedestal_list, char_idx in ((pedestals_p1, p1_char_idx), (pedestals_p2, p2_char_idx)):
                for pedestal in pedestal_list:
                    rect = pedestal['rect']
                    is_current = pedestal['index'] == char_idx
                    thumb = pedestal_thumbnails.get(pedestal['index'])

                    if is_current:
                        # 선택된 팻말: 은은한 금색 글로우 + 밝은 배경으로 확실히 눈에 띄게
                        glow_rect = rect.inflate(10, 10)
                        glow_surf = pygame.Surface(glow_rect.size, pygame.SRCALPHA)
                        pygame.draw.rect(glow_surf, (255, 215, 0, 130), glow_surf.get_rect(), border_radius=10)
                        screen.blit(glow_surf, glow_rect.topleft)
                        pygame.draw.rect(screen, COLOR_GOLD, rect, border_radius=6)
                    else:
                        pygame.draw.rect(screen, COLOR_CARD_BG, rect, border_radius=6)

                    if thumb is not None:
                        screen.blit(thumb, thumb.get_rect(center=rect.center))
                        if not is_current:
                            # 선택 안 된 팻말은 이미지를 어둡게 눌러서 선택된 것과 확실히 구분
                            dim_surf = pygame.Surface(rect.size, pygame.SRCALPHA)
                            dim_surf.fill((0, 0, 0, 150))
                            screen.blit(dim_surf, rect.topleft)

                    pygame.draw.rect(screen, COLOR_WHITE if is_current else COLOR_GRAY, rect,
                                      3 if is_current else 2, border_radius=6)
                    name_txt = render_text_cached(font_icon, CHARACTERS[pedestal['index']]['name'],
                                                   (0, 0, 0) if is_current else COLOR_WHITE)
                    screen.blit(name_txt, (rect.centerx - name_txt.get_width() // 2, rect.bottom + 3))

            dummy1.draw(screen)
            dummy2.draw(screen)
            player1.draw(screen)
            player2.draw(screen)
            for attack in attacks:
                attack.draw(screen)

            if p1_ready:
                ready_txt1 = render_text_cached(font_medium, "READY", COLOR_GOLD)
                screen.blit(ready_txt1, (player1.rect.centerx - ready_txt1.get_width() // 2, player1.rect.top - 28))
            if p2_ready:
                ready_txt2 = render_text_cached(font_medium, "READY", COLOR_GOLD)
                screen.blit(ready_txt2, (player2.rect.centerx - ready_txt2.get_width() // 2, player2.rect.top - 28))

            guide_txt = render_text_cached(font_medium, "허수아비에게 시험해보고, 팻말을 밟아 능력을 교체하세요 (SPACE/ENTER: 확정, 다시 누르면 취소)", COLOR_WHITE)
            screen.blit(guide_txt, (WIDTH // 2 - guide_txt.get_width() // 2, 15))

            p1_label = f"P1: {CHARACTERS[p1_char_idx]['name']}" + (" (확정!)" if p1_ready else "")
            p2_label = f"P2: {CHARACTERS[p2_char_idx]['name']}" + (" (확정!)" if p2_ready else "")
            screen.blit(render_text_cached(font_small, p1_label, COLOR_RED), (20, 50))
            screen.blit(render_text_cached(font_small, p2_label, COLOR_BLUE), (WIDTH - 250, 50))

            for idx in range(1, len(player1.abilities)):
                skill = player1.abilities[idx]
                x_pos = 20 + (idx - 1) * 40
                if skill is None:
                    continue
                if idx == 3:
                    draw_ult_icon(screen, x_pos, 75, 32, player1.ult_gauge, "Ult", player1.color)
                else:
                    draw_skill_icon_with_clock(screen, x_pos, 75, 32, skill, f"S{idx+1}", player1.color)

            for idx in range(1, len(player2.abilities)):
                skill = player2.abilities[idx]
                x_pos = WIDTH - 160 + (idx - 1) * 40
                if skill is None:
                    continue
                if idx == 3:
                    draw_ult_icon(screen, x_pos, 75, 32, player2.ult_gauge, "Ult", player2.color)
                else:
                    draw_skill_icon_with_clock(screen, x_pos, 75, 32, skill, f"S{idx+1}", player2.color)

            # 간략 설명: P1은 화면 왼쪽에, P2는 화면 오른쪽에 세로로 나열
            desc_line_h = 20
            p1_desc_lines = [line.strip() for line in CHARACTERS[p1_char_idx]['desc'].split(",") if line.strip()]
            for i, line in enumerate(p1_desc_lines):
                line_surf = render_text_cached(font_small, line, COLOR_GRAY)
                screen.blit(line_surf, (20, 120 + i * desc_line_h))

            p2_desc_lines = [line.strip() for line in CHARACTERS[p2_char_idx]['desc'].split(",") if line.strip()]
            for i, line in enumerate(p2_desc_lines):
                line_surf = render_text_cached(font_small, line, COLOR_GRAY)
                screen.blit(line_surf, (WIDTH - 20 - line_surf.get_width(), 120 + i * desc_line_h))

        elif game_state == "VERSUS":
            # 대난투 스타일 VS 화면: 양쪽 캐릭터 초상화가 화면 좌우 밖에서 미끄러져 들어와 "/"로 마주선다
            screen.fill(COLOR_BG)

            portrait_size = 380
            gap = 80
            final_centery = HEIGHT // 2 - 90
            final_x1 = WIDTH // 2 - gap // 2 - portrait_size // 2
            final_x2 = WIDTH // 2 + gap // 2 + portrait_size // 2
            start_x1 = -portrait_size // 2
            start_x2 = WIDTH + portrait_size // 2

            slide_duration = 700   # 화면 밖에서 미끄러져 들어오는 데 걸리는 시간(ms)
            hold_duration = 900    # 마주선 채로 잠시 대기하는 시간(ms)
            total_duration = slide_duration + hold_duration

            elapsed_ms = pygame.time.get_ticks() - versus_start_time
            slide_t = min(1.0, elapsed_ms / slide_duration)
            eased_t = 1.0 - (1.0 - slide_t) ** 3  # ease-out: 빠르게 다가오다 부드럽게 멈춤

            box1 = pygame.Rect(0, 0, portrait_size, portrait_size)
            box1.center = (int(start_x1 + (final_x1 - start_x1) * eased_t), final_centery)
            box2 = pygame.Rect(0, 0, portrait_size, portrait_size)
            box2.center = (int(start_x2 + (final_x2 - start_x2) * eased_t), final_centery)

            p1_portrait = get_character_portrait(p1_char_idx, portrait_size)
            p2_portrait = get_character_portrait(p2_char_idx, portrait_size)

            pygame.draw.rect(screen, COLOR_RED, box1, border_radius=12)
            if p1_portrait is not None:
                screen.blit(p1_portrait, p1_portrait.get_rect(center=box1.center))
            pygame.draw.rect(screen, COLOR_WHITE, box1, 4, border_radius=12)

            pygame.draw.rect(screen, COLOR_BLUE, box2, border_radius=12)
            if p2_portrait is not None:
                screen.blit(p2_portrait, p2_portrait.get_rect(center=box2.center))
            pygame.draw.rect(screen, COLOR_WHITE, box2, 4, border_radius=12)

            # 슬래시와 이름표는 두 초상화가 거의 다 도착했을 때부터 서서히 나타난다
            if slide_t > 0.6:
                fade_alpha = int(255 * min(1.0, (slide_t - 0.6) / 0.4))

                slash_txt = render_text_cached(font_huge, "/", COLOR_GOLD).copy()
                slash_txt.set_alpha(fade_alpha)
                screen.blit(slash_txt, (WIDTH // 2 - slash_txt.get_width() // 2,
                                         final_centery - slash_txt.get_height() // 2))

                name1_txt = render_text_cached(font_large, CHARACTERS[p1_char_idx]['name'], COLOR_RED).copy()
                name1_txt.set_alpha(fade_alpha)
                screen.blit(name1_txt, (box1.centerx - name1_txt.get_width() // 2, box1.bottom + 12))

                name2_txt = render_text_cached(font_large, CHARACTERS[p2_char_idx]['name'], COLOR_BLUE).copy()
                name2_txt.set_alpha(fade_alpha)
                screen.blit(name2_txt, (box2.centerx - name2_txt.get_width() // 2, box2.bottom + 12))

            if elapsed_ms >= total_duration:
                game_state = "MAP_SELECT"

        elif game_state == "MAP_SELECT":
            screen.fill(COLOR_BG)

            current_map = get_map(selected_map_idx)

            title_txt = render_text_cached(font_large, "맵 선택", COLOR_WHITE)
            screen.blit(title_txt, (WIDTH // 2 - title_txt.get_width() // 2, 30))

            preview_scale = 0.6
            preview_rect = pygame.Rect(0, 0, int(WIDTH * preview_scale), int(HEIGHT * preview_scale))
            preview_rect.center = (WIDTH // 2, HEIGHT // 2)

            pygame.draw.rect(screen, current_map.get('bg_color', (10, 10, 14)), preview_rect)

            # build_hazards()/build_events()는 매번 새 오브젝트(용암 기포 배치, 서피스 등)를
            # 만들기 때문에 매 프레임 다시 부르면 낭비가 크다 - 선택한 맵이 바뀔 때만 새로 만든다
            if preview_cache['idx'] != selected_map_idx:
                preview_cache['idx'] = selected_map_idx
                hazard_preview_builder = current_map.get('build_hazards')
                event_preview_builder = current_map.get('build_events')
                preview_cache['hazards'] = hazard_preview_builder() if hazard_preview_builder else []
                preview_cache['events'] = event_preview_builder() if event_preview_builder else []

            for hazard_preview in preview_cache['hazards']:
                hazard_preview.draw_preview(screen, preview_rect, preview_scale)
            for event_preview in preview_cache['events']:
                event_preview.draw_preview(screen, preview_rect, preview_scale)

            for wall in current_map['build_walls']():
                mini_rect = pygame.Rect(
                    preview_rect.left + wall.rect.x * preview_scale,
                    preview_rect.top + wall.rect.y * preview_scale,
                    wall.rect.width * preview_scale,
                    wall.rect.height * preview_scale,
                )
                pygame.draw.rect(screen, wall.color, mini_rect)

            for pickup_preview in current_map['build_pickups']():
                mini_center = (int(preview_rect.left + pickup_preview.x * preview_scale),
                                int(preview_rect.top + pickup_preview.y * preview_scale))
                pygame.draw.circle(screen, pickup_preview.color, mini_center, max(3, int(pickup_preview.radius * preview_scale)))

            pygame.draw.rect(screen, COLOR_GOLD, preview_rect, 3)

            name_txt = render_text_cached(font_medium, current_map['name'], COLOR_GOLD)
            screen.blit(name_txt, (WIDTH // 2 - name_txt.get_width() // 2, preview_rect.bottom + 14))

            index_txt = render_text_cached(font_small, f"{selected_map_idx + 1} / {len(MAPS)}", COLOR_GRAY)
            screen.blit(index_txt, (WIDTH // 2 - index_txt.get_width() // 2, preview_rect.bottom + 46))

            hint_txt = render_text_cached(font_medium, "방향키(A/D): 맵 변경    SPACE / ENTER: 전투 시작", COLOR_WHITE)
            screen.blit(hint_txt, (WIDTH // 2 - hint_txt.get_width() // 2, preview_rect.top - 40))

        elif game_state == "BATTLE":
            keys = key_state

            player1.update(dt_sec, keys, attacks, player1.color, walls)
            player2.update(dt_sec, keys, attacks, player2.color, walls)

            for attack in attacks[:]:
                if hasattr(attack, 'dash_speed'):
                    attack.update(walls)
                else:
                    attack.update()

                target = player2 if attack.owner == player1 else player1

                if target not in attack.hit_players and attack.collides_with(target):
                    raw_dmg = attack.damage

                    # 방어력 계산은 take_damage 내부에서 처리하고, 그 결과값을 궁극기 충전에 재사용
                    final_damage = target.take_damage(raw_dmg)
                    attack.hit_players.append(target)

                    multiplier = getattr(attack.owner, 'ult_charge_multiplier', 1.0)
                    attack.owner.add_ult_gauge(final_damage * multiplier)

                    if hasattr(attack, 'apply_effect'):
                        attack.apply_effect(target)

                if attack.is_expired():
                    attacks.remove(attack)

            handle_attack_wall_collisions(attacks, walls)

            for pickup in pickups:
                pickup.update()
                if pickup.collides_with_player(player1):
                    pickup.collect(player1)
                elif pickup.collides_with_player(player2):
                    pickup.collect(player2)

            # 빙판 등 이동에 영향을 주는 지형은 매 프레임 새로 판정해야 하므로 기본값으로 되돌린다
            # (다음 프레임 이동 계산에서 읽힘 - hazards가 이번 프레임에 다시 덮어씌운다)
            player1.on_ice = False
            player1.ice_friction = 1.0
            player2.on_ice = False
            player2.ice_friction = 1.0

            for hazard in hazards:
                hazard.update(dt_sec)
                hazard.apply_damage((player1, player2), dt_sec)

            for map_event in map_events:
                map_event.update(dt_sec)
                map_event.apply_damage((player1, player2), dt_sec)

            if player1.hp <= 0 or player2.hp <= 0:
                game_state = "GAMEOVER"
                if player1.hp <= 0 and player2.hp <= 0:
                    winner_text = "DRAW!"
                elif player1.hp <= 0:
                    winner_text = "PLAYER 2 WINS!"
                else:
                    winner_text = "PLAYER 1 WINS!"

            # 배경 및 오브젝트 그리기
            screen.fill(battle_bg_color)

            for hazard in hazards:
                hazard.draw(screen)

            for map_event in map_events:
                map_event.draw(screen)

            for wall in walls:
                wall.draw(screen)

            for pickup in pickups:
                pickup.draw(screen)

            player1.draw(screen)
            player2.draw(screen)
            for attack in attacks:
                attack.draw(screen)

            # --- 플레이어 1 정보 및 상태 표시 ---
            p1_hp_txt = render_text_cached(font_small, f"P1 HP: {int(max(0, player1.hp))}/{int(player1.max_hp)}", player1.color)
            screen.blit(p1_hp_txt, (20, 15))

            p1_status_list = player1.get_status_text()
            for i, status_text in enumerate(p1_status_list):
                screen.blit(render_text_cached(font_small, status_text, (255, 255, 100)), (155, 15 + i * 20))

            for idx in range(1, len(player1.abilities)):
                skill = player1.abilities[idx]
                x_pos = 20 + (idx - 1) * 40
                if skill is None:
                    continue
                if idx == 3:
                    draw_ult_icon(screen, x_pos, 42, 32, player1.ult_gauge, "Ult", player1.color)
                else:
                    draw_skill_icon_with_clock(screen, x_pos, 42, 32, skill, f"S{idx+1}", player1.color)

            # --- 플레이어 2 정보 및 상태 표시 ---
            p2_hp_txt = render_text_cached(font_small, f"P2 HP: {int(max(0, player2.hp))}/{int(player2.max_hp)}", player2.color)
            screen.blit(p2_hp_txt, (WIDTH - 160, 15))

            p2_status_list = player2.get_status_text()
            for i, status_text in enumerate(p2_status_list):
                screen.blit(render_text_cached(font_small, status_text, (255, 255, 100)), (WIDTH - 270, 15 + i * 20))

            for idx in range(1, len(player2.abilities)):
                skill = player2.abilities[idx]
                x_pos = WIDTH - 160 + (idx - 1) * 40
                if skill is None:
                    continue
                if idx == 3:
                    draw_ult_icon(screen, x_pos, 42, 32, player2.ult_gauge, "Ult", player2.color)
                else:
                    draw_skill_icon_with_clock(screen, x_pos, 42, 32, skill, f"S{idx+1}", player2.color)

            # 이벤트 경고 배너 등, 다른 모든 요소 위에 그려야 하는 오버레이 (선택적 훅)
            for map_event in map_events:
                overlay_draw = getattr(map_event, 'draw_overlay', None)
                if overlay_draw:
                    overlay_draw(screen)

        elif game_state == "GAMEOVER":
            screen.fill(COLOR_BG)
            res_txt = render_text_cached(font_large, winner_text, COLOR_WHITE)
            restart_txt = render_text_cached(font_medium, "Press SPACE to Restart", COLOR_GRAY)

            screen.blit(res_txt, (WIDTH // 2 - res_txt.get_width() // 2, 260))
            screen.blit(restart_txt, (WIDTH // 2 - restart_txt.get_width() // 2, 340))

        # --- 레터박스: 1280x720으로 그린 화면을 비율 유지한 채 실제 화면에 맞게 옮긴다 ---
        real_screen.blit(pygame.transform.scale(screen, letterbox_size), letterbox_offset)
        pygame.display.flip()

        await asyncio.sleep(0)

    pygame.quit()


asyncio.run(main(pygame, sys, math, asyncio, Wall, move_entity_with_walls, handle_attack_wall_collisions,
                  CHARACTER_REGISTRY, get_character_data, update_status_effects, Player,
                  MAPS, get_map, Pickup, get_font, render_text_cached, screen, WIDTH, HEIGHT,
                  real_screen, REAL_WIDTH, REAL_HEIGHT))
sys.exit()

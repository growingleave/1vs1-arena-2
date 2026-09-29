import pygame
from utils import check_polygon_collision

class Wall:
    def __init__(self, x, y, width, height):
        self.rect = pygame.Rect(x, y, width, height)
        self.color = (100, 100, 100)

    def draw(self, surface):
        pygame.draw.rect(surface, self.color, self.rect)
        pygame.draw.rect(surface, (50, 50, 50), self.rect, 2)


def ghost(target, duration):
    target.status_effects['ghost'] = {'duration': duration}


def move_entity_with_walls(entity, total_dx, total_dy, walls):
    """
    엔티티를 이동시키되, 벽과의 충돌을 처리합니다.
    (1280x720 전장 비율 적용)
    """
    # pygame.Rect의 x/y는 정수라, 소수점이 있는 값을 그대로 += 하면 내부적으로
    # int()로 변환된다. 이 변환이 "버림(trunc)"인지 "반올림(round)"인지가
    # pygame/pygame-ce 버전·플랫폼마다 달라서(데스크탑 pygame 2.6.1은 반올림이지만
    # 웹 빌드의 pygame-ce 2.5.7은 다르게 동작해, 같은 코드인데도 음수 방향 이동이
    # 매 스텝 최대 거의 1픽셀씩 더 밀리는 문제가 있었다) round()로 명시적으로
    # 반올림해서 버전과 무관하게 항상 같은 결과가 나오게 한다.
    if getattr(entity, 'ignore_walls', False):
        entity.rect.x = round(entity.rect.x + total_dx)
        entity.rect.y = round(entity.rect.y + total_dy)
        entity.rect.clamp_ip(pygame.Rect(0, 0, 1280, 720))
        return

    steps = max(int(max(abs(total_dx), abs(total_dy))), 1)
    step_dx = total_dx / steps
    step_dy = total_dy / steps

    for _ in range(steps):
        entity.rect.x = round(entity.rect.x + step_dx)
        for wall in walls:
            if entity.rect.colliderect(wall.rect):
                if step_dx > 0:
                    entity.rect.right = wall.rect.left
                elif step_dx < 0:
                    entity.rect.left = wall.rect.right

        entity.rect.y = round(entity.rect.y + step_dy)
        for wall in walls:
            if entity.rect.colliderect(wall.rect):
                if step_dy > 0:
                    entity.rect.bottom = wall.rect.top
                elif step_dy < 0:
                    entity.rect.top = wall.rect.bottom
                    
    # 전장 전체 크기를 1280x720으로 제한
    entity.rect.clamp_ip(pygame.Rect(0, 0, 1280, 720))


def handle_attack_wall_collisions(attacks, walls):
    for attack in attacks:
        if getattr(attack, 'can_penetrate_walls', False):
            continue

        for wall in walls:
            if getattr(attack, 'is_dash', False):
                if hasattr(attack, 'owner') and attack.owner and attack.owner.rect.colliderect(wall.rect):
                    if hasattr(attack, 'start_time') and hasattr(attack, 'duration'):
                        attack.start_time = pygame.time.get_ticks() - attack.duration
                        break
            
            elif hasattr(attack, 'rect'):
                if attack.rect.colliderect(wall.rect):
                    if hasattr(attack, 'start_time') and hasattr(attack, 'duration'):
                        attack.start_time = pygame.time.get_ticks() - attack.duration
                        break

            elif hasattr(attack, 'get_polygon_points'):
                if check_polygon_collision(attack.get_polygon_points(), wall.rect):
                    if hasattr(attack, 'created_time') and hasattr(attack, 'lifespan'):
                        attack.created_time = pygame.time.get_ticks() - attack.lifespan
                        break
                    elif hasattr(attack, 'start_time') and hasattr(attack, 'duration'):
                        attack.start_time = pygame.time.get_ticks() - attack.duration
                        break
import os
import math
import pygame

# 캐릭터별 이미지(정방향/좌우반전/팻말 썸네일) 로드 결과를 경로 기준으로 캐싱.
# 매 프레임 로드/스케일/반전을 다시 하면 렉이 생기므로 최초 1회만 계산해서 재사용한다.
_CHARACTER_IMAGE_CACHE = {}


def _remove_opaque_background(surf):
    """누끼(배경 투명화)가 안 된 이미지를 위한 안전장치: 테두리에 닿아있는, 모서리 색과
    비슷한 영역만 배경으로 보고 지운다 (칠해진 배경만 지우고, 캐릭터 내부의 흰색 등은 보존)."""
    corner = surf.get_at((0, 0))
    if corner[3] < 20:
        return surf  # 이미 배경이 투명하게 되어 있음

    w, h = surf.get_size()
    threshold = 30

    def is_background(c):
        return (abs(c[0] - corner[0]) <= threshold and
                abs(c[1] - corner[1]) <= threshold and
                abs(c[2] - corner[2]) <= threshold)

    surf = surf.copy()
    visited = bytearray(w * h)
    stack = []
    for x in range(w):
        stack.append((x, 0))
        stack.append((x, h - 1))
    for y in range(h):
        stack.append((0, y))
        stack.append((w - 1, y))

    surf.lock()
    while stack:
        x, y = stack.pop()
        idx = y * w + x
        if visited[idx]:
            continue
        visited[idx] = 1
        c = surf.get_at((x, y))
        if not is_background(c):
            continue
        surf.set_at((x, y), (c[0], c[1], c[2], 0))
        if x > 0: stack.append((x - 1, y))
        if x < w - 1: stack.append((x + 1, y))
        if y > 0: stack.append((x, y - 1))
        if y < h - 1: stack.append((x, y + 1))
    surf.unlock()
    return surf


def _load_cropped_image(image_name):
    key = ('raw', image_name)
    if key not in _CHARACTER_IMAGE_CACHE:
        img_path = os.path.join(os.path.dirname(__file__), 'images', image_name)
        raw = pygame.image.load(img_path).convert_alpha()
        raw = _remove_opaque_background(raw)
        # 배경 제거 과정에서 남는 미세한 알파 잔여물 때문에 기본 임계값(1)으로는
        # 크롭이 안 되므로, 임계값을 높여 실제 그림이 있는 영역만 잡는다
        bbox = raw.get_bounding_rect(16)
        _CHARACTER_IMAGE_CACHE[key] = raw.subsurface(bbox).copy()
    return _CHARACTER_IMAGE_CACHE[key]


def get_character_sprite(image_name, size=44):
    """(정방향, 좌우반전) 캐릭터 이미지를 반환한다. 최초 1회만 만들고 이후엔 캐시에서 꺼내온다."""
    key = ('sprite', image_name, size)
    if key not in _CHARACTER_IMAGE_CACHE:
        cropped = _load_cropped_image(image_name)
        normal = pygame.transform.smoothscale(cropped, (size, size))
        flipped = pygame.transform.flip(normal, True, False)
        _CHARACTER_IMAGE_CACHE[key] = (normal, flipped)
    return _CHARACTER_IMAGE_CACHE[key]


def get_character_thumbnail(image_name, size=40):
    """캐릭터 선택 팻말용 썸네일 이미지를 반환한다 (최초 1회만 생성 후 캐싱)."""
    key = ('thumb', image_name, size)
    if key not in _CHARACTER_IMAGE_CACHE:
        cropped = _load_cropped_image(image_name)
        _CHARACTER_IMAGE_CACHE[key] = pygame.transform.smoothscale(cropped, (size, size))
    return _CHARACTER_IMAGE_CACHE[key]


def _project(points, axis_x, axis_y):
    dots = [p[0] * axis_x + p[1] * axis_y for p in points]
    return min(dots), max(dots)


def _sat_polygon_rect_overlap(polygon_points, rect):
    """분리축 정리(SAT)로 볼록 다각형과 사각형의 교차 여부를 판정한다.
    (기존 pygame.mask 기반 픽셀 판정과 달리 Surface/마스크를 만들지 않아 훨씬 가볍다.)"""
    rect_points = [
        (rect.left, rect.top), (rect.right, rect.top),
        (rect.right, rect.bottom), (rect.left, rect.bottom),
    ]

    # 사각형은 축이 두 개(수평/수직)뿐이라 그것부터 검사
    for axis_x, axis_y in ((1.0, 0.0), (0.0, 1.0)):
        min1, max1 = _project(polygon_points, axis_x, axis_y)
        min2, max2 = _project(rect_points, axis_x, axis_y)
        if max1 < min2 or max2 < min1:
            return False

    n = len(polygon_points)
    for i in range(n):
        x1, y1 = polygon_points[i]
        x2, y2 = polygon_points[(i + 1) % n]
        edge_x, edge_y = x2 - x1, y2 - y1
        length = math.hypot(edge_x, edge_y)
        if length == 0:
            continue
        axis_x, axis_y = -edge_y / length, edge_x / length

        min1, max1 = _project(polygon_points, axis_x, axis_y)
        min2, max2 = _project(rect_points, axis_x, axis_y)
        if max1 < min2 or max2 < min1:
            return False

    return True


def check_polygon_collision(polygon_points, target_rect):
    """다각형과 사각형의 정밀 충돌 판정"""
    if len(polygon_points) < 3:
        return False

    xs = [p[0] for p in polygon_points]
    ys = [p[1] for p in polygon_points]
    bounding_rect = pygame.Rect(min(xs), min(ys), max(xs) - min(xs), max(ys) - min(ys))

    if not bounding_rect.colliderect(target_rect):
        return False

    return _sat_polygon_rect_overlap(polygon_points, target_rect)

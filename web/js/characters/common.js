// 캐릭터들이 같이 쓰는 스킬 기본 틀과 그리기 도구

// 모든 스킬의 공통 부분: 쿨타임 확인
class Skill {
    constructor(name, cooldown, keywords, lastUsed = 0) {
        this.name = name;
        this.cooldown = cooldown;
        this.lastUsed = lastUsed;
        this.keywords = keywords;
    }

    canUse() {
        return Time.now - this.lastUsed >= this.cooldown;
    }
}

// 공격 판정이 상대를 맞힐 수 있는 상태인지 (무적/방어력 100이면 불가)
function canBeHit(attack, target) {
    return target !== attack.owner && !target.invincible && target.defense < 100.0;
}

function drawPolygon(ctx, points, fill, stroke, lineWidth) {
    if (points.length < 3) return;
    ctx.beginPath();
    ctx.moveTo(points[0][0], points[0][1]);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i][0], points[i][1]);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
}

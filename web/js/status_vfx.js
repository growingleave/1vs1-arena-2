// 상태이상·버프 이펙트 (화면 전용, 게임 결과와 무관). 모든 캐릭터 공통으로 player.draw에서 부른다
//   몸 아래: 속박(사슬 고리), 이동 불가(발밑 덩굴 고리), 슬로우(발밑 푸른 서리), 시간 지연(시계 고리), 속도 증가(바람 줄), 공격력 증가(붉은 기운)
//   몸 위:   화상(불꽃), 출혈(피 방울), 방어력 증가/무적(방패 막)
//   머리 위: 기절(도는 별), 침묵(말풍선 X), 혼란(도는 물음표)
// 그림은 코드로 아주 가볍게 (원·선 몇 개). 시간은 Time.now로 흔들기만 한다

function stvT() { return Time.now / 1000; }

// 맞을 때 걸리는 아주 짧은 슬로우(0.12초)는 그리지 않는다
function stvRealSlow(p) {
    const s = p.statusEffects.slow;
    return s && (s.total === undefined || s.total > 0.2);
}

function drawStatusUnder(ctx, p) {
    const e = p.statusEffects, r = p.rect, t = stvT();
    const cx = r.centerx, fy = r.bottom - 2; // 발밑
    ctx.save();
    // 공격력 증가: 발밑에서 위로 피어오르는 붉은 기운 + 위로 가는 화살표
    if (e.power_up) {
        ctx.globalCompositeOperation = 'lighter';
        const a = 0.35 + 0.15 * Math.sin(t * 6);
        ctx.fillStyle = `rgba(255, 90, 40, ${a * 0.5})`;
        ctx.beginPath(); ctx.ellipse(cx, fy, 30, 10, 0, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(255, 140, 60, ${a + 0.2})`; ctx.lineWidth = 2;
        for (let i = 0; i < 3; i++) {
            const ph = (t * 1.2 + i / 3) % 1, x = cx + (i - 1) * 16, y = fy - ph * 46;
            ctx.globalAlpha = 1 - ph;
            ctx.beginPath(); ctx.moveTo(x - 4, y + 4); ctx.lineTo(x, y); ctx.lineTo(x + 4, y + 4); ctx.moveTo(x, y); ctx.lineTo(x, y + 9); ctx.stroke();
        }
        ctx.globalAlpha = 1; ctx.globalCompositeOperation = 'source-over';
    }
    // 속도 증가: 발밑 하늘색 바람 줄이 뒤로 흐름
    if (e.speed_up) {
        ctx.strokeStyle = 'rgba(150, 240, 255, 0.95)'; ctx.lineWidth = 3; ctx.lineCap = 'round';
        const back = p.facing && p.facing[0] < 0 ? 1 : -1;
        for (let i = 0; i < 4; i++) {
            const ph = (t * 3 + i / 4) % 1, y = r.top + 6 + i * 10, x0 = cx + back * (16 + ph * 26);
            ctx.globalAlpha = 1 - ph;
            ctx.beginPath(); ctx.moveTo(x0, y); ctx.lineTo(x0 + back * 20, y); ctx.stroke();
        }
        ctx.globalAlpha = 1;
    }
    // 슬로우 / 이동 불가 (기절이면 별만)
    if (!p.stunned && stvRealSlow(p)) {
        if (e.slow.power >= 100) {
            // 이동 불가: 발밑 갈색 덩굴 고리 + 가시
            ctx.strokeStyle = 'rgba(150, 110, 60, 0.9)'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.ellipse(cx, fy, 26, 9, 0, 0, Math.PI * 2); ctx.stroke();
            ctx.strokeStyle = 'rgba(110, 200, 90, 0.85)'; ctx.lineWidth = 2;
            for (let i = 0; i < 6; i++) { const a = i * Math.PI / 3 + t * 0.5, x = cx + Math.cos(a) * 26, y = fy + Math.sin(a) * 9; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(a) * 3, y - 10); ctx.stroke(); }
        } else {
            // 슬로우: 발밑 푸른 서리 + 몸 위로 천천히 떨어지는 서리 조각
            ctx.fillStyle = 'rgba(120, 190, 255, 0.22)';
            ctx.beginPath(); ctx.ellipse(cx, fy, 26, 9, 0, 0, Math.PI * 2); ctx.fill();
            ctx.strokeStyle = 'rgba(160, 215, 255, 0.7)'; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.ellipse(cx, fy, 26, 9, 0, 0, Math.PI * 2); ctx.stroke();
        }
    }
    // 속박: 발밑 회색 사슬 고리 (작은 고리들이 천천히 돔)
    if (e.bind) {
        ctx.strokeStyle = 'rgba(200, 205, 215, 0.9)'; ctx.lineWidth = 2;
        for (let i = 0; i < 10; i++) {
            const a = i * Math.PI / 5 + t * 0.8, x = cx + Math.cos(a) * 28, y = fy - 4 + Math.sin(a) * 10;
            ctx.beginPath(); ctx.ellipse(x, y, 4, 2.5, a + (i % 2) * Math.PI / 2, 0, Math.PI * 2); ctx.stroke();
        }
    }
    // 시간 지연: 몸을 감싸는 금빛 시계 고리 + 천천히 도는 바늘
    if (e.time_slow) {
        const R = 32, cy = r.centery;
        ctx.strokeStyle = 'rgba(230, 200, 110, 0.6)'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, cy, R, 0, Math.PI * 2); ctx.stroke();
        for (let i = 0; i < 12; i++) { const a = i * Math.PI / 6; ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * (R - 4), cy + Math.sin(a) * (R - 4)); ctx.lineTo(cx + Math.cos(a) * R, cy + Math.sin(a) * R); ctx.stroke(); }
        const a = t * 0.8 - Math.PI / 2;
        ctx.strokeStyle = 'rgba(255, 225, 140, 0.8)'; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.moveTo(cx + Math.cos(a) * (R - 8), cy + Math.sin(a) * (R - 8)); ctx.lineTo(cx + Math.cos(a) * (R + 4), cy + Math.sin(a) * (R + 4)); ctx.stroke();
    }
    ctx.restore();
}

function drawStatusOver(ctx, p) {
    const e = p.statusEffects, r = p.rect, t = stvT(), cx = r.centerx;
    ctx.save();
    // 슬로우: 몸 위로 떨어지는 서리 조각
    if (!p.stunned && stvRealSlow(p) && e.slow.power < 100) {
        ctx.fillStyle = 'rgba(120, 190, 255, 0.16)'; ctx.fillRect(r.x, r.y, r.w, r.h); // 몸이 살짝 푸르게
        ctx.fillStyle = 'rgba(200, 235, 255, 0.9)';
        for (let i = 0; i < 4; i++) {
            const ph = (t * 0.7 + i * 0.25) % 1, x = r.x + 6 + ((i * 11 + 5) % 30), y = r.top + ph * r.h;
            ctx.globalAlpha = Math.sin(ph * Math.PI);
            ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
        }
        ctx.globalAlpha = 1;
    }
    // 화상: 몸에서 피어오르는 주황 불꽃
    if (e.burn) {
        ctx.globalCompositeOperation = 'lighter';
        ctx.fillStyle = 'rgba(255, 110, 30, 0.18)'; ctx.fillRect(r.x, r.y, r.w, r.h); // 몸이 붉게 달아오름
        for (let i = 0; i < 5; i++) {
            const ph = (t * 1.8 + i * 0.21) % 1, x = r.x + 4 + i * 8 + Math.sin(t * 7 + i) * 2, y = r.bottom - 4 - ph * 44, s = 10 * (1 - ph) + 3;
            ctx.fillStyle = `rgba(255, ${Math.trunc(110 + 110 * ph)}, 30, ${0.9 * (1 - ph)})`;
            ctx.beginPath(); ctx.moveTo(x, y - s * 1.6); ctx.quadraticCurveTo(x + s, y, x, y + s * 0.6); ctx.quadraticCurveTo(x - s, y, x, y - s * 1.6); ctx.fill();
        }
        ctx.globalCompositeOperation = 'source-over';
    }
    // 출혈(일반): 몸에서 떨어지는 피 방울
    if (e.bleed) {
        ctx.fillStyle = 'rgba(220, 20, 40, 0.95)';
        for (let i = 0; i < 4; i++) {
            const ph = (t * 1.3 + i / 4) % 1, x = r.x + 6 + i * 9, y = r.top + 8 + ph * 40, s = 3.5;
            ctx.globalAlpha = 1 - ph * ph;
            ctx.beginPath(); ctx.moveTo(x, y - s * 2); ctx.quadraticCurveTo(x + s, y, x, y + s); ctx.quadraticCurveTo(x - s, y, x, y - s * 2); ctx.fill();
        }
        ctx.globalAlpha = 1;
    }
    // 방어력 증가 / 무적: 몸을 감싸는 막 (무적은 금색)
    if (e.defense_mod) {
        const inv = p.defense >= 100, R = 30 + Math.sin(t * 5) * 1.5;
        const col = inv ? '255, 215, 90' : '110, 180, 255';
        ctx.fillStyle = `rgba(${col}, 0.10)`;
        ctx.beginPath(); ctx.arc(cx, r.centery, R, 0, Math.PI * 2); ctx.fill();
        ctx.strokeStyle = `rgba(${col}, 0.65)`; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(cx, r.centery, R, 0, Math.PI * 2); ctx.stroke();
        // 막 위를 도는 빛 한 줄
        const a = t * 3;
        ctx.strokeStyle = `rgba(255, 255, 255, 0.7)`; ctx.lineWidth = 2.5;
        ctx.beginPath(); ctx.arc(cx, r.centery, R, a, a + 0.7); ctx.stroke();
    }

    // ---------- 머리 위 아이콘 (체력바 위) ----------
    const hy = r.top - 24;
    if (p.stunned) {
        // 기절: 머리 위를 도는 노란 별 3개
        ctx.fillStyle = '#ffe14a'; ctx.strokeStyle = '#6a5000'; ctx.lineWidth = 1;
        for (let i = 0; i < 3; i++) {
            const a = t * 5 + i * Math.PI * 2 / 3, x = cx + Math.cos(a) * 18, y = hy + Math.sin(a) * 6;
            ctx.beginPath();
            for (let k = 0; k < 10; k++) { const rr = k % 2 ? 2.8 : 6.5, b = -Math.PI / 2 + k * Math.PI / 5; ctx.lineTo(x + Math.cos(b) * rr, y + Math.sin(b) * rr); }
            ctx.closePath(); ctx.fill(); ctx.stroke();
        }
    } else {
        const icons = [];
        if (e.silence) icons.push('silence');
        if (e.confuse) icons.push('confuse');
        icons.forEach((kind, i) => {
            const x = cx + (i - (icons.length - 1) / 2) * 22, y = hy + Math.sin(t * 4 + i) * 1.5;
            if (kind === 'silence') {
                // 침묵: 보라 말풍선에 X
                ctx.fillStyle = 'rgba(40, 20, 60, 0.85)'; ctx.strokeStyle = '#c08cff'; ctx.lineWidth = 2;
                ctx.beginPath(); ctx.roundRect(x - 9, y - 7, 18, 13, 4); ctx.fill(); ctx.stroke();
                ctx.beginPath(); ctx.moveTo(x - 2, y + 6); ctx.lineTo(x - 5, y + 10); ctx.lineTo(x + 2, y + 6); ctx.fill();
                ctx.strokeStyle = '#ff6a8a'; ctx.beginPath(); ctx.moveTo(x - 4, y - 3); ctx.lineTo(x + 4, y + 3); ctx.moveTo(x + 4, y - 3); ctx.lineTo(x - 4, y + 3); ctx.stroke();
            } else {
                // 혼란: 도는 분홍 물음표 2개
                for (let k = 0; k < 2; k++) {
                    const a = t * 3 + k * Math.PI, qx = x + Math.cos(a) * 9, qy = y + Math.sin(a) * 3;
                    drawText(ctx, '?', qx, qy, 15, '#ff8ad8', { bold: true, align: 'center', baseline: 'middle' });
                }
            }
        });
    }
    ctx.restore();
}

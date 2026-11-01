// 효과음 합성 (미리 구워두는 용도). 노이즈 + 필터 + 사인파를 섞어 .wav(44.1kHz, 16bit, 모노)로 저장한다.
// 실행: node tools/sfx_gen.js <저장할 폴더>
const fs = require('fs');
const path = require('path');
const OUT = process.argv[2] || __dirname;
const SR = 44100;

// ---------- 도구 ----------
let seed = 1106;
const rnd = () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const noise = () => rnd() * 2 - 1;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const expLerp = (a, b, t) => a * Math.pow(b / a, t); // 주파수는 지수로 바꿔야 자연스럽다

// 이중 2차 필터 (RBJ). 주파수를 샘플마다 바꿀 수 있다
function biquad(type) {
    let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
    return (x, freq, q = 1) => {
        const w = 2 * Math.PI * clamp(freq, 20, SR * 0.45) / SR;
        const cos = Math.cos(w), alpha = Math.sin(w) / (2 * q);
        let b0, b1, b2;
        if (type === 'lp') { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2; }
        else if (type === 'hp') { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2; }
        else { b0 = alpha; b1 = 0; b2 = -alpha; } // 'bp'
        const a0 = 1 + alpha, a1 = -2 * cos, a2 = 1 - alpha;
        const y = (b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
        x2 = x1; x1 = x; y2 = y1; y1 = y;
        return y;
    };
}

// 소리 하나 만들기: fn(t, i) → 샘플 (-1~1)
function render(seconds, fn) {
    const n = Math.round(seconds * SR);
    const buf = new Float32Array(n);
    for (let i = 0; i < n; i++) buf[i] = fn(i / SR, i);
    return buf;
}

// 끝을 살짝 줄이고 최대 크기를 맞춘다 (뚝 끊기는 소리 방지)
function finish(buf, peak = 0.9) {
    let m = 0;
    for (const v of buf) m = Math.max(m, Math.abs(v));
    const k = m > 0 ? peak / m : 1;
    const fade = Math.min(buf.length, Math.round(0.01 * SR));
    for (let i = 0; i < buf.length; i++) {
        buf[i] *= k;
        if (i > buf.length - fade) buf[i] *= (buf.length - i) / fade;
    }
    return buf;
}

// 여러 소리를 시각(초)에 맞춰 겹치기
function mix(seconds, parts) {
    const out = new Float32Array(Math.round(seconds * SR));
    for (const [at, buf, gain = 1] of parts) {
        const off = Math.round(at * SR);
        for (let i = 0; i < buf.length && off + i < out.length; i++) out[off + i] += buf[i] * gain;
    }
    return out;
}

function saveWav(name, buf) {
    const data = Buffer.alloc(buf.length * 2);
    for (let i = 0; i < buf.length; i++) data.writeInt16LE(Math.round(clamp(buf[i], -1, 1) * 32767), i * 2);
    const h = Buffer.alloc(44);
    h.write('RIFF', 0); h.writeUInt32LE(36 + data.length, 4); h.write('WAVE', 8);
    h.write('fmt ', 12); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
    h.writeUInt32LE(SR, 24); h.writeUInt32LE(SR * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34);
    h.write('data', 36); h.writeUInt32LE(data.length, 40);
    fs.writeFileSync(path.join(OUT, name), Buffer.concat([h, data]));
}

// 주파수가 바뀌는 사인파: 위상을 누적해야 음높이가 정확하다 (sin(2πf(t)t)로 쓰면 두 배로 뛴다)
function osc() {
    let phase = 0;
    return (freq) => { phase += 2 * Math.PI * freq / SR; return Math.sin(phase); };
}

// 빠르게 커졌다가 지수로 줄어드는 크기
const env = (t, attack, decay) => t < attack ? t / attack : Math.exp(-(t - attack) / decay);

// ---------- 소리들 ----------

// 휙: 대역 통과 노이즈의 중심 주파수가 높→낮으로 쓸려 내려간다 (칼이 공기를 가름)
function swoosh(len, fHi, fLo, q, attack) {
    const bp = biquad('bp'), bp2 = biquad('bp');
    return finish(render(len, (t) => {
        const u = t / len;
        const f = expLerp(fHi, fLo, Math.pow(u, 0.7));
        const a = u < attack ? Math.sin(u / attack * Math.PI / 2) : Math.pow(1 - (u - attack) / (1 - attack), 2);
        const n = noise();
        return (bp(n, f, q) * 0.7 + bp2(n, f * 1.9, q * 1.5) * 0.3) * a;
    }));
}

// 쇳소리 울림: 배음이 정수배가 아닌 사인파 여러 개 (금속 느낌)
function ring(len, base, decay, partials = [1, 1.51, 2.37, 3.11, 4.2]) {
    return render(len, (t) => {
        let s = 0;
        partials.forEach((p, i) => { s += Math.sin(2 * Math.PI * base * p * t + i) * Math.exp(-t / (decay / (1 + i * 0.4))) / (1 + i * 0.6); });
        return s;
    });
}

// 지지직: 짧게 끊기는 노이즈 조각 (글리치)
function crackle(len, density, fLo, fHi) {
    const hp = biquad('hp');
    let on = 0, hold = 0, amp = 0;
    return render(len, (t) => {
        if (hold <= 0) { on = rnd() < density ? 1 : 0; hold = Math.round(R(0.004, 0.02) * SR); amp = R(0.3, 1); }
        hold--;
        const u = t / len;
        return hp(noise(), lerp(fLo, fHi, rnd())) * on * amp * (1 - u);
    });
}
function R(a, b) { return a + (b - a) * rnd(); }

// 1) 평타 휙
const slash = swoosh(0.2, 5200, 900, 2.2, 0.25);

// 2) 검기 쉭: 휙 + 높은 바람 휘파람이 내려가며 멀어짐
const wave = (() => {
    const base = swoosh(0.34, 6500, 1500, 3, 0.12);
    const o = osc();
    const whistle = render(0.34, (t) => o(expLerp(2600, 1400, t / 0.34)) * env(t, 0.01, 0.12) * 0.35);
    return finish(mix(0.34, [[0, base], [0, whistle]]));
})();

// 3) 돌진: 낮고 굵은 바람 소리
const dash = (() => {
    const lp = biquad('lp');
    const low = render(0.3, (t) => lp(noise(), expLerp(1800, 300, t / 0.3), 0.8) * env(t, 0.02, 0.1));
    return finish(mix(0.3, [[0, swoosh(0.3, 3000, 500, 1.4, 0.15)], [0, low, 0.8]]));
})();

// 4) 궁극기 선딜: 올라가는 울림 + 반짝이는 노이즈 (기 모으기)
const charge = (() => {
    const bp = biquad('bp');
    const len = 0.6, o1 = osc(), o2 = osc();
    return finish(render(len, (t) => {
        const u = t / len;
        const f = expLerp(180, 720, u);
        const tone = o1(f) * 0.4 + o2(f * 2.01) * 0.2;
        const shimmer = bp(noise(), expLerp(2000, 7000, u), 6) * 0.6;
        return (tone + shimmer) * Math.pow(u, 1.5) * (u > 0.92 ? (1 - u) / 0.08 : 1);
    }), 0.6);
})();

// 5) 궁극기 돌진: 날카롭게 짧은 휙 + 지지직
const ultDash = finish(mix(0.36, [[0, swoosh(0.3, 8000, 1200, 2.5, 0.08)], [0, crackle(0.36, 0.35, 3000, 9000), 0.35]]));

// 6) 납도: 칼날이 칼집을 스치는 쇳소리(점점 빨라짐) → 찰칵
const sheath = (() => {
    const bp = biquad('bp');
    const scrapeLen = 0.48;
    const scrape = render(scrapeLen, (t) => {
        const u = t / scrapeLen;
        return bp(noise(), expLerp(3500, 6000, u), 8) * Math.pow(u, 0.6) * 0.5;
    });
    const click = render(0.2, (t) => (noise() * Math.exp(-t / 0.003) * 0.8));
    const clickRing = ring(0.25, 2100, 0.05);
    return finish(mix(0.75, [[0, scrape], [scrapeLen, click], [scrapeLen, clickRing, 0.6]]));
})();

// 7) 궁극기 참격 한 번 (빠바박 중 하나): 짧은 베기 + 쇳소리 + 둔탁한 타격
const ultHit = (() => {
    const hp = biquad('hp'), lp = biquad('lp');
    const cut = render(0.12, (t) => hp(noise(), 3000, 0.7) * env(t, 0.002, 0.03));
    const o = osc();
    const thump = render(0.12, (t) => (o(expLerp(160, 60, t / 0.12)) + lp(noise(), 400) * 0.5) * env(t, 0.002, 0.04));
    return finish(mix(0.2, [[0, cut], [0, ring(0.12, 2900, 0.02), 0.3], [0, thump, 0.9]]));
})();

// 8) 지나온 길이 베이는 순간: 낮은 쿵 + 쫙 찢어지는 노이즈 + 지지직
const cutBurst = (() => {
    const lp = biquad('lp'), bp = biquad('bp');
    const o = osc();
    const boom = render(0.6, (t) => (o(expLerp(110, 40, t / 0.6)) + lp(noise(), 300) * 0.6) * env(t, 0.003, 0.18));
    const tear = render(0.45, (t) => bp(noise(), expLerp(9000, 1500, t / 0.45), 1.2) * env(t, 0.004, 0.12));
    return finish(mix(0.7, [[0, boom], [0, tear, 0.9], [0.02, crackle(0.5, 0.4, 2000, 8000), 0.4]]));
})();

const sounds = {
    sfx_slash: slash, sfx_wave: wave, sfx_dash: dash,
    sfx_ult_charge: charge, sfx_ult_dash: ultDash, sfx_sheath: sheath, sfx_ult_hit: ultHit, sfx_ult_cut: cutBurst,
};
for (const [name, buf] of Object.entries(sounds)) saveWav(`${name}.wav`, buf);

// 들어보기용: 검사 평타 → 검기 → 돌진, 그리고 궁극기 전체 흐름 (게임과 같은 시각)
const demo = mix(1.6, [[0, slash], [0.5, wave], [1.0, dash]]);
saveWav('demo_swordman_skills.wav', demo);
const ult = [[0, charge], [0.6, ultDash], [0.95, sheath, 0.9], [1.55, cutBurst, 0.9]];
for (let i = 0; i < 9; i++) ult.push([1.55 + i * 0.06, ultHit, 0.75]);
saveWav('demo_swordman_ult.wav', finish(mix(2.5, ult)));
console.log('saved to', OUT);

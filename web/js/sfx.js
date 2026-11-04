// 효과음 (화면 효과처럼 결과와 무관). 파일 없이 처음 한 번 합성해 두고(OfflineAudioContext) 재생만 한다.
// - 브라우저는 사용자가 키를 누르기 전엔 소리를 막으므로, 첫 키 입력 때 오디오를 깨운다.
// - 같은 소리가 너무 촘촘히(25ms 안) 겹치면 건너뛴다 (온라인에서 밀린 틱을 한꺼번에 따라잡을 때 소리가 몰리지 않게).
// - 동시에 나는 소리는 최대 12개.
//
// 소리 파일: tools/sfx_src/에 원본을 넣고 tools/sfx_build.sh → web/js/sfx_data.js (SFX_FILES, base64 ogg)
// 합성 소리: SFX_RECIPES에 이름: [길이(초), (ctx, out) => { 노드 연결 }]. 같은 이름이면 파일이 우선
// 재생: Sfx.play('이름', { volume, rate })

const SFX_RATE = 22050;     // 합성 샘플레이트 (효과음엔 충분, 가볍게)
const SFX_MASTER = 0.15; // 효과음 전체 크기 (피격 소리 hit.ogg는 따로라 영향 없음)

// 백색 소음 버퍼
function sfxNoise(ctx, sec) {
    const buf = ctx.createBuffer(1, Math.ceil(sec * ctx.sampleRate), ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return buf;
}

// 소음 → 필터 → 음량 곡선. freqs/gains: [[시각, 값], ...]
function sfxNoiseLayer(ctx, out, { sec, type = 'bandpass', q = 1, freqs, gains, start = 0 }) {
    const src = ctx.createBufferSource(); src.buffer = sfxNoise(ctx, sec);
    const f = ctx.createBiquadFilter(); f.type = type; f.Q.value = q;
    f.frequency.setValueAtTime(freqs[0][1], start + freqs[0][0]);
    for (const [t, v] of freqs.slice(1)) f.frequency.exponentialRampToValueAtTime(v, start + t);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, start);
    for (const [t, v] of gains) g.gain.exponentialRampToValueAtTime(Math.max(0.0001, v), start + t);
    src.connect(f); f.connect(g); g.connect(out);
    src.start(start);
}

// 금속성 울림: 여러 배음(정수배가 아님)이 각자 다른 속도로 줄어듦
function sfxRing(ctx, out, { partials, start = 0, gain = 0.3 }) {
    for (const [freq, amp, decay] of partials) {
        const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, start);
        g.gain.exponentialRampToValueAtTime(gain * amp, start + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0001, start + decay);
        o.connect(g); g.connect(out);
        o.start(start); o.stop(start + decay + 0.02);
    }
}

// 칼 베는 소리: 높은 쪽에서 내려가는 '쉭' + 짧은 '싱' 금속음
function sfxSlash(ctx, out, { len = 0.18, hi = 6000, lo = 1500, ring = 0.1, pitch = 1 } = {}) {
    sfxNoiseLayer(ctx, out, { sec: len + 0.05, q: 1.3, freqs: [[0, hi * pitch], [len * 0.8, lo * pitch]], gains: [[0.008, 0.9], [len, 0.001]] });
    sfxRing(ctx, out, { start: 0.008, gain: ring, partials: [[3200 * pitch, 1, len * 0.7], [4750 * pitch, 0.6, len * 0.5]] });
}

// 바람 소리: 소음이 낮→높→낮으로 쓸리며 부풀었다 사라짐
function sfxWind(ctx, out, { len = 0.34, peak = 2200, vol = 0.8, start = 0 } = {}) {
    sfxNoiseLayer(ctx, out, { sec: len + 0.05, q: 0.8, start, freqs: [[0, 380], [len * 0.35, peak], [len, 700]], gains: [[len * 0.25, vol], [len, 0.001]] });
    sfxNoiseLayer(ctx, out, { sec: len + 0.05, type: 'lowpass', q: 0.5, start, freqs: [[0, 600], [len, 300]], gains: [[len * 0.3, vol * 0.35], [len, 0.001]] });
}

const SFX_RECIPES = {
    // 검사
    sw_slash: [0.25, (ctx, out) => sfxSlash(ctx, out)],
    sw_slash_fast: [0.15, (ctx, out) => sfxSlash(ctx, out, { len: 0.11, hi: 7200, lo: 2400, ring: 0.08 })],
    sw_dash: [0.4, (ctx, out) => sfxWind(ctx, out)],
    // 검기 발사: 바람 + 아래로 떨어지는 '부웅' 음 + 반짝이는 높은 소음
    sw_wave: [0.45, (ctx, out) => {
        sfxWind(ctx, out, { len: 0.3, peak: 2600, vol: 0.6 });
        const o = ctx.createOscillator(); o.type = 'sawtooth';
        o.frequency.setValueAtTime(1400, 0); o.frequency.exponentialRampToValueAtTime(330, 0.32);
        const lp = ctx.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1800;
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(0.22, 0.02); g.gain.exponentialRampToValueAtTime(0.0001, 0.36);
        o.connect(lp); lp.connect(g); g.connect(out); o.start(0); o.stop(0.4);
        sfxNoiseLayer(ctx, out, { sec: 0.3, type: 'highpass', q: 0.7, freqs: [[0, 6000], [0.25, 8000]], gains: [[0.02, 0.25], [0.25, 0.001]] });
    }],
    // 궁극기 돌진: 더 굵은 바람 + 낮은 울림
    sw_ult_dash: [0.6, (ctx, out) => {
        sfxWind(ctx, out, { len: 0.5, peak: 1800, vol: 0.9 });
        sfxWind(ctx, out, { len: 0.42, peak: 3200, vol: 0.45, start: 0.04 });
        const o = ctx.createOscillator(); o.frequency.setValueAtTime(110, 0); o.frequency.exponentialRampToValueAtTime(55, 0.45);
        const g = ctx.createGain(); g.gain.setValueAtTime(0.0001, 0); g.gain.exponentialRampToValueAtTime(0.35, 0.05); g.gain.exponentialRampToValueAtTime(0.0001, 0.5);
        o.connect(g); g.connect(out); o.start(0); o.stop(0.55);
    }],
    // 납도 '챙!': 짧은 딸깍 + 길게 울리는 금속음
    sw_clang: [1.0, (ctx, out) => {
        sfxNoiseLayer(ctx, out, { sec: 0.05, type: 'highpass', q: 0.7, freqs: [[0, 3000], [0.03, 5000]], gains: [[0.002, 0.8], [0.03, 0.001]] });
        sfxRing(ctx, out, { start: 0.004, gain: 0.32, partials: [[1520, 1, 0.9], [2290, 0.75, 0.7], [3410, 0.55, 0.5], [4860, 0.35, 0.35], [6230, 0.2, 0.22]] });
        sfxRing(ctx, out, { start: 0.06, gain: 0.12, partials: [[2010, 1, 0.25], [3900, 0.6, 0.18]] }); // 칼집에 걸리는 두 번째 딸깍
    }],
};

const Sfx = {
    ctx: null,
    master: null,
    buffers: {},
    lastPlay: {},
    playing: 0,

    init() {
        const AC = window.AudioContext || window.webkitAudioContext;
        const OAC = window.OfflineAudioContext || window.webkitOfflineAudioContext;
        if (!AC || !OAC) return;
        try {
            this.ctx = new AC();
            // 소리 → 리미터(겹쳐도 찢어지지 않게) → 전체 크기 → 스피커
            // 전체 크기는 반드시 리미터 뒤에 둔다. 앞에 두면 리미터가 줄여 놓은 만큼 다시 키워서 크기가 안 줄어든다
            const limiter = this.ctx.createDynamicsCompressor();
            limiter.threshold.value = -8; limiter.knee.value = 6; limiter.ratio.value = 12;
            limiter.attack.value = 0.003; limiter.release.value = 0.15;
            this.input = limiter;
            this.master = this.ctx.createGain();
            this.master.gain.value = SFX_MASTER;
            limiter.connect(this.master);
            this.master.connect(this.ctx.destination);
        } catch (e) { this.ctx = null; return; }
        // 브라우저가 막아 둔 오디오를 첫 입력 때 깨운다
        const wake = () => { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); };
        window.addEventListener('keydown', wake, true);
        window.addEventListener('pointerdown', wake, true);
        // 소리 파일 풀기 (비동기, 끝난 것부터 쓸 수 있음)
        const files = typeof SFX_FILES !== 'undefined' ? SFX_FILES : {};
        for (const [name, b64] of Object.entries(files)) {
            try {
                const bin = atob(b64), bytes = new Uint8Array(bin.length);
                for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                this.ctx.decodeAudioData(bytes.buffer).then((buf) => { this.buffers[name] = buf; }).catch(() => {});
            } catch (e) { /* 무시 */ }
        }
        // 합성 소리 미리 만들기 (파일이 있는 이름은 건너뜀)
        for (const [name, [sec, build]] of Object.entries(SFX_RECIPES)) {
            if (files[name]) continue;
            try {
                const off = new OAC(1, Math.ceil(sec * SFX_RATE), SFX_RATE);
                build(off, off.destination);
                off.startRendering().then((buf) => { this.buffers[name] = buf; }).catch(() => {});
            } catch (e) { /* 소리가 없어도 게임은 돌아가야 한다 */ }
        }
    },

    // volume: 0~1, rate: 재생 속도(음 높이)
    play(name, { volume = 1, rate = 1 } = {}) {
        const buf = this.buffers[name];
        if (!buf || !this.ctx || this.ctx.state !== 'running') return;
        const now = performance.now();
        if (now - (this.lastPlay[name] || 0) < 25 || this.playing >= 12) return;
        this.lastPlay[name] = now;
        try {
            const src = this.ctx.createBufferSource();
            src.buffer = buf;
            src.playbackRate.value = rate;
            const g = this.ctx.createGain();
            g.gain.value = volume;
            src.connect(g); g.connect(this.input);
            this.playing++;
            src.onended = () => { this.playing--; };
            src.start();
        } catch (e) { /* 무시 */ }
    },
};
Sfx.init();

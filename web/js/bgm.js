// 배경음악: assets/bgm.ogg 를 계속 반복 재생 (화면 효과처럼 결과와 무관)
// - 브라우저는 키를 누르기 전엔 소리를 막으므로 첫 입력 때 시작
// - M 키로 끄기/켜기 (기기마다 따로 기억)
// - 오디오 태그로 재생해서 index.html을 파일로 직접 열어도 된다
const BGM_VOLUME = 0.35;

const Bgm = {
    el: null,
    muted: false,
    init() {
        try { this.muted = localStorage.getItem('bgmMuted') === '1'; } catch (e) { /* 저장 못 해도 괜찮음 */ }
        try {
            const a = new Audio('assets/bgm.ogg');
            a.loop = true;
            a.volume = BGM_VOLUME;
            a.preload = 'auto';
            this.el = a;
        } catch (e) { return; }
        const start = () => { if (!this.muted && this.el && this.el.paused) this.el.play().catch(() => {}); };
        window.addEventListener('keydown', (e) => {
            if (e.code === 'KeyM' && !isTypingTarget(e) && !e.repeat) { this.toggle(); return; }
            start();
        }, true);
        window.addEventListener('pointerdown', start, true);
    },
    toggle() {
        this.muted = !this.muted;
        try { localStorage.setItem('bgmMuted', this.muted ? '1' : '0'); } catch (e) { /* 무시 */ }
        if (!this.el) return;
        if (this.muted) this.el.pause();
        else this.el.play().catch(() => {});
    },
};

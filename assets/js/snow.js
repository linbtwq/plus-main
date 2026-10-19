const canvas = document.getElementById('snow-canvas');
if (canvas) {
    const ctx = canvas.getContext('2d');
    let W, H;
    let flakes = [];
    const mouse = { x: -1000, y: -1000, vx: 0, prevX: -1000 };

    function resize() {
        W = canvas.width = window.innerWidth;
        H = canvas.height = window.innerHeight;
    }
    resize();
    window.addEventListener('resize', resize);

    function handlePointer(x, y) {
        mouse.vx = (x - mouse.prevX) * 0.05;
        if (Math.abs(mouse.vx) > 8) mouse.vx = Math.sign(mouse.vx) * 8;
        mouse.prevX = x;
        mouse.x = x;
        mouse.y = y;
    }

    window.addEventListener('mousemove', (e) => handlePointer(e.clientX, e.clientY));
    window.addEventListener('touchmove', (e) => {
        if (e.touches.length > 0) {
            const t = e.touches[0];
            handlePointer(t.clientX, t.clientY);
        }
    }, { passive: true });

    class Flake {
        constructor() { this.reset(true); }
        reset(initial = false) {
            this.x = Math.random() * W;
            this.y = initial ? Math.random() * H : -15;
            this.layer = Math.random();
            this.r = this.layer * 2.6 + 0.7;
            this.speed = this.layer * 1.4 + 0.5;
            this.baseDrift = (Math.random() - 0.5) * 0.4;
            this.opacity = this.layer * 0.55 + 0.25;
            this.wobble = Math.random() * Math.PI * 2;
            this.wobbleSpeed = Math.random() * 0.02 + 0.01;
            this.glow = this.layer > 0.7;
            this.isGold = Math.random() < 0.2;
        }
        update() {
            this.wobble += this.wobbleSpeed;
            const dx = this.x - mouse.x;
            const dy = this.y - mouse.y;
            const dist = Math.sqrt(dx * dx + dy * dy);
            let windPush = 0;
            if (dist < 180) {
                const force = (1 - dist / 180) * 2;
                windPush = (dx > 0 ? 1 : -1) * force + mouse.vx;
            }
            this.x += this.baseDrift + Math.sin(this.wobble) * 0.35 + windPush;
            this.y += this.speed;
            if (this.y > H + 15 || this.x < -20 || this.x > W + 20) this.reset();
        }
        draw() {
            ctx.beginPath();
            ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
            if (this.isGold) {
                ctx.fillStyle = `rgba(238, 191, 69, ${this.opacity + 0.2})`;
                ctx.shadowBlur = this.glow ? 10 : 0;
                ctx.shadowColor = 'rgba(238, 191, 69, 0.8)';
            } else {
                ctx.fillStyle = `rgba(255, 252, 240, ${this.opacity})`;
                ctx.shadowBlur = this.glow ? 7 : 0;
                ctx.shadowColor = 'rgba(255, 245, 220, 0.9)';
            }
            ctx.fill();
        }
    }
    const count = Math.min(110, Math.floor(window.innerWidth / 14));
    for (let i = 0; i < count; i++) flakes.push(new Flake());

    function loop() {
        ctx.clearRect(0, 0, W, H);
        for (const f of flakes) { f.update(); f.draw(); }
        requestAnimationFrame(loop);
    }
    loop();
}
// Circle reveal for the #reveal, it's really cool :D
(function() {
    const reveal  = document.getElementById("reveal");
    const welcome = document.getElementById("welcome");
    if (!reveal && !welcome) return;

    const targets = [reveal, welcome].filter(Boolean);

    const setOrigin = (e) => {
        for (const el of targets) {
            const r = el.getBoundingClientRect();
            const x = Math.max(0, Math.min(r.width,  e.clientX - r.left));
            const y = Math.max(0, Math.min(r.height, e.clientY - r.top));
            el.style.setProperty("--reveal-x", `${x}px`);
            el.style.setProperty("--reveal-y", `${y}px`);
        }
    };

    document.addEventListener("pointermove", setOrigin, true);
    document.addEventListener("pointerdown", setOrigin, true);
})();
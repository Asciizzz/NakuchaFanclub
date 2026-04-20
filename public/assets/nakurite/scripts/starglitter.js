(function() {
    const container = document.getElementById("starglitter");
    if (!container) return;

    const rainbowColors = [];
    for (let i = 0; i < 360; i += 10) {
        rainbowColors.push(`hsl(${i}, 100%, 60%)`);
    }

    const STARGLITTER_CONFIG = {
        src: "/assets/nakurite/images/starglitter.png",
        colors: rainbowColors,
        spawnInterval: { min: 30, max: 80 },
        maxCount: 70,
        lifetime: { min: 900, max: 1700 },
        size: { min: 20, max: 60 },
        cols: [5],
        interval: { min: 120, max: 180 },
    };

    const stars = new Set();
    let rafId = 0;
    let spawnTimer = 0;

    function randomRange(min, max) {
        return min + Math.random() * (max - min);
    }

    function randomInt(min, max) {
        return Math.floor(randomRange(min, max + 1));
    }

    function randomFrom(list) {
        return list[Math.floor(Math.random() * list.length)];
    }

    function scheduleSpawn() {
        clearTimeout(spawnTimer);
        const delay = randomRange(STARGLITTER_CONFIG.spawnInterval.min, STARGLITTER_CONFIG.spawnInterval.max);
        spawnTimer = window.setTimeout(() => {
            spawnStar();
            scheduleSpawn();
        }, delay);
    }

    function spawnStar() {
        const rect = container.getBoundingClientRect();
        if (!rect.width || !rect.height) return;

        if (stars.size >= STARGLITTER_CONFIG.maxCount) {
            return;
        }

        const star = document.createElement("div");
        star.className = "star";

        const size = randomRange(STARGLITTER_CONFIG.size.min, STARGLITTER_CONFIG.size.max);
        const life = randomRange(STARGLITTER_CONFIG.lifetime.min, STARGLITTER_CONFIG.lifetime.max);
        const cols = randomFrom(STARGLITTER_CONFIG.cols);
        const frameCount = Math.max(1, cols);
        const tint = randomFrom(STARGLITTER_CONFIG.colors);

        star.style.width = `${size}px`;
        star.style.height = `${size}px`;
        star.style.left = `${randomRange(0, Math.max(0, rect.width - size))}px`;
        star.style.top = `${randomRange(0, Math.max(0, rect.height - size))}px`;

        star.dataset.animeSrc = STARGLITTER_CONFIG.src;
        star.dataset.animeRows = "1";
        star.dataset.animeCols = String(cols);
        star.dataset.animeInterval = String(randomInt(STARGLITTER_CONFIG.interval.min, STARGLITTER_CONFIG.interval.max));
        star.dataset.animeOffset = String(randomInt(1, frameCount));
        star.dataset.animeTintfill = tint;

        const bornAt = performance.now();
        const state = { node: star, bornAt, life };

        stars.add(state);
        container.appendChild(star);
        ensureAnimating();
    }

    function ensureAnimating() {
        if (rafId) return;
        rafId = requestAnimationFrame(tick);
    }

    function removeStar(state) {
        stars.delete(state);
        state.node.remove();
    }

    function tick(now) {
        stars.forEach((state) => {
            const age = now - state.bornAt;
            const t = Math.max(0, Math.min(1, age / state.life));
            const opacity = t < 0.5 ? t / 0.5 : (1 - t) / 0.5;
            state.node.style.opacity = String(opacity);

            if (t >= 1) {
                removeStar(state);
            }
        });

        if (!stars.size) {
            rafId = 0;
            return;
        }

        rafId = requestAnimationFrame(tick);
    }

    scheduleSpawn();
})();

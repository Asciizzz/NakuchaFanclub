const elements = [
    { queries: ["body"], cfg: {
        size: { min: 10, max: 20 },
        speed: { min: 20, max: 40 },
        lifetime: { min: 200, max: 600 },
        opacity: { min: 0.3, max: 0.8 },
        color: [ "#fff" ],

        burst: {
            count: 20,
            color: [],
            multiplier: 3.5
        }
    }}, // 0
    { queries: ["header"], cfg: {
        size: { min: 10, max: 20 },
        speed: { min: 20, max: 40 },
        lifetime: { min: 200, max: 600 },
        opacity: { min: 0.3, max: 0.8 },
        color: []
    }}, // 1
        { queries: ["label", "button", "a"], cfg: {
        size: { min: 10, max: 20 },
        speed: { min: 20, max: 40 },
        lifetime: { min: 100, max: 300 },
        opacity: { min: 0.8, max: 1.0 },
        color: [],

        burst: {
            count: 10,
            color: [], // Leave empty to use base array
            multiplier: 2
        }
    }}, // 2
    { queries: ["#welcome"], cfg: {
        size: { min: 5, max: 10 },
        speed: { min: 15, max: 30 },
        lifetime: { min: 600, max: 900 },
        opacity: { min: 0.3, max: 0.8 },
        color: []

        // Leave burst empty = no burst on click
    }}// 3
];

const rainbowColors = [];
for (let i = 0; i < 360; i += 10) {
    elements[1].cfg.color.push(`hsl(${i}, 100%, 40%)`);
    elements[2].cfg.color.push(`hsl(${i}, 100%, 60%)`);
    elements[3].cfg.color.push(`hsl(${i}, 80%, 40%)`);
}

const PARTICLE_LAYER_ID = "global-particle-layer";

function getParticleLayer() {
    let layer = document.getElementById(PARTICLE_LAYER_ID);
    if (layer) return layer;

    layer = document.createElement("div");
    layer.id = PARTICLE_LAYER_ID;
    layer.style.position = "fixed";
    layer.style.inset = "0";
    layer.style.pointerEvents = "none";
    layer.style.overflow = "visible";
    layer.style.zIndex = "2147483647";
    document.body.appendChild(layer);
    return layer;
}

function getEventPoint(event) {
    if (!event) return null;
    if (typeof event.clientX === "number" && typeof event.clientY === "number") {
        return { clientX: event.clientX, clientY: event.clientY };
    }

    if (event.touches && event.touches.length > 0) {
        const touch = event.touches[0];
        return { clientX: touch.clientX, clientY: touch.clientY };
    }

    return null;
}

function getFrontmostelementAtPoint(event) {
    const point = getEventPoint(event);
    if (!point) return null;

    const topElement = document.elementFromPoint(point.clientX, point.clientY);
    if (!topElement) return null;

    let current = topElement;
    while (current) {
        for (const entry of elements) {
            if (Array.isArray(entry.queries) && entry.queries.some((query) => current.matches?.(query))) {
                return { element: current, cfg: entry.cfg };
            }
        }
        current = current.parentElement;
    }

    return null;
}

function getBurstSettings(cfg) {
    const burst = cfg.burst;
    if (!burst) {
        return null;
    }

    return {
        count: Number.isFinite(burst.count) ? burst.count : 1,
        multiplier: Number.isFinite(burst.multiplier) ? burst.multiplier : 1,
        colors: Array.isArray(burst.color) && burst.color.length > 0 ? burst.color : cfg.color,
    };
}

function spawnParticles(div, e, cfg, type="move") {
    const rect = div.getBoundingClientRect();
    const localX = e.clientX - rect.left;
    const localY = e.clientY - rect.top;
    if (!rect) return; 

    // If outside element element local bounds, return
    if (localX < 0 || localX > rect.width || localY < 0 || localY > rect.height) {
        return;
    }

    const layer = getParticleLayer();
    const burstSettings = type === "click" ? getBurstSettings(cfg) : null;
    const burstCount = burstSettings?.count ?? 1;
    const burstMultiplier = burstSettings?.multiplier ?? 1;
    const colors = burstSettings?.colors ?? cfg.color;

    for (let i = 0; i < burstCount; i += 1) {
        const particle = document.createElement("div");
        particle.classList.add("particle");
        
        let speed = Math.random() * (cfg.speed.max - cfg.speed.min) + cfg.speed.min;
        speed *= burstMultiplier;
        let moveX = (Math.random() - 0.5) * speed * 2;
        let moveY = (Math.random() - 0.5) * speed * 2;
        particle.style.setProperty("--move-x", `${moveX}px`);
        particle.style.setProperty("--move-y", `${moveY}px`);

        let size = Math.random() * (cfg.size.max - cfg.size.min) + cfg.size.min;
        particle.style.width = `${size}px`;
        particle.style.height = `${size}px`;

        // Position in viewport space so the particle layer can sit above all elements.
        const viewportX = rect.left + localX;
        const viewportY = rect.top + localY;
        particle.style.position = "fixed";
        particle.style.left = `${viewportX - size / 2}px`;
        particle.style.top = `${viewportY - size / 2}px`;
        particle.style.zIndex = "1";

        let color = colors[Math.floor(Math.random() * colors.length)] ?? "#fff";
        particle.style.border = `3px solid ${color}`;

        layer.appendChild(particle);

        const duration = Math.random() * (cfg.lifetime.max - cfg.lifetime.min) + cfg.lifetime.min;
        const opacity = Math.random() * (cfg.opacity.max - cfg.opacity.min) + cfg.opacity.min;

        const animation = particle.animate(
            [
                { transform: "translate(0, 0)", opacity: opacity },
                { transform: `translate(${moveX}px, ${moveY}px)`, opacity: 0 },
            ],
            {
                duration,
                easing: "ease-out",
                fill: "forwards",
            },
        );

        animation.onfinish = () => {
            particle.remove();
        };
    }
}

document.addEventListener("mousemove", (e) => {
    const hit = getFrontmostelementAtPoint(e);
    if (hit) spawnParticles(hit.element, e, hit.cfg, "move");
});

document.addEventListener("touchmove", (e) => {
    const point = e.touches && e.touches.length > 0 ? e.touches[0] : null;
    if (!point) return;

    const hit = getFrontmostelementAtPoint(point);
    if (hit) spawnParticles(hit.element, point, hit.cfg, "move");
});

document.addEventListener("click", (e) => {
    const hit = getFrontmostelementAtPoint(e);
    if (hit) spawnParticles(hit.element, e, hit.cfg, "click");
});
document.addEventListener("touchstart", (e) => {
    const point = e.touches && e.touches.length > 0 ? e.touches[0] : null;
    if (!point) return;
    
    const hit = getFrontmostelementAtPoint(point);
    if (hit) spawnParticles(hit.element, point, hit.cfg, "click");
});
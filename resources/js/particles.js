(function() {
    if (!window.EzCanvas2D) return;

    const PARTICLE_HOST_ID = "global-particle-layer";

    const createParticleHost = () => {
        let host = document.getElementById(PARTICLE_HOST_ID);
        if (host) return host;

        host = document.createElement("div");
        host.id = PARTICLE_HOST_ID;
        host.style.position = "fixed";
        host.style.inset = "0";
        host.style.pointerEvents = "none";
        host.style.overflow = "hidden";
        host.style.zIndex = "2147483647";
        document.body.appendChild(host);

        return host;
    };

    const toRange = (min, max) => min + Math.random() * (max - min);
    const clamp01 = (v) => Math.max(0, Math.min(1, v));
    const easeOut = (t) => 1 - (1 - t) * (1 - t);

    const resolveHitPreset = (point, presets) => {
        const topElement = document.elementFromPoint(point.x, point.y);
        if (!topElement) return null;

        let current = topElement;
        while (current) {
            for (const preset of presets) {
                if (Array.isArray(preset.queries) && preset.queries.some((query) => current.matches?.(query))) {
                    return { element: current, cfg: preset.cfg };
                }
            }
            current = current.parentElement;
        }

        return null;
    };

    const burstSettings = (cfg) => {
        if (!cfg.burst) return null;

        return {
            count: Number.isFinite(cfg.burst.count) ? cfg.burst.count : 1,
            multiplier: Number.isFinite(cfg.burst.multiplier) ? cfg.burst.multiplier : 1,
            colors: Array.isArray(cfg.burst.color) && cfg.burst.color.length > 0 ? cfg.burst.color : cfg.color,
        };
    };

    const spawnFromPoint = (attrs, point, hit, type = "move") => {
        const rect = hit.element.getBoundingClientRect();
        const localX = point.x - rect.left;
        const localY = point.y - rect.top;

        if (localX < 0 || localX > rect.width || localY < 0 || localY > rect.height) {
            return;
        }

        const burst = type === "click" ? burstSettings(hit.cfg) : null;
        const spawnCount = burst?.count ?? 1;
        const speedMultiplier = burst?.multiplier ?? 1;
        const colors = burst?.colors ?? hit.cfg.color;

        for (let i = 0; i < spawnCount; i += 1) {
            if (attrs.particles.length >= attrs.maxParticles) {
                attrs.particles.shift();
            }

            const speed = toRange(hit.cfg.speed.min, hit.cfg.speed.max) * speedMultiplier;
            const driftX = (Math.random() - 0.5) * speed * 2;
            const driftY = (Math.random() - 0.5) * speed * 2;
            const size = toRange(hit.cfg.size.min, hit.cfg.size.max);
            const lifeMs = toRange(hit.cfg.lifetime.min, hit.cfg.lifetime.max);
            const opacity = toRange(hit.cfg.opacity.min, hit.cfg.opacity.max);

            attrs.particles.push({
                x: point.x,
                y: point.y,
                moveX: driftX,
                moveY: driftY,
                size,
                lifeMs,
                ageMs: 0,
                opacity,
                color: colors[Math.floor(Math.random() * colors.length)] ?? "#fff",
                strokeWidth: 3,
            });
        }
    };

    const createPresets = () => {
        const presets = [
            {
                queries: ["body"],
                cfg: {
                    size: { min: 10, max: 20 },
                    speed: { min: 20, max: 40 },
                    lifetime: { min: 200, max: 600 },
                    opacity: { min: 0.3, max: 0.8 },
                    color: ["#fff"],
                    burst: {
                        count: 20,
                        color: [],
                        multiplier: 3.5,
                    },
                },
            },
            {
                queries: ["header"],
                cfg: {
                    size: { min: 10, max: 20 },
                    speed: { min: 20, max: 40 },
                    lifetime: { min: 200, max: 600 },
                    opacity: { min: 0.3, max: 0.8 },
                    color: [],
                },
            },
            {
                queries: ["label", "button", "a"],
                cfg: {
                    size: { min: 10, max: 20 },
                    speed: { min: 20, max: 40 },
                    lifetime: { min: 100, max: 300 },
                    opacity: { min: 0.8, max: 1.0 },
                    color: [],
                    burst: {
                        count: 10,
                        color: [],
                        multiplier: 2,
                    },
                },
            },
            {
                queries: ["#welcome"],
                cfg: {
                    size: { min: 5, max: 10 },
                    speed: { min: 15, max: 30 },
                    lifetime: { min: 600, max: 900 },
                    opacity: { min: 0.3, max: 0.8 },
                    color: [],
                },
            },
        ];

        for (let i = 0; i < 360; i += 10) {
            presets[1].cfg.color.push(`hsl(${i}, 100%, 40%)`);
            presets[2].cfg.color.push(`hsl(${i}, 100%, 60%)`);
            presets[3].cfg.color.push(`hsl(${i}, 80%, 40%)`);
        }

        return presets;
    };

    const host = createParticleHost();
    const particleCanv = new window.EzCanvas2D();

    particleCanv.addAction("particles", {
        attrs: {
            presets: createPresets(),
            particles: [],
            maxParticles: 1200,
        },
        update(self, runtime) {
            const dtMs = runtime.deltatime * 1000;
            if (dtMs <= 0) return;

            const nextParticles = [];
            for (const particle of self.attrs.particles) {
                particle.ageMs += dtMs;
                const t = clamp01(particle.ageMs / particle.lifeMs);
                if (t >= 1) continue;

                const eased = easeOut(t);
                const px = particle.x + particle.moveX * eased;
                const py = particle.y + particle.moveY * eased;
                const alpha = particle.opacity * (1 - t);
                if (alpha <= 0) continue;

                runtime.ctx.save();
                runtime.ctx.globalAlpha = alpha;
                runtime.ctx.lineWidth = particle.strokeWidth;
                runtime.ctx.strokeStyle = particle.color;
                runtime.ctx.beginPath();
                runtime.ctx.arc(px, py, particle.size / 2, 0, Math.PI * 2);
                runtime.ctx.stroke();
                runtime.ctx.restore();

                nextParticles.push(particle);
            }

            self.attrs.particles = nextParticles;
        },
        events: {
            mousemove(self, runtime) {
                const point = runtime.mouse.viewport;
                if (!point) return;

                const hit = resolveHitPreset(point, self.attrs.presets);
                if (!hit) return;
                spawnFromPoint(self.attrs, point, hit, "move");
            },
            click(self, runtime) {
                const point = runtime.mouse.viewport;
                if (!point) return;

                const hit = resolveHitPreset(point, self.attrs.presets);
                if (!hit) return;
                spawnFromPoint(self.attrs, point, hit, "click");
            },
            touchmove(self, runtime) {
                const point = runtime.mouse.viewport;
                if (!point) return;

                const hit = resolveHitPreset(point, self.attrs.presets);
                if (!hit) return;
                spawnFromPoint(self.attrs, point, hit, "move");
            },
            touchstart(self, runtime) {
                const point = runtime.mouse.viewport;
                if (!point) return;

                const hit = resolveHitPreset(point, self.attrs.presets);
                if (!hit) return;
                spawnFromPoint(self.attrs, point, hit, "click");
            },
        },
    });

    particleCanv.mount(host);
    window.globalParticleCanv = particleCanv;
})();
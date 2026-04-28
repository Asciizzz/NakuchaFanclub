    
const WELCOME_LEFT_SIDE_CONFIG = {
    trigger: {
        delay: 300,
        threshold: 0.2,
        sentinelHeightPercent: 10
    },
    top: {
        selector: "#insane-effect-1",
        text: "Are you a fan of",
        preserveSpaces: true,
        initialOffset: (index, total) => 260 + (total - 1 - index) * 62,
        durationVar: "--fly-duration",
        fromProperty: "--from-x",
        revealClass: "fly-in-left",
        baseGap: 200,
        minGap: 26,
        accel: 0.73,
        durationStart: 0.58,
        durationFloor: 0.14,
        durationStep: 0.035
    },
    mid: {
        selector: "#nakuru-name-1",
        text: "Nakuru?",
        preserveSpaces: false,
        initialOffset: (index) => (index % 2 === 0 ? -160 : 160),
        durationVar: "--nakuru-in-duration",
        fromProperty: null,
        baseGap: 210,
        minGap: 24,
        accel: 0.81,
        durationStart: 0.52,
        durationFloor: 0.16,
        durationStep: 0.04,
        bounceCooldown: 4000,
        bounceStagger: 100,
        bounceDuration: 500
    },
    bottom: {
        selector: "#welcome .left-side label[for='toggle-popup']",
        initialStyle: {
            opacity: "0",
            ctaLift: "24px",
            transition: "0.28s ease-out"
        },
        revealStyle: {
            opacity: "1",
            ctaLift: "0px"
        },
        revealDelayAfterMid: 120,
    },
};

// EzCanvas2D runtime (replaces old JellyTank + Starglitter scripts)
(function() {
    if (!window.EzCanvas2D) return;

    const toRange = (min, max) => min + Math.random() * (max - min);

    const createCanvRuntime = ({ includeJelly, includeStars }) => {
        const canv = new window.EzCanvas2D();
        canv.setPassthrough(true);

        canv.addImage("jellyfish", window.nakuchaAssets?.images?.jellyfish ?? "/assets/images/jellyfish.png");
        canv.addImage("starglitter", window.nakuchaAssets?.images?.starglitter ?? "/assets/images/starglitter.png");

        canv.addAsset("jellySpriteRect", (frame, cfg) => {
            const cols = cfg.frameCols;
            const rows = cfg.frameRows;
            const frameIndex = ((frame % (cols * rows)) + (cols * rows)) % (cols * rows);
            const col = frameIndex % cols;
            const row = Math.floor(frameIndex / cols);
            return {
                sx: col * cfg.frameWidth,
                sy: row * cfg.frameHeight,
                sw: cfg.frameWidth,
                sh: cfg.frameHeight,
            };
        });

        if (includeJelly) {
            canv.addAction("jellytank", {
                attrs: {
                    initialized: false,
                    entities: [],
                    bubbles: [],
                    spawnTimer: 0,
                    nextSpawnDelay: 0,
                    bubbleSpawnTimer: 0,
                    nextBubbleSpawnDelay: 0,
                    pointer: {
                        lastX: null,
                        lastY: null,
                        lastMoveAt: null,
                        speed: 0,
                    },
                    cfg: {
                        frameCols: 5,
                        frameRows: 1,
                        frameWidth: 0,
                        frameHeight: 0,
                        maxCount: 20,
                        spawnIntervalMin: 0.5,
                        spawnIntervalMax: 0.9,
                        sizeMin: 50,
                        sizeMax: 150,
                        burstMin: 3,
                        burstMax: 10,
                        decelMin: 0.94,
                        decelMax: 0.99,
                        spriteAngleRad: 122 * (Math.PI / 180),
                        steerFreqMin: 0.0012,
                        steerFreqMax: 0.0028,
                        steerAmpMin: 0.0006,
                        steerAmpMax: 0.0018,
                        scareSpeedThreshold: 1,
                        scareCooldown: 180,
                    },
                    bubbleCfg: {
                        maxCount: 40,
                        spawnIntervalMin: 0.1,
                        spawnIntervalMax: 0.22,
                        sizeMin: 12,
                        sizeMax: 40,
                        speedUpMin: 0.4,
                        speedUpMax: 0.9,
                        driftLeftMin: 0.03,
                        driftLeftMax: 0.16,
                        popSpeed: 0.9,
                    },
                },
                update(self, runtime) {
                    const attrs = self.attrs;
                    const dt = runtime.deltatime;
                    const width = runtime.canvas.width;
                    const height = runtime.canvas.height;
                    if (!width || !height) return;

                    if (!attrs.initialized) {
                        attrs.initialized = true;
                        attrs.nextSpawnDelay = toRange(attrs.cfg.spawnIntervalMin, attrs.cfg.spawnIntervalMax);
                        attrs.nextBubbleSpawnDelay = toRange(attrs.bubbleCfg.spawnIntervalMin, attrs.bubbleCfg.spawnIntervalMax);
                    }

                    const jellyImage = runtime.assets.jellyfish?.img;
                    if ((attrs.cfg.frameWidth <= 0 || attrs.cfg.frameHeight <= 0) && jellyImage) {
                        const probeWidth = jellyImage.naturalWidth || jellyImage.width;
                        const probeHeight = jellyImage.naturalHeight || jellyImage.height;
                        if (probeWidth > 0 && probeHeight > 0) {
                            attrs.cfg.frameWidth = Math.max(1, Math.floor(probeWidth / attrs.cfg.frameCols));
                            attrs.cfg.frameHeight = Math.max(1, Math.floor(probeHeight / attrs.cfg.frameRows));
                        }
                    }

                    if (attrs.cfg.frameWidth <= 0 || attrs.cfg.frameHeight <= 0) {
                        return;
                    }

                    attrs.spawnTimer += dt;
                    while (attrs.spawnTimer >= attrs.nextSpawnDelay) {
                        attrs.spawnTimer -= attrs.nextSpawnDelay;
                        attrs.nextSpawnDelay = toRange(attrs.cfg.spawnIntervalMin, attrs.cfg.spawnIntervalMax);

                        if (attrs.entities.length >= attrs.cfg.maxCount) continue;

                        const size = toRange(attrs.cfg.sizeMin, attrs.cfg.sizeMax);
                        const edge = ["left", "right", "top", "bottom"][Math.floor(Math.random() * 4)];

                        let x = 0;
                        let y = 0;
                        if (edge === "left") {
                            x = -size;
                            y = Math.random() * Math.max(1, height - size);
                        } else if (edge === "right") {
                            x = width + size;
                            y = Math.random() * Math.max(1, height - size);
                        } else if (edge === "top") {
                            x = Math.random() * Math.max(1, width - size);
                            y = -size;
                        } else {
                            x = Math.random() * Math.max(1, width - size);
                            y = height + size;
                        }

                        const targetX = width * (0.35 + Math.random() * 0.3);
                        const targetY = height * (0.35 + Math.random() * 0.3);
                        const dx = targetX - (x + size / 2);
                        const dy = targetY - (y + size / 2);
                        const len = Math.hypot(dx, dy) || 1;

                        attrs.entities.push({
                            x,
                            y,
                            vx: dx / len,
                            vy: dy / len,
                            size,
                            burst: toRange(attrs.cfg.burstMin, attrs.cfg.burstMax),
                            frame: Math.floor(Math.random() * attrs.cfg.frameCols),
                            frameTimer: 0,
                            frameInterval: toRange(0.1, 0.4),
                            steerPhase: Math.random() * Math.PI * 2,
                            steerFreq: toRange(attrs.cfg.steerFreqMin, attrs.cfg.steerFreqMax),
                            steerAmp: toRange(attrs.cfg.steerAmpMin, attrs.cfg.steerAmpMax),
                            lastScaredAt: 0,
                            cursorInside: false,
                            color: `hsl(${Math.floor(Math.random() * 36) * 10}, 70%, 80%)`,
                        });
                    }

                    attrs.bubbleSpawnTimer += dt;
                    while (attrs.bubbleSpawnTimer >= attrs.nextBubbleSpawnDelay) {
                        attrs.bubbleSpawnTimer -= attrs.nextBubbleSpawnDelay;
                        attrs.nextBubbleSpawnDelay = toRange(attrs.bubbleCfg.spawnIntervalMin, attrs.bubbleCfg.spawnIntervalMax);

                        if (attrs.bubbles.length >= attrs.bubbleCfg.maxCount) continue;

                        const size = toRange(attrs.bubbleCfg.sizeMin, attrs.bubbleCfg.sizeMax);
                        attrs.bubbles.push({
                            x: Math.random() * Math.max(1, width - size),
                            y: height + size * (0.3 + Math.random() * 0.7),
                            vx: -toRange(attrs.bubbleCfg.driftLeftMin, attrs.bubbleCfg.driftLeftMax),
                            vy: -toRange(attrs.bubbleCfg.speedUpMin, attrs.bubbleCfg.speedUpMax),
                            size,
                            alpha: toRange(0.08, 0.18),
                            cursorInside: false,
                        });
                    }

                    const entities = [];
                    for (const entity of attrs.entities) {
                        const heading = Math.atan2(entity.vy, entity.vx);
                        const steerTurn = Math.sin(performance.now() * entity.steerFreq + entity.steerPhase) * entity.steerAmp;
                        const nextHeading = heading + steerTurn;
                        entity.vx = Math.cos(nextHeading);
                        entity.vy = Math.sin(nextHeading);

                        entity.x += entity.vx * entity.burst;
                        entity.y += entity.vy * entity.burst;
                        entity.burst *= toRange(attrs.cfg.decelMin, attrs.cfg.decelMax);

                        entity.frameTimer += dt;
                        if (entity.frameTimer >= entity.frameInterval) {
                            entity.frameTimer -= entity.frameInterval;
                            entity.frame = (entity.frame + 1) % attrs.cfg.frameCols;

                            if (entity.frame === 1) {
                                entity.burst = toRange(attrs.cfg.burstMin, attrs.cfg.burstMax);
                            }
                        }

                        const killPadding = entity.size * 1.6;
                        if (
                            entity.x < -killPadding
                            || entity.x > width + killPadding
                            || entity.y < -killPadding
                            || entity.y > height + killPadding
                        ) {
                            continue;
                        }

                        const srcRect = runtime.runFn("jellySpriteRect", entity.frame, attrs.cfg);
                        const drawX = entity.x;
                        const drawY = entity.y;
                        const drawW = entity.size;
                        const drawH = entity.size;
                        const angleRad = Math.atan2(entity.vy, entity.vx) + attrs.cfg.spriteAngleRad;

                        runtime.drawImage("jellyfish", {
                            dst: {
                                dx: drawX,
                                dy: drawY,
                                dw: drawW,
                                dh: drawH,
                            },
                            src: srcRect,
                        }, {
                            globalAlpha: 0.42,
                            effects: [
                                {
                                    type: "tint",
                                    color: entity.color,
                                },
                            ],
                            transformation: {
                                rotation: {
                                    angle: angleRad
                                },
                            },
                        });

                        entities.push(entity);
                    }
                    attrs.entities = entities;
                },

                events: {
                    pointermove(self, runtime, event) {
                        const attrs = self.attrs;
                        const point = runtime.mouse.pos;
                        if (!point) return;

                        const now = performance.now();
                        if (
                            Number.isFinite(attrs.pointer.lastX)
                            && Number.isFinite(attrs.pointer.lastY)
                            && Number.isFinite(attrs.pointer.lastMoveAt)
                        ) {
                            const dx = point.x - attrs.pointer.lastX;
                            const dy = point.y - attrs.pointer.lastY;
                            const dtMs = Math.max(0.0001, now - attrs.pointer.lastMoveAt);
                            attrs.pointer.speed = Math.hypot(dx, dy) / dtMs;
                        } else {
                            attrs.pointer.speed = 0;
                        }

                        attrs.pointer.lastX = point.x;
                        attrs.pointer.lastY = point.y;
                        attrs.pointer.lastMoveAt = now;

                        for (const entity of attrs.entities) {
                            const cx = entity.x + entity.size / 2;
                            const cy = entity.y + entity.size / 2;
                            const dx = cx - point.x;
                            const dy = cy - point.y;
                            const dist = Math.hypot(dx, dy);
                            const radius = entity.size / 2;
                            const inside = dist <= radius;

                            if (inside && !entity.cursorInside && attrs.pointer.speed >= attrs.cfg.scareSpeedThreshold) {
                                if (now - entity.lastScaredAt >= attrs.cfg.scareCooldown) {
                                    const safe = dist || 0.0001;
                                    entity.vx = dx / safe;
                                    entity.vy = dy / safe;
                                    entity.burst = toRange(attrs.cfg.burstMin, attrs.cfg.burstMax) * 1.5;
                                    entity.lastScaredAt = now;
                                }
                            }

                            entity.cursorInside = inside;
                        }
                    },

                    pointerleave(self) {
                        const attrs = self.attrs;
                        attrs.pointer.lastX = null;
                        attrs.pointer.lastY = null;
                        attrs.pointer.lastMoveAt = null;
                        attrs.pointer.speed = 0;

                        for (const entity of attrs.entities) {
                            entity.cursorInside = false;
                        }
                    },

                    "click": function(self, runtime, event) {
                        const attrs = self.attrs;
                        const point = runtime.mouse.pos;
                        if (!point) return;

                        for (const entity of self.attrs.entities) {
                            const cx = entity.x + entity.size / 2;
                            const cy = entity.y + entity.size / 2;
                            const dx = cx - point.x;
                            const dy = cy - point.y;
                            const dist = Math.hypot(dx, dy);
                            const radius = entity.size / 2;
                            if (dist <= radius * 1.5) {
                                const safe = dist || 0.0001;
                                entity.vx = dx / safe;
                                entity.vy = dy / safe;
                                entity.burst = toRange(attrs.cfg.burstMin, attrs.cfg.burstMax) * 2;
                                entity.lastScaredAt = performance.now();
                                entity.color = `hsl(${Math.floor(Math.random() * 36) * 10}, 70%, 80%)`;
                            }
                        }
                    }
                }
            });
        }

        if (includeStars) {
            canv.addAction("starglitter", {
                attrs: {
                    initialized: false,
                    stars: [],
                    spawnTimer: 0,
                    nextSpawnDelay: 0,
                    cfg: {
                        maxCount: 70,
                        sizeMin: 20,
                        sizeMax: 60,
                        lifeMin: 0.9,
                        lifeMax: 1.7,
                        spawnMin: 0.03,
                        spawnMax: 0.08,
                        frameCols: 5,
                        frameWidth: 0,
                        frameHeight: 0,
                    },
                },
                update(self, runtime) {
                    const attrs = self.attrs;
                    const dt = runtime.deltatime;
                    const width = runtime.canvas.width;
                    const height = runtime.canvas.height;
                    if (!width || !height) return;

                    if (!attrs.initialized) {
                        attrs.initialized = true;
                        attrs.nextSpawnDelay = toRange(attrs.cfg.spawnMin, attrs.cfg.spawnMax);
                    }

                    const starImage = runtime.assets.starglitter?.img;
                    if ((attrs.cfg.frameWidth <= 0 || attrs.cfg.frameHeight <= 0) && starImage) {
                        const probeWidth = starImage.naturalWidth || starImage.width;
                        const probeHeight = starImage.naturalHeight || starImage.height;
                        if (probeWidth > 0 && probeHeight > 0) {
                            attrs.cfg.frameWidth = Math.max(1, Math.floor(probeWidth / attrs.cfg.frameCols));
                            attrs.cfg.frameHeight = Math.max(1, probeHeight);
                        }
                    }

                    if (attrs.cfg.frameWidth <= 0 || attrs.cfg.frameHeight <= 0) {
                        return;
                    }

                    attrs.spawnTimer += dt;
                    while (attrs.spawnTimer >= attrs.nextSpawnDelay) {
                        attrs.spawnTimer -= attrs.nextSpawnDelay;
                        attrs.nextSpawnDelay = toRange(attrs.cfg.spawnMin, attrs.cfg.spawnMax);

                        if (attrs.stars.length >= attrs.cfg.maxCount) continue;

                        attrs.stars.push({
                            size: toRange(attrs.cfg.sizeMin, attrs.cfg.sizeMax),
                            life: toRange(attrs.cfg.lifeMin, attrs.cfg.lifeMax),
                            age: 0,
                            x: Math.random() * Math.max(1, width),
                            y: Math.random() * Math.max(1, height),
                            frame: Math.floor(Math.random() * attrs.cfg.frameCols),
                            frameTimer: 0,
                            frameInterval: toRange(0.12, 0.18),
                            color: `hsl(${Math.floor(Math.random() * 36) * 10}, 100%, 60%)`,
                        });
                    }

                    const stars = [];
                    for (const star of attrs.stars) {
                        star.age += dt;
                        if (star.age >= star.life) {
                            continue;
                        }

                        star.frameTimer += dt;
                        if (star.frameTimer >= star.frameInterval) {
                            star.frameTimer -= star.frameInterval;
                            star.frame = (star.frame + 1) % attrs.cfg.frameCols;
                        }

                        const t = Math.max(0, Math.min(1, star.age / star.life));
                        const alpha = t < 0.5 ? t / 0.5 : (1 - t) / 0.5;

                        const srcRect = runtime.runFn("jellySpriteRect", star.frame, {
                            frameCols: attrs.cfg.frameCols,
                            frameRows: 1,
                            frameWidth: attrs.cfg.frameWidth,
                            frameHeight: attrs.cfg.frameHeight,
                        });

                        const drawX = star.x;
                        const drawY = star.y;
                        const drawSize = star.size;

                        runtime.drawImage("starglitter", {
                            dst: {
                                dx: drawX,
                                dy: drawY,
                                dw: drawSize,
                                dh: drawSize,
                            },
                            src: srcRect,
                        }, {
                            globalAlpha: alpha,
                            effects: [
                                {
                                    type: "tint",
                                    color: star.color,
                                },
                            ],
                        });

                        stars.push(star);
                    }
                    attrs.stars = stars;
                },
            });
        }

        return canv;
    };

    const jellyHost = document.getElementById("jellytank");
    if (jellyHost) {
        const mainJellyCanv = createCanvRuntime({ includeJelly: true, includeStars: false });
        mainJellyCanv.mount(jellyHost);
        window.mainJellyCanv = mainJellyCanv;
    }

    const glitterHost = document.getElementById("starglitter");
    if (glitterHost) {
        const mainGlitterCanv = createCanvRuntime({ includeJelly: false, includeStars: true });
        mainGlitterCanv.mount(glitterHost);
        window.mainGlitterCanv = mainGlitterCanv;
    }
})();


const WELCOME_PARALLAX_CONFIG = {
    ease: 0.08,
    restThreshold: 0.02,
    exitProgress: { x: 0.5, y: 0.5 },
    background: {
        translateX: 5,
        translateY: 2,
        rotateX: 0.4,
        rotateY: 0.2,
    },
    nakuru: {
        translateX: 28,
        translateY: 20,
        rotateX: 1.25,
        rotateY: 1.45,
    },
    foreground: {
        translateX: 35,
        translateY: 24,
        rotateX: 5.95,
        rotateY: 1.55,
    },
    leftside: {
        translateX: 40,
        translateY: 20,
        rotateX: 0.8,
        rotateY: 1.5,

        // Layers
        top: {
            translateX: 22,
            translateY: 16,
            rotateX: 0.8,
            rotateY: 1.5,
        },
        mid: {
            translateX: 40,
            translateY: 32,
            rotateX: 0.8,
            rotateY: 1.5,
        },
        bottom: {
            translateX: 26,
            translateY: 19,
            rotateX: 0.8,
            rotateY: 1.5,
        },
    },

    rightside: {
        translateX: 28,
        translateY: 16,
        rotateX: 0.8,
        rotateY: 1.5,

        general: {
            translateX: 32,
            translateY: 52,
            rotateX: 0.4,
            rotateY: 1.0,
        }
    },
};

function createRevealSentinel(container, bandPercent) {
    const sentinel = document.createElement("div");
    sentinel.setAttribute("aria-hidden", "true");
    sentinel.style.position = "absolute";
    sentinel.style.left = "0";
    sentinel.style.top = `${100 - bandPercent}%`;
    sentinel.style.width = "100%";
    sentinel.style.height = `${bandPercent}%`;
    sentinel.style.pointerEvents = "none";
    sentinel.style.opacity = "0";
    container.appendChild(sentinel);
    return sentinel;
}   

function createTextSpans(target, text, options) {
    target.innerHTML = "";
    const spans = [];
    const letters = Array.from(text);
    const total = letters.length;

    letters.forEach((letter, index) => {
        const span = document.createElement("span");
        span.textContent = options.preserveSpaces && letter === " " ? "\u00A0" : letter;

        const offset = options.initialOffset(index, total);
        span.style.display = "inline-block";

        if (options.fromProperty === "--from-x") {
            span.style.setProperty(options.fromProperty, `-${offset}px`);
        } else {
            span.style.opacity = "0";
            span.style.transform = `translateY(${offset}px)`;
            span.style.transition = "transform var(--nakuru-in-duration, 0.45s) cubic-bezier(0.22, 1, 0.36, 1), opacity var(--nakuru-in-duration, 0.45s) ease-out";
        }

        target.appendChild(span);
        spans.push(span);
    });

    return spans;
}

function animateStaggeredSequence(spans, options, revealCallback) {
    const ordered = options.reversed ? [...spans].reverse() : spans;
    let elapsed = 0;

    ordered.forEach((span, step) => {
        const duration = Math.max(options.durationFloor, options.durationStart - step * options.durationStep);
        span.style.setProperty(options.durationVar, `${duration}s`);

        setTimeout(() => {
            revealCallback(span, step);
        }, elapsed);

        const gap = Math.max(options.minGap, Math.round(options.baseGap * Math.pow(options.accel, step)));
        elapsed += gap;
    });

    return elapsed;
}

// News left-side intro animations (single synchronized observer)
(function() {
    const newsContainer = document.getElementById("welcome");
    const leftSide = document.querySelector("#welcome .left-side");
    const topTarget = document.querySelector(WELCOME_LEFT_SIDE_CONFIG.top.selector);
    const midTarget = document.querySelector(WELCOME_LEFT_SIDE_CONFIG.mid.selector);
    const bottomTarget = document.querySelector(WELCOME_LEFT_SIDE_CONFIG.bottom.selector);
    
    if (!newsContainer || !leftSide || !topTarget || !midTarget || !bottomTarget) return;

    const revealSentinel = createRevealSentinel(newsContainer, WELCOME_LEFT_SIDE_CONFIG.trigger.sentinelHeightPercent);

    const topSpans = createTextSpans(topTarget, WELCOME_LEFT_SIDE_CONFIG.top.text, {
        preserveSpaces: WELCOME_LEFT_SIDE_CONFIG.top.preserveSpaces,
        initialOffset: WELCOME_LEFT_SIDE_CONFIG.top.initialOffset,
        fromProperty: WELCOME_LEFT_SIDE_CONFIG.top.fromProperty,
    });

    const midSpans = createTextSpans(midTarget, WELCOME_LEFT_SIDE_CONFIG.mid.text, {
        preserveSpaces: WELCOME_LEFT_SIDE_CONFIG.mid.preserveSpaces,
        initialOffset: WELCOME_LEFT_SIDE_CONFIG.mid.initialOffset,
        fromProperty: WELCOME_LEFT_SIDE_CONFIG.mid.fromProperty,
    });

    bottomTarget.style.opacity = WELCOME_LEFT_SIDE_CONFIG.bottom.initialStyle.opacity;
    bottomTarget.style.setProperty("--cta-lift", WELCOME_LEFT_SIDE_CONFIG.bottom.initialStyle.ctaLift);
    bottomTarget.style.transition = WELCOME_LEFT_SIDE_CONFIG.bottom.initialStyle.transition;

    let introLoaded = false;
    let bounceCooldown = false;

    midTarget.addEventListener("mousemove", () => {
        if (!introLoaded || bounceCooldown) return;

        midSpans.forEach((span, index) => {
            setTimeout(() => {
                span.classList.add("bounce");
                setTimeout(() => span.classList.remove("bounce"), WELCOME_LEFT_SIDE_CONFIG.mid.bounceDuration);
            }, index * WELCOME_LEFT_SIDE_CONFIG.mid.bounceStagger);
        });

        bounceCooldown = true;
        setTimeout(() => {
            bounceCooldown = false;
        }, WELCOME_LEFT_SIDE_CONFIG.mid.bounceCooldown);
    });

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (!entry.isIntersecting) return;

            setTimeout(() => {
                const topElapsed = animateStaggeredSequence(topSpans, {
                    reversed: true,
                    durationVar: WELCOME_LEFT_SIDE_CONFIG.top.durationVar,
                    baseGap: WELCOME_LEFT_SIDE_CONFIG.top.baseGap,
                    minGap: WELCOME_LEFT_SIDE_CONFIG.top.minGap,
                    accel: WELCOME_LEFT_SIDE_CONFIG.top.accel,
                    durationStart: WELCOME_LEFT_SIDE_CONFIG.top.durationStart,
                    durationFloor: WELCOME_LEFT_SIDE_CONFIG.top.durationFloor,
                    durationStep: WELCOME_LEFT_SIDE_CONFIG.top.durationStep,
                }, (span) => {
                    span.classList.add(WELCOME_LEFT_SIDE_CONFIG.top.revealClass);
                });

                const midElapsed = animateStaggeredSequence(midSpans, {
                    reversed: false,
                    durationVar: WELCOME_LEFT_SIDE_CONFIG.mid.durationVar,
                    baseGap: WELCOME_LEFT_SIDE_CONFIG.mid.baseGap,
                    minGap: WELCOME_LEFT_SIDE_CONFIG.mid.minGap,
                    accel: WELCOME_LEFT_SIDE_CONFIG.mid.accel,
                    durationStart: WELCOME_LEFT_SIDE_CONFIG.mid.durationStart,
                    durationFloor: WELCOME_LEFT_SIDE_CONFIG.mid.durationFloor,
                    durationStep: WELCOME_LEFT_SIDE_CONFIG.mid.durationStep,
                }, (span) => {
                    span.style.opacity = "1";
                    span.style.transform = "translateY(0)";
                });

                setTimeout(() => {
                    bottomTarget.style.opacity = WELCOME_LEFT_SIDE_CONFIG.bottom.revealStyle.opacity;
                    bottomTarget.style.setProperty("--cta-lift", WELCOME_LEFT_SIDE_CONFIG.bottom.revealStyle.ctaLift);
                }, midElapsed + WELCOME_LEFT_SIDE_CONFIG.bottom.revealDelayAfterMid);

                const introDoneAt = Math.max(topElapsed, midElapsed + WELCOME_LEFT_SIDE_CONFIG.bottom.revealDelayAfterMid);
                setTimeout(() => {
                    introLoaded = true;
                }, introDoneAt + 140);
            }, WELCOME_LEFT_SIDE_CONFIG.trigger.delay);

            observer.disconnect();
        });
    }, { threshold: WELCOME_LEFT_SIDE_CONFIG.trigger.threshold });

    observer.observe(revealSentinel);
})();


// Welcome parallax with ezParallax
(function() {
    const owner = document.getElementById("welcome");

    const background = document.querySelector("#welcome .background");
    const starglitter = document.querySelector("#welcome #starglitter");
    const nakuru = document.querySelector("#welcome .nakuru");
    const foreground = document.querySelector("#welcome .foreground");

    const leftside = document.querySelector("#welcome .left-side");
    const lefttop = document.querySelector("#welcome #insane-effect-1");
    const leftmid = document.querySelector("#welcome #nakuru-name-1");
    const leftbottom = document.querySelector("#welcome .left-side label[for='toggle-popup']");

    const rightside = document.querySelector("#welcome .right-side");
    const togglePopup = document.getElementById("toggle-popup");

    const cfg = WELCOME_PARALLAX_CONFIG;
    const attrs = [
        {
            element: background,
            template: "translate3d($x,$y,0) rotateX($rx) rotateY($ry) scale(1.01)",
            axisX: {
                0: {
                    "x": -cfg.background.translateX,
                    "ry": -cfg.background.rotateY ,
                },
                1: {
                    "x": cfg.background.translateX ,
                    "ry": cfg.background.rotateY ,
                },
            },
            axisY: {
                0: {
                    "y": -cfg.background.translateY ,
                    "rx": cfg.background.rotateX 
                },
                1: {
                    "y": cfg.background.translateY ,
                    "rx": -cfg.background.rotateX  ,
                },
            },
        },
        {
            element: starglitter,
            template: "translate3d($x,$y,0) rotateX($rx) rotateY($ry)",
            axisX: {
                0: {
                    "x": -cfg.nakuru.translateX * 2.0 ,
                    "ry": -cfg.nakuru.rotateY * 2.0 ,
                },
                1: {
                    "x": cfg.nakuru.translateX * 2.0 ,
                    "ry": cfg.nakuru.rotateY * 2.0 ,
                },
            },
            axisY: {
                0: {
                    "y": -cfg.nakuru.translateY * 2.0 ,
                    "rx": cfg.nakuru.rotateX * 2.0 ,
                },
                1: {
                    "y": cfg.nakuru.translateY * 2.0 ,
                    "rx": -cfg.nakuru.rotateX * 2.0 ,
                },
            },
        },
        {
            element: nakuru,
            template: "translate3d($x,$y,0) rotateX($rx) rotateY($ry)",
            axisX: {
                0: {
                    "x": -cfg.nakuru.translateX ,
                    "ry": -cfg.nakuru.rotateY ,
                },
                1: {
                    "x": cfg.nakuru.translateX ,
                    "ry": cfg.nakuru.rotateY ,
                },
            },
            axisY: {
                0: {
                    "y": -cfg.nakuru.translateY ,
                    "rx": cfg.nakuru.rotateX ,
                },
                1: {
                    "y": cfg.nakuru.translateY ,
                    "rx": -cfg.nakuru.rotateX ,
                },
            },
        },
        {
            element: foreground,
            template: "translate3d($x,$y,40px) rotateX($rx) rotateY($ry) scale(1.0)",
            axisX: {
                0: {
                    "x": -cfg.foreground.translateX,
                    "ry": -cfg.foreground.rotateY
                },
                1: {
                    "x": cfg.foreground.translateX,
                    "ry": cfg.foreground.rotateY
                }
            },
            axisY: {
                0: {
                    "y": -cfg.foreground.translateY,
                    "rx": cfg.foreground.rotateX
                },
                1: {
                    "y": cfg.foreground.translateY,
                    "rx": -cfg.foreground.rotateX
                }
            }
        },


        {
            element: leftside,
            template: "translate3d($x,$y,$z) rotateY($ry) scale(1.0)",
            axisX: {
                0: { 
                    "x": -cfg.leftside.translateX,
                    "ry": -cfg.leftside.rotateY
                },
                1: { 
                    "x": cfg.leftside.translateX,
                    "ry": cfg.leftside.rotateY
                }
            },
            axisY: {
                0: { 
                    "y": -cfg.leftside.translateY,
                    "rx": cfg.leftside.rotateX
                },
                1: { 
                    "y": cfg.leftside.translateY,
                    "rx": -cfg.leftside.rotateX
                }
            },
        },
        {
            element: lefttop,
            template: "translate3d($lx,$ly,0) rotateX($rx) rotateY(calc(-5deg + $ry)) scale3d($sx,$sy,$sz)",
            axisX: {
                0: {
                    "lx": -cfg.leftside.top.translateX ,
                    "ry": -cfg.leftside.top.rotateY ,
                },
                1: {
                    "lx": cfg.leftside.top.translateX ,
                    "ry": cfg.leftside.top.rotateY ,
                },
            },
            axisY: {
                0: {
                    "ly": -cfg.leftside.top.translateY ,
                    "rx": cfg.leftside.top.rotateX ,
                },
                1: {
                    "ly": cfg.leftside.top.translateY ,
                    "rx": -cfg.leftside.top.rotateX ,
                },
            }
        },
        {
            element: leftmid,
            template: "translate3d($lx,$ly,0) rotateX($rx) rotateY(calc(-5deg + $ry)) scale3d($sx,$sy,$sz)",
            axisX: {
                0: {
                    "lx": -cfg.leftside.mid.translateX ,
                    "ry": -cfg.leftside.mid.rotateY ,
                },
                1: {
                    "lx": cfg.leftside.mid.translateX ,
                    "ry": cfg.leftside.mid.rotateY ,
                },
            },
            axisY: {
                0: {
                    "ly": -cfg.leftside.mid.translateY ,
                    "rx": cfg.leftside.mid.rotateX ,
                },
                1: {
                    "ly": cfg.leftside.mid.translateY ,
                    "rx": -cfg.leftside.mid.rotateX ,
                },
            }
        },
        {
            element: leftbottom,
            template: "translate3d($lx,$ly,0) rotateX($rx) rotateY(calc(-5deg + $ry)) scale3d($sx,$sy,$sz) translateY(var(--cta-lift, 0px))",
            axisX: {
                0: {
                    "lx": -cfg.leftside.bottom.translateX ,
                    "ry": -cfg.leftside.bottom.rotateY ,
                },
                1: {
                    "lx": cfg.leftside.bottom.translateX ,
                    "ry": cfg.leftside.bottom.rotateY ,
                },
            },
            axisY: {
                0: {
                    "ly": -cfg.leftside.bottom.translateY ,
                    "rx": cfg.leftside.bottom.rotateX ,
                },
                1: {
                    "ly": cfg.leftside.bottom.translateY ,
                    "rx": -cfg.leftside.bottom.rotateX ,
                },
            }
        },


        {
            element: rightside,
            template: "translate3d($x,$y,$z) rotateX($rx) rotateY($ry) scale(1.0)",
            axisX: {
                0: { 
                    "x": -cfg.rightside.translateX,
                    "ry": -cfg.rightside.rotateY
                },
                1: { 
                    "x": cfg.rightside.translateX,
                    "ry": cfg.rightside.rotateY
                },
            },
            axisY: {
                0: { 
                    "y": -cfg.rightside.translateY,
                    "rx": cfg.rightside.rotateX
                },
                1: {
                    "y": cfg.rightside.translateY,
                    "rx": -cfg.rightside.rotateX
                },
            },
        },
    ];

    const multX = [0.8, 1.0, 0.9, 0.7];
    const multY = [1.0, 0.8, 0.8, 1.0];
    
    const rightLabelDivs = document.querySelectorAll("#welcome .right-side label");
    for (let i = 0; i < rightLabelDivs.length; i++) {
        const labelDiv = rightLabelDivs[i];

        let mx = multX[i % multX.length];
        let my = multY[i % multY.length];
        
        const attr = {
            element: labelDiv,
            template: "translate3d($x,$y,0) rotateX($rx) rotateY($ry)",
            axisX: {
                0: { 
                    "x": -cfg.rightside.general.translateX * mx,
                    "ry": -cfg.rightside.general.rotateY
                },
                1: { 
                    "x": cfg.rightside.general.translateX * mx,
                    "ry": cfg.rightside.general.rotateY
                }
            },
            axisY: {
                0: {
                    "y": -cfg.rightside.general.translateY * my,
                    "rx": cfg.rightside.general.rotateX
                },
                1: {
                    "y": cfg.rightside.general.translateY * my,
                    "rx": -cfg.rightside.general.rotateX
                }
            }
        };

        attrs.push(attr);
    }



    const welcomeParallax = window.ezParallax.create({
        owner,
        ease: cfg.ease,
        restThreshold: cfg.restThreshold,
        exitProgress: cfg.exitProgress,
        attrs: attrs
    });

    if (welcomeParallax && togglePopup) {
        togglePopup.addEventListener("change", () => {
            welcomeParallax.refresh();
        });
    }
})();

// Shared circle reveal + copied tank controller for content sections
(function() {
    const mainCanv = window.mainJellyCanv ?? null;
    if (!mainCanv) return;

    const sectionLinks = [
        { inputId: "toggle-biography", sectionId: "biography" },
        { inputId: "toggle-introduction", sectionId: "introduction" },
        { inputId: "toggle-news", sectionId: "news" },
        { inputId: "toggle-discography", sectionId: "discography" },
        { inputId: "toggle-merch", sectionId: "merch" },
    ];

    const sections = [];
    for (const link of sectionLinks) {
        const input = document.getElementById(link.inputId);
        const section = document.getElementById(link.sectionId);
        if (!input || !section) continue;

        sections.push({
            input,
            section,
            closeTimerId: null,
        });
    }

    if (sections.length === 0) return;

    const isSectionOpen = (item) => item.input.checked;

    const openSection = (item) => {
        if (item.closeTimerId != null) {
            clearTimeout(item.closeTimerId);
            item.closeTimerId = null;
        }
        // Sections are transparent — the main jelly canvas shows through.
        // No per-section canvas needed; the main tank keeps running.
    };

    const closeSection = (item) => {
        if (item.closeTimerId != null) {
            clearTimeout(item.closeTimerId);
            item.closeTimerId = null;
        }
        // Sections are transparent — nothing to tear down canvas-wise.
    };

    const syncSections = () => {
        for (const item of sections) {
            if (isSectionOpen(item)) {
                openSection(item);
            } else {
                closeSection(item);
            }
        }
    };

    const setRevealOriginFromEvent = (e) => {
        // Sync origin on each section (used by section's own mask)
        for (const item of sections) {
            const rect = item.section.getBoundingClientRect();
            const localX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
            const localY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));

            item.section.style.setProperty("--reveal-x", `${localX}px`);
            item.section.style.setProperty("--reveal-y", `${localY}px`);
        }

        // Sync origin on #welcome so its inverted mask uses the same click point
        const welcome = document.getElementById("welcome");
        if (welcome) {
            const rect = welcome.getBoundingClientRect();
            const localX = Math.max(0, Math.min(rect.width, e.clientX - rect.left));
            const localY = Math.max(0, Math.min(rect.height, e.clientY - rect.top));
            welcome.style.setProperty("--reveal-x", `${localX}px`);
            welcome.style.setProperty("--reveal-y", `${localY}px`);
        }
    };

    document.addEventListener("pointermove", setRevealOriginFromEvent, true);
    document.addEventListener("pointerdown", setRevealOriginFromEvent, true);

    const syncInputIds = ["toggle-none", ...sectionLinks.map((link) => link.inputId)];
    const syncInputs = new Set();
    for (const inputId of syncInputIds) {
        const input = document.getElementById(inputId);
        if (!input) continue;
        syncInputs.add(input);
    }

    for (const input of syncInputs) {
        input.addEventListener("change", syncSections);
    }

    syncSections();
})();

// Custom floaters (context + tooltip)

(function() {
    if (!window.EzFloater) return;

    const floater = window.welcomeFloater instanceof window.EzFloater
        ? window.welcomeFloater
        : new window.EzFloater();
    window.welcomeFloater = floater;

    const readLabelText = (labelElement) => {
        const inner = labelElement.querySelector("div");
        const text = inner?.textContent?.trim() || labelElement.textContent?.trim() || "";
        return text;
    };

    floater.addDisplay("welcomeRightLabel", {
        tooltip(element) {
            return readLabelText(element);
        },
        context(element) {
            return readLabelText(element);
        },
    });

    floater.addQuery("#welcome .right-side label", {
        display: "welcomeRightLabel",
    });



})();
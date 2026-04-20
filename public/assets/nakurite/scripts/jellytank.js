const DEFAULT_JELLY_CONFIG = {
    src: "/assets/nakurite/images/jellyfish.png",
    frameRows: 1,
    frameCols: 5,
    frameSpeedMin: 100,
    frameSpeedMax: 400,
    burstMin: 3,
    burstMax: 10,
    burstFrame: 1,
    decelMin: 0.94,
    decelMax: 0.99,

    maxCount: 20,
    spawnIntervalMin: 500,
    spawnIntervalMax: 900,
    sizeMin: 50,
    sizeMax: 150,
    angle: 45,

    spriteAngle: 122,
    scareSpeed: 1,
    scareCooldown: 180,

    colors: []
};

for (let i = 0; i < 360; i += 10) {
    DEFAULT_JELLY_CONFIG.colors.push(`hsl(${i}, 70%, 80%)`);
}

const DEFAULT_BUBBLE_CONFIG = {
    popSpeed: 0.9,
    maxCount: 40,
    spawnIntervalMin: 100,
    spawnIntervalMax: 220,
    sizeMin: 12,
    sizeMax: 40,
    speedUpMin: 0.4,
    speedUpMax: 0.9,
    driftLeftMin: 0.03,
    driftLeftMax: 0.16,
};

const DEFAULT_RUNTIME_OPTIONS = {
    autoStart: true,
    startupJellyRatio: 0.1,
    startupBubbleRatio: 0.2,
    debugSpawns: false,
};

function resolveElement(target) {
    if (target instanceof Element) return target;
    if (typeof target === "string") return document.querySelector(target);
    return null;
}

function resetCursorInside(map) {
    for (const element of map) {
        if (!element?.dataset) continue;
        element.dataset.jellyCursorInside = "false";
    }
}

function toNumber(value, fallback = 0) {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function toBool(value, fallback = false) {
    if (value == null) return fallback;
    if (typeof value === "boolean") return value;
    return value === "true" || value === "1";
}

function parsePair(value, fallbackX = 0, fallbackY = 0) {
    const parts = String(value ?? "").split(",");
    return {
        x: toNumber(parts[0], fallbackX),
        y: toNumber(parts[1], fallbackY),
    };
}

function formatPair(x, y) {
    return `${x},${y}`;
}

function serializeAttributes(element) {
    const result = {};
    if (!element) return result;

    for (const attr of element.attributes) {
        result[attr.name] = attr.value;
    }

    return result;
}

function applyAttributes(element, attributes = {}) {
    if (!element) return;
    for (const [name, value] of Object.entries(attributes)) {
        element.setAttribute(name, String(value));
    }
}

function ensureElementStyle(element, styleMap) {
    for (const [name, value] of Object.entries(styleMap)) {
        element.style[name] = value;
    }
}

function ensureOwnerElement(container) {
    let owner = Array.from(container.children).find((child) => child?.dataset?.jellyOwner === "true") ?? null;
    if (!owner) {
        owner = document.createElement("div");
        owner.dataset.jellyOwner = "true";
        container.appendChild(owner);
    }

    owner.classList.add("jelly-tank-owner");

    ensureElementStyle(owner, {
        position: "absolute",
        inset: "0",
        width: "100%",
        height: "100%",
        overflow: "hidden",
        pointerEvents: "none",
    });

    if (getComputedStyle(container).position === "static") {
        container.style.position = "relative";
    }

    if (container.hasAttribute("data-jellytank-jelly-scare")) {
        owner.setAttribute("data-jellytank-jelly-scare", "");
    } else {
        owner.removeAttribute("data-jellytank-jelly-scare");
    }

    if (container.hasAttribute("data-jellytank-bubble-pop")) {
        owner.setAttribute("data-jellytank-bubble-pop", "");
    } else {
        owner.removeAttribute("data-jellytank-bubble-pop");
    }

    return owner;
}

function readJellyState(jellyEl) {
    const pos = parsePair(jellyEl.dataset.jellyPos, 0, 0);
    const vel = parsePair(jellyEl.dataset.jellyVel, 0, 0);
    const steer = parsePair(jellyEl.dataset.jellySteer, 0, 0);
    const steerExtra = parsePair(jellyEl.dataset.jellySteerExtra, 0, 0);

    return {
        x: pos.x,
        y: pos.y,
        vx: vel.x,
        vy: vel.y,
        size: toNumber(jellyEl.dataset.jellySize, 0),
        rotation: toNumber(jellyEl.dataset.jellyRotation, 0),
        burst: toNumber(jellyEl.dataset.jellyBurst, 0),
        lastFrameNumber: Number.parseInt(jellyEl.dataset.jellyFrame ?? "-1", 10),
        cursorInside: toBool(jellyEl.dataset.jellyCursorInside, false),
        lastScaredAt: toNumber(jellyEl.dataset.jellyLastScaredAt, 0),
        steerPhase: steer.x,
        steerFreq: steer.y,
        steerAmp: steerExtra.x,
        steerNoise: steerExtra.y,
        color: jellyEl.dataset.jellyColor ?? "",
        frameInterval: toNumber(jellyEl.dataset.jellyFrameInterval, 0),
    };
}

function writeJellyState(jellyEl, state) {
    jellyEl.dataset.jellyPos = formatPair(state.x, state.y);
    jellyEl.dataset.jellyVel = formatPair(state.vx, state.vy);
    jellyEl.dataset.jellySize = String(state.size);
    jellyEl.dataset.jellyRotation = String(state.rotation);
    jellyEl.dataset.jellyBurst = String(state.burst);
    jellyEl.dataset.jellyFrame = String(state.lastFrameNumber ?? -1);
    jellyEl.dataset.jellyCursorInside = String(Boolean(state.cursorInside));
    jellyEl.dataset.jellyLastScaredAt = String(state.lastScaredAt ?? 0);
    jellyEl.dataset.jellySteer = formatPair(state.steerPhase, state.steerFreq);
    jellyEl.dataset.jellySteerExtra = formatPair(state.steerAmp, state.steerNoise);
    jellyEl.dataset.jellyColor = String(state.color ?? "");
    jellyEl.dataset.jellyFrameInterval = String(state.frameInterval ?? 0);

    jellyEl.style.position = "absolute";
    jellyEl.style.width = `${state.size}px`;
    jellyEl.style.height = `${state.size}px`;
    jellyEl.style.opacity = "0.4";
    jellyEl.style.transform = `translate(${state.x}px, ${state.y}px)`;
}

function readBubbleState(bubbleEl) {
    const pos = parsePair(bubbleEl.dataset.jellyPos, 0, 0);
    const vel = parsePair(bubbleEl.dataset.jellyVel, 0, 0);

    return {
        x: pos.x,
        y: pos.y,
        vx: vel.x,
        vy: vel.y,
        size: toNumber(bubbleEl.dataset.jellySize, 0),
        opacity: bubbleEl.dataset.jellyOpacity ?? "1",
        cursorInside: toBool(bubbleEl.dataset.jellyCursorInside, false),
    };
}

function writeBubbleState(bubbleEl, state) {
    bubbleEl.dataset.jellyPos = formatPair(state.x, state.y);
    bubbleEl.dataset.jellyVel = formatPair(state.vx, state.vy);
    bubbleEl.dataset.jellySize = String(state.size);
    bubbleEl.dataset.jellyOpacity = String(state.opacity);
    bubbleEl.dataset.jellyCursorInside = String(Boolean(state.cursorInside));

    bubbleEl.style.position = "absolute";
    bubbleEl.style.width = `${state.size}px`;
    bubbleEl.style.height = `${state.size}px`;
    bubbleEl.style.opacity = String(state.opacity);
    bubbleEl.style.transform = `translate(${state.x}px, ${state.y}px)`;
}

function resolveCircleEnter(state, centerX, centerY, radius, mouseX, mouseY, mouseSpeed, triggerSpeed) {
    const dx = centerX - mouseX;
    const dy = centerY - mouseY;
    const distSq = dx * dx + dy * dy;
    const inside = distSq <= radius * radius;

    if (!inside || state.cursorInside) {
        state.cursorInside = inside;
        return null;
    }

    if (mouseSpeed < triggerSpeed) {
        state.cursorInside = inside;
        return null;
    }

    state.cursorInside = true;

    const dist = Math.max(Math.sqrt(distSq), 0.0001);
    return {
        nx: dx / dist,
        ny: dy / dist,
    };
}

class JellyTank {
    static instances = new Map();

    static getInstance(target) {
        const element = resolveElement(target);
        if (!element) return null;
        return JellyTank.instances.get(element) ?? null;
    }

    constructor(target, options = {}) {
        const element = resolveElement(target);
        if (!element) {
            throw new Error("JellyTank: target element was not found.");
        }

        const runtimeOptions = { ...DEFAULT_RUNTIME_OPTIONS, ...options };

        this.container = element;
        this.owner = ensureOwnerElement(this.container);
        this.jellyConfig = { ...DEFAULT_JELLY_CONFIG, ...(options.jellyConfig ?? {}) };
        this.bubbleConfig = { ...DEFAULT_BUBBLE_CONFIG, ...(options.bubbleConfig ?? {}) };
        this.options = {
            autoStart: runtimeOptions.autoStart,
            startupJellyRatio: runtimeOptions.startupJellyRatio,
            startupBubbleRatio: runtimeOptions.startupBubbleRatio,
            debugSpawns: runtimeOptions.debugSpawns,
        };

        this.fieldWidth = 0;
        this.fieldHeight = 0;

        this.jellies = new Set();
        this.bubbles = new Set();

        this.mouseState = {
            x: 0,
            y: 0,
            active: false,
            speed: 0,
            lastX: null,
            lastY: null,
            lastMoveAt: null,
        };

        this.spawnTimer = null;
        this.bubbleSpawnTimer = null;
        this.animationFrameId = null;
        this.resizeObserver = null;
        this.running = false;
        this.spawnEdgeQueue = [];
        this.spawnDebugCounts = {
            left: 0,
            right: 0,
            top: 0,
            bottom: 0,
        };

        this.updateMousePositionBound = this.updateMousePosition.bind(this);
        this.handlePointerDownBound = this.handlePointerDown.bind(this);
        this.clearMousePositionBound = this.clearMousePosition.bind(this);
        this.onContainerResizeBound = this.onContainerResize.bind(this);
        this.animationLoopBound = this.animationLoop.bind(this);

        JellyTank.instances.set(this.container, this);

        if (this.options.autoStart) {
            this.start();
        }
    }

    getJellyElements() {
        return Array.from(this.owner.querySelectorAll('[data-jelly-kind="jelly"]'));
    }

    getBubbleElements() {
        return Array.from(this.owner.querySelectorAll('[data-jelly-kind="bubble"]'));
    }

    syncOwnerState() {
        this.owner.dataset.jellyField = formatPair(this.fieldWidth, this.fieldHeight);
        this.owner.dataset.jellyMouse = formatPair(this.mouseState.x, this.mouseState.y);
        this.owner.dataset.jellyMouseActive = String(this.mouseState.active);
        this.owner.dataset.jellyMouseSpeed = String(this.mouseState.speed);
        this.owner.dataset.jellyRunning = String(this.running);
        this.owner.dataset.jellyCounts = formatPair(this.getJellyElements().length, this.getBubbleElements().length);
    }

    isJellyScareEnabled() {
        return this.owner.hasAttribute("data-jellytank-jelly-scare")
            || this.container.hasAttribute("data-jellytank-jelly-scare");
    }

    isBubblePopEnabled() {
        return this.owner.hasAttribute("data-jellytank-bubble-pop")
            || this.container.hasAttribute("data-jellytank-bubble-pop");
    }

    start() {
        if (this.running) return;
        this.running = true;

        this.owner = ensureOwnerElement(this.container);
        this.updateFieldDimensions();
        this.syncOwnerState();

        document.addEventListener("pointermove", this.updateMousePositionBound, true);
        document.addEventListener("pointerdown", this.handlePointerDownBound, true);
        this.container.addEventListener("pointerleave", this.clearMousePositionBound);

        if ("ResizeObserver" in window) {
            this.resizeObserver = new ResizeObserver(this.onContainerResizeBound);
            this.resizeObserver.observe(this.container);
        } else {
            window.addEventListener("resize", this.onContainerResizeBound);
            window.addEventListener("scroll", this.onContainerResizeBound, { passive: true });
        }

        if (this.getJellyElements().length === 0 && this.options.startupJellyRatio > 0) {
            const startupCount = Math.max(0, Math.floor(this.jellyConfig.maxCount * this.options.startupJellyRatio));
            for (let i = 0; i < startupCount; i += 1) {
                this.spawnJelly();
            }
        }

        if (this.getBubbleElements().length === 0 && this.options.startupBubbleRatio > 0) {
            const startupCount = Math.max(0, Math.floor(this.bubbleConfig.maxCount * this.options.startupBubbleRatio));
            for (let i = 0; i < startupCount; i += 1) {
                this.spawnBubble();
            }
        }

        this.scheduleNextSpawn();
        this.scheduleNextBubbleSpawn();
        this.animationFrameId = requestAnimationFrame(this.animationLoopBound);
    }

    stop() {
        if (!this.running) return;
        this.running = false;

        if (this.spawnTimer != null) {
            window.clearTimeout(this.spawnTimer);
            this.spawnTimer = null;
        }
        if (this.bubbleSpawnTimer != null) {
            window.clearTimeout(this.bubbleSpawnTimer);
            this.bubbleSpawnTimer = null;
        }
        if (this.animationFrameId != null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }

        document.removeEventListener("pointermove", this.updateMousePositionBound, true);
        document.removeEventListener("pointerdown", this.handlePointerDownBound, true);
        this.container.removeEventListener("pointerleave", this.clearMousePositionBound);

        if (this.resizeObserver) {
            this.resizeObserver.disconnect();
            this.resizeObserver = null;
        } else {
            window.removeEventListener("resize", this.onContainerResizeBound);
            window.removeEventListener("scroll", this.onContainerResizeBound);
        }

        this.syncOwnerState();
    }

    destroy({ clearDom = true } = {}) {
        this.stop();
        if (clearDom) {
            this.clearAllEntities();
        }
        JellyTank.instances.delete(this.container);
    }

    clearAllEntities() {
        for (const jellyEl of this.getJellyElements()) {
            if (this.owner.contains(jellyEl)) {
                this.owner.removeChild(jellyEl);
            }
        }
        for (const bubbleEl of this.getBubbleElements()) {
            if (this.owner.contains(bubbleEl)) {
                this.owner.removeChild(bubbleEl);
            }
        }

        this.jellies.clear();
        this.bubbles.clear();
        this.syncOwnerState();
    }

    updateFieldDimensions() {
        this.fieldWidth = this.container.clientWidth || this.owner.clientWidth || window.innerWidth;
        this.fieldHeight = this.container.clientHeight || this.owner.clientHeight || window.innerHeight;
        this.syncOwnerState();
    }

    onContainerResize() {
        this.updateFieldDimensions();
    }

    updateMousePosition(event) {
        const rect = this.container.getBoundingClientRect();
        const nextX = event.clientX - rect.left;
        const nextY = event.clientY - rect.top;
        const now = performance.now();

        if (this.mouseState.lastX == null || this.mouseState.lastY == null || this.mouseState.lastMoveAt == null) {
            this.mouseState.speed = 0;
        } else {
            const dx = nextX - this.mouseState.lastX;
            const dy = nextY - this.mouseState.lastY;
            const dt = Math.max(now - this.mouseState.lastMoveAt, 0.0001);
            this.mouseState.speed = Math.hypot(dx, dy) / dt;
        }

        this.mouseState.lastX = nextX;
        this.mouseState.lastY = nextY;
        this.mouseState.lastMoveAt = now;

        this.mouseState.x = nextX;
        this.mouseState.y = nextY;

        const insideTank = nextX >= 0 && nextX <= this.fieldWidth && nextY >= 0 && nextY <= this.fieldHeight;
        this.mouseState.active = insideTank;
        this.syncOwnerState();
        if (!insideTank) return;

        if (this.isBubblePopEnabled()) {
            for (const bubbleEl of this.getBubbleElements()) {
                this.applyMouseBubblePop(bubbleEl, this.mouseState.x, this.mouseState.y, this.mouseState.speed);
            }
        }
    }

    handlePointerDown(event) {
        const rect = this.container.getBoundingClientRect();
        const clickX = event.clientX - rect.left;
        const clickY = event.clientY - rect.top;
        const insideTank = clickX >= 0 && clickX <= this.fieldWidth && clickY >= 0 && clickY <= this.fieldHeight;
        if (!insideTank) return;

        if (this.isJellyScareEnabled()) {
            for (const jellyEl of this.getJellyElements()) {
                this.applyClickScare(jellyEl, clickX, clickY);
            }
        }

        if (this.isBubblePopEnabled()) {
            for (const bubbleEl of this.getBubbleElements()) {
                this.applyMouseBubblePopFromClick(bubbleEl, clickX, clickY);
            }
        }
    }

    clearMousePosition() {
        this.mouseState.active = false;
        this.mouseState.speed = 0;
        this.mouseState.lastX = null;
        this.mouseState.lastY = null;
        this.mouseState.lastMoveAt = null;

        resetCursorInside(this.getJellyElements());
        resetCursorInside(this.getBubbleElements());
        this.syncOwnerState();
    }

    applyMouseBounce(jellyEl, mouseX, mouseY, mouseSpeed) {
        const state = readJellyState(jellyEl);
        const now = performance.now();

        const centerX = state.x + state.size / 2;
        const centerY = state.y + state.size / 2;
        const hit = resolveCircleEnter(
            state,
            centerX,
            centerY,
            state.size / 2,
            mouseX,
            mouseY,
            mouseSpeed,
            this.jellyConfig.scareSpeed,
        );
        if (!hit) {
            writeJellyState(jellyEl, state);
            return;
        }

        if (now - state.lastScaredAt < this.jellyConfig.scareCooldown) {
            writeJellyState(jellyEl, state);
            return;
        }

        const { nx, ny } = hit;
        const dot = state.vx * nx + state.vy * ny;
        let rvx = state.vx;
        let rvy = state.vy;

        if (dot < 0) {
            rvx = state.vx - 2 * dot * nx;
            rvy = state.vy - 2 * dot * ny;
        }

        const rLen = Math.hypot(rvx, rvy) || 1;
        state.vx = rvx / rLen;
        state.vy = rvy / rLen;

        state.burst = this.jellyConfig.burstMin + Math.random() * (this.jellyConfig.burstMax - this.jellyConfig.burstMin);
        state.burst *= 1.5;

        state.rotation = Math.atan2(state.vy, state.vx) * (180 / Math.PI);
        state.totalSpriteRotation = this.jellyConfig.spriteAngle + state.rotation;
        const spriteEl = jellyEl.querySelector(".jelly");
        if (spriteEl) {
            spriteEl.style.transform = `rotate(${state.totalSpriteRotation}deg) translate(50%, 50%)`;
        }

        state.lastScaredAt = now;
        writeJellyState(jellyEl, state);
    }

    applyClickScare(jellyEl, clickX, clickY) {
        const state = readJellyState(jellyEl);
        const now = performance.now();

        if (now - state.lastScaredAt < this.jellyConfig.scareCooldown) {
            return;
        }

        const centerX = state.x + state.size / 2;
        const centerY = state.y + state.size / 2;
        const dx = centerX - clickX;
        const dy = centerY - clickY;
        const dist = Math.hypot(dx, dy);
        const radius = state.size / 2;
        const triggerDistance = radius * 1.5;

        if (dist > triggerDistance) {
            return;
        }

        const safeDist = Math.max(dist, 0.0001);
        state.vx = dx / safeDist;
        state.vy = dy / safeDist;

        const proximity = 1 - Math.min(dist / triggerDistance, 1);
        const burstMultiplier = 1 + proximity * 2;

        const baseBurst = this.jellyConfig.burstMin
            + Math.random() * (this.jellyConfig.burstMax - this.jellyConfig.burstMin);
        state.burst = baseBurst * burstMultiplier;

        state.rotation = Math.atan2(state.vy, state.vx) * (180 / Math.PI);
        state.totalSpriteRotation = this.jellyConfig.spriteAngle + state.rotation;

        const spriteEl = jellyEl.querySelector(".jelly");
        if (spriteEl) {
            spriteEl.style.transform = `rotate(${state.totalSpriteRotation}deg) translate(50%, 50%)`;
        }

        state.lastScaredAt = now;
        writeJellyState(jellyEl, state);
    }

    applyMouseBubblePop(bubbleEl, mouseX, mouseY, mouseSpeed) {
        const state = readBubbleState(bubbleEl);
        const centerX = state.x + state.size / 2;
        const centerY = state.y + state.size / 2;
        const hit = resolveCircleEnter(
            state,
            centerX,
            centerY,
            state.size / 2,
            mouseX,
            mouseY,
            mouseSpeed,
            this.bubbleConfig.popSpeed,
        );
        if (!hit) {
            writeBubbleState(bubbleEl, state);
            return;
        }
        this.popBubble(bubbleEl);
    }

    applyMouseBubblePopFromClick(bubbleEl, clickX, clickY) {
        const state = readBubbleState(bubbleEl);
        const centerX = state.x + state.size / 2;
        const centerY = state.y + state.size / 2;
        const dx = centerX - clickX;
        const dy = centerY - clickY;
        const distSq = dx * dx + dy * dy;
        const radius = state.size / 2;

        if (distSq <= radius * radius) {
            this.popBubble(bubbleEl);
        }
    }

    makeJelly(config) {
        const wrapper = document.createElement("div");
        wrapper.classList.add("jelly-wrapper");
        wrapper.dataset.jellyKind = "jelly";

        const jelly = document.createElement("div");
        jelly.classList.add("jelly");

        jelly.dataset.animeSrc = this.jellyConfig.src;
        jelly.dataset.animeRows = String(this.jellyConfig.frameRows);
        jelly.dataset.animeCols = String(this.jellyConfig.frameCols);
        jelly.dataset.animeTintfill = String(config.color);
        jelly.dataset.animeInterval = String(config.frameInterval);

        if (Number.isInteger(config.lastFrameNumber) && config.lastFrameNumber >= 0) {
            jelly.dataset.animeFrame = String(config.lastFrameNumber);
        }

        wrapper.appendChild(jelly);
        writeJellyState(wrapper, {
            x: config.simX,
            y: config.simY,
            vx: config.vx,
            vy: config.vy,
            size: config.size,
            rotation: config.rotationDeg,
            burst: config.burst ?? 0,
            lastFrameNumber: config.lastFrameNumber ?? -1,
            cursorInside: config.cursorInside ?? false,
            lastScaredAt: config.lastScaredAt ?? 0,
            steerPhase: config.steerPhase,
            steerFreq: config.steerFreq,
            steerAmp: config.steerAmp,
            steerNoise: config.steerNoise,
            color: config.color,
            frameInterval: config.frameInterval,
            totalSpriteRotation: this.jellyConfig.spriteAngle + config.rotationDeg,
        });
        jelly.style.width = "100%";
        jelly.style.height = "100%";
        jelly.style.opacity = "0.4";
        jelly.style.transform = `rotate(${this.jellyConfig.spriteAngle + config.rotationDeg}deg) translate(50%, 50%)`;

        return wrapper;
    }

    nextSpawnEdge() {
        if (this.spawnEdgeQueue.length === 0) {
            const edges = ["left", "right", "top", "bottom"];
            for (let i = edges.length - 1; i > 0; i -= 1) {
                const j = Math.floor(Math.random() * (i + 1));
                const tmp = edges[i];
                edges[i] = edges[j];
                edges[j] = tmp;
            }
            this.spawnEdgeQueue = edges;
        }

        return this.spawnEdgeQueue.pop();
    }

    spawnJelly(forcedState = null) {
        if (this.fieldWidth <= 0 || this.fieldHeight <= 0) return null;
        if (!forcedState && this.getJellyElements().length >= this.jellyConfig.maxCount) return null;

        if (forcedState) {
            return this.addJellyFromState(forcedState);
        }

        const size = this.jellyConfig.sizeMin + Math.random() * (this.jellyConfig.sizeMax - this.jellyConfig.sizeMin);
        const spawnInset = size * 0.8;
        const innerWidth = Math.max(0, this.fieldWidth - size);
        const innerHeight = Math.max(0, this.fieldHeight - size);
        const edge = this.nextSpawnEdge();
        if (this.options.debugSpawns && this.spawnDebugCounts[edge] != null) {
            this.spawnDebugCounts[edge] += 1;
            this.owner.dataset.jellySpawnCounts = JSON.stringify(this.spawnDebugCounts);
        }

        let simX = 0;
        let simY = 0;

        switch (edge) {
            case "left":
                simX = -spawnInset;
                simY = Math.random() * innerHeight;
                break;
            case "right":
                simX = this.fieldWidth + size - spawnInset;
                simY = Math.random() * innerHeight;
                break;
            case "top":
                simX = Math.random() * innerWidth;
                simY = -spawnInset;
                break;
            case "bottom":
                simX = Math.random() * innerWidth;
                simY = this.fieldHeight + size - spawnInset;
                break;
        }

        const spawnCenterX = simX + size / 2;
        const spawnCenterY = simY + size / 2;
        const targetX = this.fieldWidth / 2 + (Math.random() - 0.5) * this.fieldWidth * 0.25;
        const targetY = this.fieldHeight / 2 + (Math.random() - 0.5) * this.fieldHeight * 0.25;
        const toTargetX = targetX - spawnCenterX;
        const toTargetY = targetY - spawnCenterY;
        const toTargetLength = Math.hypot(toTargetX, toTargetY) || 1;
        const inwardX = toTargetX / toTargetLength;
        const inwardY = toTargetY / toTargetLength;

        let travelAngle = Math.atan2(inwardY, inwardX) + (Math.random() - 0.5) * 0.35;
        let vx = Math.cos(travelAngle);
        let vy = Math.sin(travelAngle);

        // Ensure the first heading still moves inward after jitter.
        if (vx * inwardX + vy * inwardY < 0) {
            travelAngle = Math.atan2(inwardY, inwardX);
            vx = Math.cos(travelAngle);
            vy = Math.sin(travelAngle);
        }

        const travelAngleDeg = travelAngle * (180 / Math.PI);
        const frameInterval = this.jellyConfig.frameSpeedMin
            + Math.random() * (this.jellyConfig.frameSpeedMax - this.jellyConfig.frameSpeedMin);
        const color = this.jellyConfig.colors[Math.floor(Math.random() * this.jellyConfig.colors.length)];

        return this.addJellyFromState({
            x: simX,
            y: simY,
            simX,
            simY,
            vx,
            vy,
            size,
            rotation: travelAngleDeg,
            burst: this.jellyConfig.burstMin + Math.random() * (this.jellyConfig.burstMax - this.jellyConfig.burstMin),
            lastFrameNumber: -1,
            cursorInside: false,
            lastScaredAt: 0,
            steerPhase: Math.random() * Math.PI * 2,
            steerFreq: 0.0012 + Math.random() * 0.0016,
            steerAmp: 0.0006 + Math.random() * 0.0012,
            steerNoise: 0.0001 + Math.random() * 0.0025,
            color,
            frameInterval,
        });
    }

    addJellyFromState(rawState) {
        const state = {
            x: rawState.x ?? rawState.simX ?? 0,
            y: rawState.y ?? rawState.simY ?? 0,
            vx: rawState.vx,
            vy: rawState.vy,
            size: rawState.size,
            rotation: rawState.rotation,
            burst: rawState.burst,
            lastFrameNumber: rawState.lastFrameNumber ?? -1,
            cursorInside: rawState.cursorInside ?? false,
            lastScaredAt: rawState.lastScaredAt ?? 0,
            steerPhase: rawState.steerPhase,
            steerFreq: rawState.steerFreq,
            steerAmp: rawState.steerAmp,
            steerNoise: rawState.steerNoise,
            color: rawState.color,
            frameInterval: rawState.frameInterval,
        };

        const jellyEl = this.makeJelly({
            simX: state.x,
            simY: state.y,
            vx: state.vx,
            vy: state.vy,
            size: state.size,
            rotationDeg: state.rotation,
            color: state.color,
            frameInterval: state.frameInterval,
            lastFrameNumber: state.lastFrameNumber,
            cursorInside: state.cursorInside,
            lastScaredAt: state.lastScaredAt,
            steerPhase: state.steerPhase,
            steerFreq: state.steerFreq,
            steerAmp: state.steerAmp,
            steerNoise: state.steerNoise,
            burst: state.burst,
        });

        this.owner.appendChild(jellyEl);
        this.jellies.add(jellyEl);
        this.syncOwnerState();
        return jellyEl;
    }

    updateJelly(jellyEl, state) {
        state = readJellyState(jellyEl);
        const now = performance.now();
        const velocityLength = Math.hypot(state.vx, state.vy);
        let heading = Math.atan2(state.vy, state.vx);
        if (!Number.isFinite(heading) || velocityLength < 0.0001) {
            const fallbackRotation = Number.isFinite(state.rotation) ? state.rotation * (Math.PI / 180) : 0;
            heading = fallbackRotation;
            state.vx = Math.cos(heading);
            state.vy = Math.sin(heading);
        }
        const sineTurn = Math.sin(now * state.steerFreq + state.steerPhase) * state.steerAmp;
        const noiseTurn = (Math.random() - 0.5) * 2 * state.steerNoise;
        const nextHeading = heading + sineTurn + noiseTurn;
        state.vx = Math.cos(nextHeading);
        state.vy = Math.sin(nextHeading);
        state.rotation = nextHeading * (180 / Math.PI);

        state.x += state.vx * state.burst;
        state.y += state.vy * state.burst;

        const spriteEl = jellyEl.querySelector(".jelly");
        const currentFrame = Number.parseInt(spriteEl?.dataset?.animeFrame ?? "", 10);

        if (
            Number.isInteger(currentFrame)
            && currentFrame === this.jellyConfig.burstFrame
            && state.lastFrameNumber !== currentFrame
        ) {
            state.burst = this.jellyConfig.burstMin
                + Math.random() * (this.jellyConfig.burstMax - this.jellyConfig.burstMin);
        }

        if (Number.isInteger(currentFrame)) {
            state.lastFrameNumber = currentFrame;
        }

        state.burst *= this.jellyConfig.decelMin + Math.random() * (this.jellyConfig.decelMax - this.jellyConfig.decelMin);

        if (spriteEl) {
            state.totalSpriteRotation = this.jellyConfig.spriteAngle + state.rotation;
            spriteEl.style.transform = `rotate(${state.totalSpriteRotation}deg) translate(50%, 50%)`;
            spriteEl.dataset.animeFrame = String(state.lastFrameNumber);
        }

        writeJellyState(jellyEl, state);

        const killPadding = state.size * 1.6;
        if (
            state.x < -killPadding
            || state.x > this.fieldWidth + killPadding
            || state.y < -killPadding
            || state.y > this.fieldHeight + killPadding
        ) {
            this.removeJelly(jellyEl);
        }
    }

    removeJelly(jellyEl) {
        if (!jellyEl) return;
        this.jellies.delete(jellyEl);
        if (this.owner.contains(jellyEl)) {
            this.owner.removeChild(jellyEl);
        }
    }

    scheduleNextSpawn() {
        if (!this.running) return;
        const delay = this.jellyConfig.spawnIntervalMin
            + Math.random() * (this.jellyConfig.spawnIntervalMax - this.jellyConfig.spawnIntervalMin);
        this.spawnTimer = window.setTimeout(() => {
            this.spawnJelly();
            this.scheduleNextSpawn();
        }, delay);
    }

    makeBubble(config) {
        const bubble = document.createElement("button");
        bubble.type = "button";
        bubble.setAttribute("aria-label", "Pop bubble");
        bubble.classList.add("bubble");
        bubble.dataset.jellyKind = "bubble";
        writeBubbleState(bubble, {
            x: config.simX,
            y: config.simY,
            vx: config.vx,
            vy: config.vy,
            size: config.size,
            opacity: config.opacity,
            cursorInside: config.cursorInside ?? false,
        });
        return bubble;
    }

    spawnBubble(forcedState = null) {
        if (this.fieldWidth <= 0 || this.fieldHeight <= 0) return null;
        if (!forcedState && this.getBubbleElements().length >= this.bubbleConfig.maxCount) return null;

        if (forcedState) {
            return this.addBubbleFromState(forcedState);
        }

        const size = this.bubbleConfig.sizeMin + Math.random() * (this.bubbleConfig.sizeMax - this.bubbleConfig.sizeMin);
        const simX = Math.random() * Math.max(0, this.fieldWidth - size);
        const simY = this.fieldHeight + size * (0.2 + Math.random() * 0.8);
        const vx = -(this.bubbleConfig.driftLeftMin
            + Math.random() * (this.bubbleConfig.driftLeftMax - this.bubbleConfig.driftLeftMin));
        const vy = -(this.bubbleConfig.speedUpMin
            + Math.random() * (this.bubbleConfig.speedUpMax - this.bubbleConfig.speedUpMin));
        const opacity = (0.1 + Math.random() * 0.1).toFixed(3);

        return this.addBubbleFromState({
            x: simX,
            y: simY,
            vx,
            vy,
            size,
            opacity,
            cursorInside: false,
        });
    }

    addBubbleFromState(rawState) {
        const state = {
            x: rawState.x ?? rawState.simX ?? 0,
            y: rawState.y ?? rawState.simY ?? 0,
            vx: rawState.vx,
            vy: rawState.vy,
            size: rawState.size,
            opacity: rawState.opacity,
            cursorInside: rawState.cursorInside ?? false,
        };

        const bubbleEl = this.makeBubble({
            simX: state.x,
            simY: state.y,
            size: state.size,
            opacity: state.opacity,
            vx: state.vx,
            vy: state.vy,
            cursorInside: state.cursorInside,
        });

        this.owner.appendChild(bubbleEl);
        this.bubbles.add(bubbleEl);
        this.syncOwnerState();
        return bubbleEl;
    }

    popBubble(bubbleEl) {
        if (!bubbleEl) return;
        this.bubbles.delete(bubbleEl);
        if (this.owner.contains(bubbleEl)) {
            this.owner.removeChild(bubbleEl);
        }
    }

    updateBubble(bubbleEl) {
        const state = readBubbleState(bubbleEl);
        state.x += state.vx;
        state.y += state.vy;
        writeBubbleState(bubbleEl, state);

        const killPadding = state.size * 1.3;
        if (state.y < -killPadding || state.x < -killPadding || state.x > this.fieldWidth + killPadding) {
            this.popBubble(bubbleEl);
        }
    }

    scheduleNextBubbleSpawn() {
        if (!this.running) return;
        const delay = this.bubbleConfig.spawnIntervalMin
            + Math.random() * (this.bubbleConfig.spawnIntervalMax - this.bubbleConfig.spawnIntervalMin);
        this.bubbleSpawnTimer = window.setTimeout(() => {
            this.spawnBubble();
            this.scheduleNextBubbleSpawn();
        }, delay);
    }

    animationLoop() {
        if (!this.running) return;

        for (const bubbleEl of this.getBubbleElements()) {
            this.updateBubble(bubbleEl);
        }

        for (const jellyEl of this.getJellyElements()) {
            this.updateJelly(jellyEl);
        }

        this.syncOwnerState();

        this.animationFrameId = requestAnimationFrame(this.animationLoopBound);
    }

    getStateSnapshot() {
        return {
            fieldWidth: this.fieldWidth,
            fieldHeight: this.fieldHeight,
            jellyConfig: { ...this.jellyConfig },
            bubbleConfig: { ...this.bubbleConfig },
            options: { ...this.options },
            ownerAttributes: serializeAttributes(this.owner),
            mouseState: {
                x: this.mouseState.x,
                y: this.mouseState.y,
                active: this.mouseState.active,
                speed: this.mouseState.speed,
                lastX: this.mouseState.lastX,
                lastY: this.mouseState.lastY,
                lastMoveAt: this.mouseState.lastMoveAt,
            },
            jellies: this.getJellyElements().map((jellyEl) => serializeAttributes(jellyEl)),
            bubbles: this.getBubbleElements().map((bubbleEl) => serializeAttributes(bubbleEl)),
        };
    }

    importState(snapshot, options = {}) {
        const {
            clearExisting = true,
            scaleToFit = true,
            keepRuntimeOptions = true,
            start = false,
        } = options;

        if (!snapshot) return;

        if (clearExisting) {
            this.clearAllEntities();
        }

        this.jellyConfig = { ...this.jellyConfig, ...(snapshot.jellyConfig ?? {}) };
        this.bubbleConfig = { ...this.bubbleConfig, ...(snapshot.bubbleConfig ?? {}) };

        if (!keepRuntimeOptions && snapshot.options) {
            this.options = {
                autoStart: this.options.autoStart,
                startupJellyRatio: snapshot.options.startupJellyRatio ?? this.options.startupJellyRatio,
                startupBubbleRatio: snapshot.options.startupBubbleRatio ?? this.options.startupBubbleRatio,
            };
        }

        this.updateFieldDimensions();
        this.owner = ensureOwnerElement(this.container);

        if (snapshot.ownerAttributes) {
            applyAttributes(this.owner, snapshot.ownerAttributes);
        }
        this.owner.dataset.jellyOwner = "true";

        const sourceWidth = snapshot.fieldWidth > 0 ? snapshot.fieldWidth : this.fieldWidth || 1;
        const sourceHeight = snapshot.fieldHeight > 0 ? snapshot.fieldHeight : this.fieldHeight || 1;
        const scaleX = scaleToFit ? this.fieldWidth / sourceWidth : 1;
        const scaleY = scaleToFit ? this.fieldHeight / sourceHeight : 1;
        const scaleAvg = (scaleX + scaleY) / 2;

        const incomingJellies = Array.isArray(snapshot.jellies) ? snapshot.jellies : [];
        for (const jellyState of incomingJellies) {
            const jellyAttrs = { ...jellyState };
            const tempJelly = document.createElement("div");
            applyAttributes(tempJelly, jellyAttrs);
            const parsed = readJellyState(tempJelly);
            this.spawnJelly({
                x: parsed.x * scaleX,
                y: parsed.y * scaleY,
                vx: parsed.vx,
                vy: parsed.vy,
                size: parsed.size * scaleAvg,
                rotation: parsed.rotation,
                burst: parsed.burst * scaleAvg,
                lastFrameNumber: parsed.lastFrameNumber,
                cursorInside: false,
                lastScaredAt: 0,
                steerPhase: parsed.steerPhase,
                steerFreq: parsed.steerFreq,
                steerAmp: parsed.steerAmp,
                steerNoise: parsed.steerNoise,
                color: parsed.color,
                frameInterval: parsed.frameInterval,
            });
        }

        const incomingBubbles = Array.isArray(snapshot.bubbles) ? snapshot.bubbles : [];
        for (const bubbleState of incomingBubbles) {
            const bubbleAttrs = { ...bubbleState };
            const tempBubble = document.createElement("div");
            applyAttributes(tempBubble, bubbleAttrs);
            const parsed = readBubbleState(tempBubble);
            this.spawnBubble({
                x: parsed.x * scaleX,
                y: parsed.y * scaleY,
                vx: parsed.vx,
                vy: parsed.vy,
                size: parsed.size * scaleAvg,
                opacity: parsed.opacity,
                cursorInside: false,
            });
        }

        this.mouseState = {
            x: 0,
            y: 0,
            active: false,
            speed: 0,
            lastX: null,
            lastY: null,
            lastMoveAt: null,
            ...(snapshot.mouseState ?? {}),
        };
        this.clearMousePosition();
        this.syncOwnerState();

        if (start && !this.running) {
            this.start();
        }
    }

    copyStateTo(target, options = {}) {
        const targetElement = resolveElement(target);
        if (!targetElement) {
            throw new Error("JellyTank.copyStateTo: target element was not found.");
        }

        if (this.isJellyScareEnabled()) {
            targetElement.setAttribute("data-jellytank-jelly-scare", "");
        } else {
            targetElement.removeAttribute("data-jellytank-jelly-scare");
        }

        if (this.isBubblePopEnabled()) {
            targetElement.setAttribute("data-jellytank-bubble-pop", "");
        } else {
            targetElement.removeAttribute("data-jellytank-bubble-pop");
        }

        const sourceSnapshot = this.getStateSnapshot();
        const {
            start = true,
            reuseTarget = true,
            targetOptions = {},
        } = options;

        let targetTank = reuseTarget ? JellyTank.getInstance(targetElement) : null;
        if (!targetTank) {
            targetTank = new JellyTank(targetElement, {
                autoStart: false,
                startupJellyRatio: 0,
                startupBubbleRatio: 0,
                jellyConfig: sourceSnapshot.jellyConfig,
                bubbleConfig: sourceSnapshot.bubbleConfig,
                ...targetOptions,
            });
        }

        targetTank.importState(sourceSnapshot, { ...options, start: false });
        if (start) {
            targetTank.start();
        }

        return targetTank;
    }
}

function copyJellyTankState(source, target, options = {}) {
    const sourceTank = source instanceof JellyTank ? source : JellyTank.getInstance(source);
    if (!sourceTank) {
        throw new Error("copyJellyTankState: source JellyTank instance was not found.");
    }
    return sourceTank.copyStateTo(target, options);
}

function setupDefaultJellyTank() {
    const defaultContainer = document.getElementById("jellytank");
    if (!defaultContainer) return;
    if (JellyTank.getInstance(defaultContainer)) return;

    if (!defaultContainer.hasAttribute("data-jellytank-jelly-scare")) {
        defaultContainer.setAttribute("data-jellytank-jelly-scare", "");
    }
    if (!defaultContainer.hasAttribute("data-jellytank-bubble-pop")) {
        defaultContainer.setAttribute("data-jellytank-bubble-pop", "");
    }

    const tank = new JellyTank(defaultContainer);
    window.jellyTank = tank;
    window.defaultJellyTank = tank;
}

window.JellyTank = JellyTank;
window.copyJellyTankState = copyJellyTankState;

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", setupDefaultJellyTank);
} else {
    setupDefaultJellyTank();
}
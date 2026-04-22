/*
EzLivecanvas 
By Asciiz

Lightweight canvas action engine for dynamic visual shi (jellytank, starglitter,
go wild and make custom terrain or something, that would genuinely be cool).

Built for runtime overlays and gameplay-ish effects without committing to a full
engine stack. Keep it simple, wire actions, let it cook.

# Guide:
    + include EzLivecanvas.js in your page
    + create a runtime canvas with new window.EzLivecanvas({ width, height })
    + mount it with canv.mount(host) and unmount it with canv.unmount()
    + when you are done for real, call canv.destroy() to fully clean up

    + Asset helpers
        + addAsset(key, value): store any shared value/function
        + addImage(key, url): preload image asset as { type: "img", img }
            -> returns the final key (string) or null
        + addAudio(key, url): preload audio asset as { type: "audio", audio }
            -> returns the final key (string) or null
        + runFn(key, ...params): execute a function asset
        + playAudio(key, options): plays a registered audio asset
            -> returns HTMLAudioElement on success path, null on invalid key

    + Action system (the bread and butter)
        + addAction(key, cfg)
            + cfg = {
                attrs: { ... },
                update: function(self, canv) { ... },
                events: {
                    click: function(self, canv, e) { ... },
                    pointermove: function(self, canv, e) { ... },
                    ...
                }
            }
        + removeAction(key): remove action and detach unused global event handlers

    + Canvas event behavior
        + one listener per event type on document (shared global listener)
        + when event fires, it loops all actions and runs self.events[event](self, canv, e)
        + action callback only runs when pointer is inside current canvas bounds
        + pointer-events comes from passthrough config (not inferred from actions)

    + Other
        + drawImage(assetKey, rect, style) accepts normal ctx style keys directly
        + mouse = {
            viewport: { x, y }, // in viewport coord (global)
            pos: { x, y },      // in canvas coord (local)
            ndc: { x, y },      // in canvas NDC coord [-1, 1]
        }
        + mousepos(ndc=false) returns the latest mouse position in canvas coord
            + ndc=true return mouse.ndc, otherwise return mouse.pos

# Notes:

    + reserved style keys:
        + angleRad, pivotX, pivotY: control image rotation around pivot
    + deltatime is in seconds
    + shared is a free object for cross-action runtime state
    + It is recommended against setting custom style or attributes for the canvas, just use mount() and unmount()
    + return-value policy is intentionally predictable:
        + add* style methods return key or null
        + remove* style methods return boolean

*/

class EzLivecanvas {
    constructor(cfg = {width: 300, height: 150, passthrough: true}) {
        this.cfg = {
            width: Number.isFinite(cfg.width) ? cfg.width : 0,
            height: Number.isFinite(cfg.height) ? cfg.height : 0,
            passthrough: cfg.passthrough === true
        };

        this.canvas = document.createElement("canvas");
        this.ctx = this.canvas.getContext("2d", { alpha: true });

        this.mountHost = null;

        this.assets = {};
        this.shared = {};
        this.actions = {};

        this.mouse = {
            viewport: null,
            pos: null,
            ndc: null,
        };

        this.deltatime = 0;


        this._handleResize = this._handleResize.bind(this);

        this._rafId = null;
        this._lastFrameAt = null;
        this._loop = this._loop.bind(this);
        this._canvasEventHandlers = {};

        this._applyCanvasBaseStyle();
        this._applyCanvasDimensions();
    }

    static cloneData(value) {
        if (typeof structuredClone === "function") {
            return structuredClone(value);
        }

        if (value == null) return value;
        return JSON.parse(JSON.stringify(value));
    }

    _applyCanvasBaseStyle() {
        this.canvas.style.position = "absolute";
        this.canvas.style.inset = "0";
        this.canvas.style.width = "100%";
        this.canvas.style.height = "100%";
        this.canvas.style.pointerEvents = this.cfg.passthrough ? "none" : "auto";
        this.canvas.style.display = "block";
    }

    _applyCanvasDimensions(width = this.cfg.width, height = this.cfg.height) {
        const w = Math.max(1, Math.floor(width || 1));
        const h = Math.max(1, Math.floor(height || 1));

        this.canvas.width = w;
        this.canvas.height = h;
        this.cfg.width = w;
        this.cfg.height = h;
    }

// Event handling (ft. mouse)

    _eventPoint(event) {
        if (!event || typeof event !== "object") return null;

        if (Number.isFinite(event.clientX) && Number.isFinite(event.clientY)) {
            return { x: event.clientX, y: event.clientY };
        }

        if (event.touches && event.touches.length > 0) {
            const touch = event.touches[0];
            if (Number.isFinite(touch.clientX) && Number.isFinite(touch.clientY)) {
                return { x: touch.clientX, y: touch.clientY };
            }
        }

        if (event.changedTouches && event.changedTouches.length > 0) {
            const touch = event.changedTouches[0];
            if (Number.isFinite(touch.clientX) && Number.isFinite(touch.clientY)) {
                return { x: touch.clientX, y: touch.clientY };
            }
        }

        return null;
    }

    _isEventInsideCanvas(event) {
        if (!this.mountHost) return false;

        const point = this._eventPoint(event);
        if (!point) {
            return true;
        }

        const rect = this.canvas.getBoundingClientRect();
        return point.x >= rect.left
            && point.x <= rect.right
            && point.y >= rect.top
            && point.y <= rect.bottom;
    }

    _getRegisteredActionEventNames() {
        const names = new Set();
        for (const action of Object.values(this.actions)) {
            for (const eventName of Object.keys(action?.events || {})) {
                names.add(eventName);
            }
        }
        return names;
    }

    // Convert from viewport coord to canvas coord (global to local)
    _mouseposFromViewportPoint(viewportPoint, ndc = false) {
        if (!viewportPoint) return null;

        const rect = this.canvas.getBoundingClientRect();
        const width = Math.max(1, rect.width || this.canvas.width || 1);
        const height = Math.max(1, rect.height || this.canvas.height || 1);

        const canvasPoint = {
            x: viewportPoint.x - rect.left,
            y: viewportPoint.y - rect.top,
        };

        if (!ndc) return canvasPoint;

        return {
            x: (canvasPoint.x / width) * 2 - 1,
            y: 1 - (canvasPoint.y / height) * 2,
        };
    }

    _ensureCanvasEventHandler(eventName) {
        if (this._canvasEventHandlers[eventName]) return;

        const handler = (e) => {
            const point = this._eventPoint(e);
            if (point) {
                this.mouse.viewport = point;
                this.mouse.pos = this._mouseposFromViewportPoint(point, false);
                this.mouse.ndc = this._mouseposFromViewportPoint(point, true);
            }

            if (!this._isEventInsideCanvas(e)) {
                return;
            }

            for (const action of Object.values(this.actions)) {
                const eventFn = action?.events?.[eventName];
                if (typeof eventFn !== "function") continue;

                try {
                    eventFn(action, this, e);
                } catch (error) {
                    console.error(`[EzLivecanvas] Action event '${eventName}' failed:`, error);
                }
            }
        };

        this._canvasEventHandlers[eventName] = handler;
        document.addEventListener(eventName, handler, { passive: true });
    }

    setPassthrough(value) {
        this.cfg.passthrough = Boolean(value);
        this.canvas.style.pointerEvents = this.cfg.passthrough ? "none" : "auto";
        return this.cfg.passthrough;
    }

    mousepos(ndc = false) {
        return ndc ? this.mouse.ndc : this.mouse.pos;
    }

    mouseviewport() {
        return this.mouse.viewport;
    }

    // The current element under the mouse cursor (DOM stack based)
    mousetarget() {
        if (!this.mouse.pos) return null;

        const elements = document.elementsFromPoint(this.mouse.viewport.x, this.mouse.viewport.y);
        return elements.length > 0 ? elements[0] : null;
    }

    // Check if element is currently under mouse (DOM stack based)
    isMouseover(element) {
        if (!(element instanceof Element) || !this.mouse.pos) return false;

        const elements = document.elementsFromPoint(this.mouse.viewport.x, this.mouse.viewport.y);
        return elements.includes(element);
    }

    // Mouse-Element hitbox collision (ignore any stack)
    hitTest(element) {
        if (!(element instanceof Element) || !this.mouse.viewport) return false;

        const rect = element.getBoundingClientRect();
        const point = this.mouse.viewport;

        return point.x >= rect.left
            && point.x <= rect.right
            && point.y >= rect.top
            && point.y <= rect.bottom;
    }

// Assets stuff

    _buildUniqueKey(baseKey, collection) {
        if (!Object.prototype.hasOwnProperty.call(collection, baseKey)) {
            return baseKey;
        }

        let key = `${baseKey}_1`;
        while (Object.prototype.hasOwnProperty.call(collection, key)) {
            key = `${key}_1`;
        }
        return key;
    }

    addAsset(key, value) {
        const safeKey = String(key || "asset");
        const finalKey = this._buildUniqueKey(safeKey, this.assets);
        this.assets[finalKey] = value;
        return finalKey;
    }

    addImage(key, url) {
        if (typeof url !== "string" || url.trim().length === 0) return null;

        const img = new Image();
        img.src = url;

        return this.addAsset(key, { type: "img", url, img });
    }

    addAudio(key, url) {
        if (typeof url !== "string" || url.trim().length === 0) return null;

        const audio = new Audio(url);

        return this.addAsset(key, { type: "audio", url, audio });
    }

    removeAsset(key) {
        if (!Object.prototype.hasOwnProperty.call(this.assets, key)) {
            return false;
        }

        delete this.assets[key];
        return true;
    }

    drawImage(assetKey, rect = {}, style = {}) {
        const asset = this.assets[assetKey];
        if (!asset || asset.type !== "img" || !asset.img) {
            return false;
        }

        const dst = rect?.dst;
        if (!dst || !Number.isFinite(dst.dw) || !Number.isFinite(dst.dh)) {
            return false;
        }

        const dx = Number.isFinite(dst.dx) ? dst.dx : 0;
        const dy = Number.isFinite(dst.dy) ? dst.dy : 0;
        const dw = dst.dw;
        const dh = dst.dh;

        const src = rect?.src;

        this.ctx.save();

        // Special style keys with special handling
        const specialStyleKeys = new Set([
            "angleRad", "pivotX", "pivotY" // Control image rotation around pivot
        ]);
        
        // Set ctx styles while ignoring special style keys
        for (const [name, value] of Object.entries(style || {})) {
            // Special style key
            if (specialStyleKeys.has(name)) continue;
            // Default ctx style key
            if (name in this.ctx) this.ctx[name] = value;
        }

        // Rotation based on angleRad, pivotX and pivotY
        const angleRad = Number.isFinite(style?.angleRad) ? style.angleRad : 0;
        if (angleRad !== 0) {
            // No pivot => pivot = image center
            const pivotX = Number.isFinite(style?.pivotX) ? style.pivotX : dx + dw / 2;
            const pivotY = Number.isFinite(style?.pivotY) ? style.pivotY : dy + dh / 2;
            this.ctx.translate(pivotX, pivotY);
            this.ctx.rotate(angleRad);
            this.ctx.translate(-pivotX, -pivotY);
        }

        // Draw the image
        const hasSrc = src && Number.isFinite(src.sw) && Number.isFinite(src.sh);
        if (hasSrc) { // Has source cropping
            const sx = Number.isFinite(src.sx) ? src.sx : 0;
            const sy = Number.isFinite(src.sy) ? src.sy : 0;
            this.ctx.drawImage(asset.img, sx, sy, src.sw, src.sh, dx, dy, dw, dh);
        } else {      // No source cropping (hl3 coming)
            this.ctx.drawImage(asset.img, dx, dy, dw, dh);
        }

        this.ctx.restore();
        return true;
    }

    playAudio(assetKey, options = {}) {
        const asset = this.assets[assetKey];
        if (!asset || asset.type !== "audio" || !asset.audio) {
            return null;
        }

        const audio = asset.audio;

        if (Number.isFinite(options.currentTime)) {
            audio.currentTime = Math.max(0, options.currentTime);
        }

        if (typeof options.loop === "boolean") {
            audio.loop = options.loop;
        }

        if (Number.isFinite(options.volume)) {
            audio.volume = Math.min(1, Math.max(0, options.volume));
        }

        if (Number.isFinite(options.rate)) {
            audio.playbackRate = Math.max(0.25, options.rate);
        }

        const playPromise = audio.play();
        if (playPromise && typeof playPromise.catch === "function") {
            playPromise.catch((error) => {
                console.error("[EzLivecanvas] Audio play failed:", error);
            });
        }

        return audio;
    }

    runFn(assetKey, ...params) {
        const matchFn = this.assets[assetKey];
        return typeof matchFn === "function" ? matchFn(...params) : undefined;
    }

// Actions and events

    _normalizeEventName(eventName) {
        if (typeof eventName !== "string") return "";

        const normalized = eventName.trim().toLowerCase();
        if (!normalized) return "";
        return normalized.startsWith("on") ? normalized.slice(2) : normalized;
    }

    _normalizeEvents(events) {
        const normalizedEvents = {};
        if (!events || typeof events !== "object") return normalizedEvents;

        for (const [eventName, eventFn] of Object.entries(events)) {
            if (typeof eventFn !== "function") continue;
            const normalizedEventName = this._normalizeEventName(eventName);
            if (!normalizedEventName) continue;
            normalizedEvents[normalizedEventName] = eventFn;
        }

        return normalizedEvents;
    }

    addAction(key, cfg) {
        const safeKey = String(key || "action");
        const finalKey = this._buildUniqueKey(safeKey, this.actions);

        if (!cfg || typeof cfg !== "object" || typeof cfg.update !== "function") {
            return null;
        }

        const events = this._normalizeEvents(cfg.events);

        this.actions[finalKey] = {
            attrs: cfg.attrs && typeof cfg.attrs === "object" ? cfg.attrs : {},
            events,
            update: cfg.update,
        };

        for (const eventName of Object.keys(events)) {
            this._ensureCanvasEventHandler(eventName);
        }

        return finalKey;
    }

    removeAction(key) {
        if (!Object.prototype.hasOwnProperty.call(this.actions, key)) {
            return false;
        }

        const eventNames = Object.keys(this.actions[key]?.events || {});

        delete this.actions[key];

        // Remove unused canvas event handlers after action removal
        for (const eventName of eventNames) {
            // If any action still uses this event, don't remove the handler
            const eventStillUsed = Object.values(this.actions).some((action) => {
                return typeof action?.events?.[eventName] === "function";
            });
            if (eventStillUsed) continue;

            const handler = this._canvasEventHandlers[eventName];
            if (!handler) continue; // Handler is schizophrenic

            // Remove event listener and handler reference
            document.removeEventListener(eventName, handler);
            delete this._canvasEventHandlers[eventName];
        }

        return true;
    }



// Mounting logic

    _handleResize() {
        if (!this.mountHost) return;

        const width = this.mountHost.clientWidth || this.cfg.width || 1;
        const height = this.mountHost.clientHeight || this.cfg.height || 1;
        this._applyCanvasDimensions(width, height);
    }

    mount(query) {
        const host = typeof query === "string" ? document.querySelector(query) : query;
        if (!(host instanceof Element)) {
            return false;
        }

        if (getComputedStyle(host).position === "static") {
            host.style.position = "relative";
        }

        if (this.canvas.parentElement !== host) {
            host.appendChild(this.canvas);
        }

        this.mountHost = host;
        this._handleResize();
        window.addEventListener("resize", this._handleResize);

        const registeredEventNames = this._getRegisteredActionEventNames();
        for (const eventName of registeredEventNames) {
            this._ensureCanvasEventHandler(eventName);
        }

        if (this._rafId == null) {
            this._lastFrameAt = null;
            this._rafId = requestAnimationFrame(this._loop);
        }

        return true;
    }

    unmount() {
        window.removeEventListener("resize", this._handleResize);

        for (const [eventName, handler] of Object.entries(this._canvasEventHandlers)) {
            document.removeEventListener(eventName, handler);
        }
        this._canvasEventHandlers = {};

        if (this._rafId != null) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }

        this._lastFrameAt = null;

        if (this.canvas.parentElement) {
            this.canvas.parentElement.removeChild(this.canvas);
        }

        this.mountHost = null;
    }

    destroy() {
        this.unmount();
        this.actions = {};
        this.assets = {};
        this.shared = {};
        this.mouse.viewport = null;
        this.mouse.pos = null;
        this.mouse.ndc = null;
        this.deltatime = 0;
    }


// Main loop

    _loop(now) {
        if (this._rafId == null) return;

        if (this._lastFrameAt == null) {
            this.deltatime = 0;
        } else {
            this.deltatime = Math.max(0, (now - this._lastFrameAt) / 1000);
        }
        this._lastFrameAt = now;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        for (const action of Object.values(this.actions)) {
            try {
                action.update(action, this);
            } catch (error) {
                console.error("[EzLivecanvas] Action failed:", error);
            }
        }

        this._rafId = requestAnimationFrame(this._loop);
    }
}

window.EzLivecanvas = EzLivecanvas;


/*
EzLivecanvas 
By Asciiz

Lightweight canvas action engine for dynamic visual shi (jellytank, starglitter, heck,
go wild and make custom terrain or something, that would genuinely be cool)

# Guide:
    + include EzLivecanvas.js in your page
    + create a runtime canvas with new window.EzLivecanvas({ width, height })
    + mount it with canv.mount(host) and unmount it with canv.unmount()

    + Asset helpers
        + addAsset(key, value): store any shared value/function
        + addImage(key, url): preload image asset as { type: "img", img }
        + addAudio(key, url): preload audio asset as { type: "audio", audio }
        + exec(key, ...params): execute a function asset

    + Action system (main thing)
        + addAction(key, cfg)
            + cfg = {
                attrs: {},
                update: function(self, canv) { ... },
                events: {
                    click: function(self, canv, e) { ... },
                    pointermove: function(self, canv, e) { ... }
                }
            }
        + addActionEvent(key, event, eventFn): create/override one action event
        + removeAction(key): remove action and detach unused canvas events

    + Canvas event behavior
        + one listener per event type on the canvas
        + when event fires, it loops all actions and runs self.events[event](self, canv, e)
        + canvas pointer-events becomes auto only when at least one action event exists

# Notes:
    + drawImage(assetKey, rect, style) accepts normal ctx style keys directly
    + reserved style keys:
        + angleRad, pivotX, pivotY: control image rotation around pivot
    + deltatime is in seconds
    + shared is a free object for cross-action runtime state
    + It is recommended against setting custom style or attributes for the canvas, just use mount() and unmount()

*/

class EzLivecanvas {
    constructor(cfg = {width: 300, height: 150}) {
        this.cfg = {
            width: Number.isFinite(cfg.width) ? cfg.width : 0,
            height: Number.isFinite(cfg.height) ? cfg.height : 0,
        };

        this.canvas = document.createElement("canvas");
        this.ctx = this.canvas.getContext("2d", { alpha: true });

        this.assets = {};
        this.shared = {};
        this.actions = {};

        this.deltatime = 0;

        this._rafId = null;
        this._lastFrameAt = null;
        this._mountedHost = null;
        this._canvasEventHandlers = {};

        this._handleResize = this._handleResize.bind(this);
        this._loop = this._loop.bind(this);

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
        this.canvas.style.pointerEvents = "none";
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

    _hasEventInAnyAction(eventName) {
        for (const action of Object.values(this.actions)) {
            if (typeof action?.events?.[eventName] === "function") {
                return true;
            }
        }
        return false;
    }

    _ensureCanvasEventHandler(eventName) {
        if (this._canvasEventHandlers[eventName]) return;

        const handler = (e) => {
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
        this.canvas.addEventListener(eventName, handler);
    }

    _removeCanvasEventHandlerIfUnused(eventName) {
        if (this._hasEventInAnyAction(eventName)) return;

        const handler = this._canvasEventHandlers[eventName];
        if (!handler) return;

        this.canvas.removeEventListener(eventName, handler);
        delete this._canvasEventHandlers[eventName];
    }

    _syncCanvasInteractivity() {
        this.canvas.style.pointerEvents = Object.keys(this._canvasEventHandlers).length > 0 ? "auto" : "none";
    }

    addAsset(key, value) {
        const safeKey = String(key || "asset");
        const finalKey = this._buildUniqueKey(safeKey, this.assets);
        this.assets[finalKey] = value;
        return finalKey;
    }

    addImage(key, url) {
        if (typeof url !== "string" || url.trim().length === 0) return false;

        const img = new Image();
        img.src = url;

        this.addAsset(key, { type: "img", url, img });

        return true;
    }

    addAudio(key, url) {
        if (typeof url !== "string" || url.trim().length === 0) return false;

        const audio = new Audio(url);

        this.addAsset(key, { type: "audio", url, audio });

        return true;
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
        } else {      // No source cropping (source 3 coming)
            this.ctx.drawImage(asset.img, dx, dy, dw, dh);
        }

        this.ctx.restore();
        return true;
    }

    exec(assetKey, ...params) {
        const match = this.assets[assetKey];
        return typeof match === "function" ? match(...params) : undefined;
    }

    addAction(key, cfg) {
        const safeKey = String(key || "action");
        const finalKey = this._buildUniqueKey(safeKey, this.actions);

        if (!cfg || typeof cfg !== "object" || typeof cfg.update !== "function") {
            return false;
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

        this._syncCanvasInteractivity();

        return finalKey;
    }

    addActionEvent(key, event, eventFn) {
        if (!Object.prototype.hasOwnProperty.call(this.actions, key)) {
            return false;
        }

        if (typeof eventFn !== "function") {
            return false;
        }

        const eventName = this._normalizeEventName(event);
        if (!eventName) {
            return false;
        }

        const action = this.actions[key];
        if (!action.events || typeof action.events !== "object") {
            action.events = {};
        }

        action.events[eventName] = eventFn;
        this._ensureCanvasEventHandler(eventName);
        this._syncCanvasInteractivity();

        return true;
    }

    removeAction(key) {
        if (!Object.prototype.hasOwnProperty.call(this.actions, key)) {
            return false;
        }

        const eventNames = Object.keys(this.actions[key]?.events || {});

        delete this.actions[key];

        for (const eventName of eventNames) {
            this._removeCanvasEventHandlerIfUnused(eventName);
        }

        this._syncCanvasInteractivity();
        return true;
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

        this._mountedHost = host;
        this._handleResize();
        window.addEventListener("resize", this._handleResize);

        if (this._rafId == null) {
            this._lastFrameAt = null;
            this._rafId = requestAnimationFrame(this._loop);
        }

        return true;
    }

    unmount() {
        window.removeEventListener("resize", this._handleResize);

        if (this._rafId != null) {
            cancelAnimationFrame(this._rafId);
            this._rafId = null;
        }

        this._lastFrameAt = null;

        if (this.canvas.parentElement) {
            this.canvas.parentElement.removeChild(this.canvas);
        }

        this._mountedHost = null;
    }

    _handleResize() {
        if (!this._mountedHost) return;

        const width = this._mountedHost.clientWidth || this.cfg.width || 1;
        const height = this._mountedHost.clientHeight || this.cfg.height || 1;
        this._applyCanvasDimensions(width, height);
    }

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


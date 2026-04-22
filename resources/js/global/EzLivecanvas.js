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

## Asset helpers
    + addAsset(key, value): store any shared value/function
    + addImage(key, url): preload image asset as { type: "img", img }
        -> returns the final key (string) or null
    + addAudio(key, url): preload audio asset as { type: "audio", audio }
        -> returns the final key (string) or null
    + runFn(key, ...params): execute a function asset
    + playAudio(key, options): plays a registered audio asset
        -> returns HTMLAudioElement on success path, null on invalid key

## Action system (the bread and butter)
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
    + removeAction(key): remove action (event listeners are shared and auto-managed)

## Canvas event behavior
    + one listener per event type on document (shared global listener)
    + when event fires, it loops all actions and runs self.events[event](self, canv, e)
    + action callback only runs when pointer is inside current canvas bounds
    + pointer-events comes from passthrough config (not inferred from actions)

## Other
    + drawImage(assetKey, rect, style)
        + rect = {
            dst:  { dx, dy, dw, dh },
            src?: { sx, sy, sw, sh } // optional cropping
        }

        + style accepts normal ctx style keys AND:
            transformation: {
                scale: { x, y },        // default 1,1 (applied from center)
                rotation: { 
                    angle,              // radians
                    px, py              // pivot (default = center of image)
                },
                translation: { x, y }  // applied last
            }, -> order is always scale -> rotate -> translate

            effects: [
                { type: "tint", color: "css-color", mode?: "source-atop" },
                ...
            ]

    ++ mouse = {
        viewport: { x, y }, // in viewport coord (global)
        pos: { x, y },      // in canvas coord (local)
        ndc: { x, y },      // in canvas NDC coord [-1, 1]

        target: () => element under mouse or null,
        over: (el) => boolean, if mouse is over element (DOM stack aware),
        hit: (el)  => boolean, simple AABB hit test
    }

# Notes:

    + transformation replaces older angle/pivot style keys (those are deprecated now)
    + deltatime is in seconds
    + shared is a free object for cross-action runtime state
    + It is recommended against setting custom style or attributes for the canvas, just use mount() and unmount()
    + return-value policy is intentionally predictable:
        + add* style methods return key or null
        + remove* style methods return boolean

*/

class EzLivecanvas {
    constructor(cfg = {}) {
        const { width = 300, height = 150, passthrough = true } = cfg;

        this.cfg = { width: width | 0, height: height | 0, passthrough: !!passthrough };

        this.canvas = document.createElement("canvas");
        this.ctx = this.canvas.getContext("2d");

        Object.assign(this.canvas.style, {
            position: "absolute",
            inset: "0",
            width: "100%",
            height: "100%",
            display: "block",
            pointerEvents: this.cfg.passthrough ? "none" : "auto"
        });

        this.canvas.width = this.cfg.width || 1;
        this.canvas.height = this.cfg.height || 1;

        this.mountHost = null;

        this.assets = {};
        this.actions = {};
        this.shared = {};
        
        this.deltatime = 0; // For physic and stuff

        this.mouse = {
            viewport: null,
            pos: null,
            ndc: null,

            target: () => {
                const p = this.mouse.viewport;
                return p ? document.elementFromPoint(p.x, p.y) : null;
            },

            over: el => {
                const p = this.mouse.viewport;
                return p && el instanceof Element
                    ? document.elementsFromPoint(p.x, p.y).includes(el)
                    : false;
            },

            hit: el => {
                const p = this.mouse.viewport;
                if (!p || !(el instanceof Element)) return false;

                const r = el.getBoundingClientRect();
                return p.x >= r.left && p.x <= r.right &&
                    p.y >= r.top && p.y <= r.bottom;
            }
        };

        this._handlers = {};
        this._raf = null;
        this._last = null;

        // Effect surface for processing effects (fork found in kitchen)
        this._fxSurface = null;
        this._fxCtx = null;

        this._loop = this._loop.bind(this);
        this._resize = this._resize.bind(this);
    }

    // ---------- utils ----------
    _key(base, obj) {
        let i = 0, k = base;
        while (k in obj) k = `${base}_${++i}`;
        return k;
    }

    _eventPoint(e) {
        const p = e?.touches?.[0] || e?.changedTouches?.[0] || e;
        return Number.isFinite(p?.clientX) ? { x: p.clientX, y: p.clientY } : null;
    }

    _inRect(p, r) {
        return p.x >= r.left && p.x <= r.right && p.y >= r.top && p.y <= r.bottom;
    }

    _toCanvas(p, ndc = false) {
        if (!p) return null;
        const r = this.canvas.getBoundingClientRect();
        const x = p.x - r.left, y = p.y - r.top;

        return ndc
            ? { x: (x / r.width) * 2 - 1, y: 1 - (y / r.height) * 2 }
            : { x, y };
    }

    _ensureEffectSurface(w, h) {
        if (!this._fxSurface || !this._fxCtx) {
            this._fxSurface = typeof OffscreenCanvas === "function"
                ? new OffscreenCanvas(1, 1)
                : document.createElement("canvas");
            this._fxCtx = this._fxSurface.getContext("2d", { alpha: true })
                || this._fxSurface.getContext("2d");
        }

        if (!this._fxCtx) return null;

        if (this._fxSurface.width !== w || this._fxSurface.height !== h) {
            this._fxSurface.width = w;
            this._fxSurface.height = h;
        }

        return this._fxCtx;
    }

    _runEffect(ctx, w, h, fx) {
        if (!fx || typeof fx !== "object") return;

        switch (fx.type) {
            case "tint": {
                if (typeof fx.color !== "string" || fx.color.length === 0) break;
                ctx.globalCompositeOperation = typeof fx.mode === "string" ? fx.mode : "source-atop";
                ctx.fillStyle = fx.color;
                ctx.fillRect(0, 0, w, h);
                break;
            }
            default:
                break;
        }

        ctx.globalCompositeOperation = "source-over";
        ctx.globalAlpha = 1;
    }

    _applyEffects(img, src, w, h, effects) {
        const fxCtx = this._ensureEffectSurface(w, h);
        if (!fxCtx) return img;

        fxCtx.setTransform(1, 0, 0, 1, 0, 0);
        fxCtx.globalCompositeOperation = "source-over";
        fxCtx.globalAlpha = 1;
        fxCtx.clearRect(0, 0, w, h);

        const hasSrc = src && Number.isFinite(src.sw) && Number.isFinite(src.sh);
        hasSrc
            ? fxCtx.drawImage(img, src.sx || 0, src.sy || 0, src.sw, src.sh, 0, 0, w, h)
            : fxCtx.drawImage(img, 0, 0, w, h);

        for (const fx of effects) {
            this._runEffect(fxCtx, w, h, fx);
        }

        return this._fxSurface;
    }

    // ---------- events ----------
    _ensureEvent(name) {
        if (this._handlers[name]) return;

        const fn = e => {
            const p = this._eventPoint(e);
            if (p) {
                this.mouse.viewport = p;
                this.mouse.pos = this._toCanvas(p);
                this.mouse.ndc = this._toCanvas(p, true);
            }

            if (!this.mountHost) return;
            if (p && !this._inRect(p, this.canvas.getBoundingClientRect())) return;

            for (const a of Object.values(this.actions)) {
                a.events?.[name]?.(a, this, e);
            }
        };

        this._handlers[name] = fn;
        document.addEventListener(name, fn, { passive: true });
    }

    // ---------- assets ----------
    addAsset(k, v) {
        k = this._key(k || "asset", this.assets);
        this.assets[k] = v;
        return k;
    }

    addImage(k, url) {
        if (!url) return null;
        const img = new Image();
        img.src = url;
        return this.addAsset(k, { type: "img", img });
    }

    addAudio(k, url) {
        if (!url) return null;
        return this.addAsset(k, { type: "audio", audio: new Audio(url) });
    }

    playAudio(k, opt = {}) {
        const a = this.assets[k]?.audio;
        if (!a) return null;

        if (opt.currentTime != null) a.currentTime = opt.currentTime;
        if (opt.loop != null) a.loop = opt.loop;
        if (opt.volume != null) a.volume = Math.max(0, Math.min(1, opt.volume));
        if (opt.rate != null) a.playbackRate = opt.rate;

        a.play().catch(() => {});
        return a;
    }

    runFn(k, ...p) {
        return typeof this.assets[k] === "function"
            ? this.assets[k](...p)
            : undefined;
    }

    // ---------- draw ----------
    drawImage(k, rect = {}, style = {}) {
        const img = this.assets[k]?.img;
        if (!img) return false;

        const { dx = 0, dy = 0, dw, dh } = rect.dst || {};
        if (!dw || !dh) return false;

        const t = style.transformation || {};
        const scale = t.scale || {};
        const rot = t.rotation || {};
        const trans = t.translation || {};

        const sx = scale.x ?? 1;
        const sy = scale.y ?? 1;

        const angle = rot.angle ?? 0;
        const px = rot.px ?? (dx + dw / 2);
        const py = rot.py ?? (dy + dh / 2);

        const tx = trans.x ?? 0;
        const ty = trans.y ?? 0;

        const effects = Array.isArray(style.effects) ? style.effects : [];

        this.ctx.save();

        // Apply normal styles (ignore special keys)

        const specialKeys = new Set(["transformation", "effects"]);

        for (const s in style) {
            if (!specialKeys.has(s) && s in this.ctx) {
                this.ctx[s] = style[s];
            }
        }

        // ---- Transform order: scale -> rotation -> translation ----

        // Move to pivot
        this.ctx.translate(px, py);
        this.ctx.scale(sx, sy);

        // Rotate
        if (angle) this.ctx.rotate(angle);

        // Move back
        this.ctx.translate(-px, -py);

        // Final translation
        if (tx || ty) this.ctx.translate(tx, ty);

        const src = rect.src;
        if (effects.length > 0) {
            const drawW = Math.max(1, Math.ceil(Math.abs(dw)));
            const drawH = Math.max(1, Math.ceil(Math.abs(dh)));
            const processedSurface = this._applyEffects(img, src, drawW, drawH, effects);
            this.ctx.drawImage(processedSurface, dx, dy, dw, dh);
        } else {
            const hasSrc = src && Number.isFinite(src.sw) && Number.isFinite(src.sh);
            hasSrc
                ? this.ctx.drawImage(img, src.sx || 0, src.sy || 0, src.sw, src.sh, dx, dy, dw, dh)
                : this.ctx.drawImage(img, dx, dy, dw, dh);
        }

        this.ctx.restore();
        return true;
    }

    // ---------- actions ----------
    addAction(k, cfg) {
        if (!cfg?.update) return null;

        k = this._key(k || "action", this.actions);

        const events = {};
        for (const e in cfg.events || {}) {
            const name = e.toLowerCase().replace(/^on/, "");
            if (typeof cfg.events[e] === "function") {
                events[name] = cfg.events[e];
                this._ensureEvent(name);
            }
        }

        this.actions[k] = {
            attrs: cfg.attrs || {},
            update: cfg.update,
            events
        };

        return k;
    }

    removeAction(k) {
        delete this.actions[k];
        return true;
    }

    // ---------- mount ----------
    _resize() {
        if (!this.mountHost) return;
        this.canvas.width = this.mountHost.clientWidth || 1;
        this.canvas.height = this.mountHost.clientHeight || 1;
    }

    mount(el) {
        const host = typeof el === "string" ? document.querySelector(el) : el;
        if (!(host instanceof Element)) return false;

        if (getComputedStyle(host).position === "static") {
            host.style.position = "relative";
        }

        host.appendChild(this.canvas);
        this.mountHost = host;

        this._resize();
        window.addEventListener("resize", this._resize);

        if (!this._raf) {
            this._last = null;
            this._raf = requestAnimationFrame(this._loop);
        }

        return true;
    }

    unmount() {
        window.removeEventListener("resize", this._resize);

        for (const e in this._handlers) {
            document.removeEventListener(e, this._handlers[e]);
        }
        this._handlers = {};

        cancelAnimationFrame(this._raf);
        this._raf = null;

        this.canvas.remove();
        this.mountHost = null;
    }

    destroy() {
        this.unmount();
        this.assets = {};
        this.actions = {};
        this.shared = {};
        this.mouse = { viewport: null, pos: null, ndc: null };
        this._fxSurface = null;
        this._fxCtx = null;
    }

    // ---------- loop ----------
    _loop(t) {
        if (!this._raf) return;

        this.deltatime = this._last ? (t - this._last) / 1000 : 0;
        this._last = t;

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        for (const a of Object.values(this.actions)) {
            try { a.update(a, this); }
            catch (e) { console.error(e); }
        }

        this._raf = requestAnimationFrame(this._loop);
    }
}

window.EzLivecanvas = EzLivecanvas;
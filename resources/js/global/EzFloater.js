/*
EzFloater
By Asciiz

# Lightweight floating tooltip / context engine

    + Single shared floater node (no duplicates)
    + Same-origin iframe support (auto-attached)
    + Delegated query system with @ iframe scoping
    + Dataset-driven action system (data-click, etc)
    + Tooltip (hover) + Context (right-click / long-press) modes
    + CSS-driven state via configurable class names

    + addAction / addDisplay / addQuery
    + destroy() cleans up listeners/observers safely

# Cool things:

## Actions
    Define behavior triggered from inside the floater.

    floater.addAction(name, (element, event, ctx) => { ... });

    Usage inside display:
        element.dataset.click = "actionName"

    + element -> the clicked element inside floater
    + ctx -> { floater, mode }

## Displays
    Define how content is rendered.

    floater.addDisplay(name, {
        context(element, ctx) => Node | string,
        tooltip(element, ctx) => Node | string
    });

    + context <- right click / long press
    + tooltip <- hover
    + Either can be omitted

## Queries
    Bind selectors to displays.

    floater.addQuery(selector, {
        display: "displayName",
        delegate: true // default: true
    });

    + delegate: true  -> uses element.closest()
    + delegate: false -> uses element.matches()

## Iframe Support

Use @ tokens to scope queries into nested iframes:

    "@frameA @frameB .target"

    -> Means:
        scope: ["@frameA", "@frameB"] -> iframeB inside iframeA
        selector: ".target" -> element(s) inside iframeB

Notes:
    + Only works for same-origin iframes
    + @ is NOT CSS — it's EzFloater-specific syntax thingy

## Class System (Styling)

Class names are configurable:

    this.class = {
        active: "ez-floater-active",
        context: "ez-floater-context",
        tooltip: "ez-floater-tooltip"
    }; -> self-explanatory

Styling Example

    .ez-floater {
        position: fixed;
        z-index: 2147483647;
        opacity: 0;
        transform: scale(0.95);
        transition: opacity 0.12s ease, transform 0.12s ease;
        pointer-events: none;
    }

    .ez-floater.ez-floater-active {
        opacity: 1;
        transform: scale(1);
    }

    .ez-floater.ez-floater-context {
        pointer-events: auto;
    }

# Example

    const floater = new window.EzFloater();

    floater.addAction("clickForCookies", (el) => {
        el.textContent = "No cookies for you";
    });

    floater.addDisplay("menu", {
        context(el) {
            const wrap = document.createElement("div");
            const btn = document.createElement("button");

            btn.textContent = "Cookie";
            btn.dataset.click = "clickForCookies";

            wrap.appendChild(btn);
            return wrap;
        },
        tooltip(el) {
            return `Hello ${el.tagName}`;
        }
    });

    floater.addQuery(".menu-or-whatever", {
        display: "menu"
    });

# Notes
    + Only one floater instance is used at runtime
    + Queries are optimized per document for performance
    + Automatically tracks iframe lifecycle
    + Designed to be lightweight, extensible, and CSS-driven

*/

(function () {
    class EzFloater {
        constructor() {
            this.id = "ez-floater";
            this.class = {
                active: "ez-floater-active",
                context: "ez-floater-context",
                tooltip: "ez-floater-tooltip"
            }

            this.LONG_PRESS = 450;

            this.actions = new Map();
            this.displays = new Map();
            this.queriesByDoc = new Map();

            this.state = { mode: null, hoverEl: null, hoverQuery: null, touchTimer: null };

            this.root = window;
            this.docs = new Map(); // doc -> meta
            this.frameDocs = new Map(); // iframe -> Set<doc>

            this._init();
        }

        _init() {
            this._ensureNode();
            this._bindFloaterEvents();
            this._attachDoc(document);
            this.root.addEventListener("blur", () => {
                if (this.state.mode === "tooltip") this.hide();
            });
        }

        _ensureNode() {
            this.node = document.getElementById(this.id);
            if (!this.node) {
                this.node = document.createElement("div");
                this.node.id = this.id;
                Object.assign(this.node.style, { position: "fixed", top: 0, left: 0, zIndex: 2147483647, opacity: 0, visibility: "hidden" });
                document.body.appendChild(this.node);
            }
        }

        _bindFloaterEvents() {
            this.node.addEventListener("click", e => this._dispatch("click", e));
        }

        setPosition(x, y) {
            const off = 8;
            const w = this.node.offsetWidth;
            const h = this.node.offsetHeight;
            const maxX = window.innerWidth - w - off;
            const maxY = window.innerHeight - h - off;

            this.node.style.left = Math.min(Math.max(x + off, off), maxX) + "px";
            this.node.style.top = Math.min(Math.max(y + off, off), maxY) + "px";
        }

        show(content, x, y, mode) {
            this.node.replaceChildren();
            typeof content === "string" ? this.node.textContent = content : this.node.appendChild(content);

            this.state.mode = mode;
            this.node.style.opacity = 0.95;
            this.node.style.visibility = "visible";
            this.node.style.pointerEvents = mode === "context" ? "auto" : "none";

            this.node.classList.toggle(this.class.context, mode === "context");
            this.node.classList.toggle(this.class.tooltip, mode === "tooltip");
            this.node.classList.add(this.class.active);

            this.setPosition(x, y);
        }

        hide() {
            this.state = { mode: null, hoverEl: null, hoverQuery: null, touchTimer: null };
            this.node.style.opacity = 0;
            this.node.style.visibility = "hidden";
            this.node.style.pointerEvents = "none";

            this.node.classList.remove(this.class.context, this.class.tooltip, this.class.active);
        }

        addAction(name, fn) { if (name && fn) this.actions.set(name, fn); }
        getAction(name) { return this.actions.get(name); }

        addDisplay(name, cfg) {
            this.displays.set(name, { context: cfg.context || null, tooltip: cfg.tooltip || null });
        }

        addQuery(selector, { display, delegate = true }) {
            const parsed = this._parse(selector);
            const doc = this._resolve(parsed.scope);
            if (!doc) return;

            const q = { selector: parsed.sel, display, delegate };
            if (!this.queriesByDoc.has(doc)) this.queriesByDoc.set(doc, []);
            this.queriesByDoc.get(doc).push(q);
        }

        removeQuery(selector, { display, delegate = true } = {}) {
            const parsed = this._parse(selector);
            const doc = this._resolve(parsed.scope);
            if (!doc) return;

            const list = this.queriesByDoc.get(doc);
            if (!list || list.length === 0) return;

            const next = list.filter(q => {
                if (q.selector !== parsed.sel) return true;
                if (display != null && q.display !== display) return true;
                if (delegate != null && q.delegate !== delegate) return true;
                return false;
            });

            if (next.length > 0) {
                this.queriesByDoc.set(doc, next);
            } else {
                this.queriesByDoc.delete(doc);
            }
        }

        _attachDoc(doc, frame = null) {
            if (this.docs.has(doc)) return;

            const move = e => this._onMove(e, doc);
            const ctx = e => this._onContext(e, doc);
            const click = e => !this.node.contains(e.target) && this.hide();

            doc.addEventListener("mousemove", move, true);
            doc.addEventListener("contextmenu", ctx, true);
            doc.addEventListener("click", click, true);

            const obs = new MutationObserver(muts => {
                for (const m of muts) {
                    for (const n of m.addedNodes) {
                        if (n.tagName === "IFRAME") this._attachFrame(n);
                    }
                    for (const n of m.removedNodes) {
                        if (n.tagName === "IFRAME") this._detachFrame(n);
                    }
                }
            });

            obs.observe(doc, { childList: true, subtree: true });
            this.docs.set(doc, { move, ctx, click, obs, frame });

            doc.querySelectorAll("iframe").forEach(f => this._attachFrame(f));
        }

        _attachFrame(frame) {
            try {
                const doc = frame.contentDocument;
                if (!doc) return;

                if (!this.frameDocs.has(frame)) this.frameDocs.set(frame, new Set());
                this.frameDocs.get(frame).add(doc);

                this._attachDoc(doc, frame);
            } catch { }
        }

        _detachFrame(frame) {
            const set = this.frameDocs.get(frame);
            if (!set) return;
            for (const d of set) this._detachDoc(d);
            this.frameDocs.delete(frame);
        }

        _detachDoc(doc) {
            const m = this.docs.get(doc);
            if (!m) return;

            doc.removeEventListener("mousemove", m.move, true);
            doc.removeEventListener("contextmenu", m.ctx, true);
            doc.removeEventListener("click", m.click, true);
            m.obs.disconnect();

            this.docs.delete(doc);
        }

        _onMove(e, doc) {
            if (this.state.mode === "context") return;

            if (this.state.hoverEl && this.state.hoverEl.contains(e.target)) {
                const p = this._point(doc, e);
                if (p) this.setPosition(p.x, p.y);
                return;
            }

            const res = this._match(e.target, doc, "tooltip", e);
            if (!res) return this.hide();

            const p = this._point(doc, e);
            if (!p) return;

            this.show(res.content, p.x, p.y, "tooltip");
            this.state.hoverEl = res.el;
            this.state.hoverQuery = res.q;
        }

        _onContext(e, doc) {
            const res = this._match(e.target, doc, "context", e);
            if (!res) return;

            e.preventDefault();
            const p = this._point(doc, e);
            if (p) this.show(res.content, p.x, p.y, "context");
        }

        _match(target, doc, mode, event) {
            if (target.nodeType === 3) target = target.parentElement;
            const list = this.queriesByDoc.get(doc);
            if (!list) return null;

            for (const q of list) {
                const el = q.delegate ? target.closest(q.selector) : (target.matches(q.selector) ? target : null);
                if (!el) continue;

                const d = this.displays.get(q.display);
                const fn = d && d[mode];
                if (!fn) continue;

                const content = fn(el, { event, mode, floater: this });
                if (!content) return null;

                return { el, q, content };
            }
            return null;
        }

        _dispatch(type, e) {
            const el = e.target.closest(`[data-${type}]`);
            if (!el) return;

            const fn = this.actions.get(el.dataset[type]);
            if (fn) fn(el, e, { floater: this, mode: this.state.mode });
        }

        _parse(raw) {
            const parts = raw.split(/\s+/);
            const scope = [], sel = [];
            for (const p of parts) { p.startsWith("@") ? scope.push(p) : sel.push(p); }
            return { scope, sel: sel.join(" ") };
        }

        _resolve(scope) {
            let doc = document;
            for (const t of scope) {
                const f = doc.getElementById(t.slice(1));
                if (!f) return null;
                try { doc = f.contentDocument; } catch { return null; }
            }
            return doc;
        }

        _point(doc, e) {
            let x = e.clientX, y = e.clientY, w = doc.defaultView;
            while (w && w !== this.root) {
                const f = w.frameElement;
                if (!f) return null;
                const r = f.getBoundingClientRect();
                x += r.left; y += r.top;
                w = f.ownerDocument.defaultView;
            }
            return { x, y };
        }
    }

    window.EzFloater = EzFloater;
})();

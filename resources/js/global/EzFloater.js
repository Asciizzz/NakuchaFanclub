/*
EzFloater
By Asciiz

# Lightweight shared floating UI engine (tooltip + context)

# Constructor:
    new EzFloater()                 creates/uses #ez-floater, binds active document, and tracks same-origin iframes

# Core behavior:
    show(content, x, y, mode)       renders content and shows floater at clamped viewport coordinates
    hide()                          clears state and hides floater
    setPosition(x, y)               positions floater with viewport bounds protection

# Display API:
    addDisplay(name, {
        context(element, {element?, floater?, event?})?,   renderer for context mode (right-click / long-press)
        tooltip(element, {element?, floater?, event?})?    renderer for tooltip mode (hover)
    })

# Event API:
    addEvent(eventName, actionName, fn)
                                    binds a floater event to a named handler
    removeEvent(eventName, actionName)
                                    removes a named handler for a floater event

# Event usage inside a display:
    button.dataset.click = "actionName"
    button.dataset.mouseover = "previewName"
    button.dataset.mousedown = "pressName"

# Query API:
    addQuery(selector, { display, delegate=true })
                                    binds selector to a display in the resolved document scope
    removeQuery(selector, opts?)    removes matching query bindings from the resolved scope

# Scope syntax for selectors:
    ".target"                      current document
    "@frameA .target"              inside iframe#frameA
    "@frameA @frameB .target"      nested iframe chain then selector

# Matching mode:
    delegate=true                   uses target.closest(selector)
    delegate=false                  uses target.matches(selector)

# Display callback context:
    {
        element?,                   element that matched the query and triggered the display
        floater?,                   EzFloater instance
        event?                      originating DOM event
    }

# Event callback context:
    {
        element,                    element with matching data-<eventName>
        floater,                    EzFloater instance
        event                       triggering DOM event
    }

# CSS state classes (configurable via this.class):
    active:  ez-floater-active
    context: ez-floater-context
    tooltip: ez-floater-tooltip

# Notes:
    - Single floater node is shared at runtime
    - Only same-origin iframe documents are attachable
    - Content may be string or Node
    - If a display callback returns falsy, nothing is shown
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

            this.displays = new Map();
            this.events = new Map();
            this.eventListeners = new Map();
            this.queriesByDoc = new Map();

            this.state = { mode: null, hoverEl: null, hoverQuery: null, touchTimer: null };

            this.root = window;
            this.docs = new Map(); // doc -> meta
            this.frameDocs = new Map(); // iframe -> Set<doc>

            this._init();
        }

        _init() {
            this._ensureNode();
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

        addDisplay(name, cfg) {
            const next = cfg || {};
            this.displays.set(name, { context: next.context || null, tooltip: next.tooltip || null });
        }

        addEvent(eventName, actionName, fn) {
            if (!eventName || !actionName || typeof fn !== "function") return;

            let actions = this.events.get(eventName);
            if (!actions) {
                actions = new Map();
                this.events.set(eventName, actions);
                this._bindEvent(eventName);
            }

            actions.set(actionName, fn);
        }

        removeEvent(eventName, actionName) {
            const actions = this.events.get(eventName);
            if (!actions) return;

            actions.delete(actionName);
            if (actions.size > 0) return;

            this.events.delete(eventName);

            const listener = this.eventListeners.get(eventName);
            if (listener) {
                this.node.removeEventListener(eventName, listener, true);
                this.eventListeners.delete(eventName);
            }
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

            const res = this._match(e.target, doc, "tooltip", e);
            if (!res) return this.hide();

            if (this.state.hoverEl === res.el) {
                const p = this._point(doc, e);
                if (p) this.setPosition(p.x, p.y);
                return;
            }

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

                const content = fn(el, { element: el, floater: this, event });
                if (!content) return null;

                return { el, q, content };
            }
            return null;
        }

        _parse(raw) {
            const parts = raw.split(/\s+/);
            const scope = [], sel = [];
            for (const p of parts) { p.startsWith("@") ? scope.push(p) : sel.push(p); }
            return { scope, sel: sel.join(" ") };
        }

        _bindEvent(eventName) {
            const listener = e => this._dispatchEvent(eventName, e);
            this.eventListeners.set(eventName, listener);
            this.node.addEventListener(eventName, listener, true);
        }

        _dispatchEvent(eventName, e) {
            const actions = this.events.get(eventName);
            if (!actions || actions.size === 0) return;

            let target = e.target;
            if (target?.nodeType === 3) target = target.parentElement;
            if (!target) return;

            const el = target.closest(`[data-${eventName}]`);
            if (!el || !this.node.contains(el)) return;

            const actionName = el.dataset[eventName];
            if (!actionName) return;

            const fn = actions.get(actionName);
            if (!fn) return;

            fn({ element: el, event: e, floater: this });
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

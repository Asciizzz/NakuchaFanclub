/*
EzFloater
By Asciiz

# Floating tooltip/context engine thingy, pretty cool

# Example:
    const floater = new window.EzFloater();

    floater.addAction("clickForCookies", (element, event, ctx) => {
        element.textContent = "You wont get shit dumbass";
    });

    floater.addDisplay("menu", {
        context(element, ctx) {
            const wrap = document.createElement("div");
            const button = document.createElement("button");
            button.textContent = "Cookie";
            button.dataset.click = "clickForCookies"; --> <element>.dataset.<event> = <action_name>
            wrap.appendChild(button);
            return wrap; --> must return the floater element
        },
        tooltip(element, ctx) {
            return `Hello ${element.tagName}`;
        },
    });

    floater.addQuery(".needs-menu", { delegate: true, display: "menu" });

# You can freely customize the style of the floater in css:
    #ez-floater
    #ez-floater.ez-floater-active

*/

(function() {
    class EzFloater {
        constructor() {
            this.FLOATER_ID = "ez-floater";
            this.FLOATER_STYLE_ID = "ez-floater-style";
            this.LONG_PRESS_MS = 450;

            this.actions = {};
            this.displays = {};
            this.queries = {};

            this.state = {
                mode: null,
                hoverElement: null,
                hoverSelector: "",
                touchTimer: null,
            };

            this.floater = null;
            this._bound = false;

            this.init();
        }

        init() {
            this._ensureFloater();
            this._ensureStyle();
            this._bindRuntimeEvents();
            return this;
        }

        // State and rendering

        _ensureFloater() {
            this.floater = document.getElementById(this.FLOATER_ID);
            if (!this.floater) {
                this.floater = document.createElement("div");
                this.floater.id = this.FLOATER_ID;
                document.body.appendChild(this.floater);
            }
        }

        _ensureStyle() {
            if (document.getElementById(this.FLOATER_STYLE_ID)) return;

            const style = document.createElement("style");
            style.id = this.FLOATER_STYLE_ID;
            style.textContent = `
                #ez-floater {
                    position: fixed;
                    top: 0;
                    left: 0;
                    z-index: 2147483647;
                    opacity: 0;
                    visibility: hidden;
                    pointer-events: none;
                }
                #ez-floater.ez-floater-active {
                    opacity: 0.95;
                    visibility: visible;
                }
                #ez-floater.ez-floater-mode-context {
                    pointer-events: auto;
                }
            `;

            document.head.appendChild(style);
        }

        setPosition(x, y) {
            if (!this.floater) return;

            const offset = 8;
            const maxLeft = window.innerWidth - this.floater.offsetWidth - offset;
            const maxTop = window.innerHeight - this.floater.offsetHeight - offset;

            const nextLeft = Math.min(Math.max(x + offset, offset), Math.max(offset, maxLeft));
            const nextTop = Math.min(Math.max(y + offset, offset), Math.max(offset, maxTop));

            this.floater.style.left = `${nextLeft}px`;
            this.floater.style.top = `${nextTop}px`;
        }

        showFloater(content, x, y, mode = "tooltip") {
            if (!this.floater) return;

            this.floater.replaceChildren();
            if (typeof content === "string") {
                this.floater.textContent = content;
            } else {
                this.floater.appendChild(content);
            }

            this.state.mode = mode;
            this.floater.classList.toggle("ez-floater-mode-context", mode === "context");
            this.floater.classList.add("ez-floater-active");
            this.setPosition(x, y);
        }

        hideFloater() {
            if (!this.floater) return;

            this.state.mode = null;
            this.state.hoverElement = null;
            this.state.hoverSelector = "";
            this._clearTouchTimer();

            this.floater.classList.remove("ez-floater-active");
            this.floater.classList.remove("ez-floater-mode-context");
        }

        // Registration stuff thingy

        addAction(name, fn) {
            if (typeof name !== "string" || !name.trim() || typeof fn !== "function") return null;
            const key = name.trim();
            this.actions[key] = fn;
            return fn;
        }

        removeAction(name) {
            if (typeof name !== "string" || !name.trim()) return false;
            const key = name.trim();
            if (!Object.prototype.hasOwnProperty.call(this.actions, key)) return false;
            delete this.actions[key];
            return true;
        }

        getAction(name) {
            if (typeof name !== "string" || !name.trim()) return null;
            return this.actions[name.trim()] || null;
        }

        addDisplay(name, cfg) {
            if (typeof name !== "string" || !name.trim() || !cfg || typeof cfg !== "object") return null;
            const key = name.trim();
            const prev = this.displays[key] || { context: null, tooltip: null };

            const hasContext = Object.prototype.hasOwnProperty.call(cfg, "context");
            const hasTooltip = Object.prototype.hasOwnProperty.call(cfg, "tooltip");
            if (!hasContext && !hasTooltip) return null;

            this.displays[key] = {
                context: hasContext ? (typeof cfg.context === "function" ? cfg.context : null) : prev.context,
                tooltip: hasTooltip ? (typeof cfg.tooltip === "function" ? cfg.tooltip : null) : prev.tooltip,
            };

            return this.displays[key];
        }

        removeDisplay(name) {
            if (typeof name !== "string" || !name.trim()) return false;
            const key = name.trim();
            if (!Object.prototype.hasOwnProperty.call(this.displays, key)) return false;
            delete this.displays[key];
            return true;
        }

        addQuery(selector, cfg) {
            if (typeof selector !== "string" || !selector.trim() || !cfg || typeof cfg !== "object") return null;
            if (typeof cfg.display !== "string" || !cfg.display.trim()) return null;

            const key = selector.trim();
            this.queries[key] = {
                delegate: cfg.delegate !== false,
                display: cfg.display.trim(),
            };

            return this.queries[key];
        }

        removeQuery(selector) {
            if (typeof selector !== "string" || !selector.trim()) return false;
            const key = selector.trim();
            if (!Object.prototype.hasOwnProperty.call(this.queries, key)) return false;
            delete this.queries[key];
            return true;
        }

        // Runtime behavior

        _bindRuntimeEvents() {
            if (this._bound) return;
            this._bound = true;

            const actionEvents = ["click", "mousedown", "mouseup", "mouseover", "mouseout", "mouseenter", "mouseleave"];
            for (const eventName of actionEvents) {
                this.floater.addEventListener(eventName, (event) => {
                    this._dispatchFloaterAction(eventName, event);
                });
            }

            document.addEventListener("contextmenu", (event) => {
                if (!event.target || this.floater.contains(event.target)) return;

                const result = this._matchDisplay("context", event.target, event);
                if (!result) {
                    this.hideFloater();
                    return;
                }

                event.preventDefault();
                this.showFloater(result.content, event.clientX, event.clientY, "context");
            }, true);

            document.addEventListener("mousemove", (event) => {
                if (this.state.mode === "context") return;
                if (!event.target || this.floater.contains(event.target)) return;

                const result = this._matchDisplay("tooltip", event.target, event);
                if (!result) {
                    if (this.state.mode === "tooltip") this.hideFloater();
                    return;
                }

                const isSameHover =
                    this.state.mode === "tooltip" &&
                    this.state.hoverElement === result.matched &&
                    this.state.hoverSelector === result.selector;

                if (!isSameHover) {
                    this.showFloater(result.content, event.clientX, event.clientY, "tooltip");
                } else {
                    this.setPosition(event.clientX, event.clientY);
                }

                this.state.hoverElement = result.matched;
                this.state.hoverSelector = result.selector;
            }, true);

            document.addEventListener("mouseout", (event) => {
                if (this.state.mode !== "tooltip" || !this.state.hoverElement) return;

                const nextTarget = event.relatedTarget;
                if (nextTarget && this.state.hoverElement.contains(nextTarget)) return;

                this.hideFloater();
            }, true);

            document.addEventListener("touchstart", (event) => {
                if (!event.target || this.floater.contains(event.target)) return;

                const touch = event.touches?.[0];
                if (!touch) return;

                this._clearTouchTimer();
                this.state.touchTimer = window.setTimeout(() => {
                    const result = this._matchDisplay("context", event.target, event);
                    if (!result) {
                        this.hideFloater();
                        return;
                    }

                    this.showFloater(result.content, touch.clientX, touch.clientY, "context");
                }, this.LONG_PRESS_MS);
            }, true);

            document.addEventListener("touchend", () => {
                this._clearTouchTimer();
            }, true);

            document.addEventListener("touchcancel", () => {
                this._clearTouchTimer();
            }, true);

            document.addEventListener("click", (event) => {
                if (!this.floater.contains(event.target)) this.hideFloater();
            }, true);

            document.addEventListener("keydown", (event) => {
                if (event.key === "Escape") this.hideFloater();
            });

            window.addEventListener("blur", () => {
                if (this.state.mode === "tooltip") this.hideFloater();
            });
        }

        _clearTouchTimer() {
            if (!this.state.touchTimer) return;
            window.clearTimeout(this.state.touchTimer);
            this.state.touchTimer = null;
        }

        _dispatchFloaterAction(eventName, event) {
            const dataAttr = `data-${eventName}`;
            const actionElement = event.target.closest(`[${dataAttr}]`);
            if (!actionElement) return;

            const actionName = actionElement.getAttribute(dataAttr);
            const actionFn = this.getAction(actionName);
            if (typeof actionFn !== "function") return;

            actionFn(actionElement, event, {
                floater: this,
                mode: this.state.mode,
            });
        }

        _matchDisplay(mode, eventTarget, event) {
            let target = eventTarget;
            if (target && target.nodeType === Node.TEXT_NODE) {
                target = target.parentElement;
            }

            if (!target || target.nodeType !== Node.ELEMENT_NODE) return null;

            for (const [selector, query] of Object.entries(this.queries)) {
                const matched = query.delegate === false
                    ? (target.matches(selector) ? target : null)
                    : target.closest(selector);
                if (!matched) continue;

                const display = this.displays[query.display] || null;
                if (!display) continue;

                const runDisplay = mode === "context" ? display.context : display.tooltip;
                if (typeof runDisplay !== "function") continue;

                const content = runDisplay(matched, {
                    mode,
                    event,
                    selector,
                    query,
                    floater: this,
                });
                if (!content) return null;

                return {
                    selector,
                    query,
                    matched,
                    content,
                };
            }

            return null;
        }
    }

    window.EzFloater = EzFloater;
})();

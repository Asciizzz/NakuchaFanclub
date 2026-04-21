/*
EzFloater
By Asciiz

# Floating tooltip/context engine thingy, pretty cool
# Supports iframes (as long as they are same-origin)

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

    floater.addQuery(".menu-or-whatever", { 
        delegate: true,
        display: "menu" 
    });

# Note:

+   If you want to have floaters on element inside iframes, use @ token
    "@<iframe_id_1> @<iframe_id_2> .<element_class_1> .<element_class_2>"
    -> {
        scope: ["@<iframe_id_1>", "@<iframe_id_2>"],
        selector: ".<element_class_1> .<element_class_2>"
    }
    This means:
        + Applying floater to element with query ".<element_class_1> .<element_class_2>"
        + Inside iframe "<iframe_id_2>", which itself is inside of iframe "<iframe_id_1>".

+   The @ token is a custom thing and not related to css
    If you want to apply style or do whatever to the iframe
    You can still use #<iframe_id>

+   You can freely customize the style of the floater in css:
        #ez-floater
        #ez-floater.ez-floater-mode-context
        #ez-floater.ez-floater-active
        (or even combinations of those 2 classes above)
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
                hoverDocument: null,
                touchTimer: null,
            };

            this.floater = null;
            this._bound = false;
            this._rootWindow = window;
            this._documents = new Map();
            this._iframeLoadHandlers = new Map();

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
            this.state.hoverDocument = null;
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
            const parsed = this._parseQuery(key);
            if (!parsed) return null;

            this.queries[key] = {
                raw: key,
                scope: parsed.scope,
                selector: parsed.selector,
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

            this._attachDocument(this._rootWindow.document, null);

            this._rootWindow.addEventListener("blur", () => {
                if (this.state.mode === "tooltip") this.hideFloater();
            });
        }

        _attachDocument(doc, ownerFrame) {
            if (!doc || this._documents.has(doc)) return;

            const handlers = {
                contextmenu: (event) => this._onContextMenu(event, doc),
                mousemove: (event) => this._onMouseMove(event, doc),
                mouseout: (event) => this._onMouseOut(event, doc),
                touchstart: (event) => this._onTouchStart(event, doc),
                touchend: () => this._clearTouchTimer(),
                touchcancel: () => this._clearTouchTimer(),
                click: (event) => this._onDocumentClick(event),
                keydown: (event) => {
                    if (event.key === "Escape") this.hideFloater();
                },
            };

            doc.addEventListener("contextmenu", handlers.contextmenu, true);
            doc.addEventListener("mousemove", handlers.mousemove, true);
            doc.addEventListener("mouseout", handlers.mouseout, true);
            doc.addEventListener("touchstart", handlers.touchstart, true);
            doc.addEventListener("touchend", handlers.touchend, true);
            doc.addEventListener("touchcancel", handlers.touchcancel, true);
            doc.addEventListener("click", handlers.click, true);
            doc.addEventListener("keydown", handlers.keydown);

            const observer = new MutationObserver((mutations) => {
                for (const mutation of mutations) {
                    for (const node of mutation.addedNodes) {
                        this._visitIframeNodes(node, (iframe) => this._attachIframeDocument(iframe));
                    }

                    for (const node of mutation.removedNodes) {
                        this._visitIframeNodes(node, (iframe) => this._detachIframeDocument(iframe));
                    }
                }
            });

            if (doc.documentElement) {
                observer.observe(doc.documentElement, { childList: true, subtree: true });
            }

            this._documents.set(doc, { ownerFrame, handlers, observer });
            this._scanIframesInDocument(doc);
        }

        _detachDocument(doc) {
            const meta = this._documents.get(doc);
            if (!meta) return;

            const childDocs = [];
            for (const [candidateDoc, candidateMeta] of this._documents.entries()) {
                if (candidateMeta.ownerFrame && candidateMeta.ownerFrame.ownerDocument === doc) {
                    childDocs.push(candidateDoc);
                }
            }

            for (const childDoc of childDocs) {
                this._detachDocument(childDoc);
            }

            meta.observer.disconnect();
            doc.removeEventListener("contextmenu", meta.handlers.contextmenu, true);
            doc.removeEventListener("mousemove", meta.handlers.mousemove, true);
            doc.removeEventListener("mouseout", meta.handlers.mouseout, true);
            doc.removeEventListener("touchstart", meta.handlers.touchstart, true);
            doc.removeEventListener("touchend", meta.handlers.touchend, true);
            doc.removeEventListener("touchcancel", meta.handlers.touchcancel, true);
            doc.removeEventListener("click", meta.handlers.click, true);
            doc.removeEventListener("keydown", meta.handlers.keydown);

            this._documents.delete(doc);
        }

        destroy() {
            this.hideFloater();
            for (const doc of Array.from(this._documents.keys())) {
                this._detachDocument(doc);
            }

            for (const [iframe, onLoad] of this._iframeLoadHandlers.entries()) {
                iframe.removeEventListener("load", onLoad);
            }
            this._iframeLoadHandlers.clear();
        }

        _scanIframesInDocument(doc) {
            const iframes = doc.querySelectorAll("iframe");
            for (const iframe of iframes) {
                this._attachIframeDocument(iframe);
            }
        }

        _visitIframeNodes(node, visitor) {
            if (!node || node.nodeType !== Node.ELEMENT_NODE) return;

            const element = node;
            if (element.tagName === "IFRAME") visitor(element);

            const nested = element.querySelectorAll?.("iframe") || [];
            for (const iframe of nested) {
                visitor(iframe);
            }
        }

        _attachIframeDocument(iframe) {
            if (!iframe || iframe.tagName !== "IFRAME") return;

            if (!this._iframeLoadHandlers.has(iframe)) {
                const onLoad = () => {
                    this._attachIframeDocument(iframe);
                };
                iframe.addEventListener("load", onLoad);
                this._iframeLoadHandlers.set(iframe, onLoad);
            }

            try {
                const childDoc = iframe.contentDocument;
                if (!childDoc) return;

                const existingDocs = this._getChildDocsForFrame(iframe);
                for (const existingDoc of existingDocs) {
                    if (existingDoc !== childDoc) {
                        this._detachDocument(existingDoc);
                    }
                }

                this._attachDocument(childDoc, iframe);
            } catch (error) {
                // Cross-origin iframe, intentionally ignored.
                const existingDocs = this._getChildDocsForFrame(iframe);
                for (const existingDoc of existingDocs) {
                    this._detachDocument(existingDoc);
                }
            }
        }

        _detachIframeDocument(iframe) {
            if (!iframe || iframe.tagName !== "IFRAME") return;

            const onLoad = this._iframeLoadHandlers.get(iframe);
            if (onLoad) {
                iframe.removeEventListener("load", onLoad);
                this._iframeLoadHandlers.delete(iframe);
            }

            try {
                const childDoc = iframe.contentDocument;
                if (!childDoc) return;
                this._detachDocument(childDoc);
            } catch (error) {
                // Cross-origin iframe, intentionally ignored.
            }

            const existingDocs = this._getChildDocsForFrame(iframe);
            for (const existingDoc of existingDocs) {
                this._detachDocument(existingDoc);
            }
        }

        _getChildDocsForFrame(iframe) {
            const childDocs = [];
            for (const [candidateDoc, candidateMeta] of this._documents.entries()) {
                if (candidateMeta.ownerFrame === iframe) {
                    childDocs.push(candidateDoc);
                }
            }
            return childDocs;
        }

        _onContextMenu(event, sourceDoc) {
            if (!event.target || this._isFloaterTarget(event.target)) return;

            const point = this._toRootClientPoint(sourceDoc.defaultView, event.clientX, event.clientY);
            if (!point) return;

            const result = this._matchDisplay("context", event.target, event, sourceDoc);
            if (!result) {
                this.hideFloater();
                return;
            }

            event.preventDefault();
            this.showFloater(result.content, point.x, point.y, "context");
        }

        _onMouseMove(event, sourceDoc) {
            if (this.state.mode === "context") return;
            if (!event.target || this._isFloaterTarget(event.target)) return;

            const point = this._toRootClientPoint(sourceDoc.defaultView, event.clientX, event.clientY);
            if (!point) return;

            const result = this._matchDisplay("tooltip", event.target, event, sourceDoc);
            if (!result) {
                if (this.state.mode === "tooltip") this.hideFloater();
                return;
            }

            const isSameHover =
                this.state.mode === "tooltip" &&
                this.state.hoverElement === result.matched &&
                this.state.hoverSelector === result.selector &&
                this.state.hoverDocument === sourceDoc;

            if (!isSameHover) {
                this.showFloater(result.content, point.x, point.y, "tooltip");
            } else {
                this.setPosition(point.x, point.y);
            }

            this.state.hoverElement = result.matched;
            this.state.hoverSelector = result.selector;
            this.state.hoverDocument = sourceDoc;
        }

        _onMouseOut(event, sourceDoc) {
            if (this.state.mode !== "tooltip" || !this.state.hoverElement) return;
            if (this.state.hoverDocument !== sourceDoc) return;

            const nextTarget = event.relatedTarget;
            if (nextTarget && this.state.hoverElement.contains(nextTarget)) return;

            this.hideFloater();
        }

        _onTouchStart(event, sourceDoc) {
            if (!event.target || this._isFloaterTarget(event.target)) return;

            const touch = event.touches?.[0];
            if (!touch) return;

            this._clearTouchTimer();
            this.state.touchTimer = this._rootWindow.setTimeout(() => {
                const result = this._matchDisplay("context", event.target, event, sourceDoc);
                if (!result) {
                    this.hideFloater();
                    return;
                }

                const point = this._toRootClientPoint(sourceDoc.defaultView, touch.clientX, touch.clientY);
                if (!point) return;

                this.showFloater(result.content, point.x, point.y, "context");
            }, this.LONG_PRESS_MS);
        }

        _onDocumentClick(event) {
            if (this._isFloaterTarget(event.target)) return;
            this.hideFloater();
        }

        _isFloaterTarget(target) {
            if (!target || !this.floater) return false;
            if (target.ownerDocument !== document) return false;
            return this.floater.contains(target);
        }

        _toRootClientPoint(sourceWindow, clientX, clientY) {
            if (!sourceWindow) return null;

            let x = clientX;
            let y = clientY;
            let currentWindow = sourceWindow;

            while (currentWindow && currentWindow !== this._rootWindow) {
                let frameElement = null;
                try {
                    frameElement = currentWindow.frameElement;
                } catch (error) {
                    return null;
                }

                if (!frameElement) return null;

                const rect = frameElement.getBoundingClientRect();
                x += rect.left;
                y += rect.top;
                currentWindow = frameElement.ownerDocument.defaultView;
            }

            if (currentWindow !== this._rootWindow) return null;
            return { x, y };
        }

        _clearTouchTimer() {
            if (!this.state.touchTimer) return;
            this._rootWindow.clearTimeout(this.state.touchTimer);
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

        _matchDisplay(mode, eventTarget, event, sourceDoc) {
            let target = eventTarget;
            if (target && target.nodeType === Node.TEXT_NODE) {
                target = target.parentElement;
            }

            if (!target || target.nodeType !== Node.ELEMENT_NODE) return null;

            for (const [, query] of Object.entries(this.queries)) {
                const scopeDoc = this._resolveScopeDocument(query.scope);
                if (!scopeDoc || scopeDoc !== sourceDoc) continue;

                const matched = query.delegate === false
                    ? (target.matches(query.selector) ? target : null)
                    : target.closest(query.selector);
                if (!matched) continue;

                const display = this.displays[query.display] || null;
                if (!display) continue;

                const runDisplay = mode === "context" ? display.context : display.tooltip;
                if (typeof runDisplay !== "function") continue;

                const content = runDisplay(matched, {
                    mode,
                    event,
                    selector: query.selector,
                    query,
                    floater: this,
                    sourceDocument: sourceDoc,
                });
                if (!content) return null;

                return {
                    selector: query.selector,
                    query,
                    matched,
                    content,
                };
            }

            return null;
        }

        _parseQuery(raw) {
            const parts = raw.split(/\s+/).filter(Boolean);
            if (!parts.length) return null;

            const scope = [];
            const selectorParts = [];

            for (const part of parts) {
                if (part.startsWith("@")) {
                    if (part.length < 2) return null;
                    scope.push(part);
                    continue;
                }

                selectorParts.push(part);
            }

            const selector = selectorParts.join(" ").trim();
            if (!selector) return null;

            return {
                scope,
                selector,
            };
        }

        _resolveScopeDocument(scope) {
            let currentDoc = this._rootWindow.document;

            for (const token of scope) {
                const frameId = token.slice(1);
                if (!frameId) return null;

                const candidate = currentDoc.getElementById(frameId);
                if (!candidate || candidate.tagName !== "IFRAME") return null;

                try {
                    const nextDoc = candidate.contentDocument;
                    if (!nextDoc) return null;
                    currentDoc = nextDoc;
                } catch (error) {
                    return null;
                }
            }

            return currentDoc;
        }
    }

    window.EzFloater = EzFloater;
})();

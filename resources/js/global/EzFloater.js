/*
EzFloater
By Asciiz

# Cool dynamic context menus and hover tooltips that is aware of iframes and DOMs and shi

# Guide:
    + include EzFloater.js in your page (every page has a unique instance, don't worry about conflicts)
    + use window.EzFloater.handler in a different script

    + window.EzFloater.handler - global engine that resolves event and shi
        + addEventFn(eventName, actionName, actionFn): add a handler function for floater content with data-[eventName]=[actionName]
        + removeEventFn(eventName, actionName): remove the handler function, if actionName is not provided, remove the whole event group
        + setDisplay(name, cfg): register or update a shared display definition for context menu or tooltip
            + cfg = {
                context: function(element, ctx) { ... } return a wrapper element for the context menu
                tooltip: function(element, ctx) { ... } return a wrapper element for the tooltip
            }
        + setupQuery(rawQuery, displayName, delegate = true): add a query that points to a shared display definition
        + removeQuery(rawQuery): remove the query

    + To display iframe's handler.floater, do "@<the-iframe-id-but-without-#> <the iframe element, attribute, etc>"
        + For example: @screen #inside-the-screen

    + That's pretty much it.

# Notes:
    + Freely customize the floater style in your css with
        #ez-floater and #ez-floater.ez-floater-active

    + Every iframe requires an id
        + IDs don’t need to be globally unique across nested iframes because each iframe has its own document scope
            Something like "@screen @screen .class" will work, it means
            "looking for .class inside an iframe with id=screen,
            which itself is inside another iframe with id=screen"

    + Query must starts with all @scope tokens (if any) followed by css selector
        + Something like @screen1 .class1 @screen2 .class2 will be interpreted to
            scope = ['screen1', 'screen2']
            selector = '.class1 .class2'

*/

(function() {

    class EzFloater {
        constructor() {
            this.events = {};
            this.queries = {};
            this.display = {};
            this.state = {
                mode: null,
                hoverElement: null,
                hoverDocument: null,
                hoverScopeKey: ''
            }

            this.FLOATER_ID = 'ez-floater';
            this.FLOATER_STYLE_ID = 'ez-floater-runtime-style';
            this.floater = null;
        }

        init() {
            // Create new handler.floater element if not exist
            this.floater = document.getElementById(this.FLOATER_ID);
            if (!this.floater) {
                this.floater = document.createElement('div');
                this.floater.id = this.FLOATER_ID;
                document.body.appendChild(this.floater);
            }

            // Create runtime style for handler.floater if not exist
            if (document.getElementById(this.FLOATER_STYLE_ID)) return;

            const style = document.createElement('style');
            style.id = this.FLOATER_STYLE_ID;
            style.innerHTML = `
                #ez-floater {
                    position: fixed;
                    top: 0;
                    left: 0;
                    z-index: 2147483647;
                    opacity: 0;
                    pointer-events: none;
                }
                #ez-floater.ez-floater-active {
                    opacity: 0.8;
                    visibility: visible;
                    pointer-events: none;
                }
                #ez-floater.ez-floater-mode-context {
                    pointer-events: auto;
                }
            `;

            document.head.appendChild(style);

            // Event delegation for floater clicks
            this.floater.addEventListener('mousedown', function(event) {
                const clickdata = (event.button === 0) ? 'leftclick' :
                                ( (event.button === 2) ? 'rightclick' :
                                ( (event.button === 1) ? 'middleclick' :
                                ( null ) ) );

                if (!clickdata) return;

                // Find the closest element with this data attribute
                const clickedElement = event.target.closest('[data-' + clickdata + ']');  
                if (!clickedElement) return;

                const action = clickedElement.dataset[clickdata];
                const actionFn = this.getEventFn(clickdata, action);
                if (typeof actionFn === 'function') actionFn(event, clickedElement);
            });

            // Click away or press Escape to hide floater
            document.addEventListener('click', function(event) {
                if (!this.floater.contains(event.target)) this.hideFloater();
            }.bind(this));

            document.addEventListener('keydown', function(event) {
                if (event.key === 'Escape') this.hideFloater();
            }.bind(this));
        }

    // Floater state management and utils

        getFloaterStyle() {
            return {
                "hidden": window.getComputedStyle(this.floater),
                "visible": window.getComputedStyle(this.floater, '.ez-floater-active')
            }
        }

        setFloaterCoord(x, y) {
            const offset = 8;
            const maxLeft = window.innerWidth - this.floater.offsetWidth - offset;
            const maxTop = window.innerHeight - this.floater.offsetHeight - offset;

            const nextLeft = Math.min(x + offset, Math.max(offset, maxLeft));
            const nextTop = Math.min(y + offset, Math.max(offset, maxTop));

            this.floater.style.left = nextLeft + 'px';
            this.floater.style.top = nextTop + 'px';
        }

        showFloater(content, x, y, mode) {
            this.floater.replaceChildren();

            if (typeof content === 'string') {
                this.floater.textContent = content;
            } else {
                this.floater.appendChild(content);
            }

            this.state.mode = mode;
            this.floater.classList.toggle('ez-floater-mode-context', mode === 'context');
            this.floater.classList.add('ez-floater-active');
            this.setFloaterCoord(x, y);
        }

        hideFloater() {
            this.state.mode = null;
            this.floater.classList.remove('ez-floater-active');
            this.floater.classList.remove('ez-floater-mode-context');

            // Clear hover state
            this.state.hoverElement = null;
            this.state.hoverDocument = null;
            this.state.hoverScopeKey = '';
        }

    // Floater events and queries management

        addEventFn(eventName, actionName, actionFn) {
            if (!eventName || !actionName || typeof actionFn !== 'function') return null;

            // Event group hasn't exist
            if (!this.events[eventName]) this.events[eventName] = {};

            this.events[eventName][actionName] = actionFn;
            return actionFn;
        }

        removeEventFn(eventName, actionName) {
            const eventGroup = this.events[eventName];
            if (!eventGroup) return false;

            if (!actionName) {
                delete this.events[eventName];
                return true;
            }

            if (!Object.prototype.hasOwnProperty.call(eventGroup, actionName)) {
                return false;
            }

            delete eventGroup[actionName];
            if (Object.keys(eventGroup).length === 0) {
                delete this.events[eventName];
            }

            return true;
        }

        getEventFn(eventName, actionName) {
            const eventGroup = this.events[eventName];
            if (!eventGroup) {
                return null;
            }
            return eventGroup[actionName] || null;
        }

        setDisplay(name, cfg) {
            if (typeof name !== 'string' || !name.trim() || !cfg || typeof cfg !== 'object') return null;

            const displayName = name.trim();
            const hasContext = Object.prototype.hasOwnProperty.call(cfg, 'context');
            const hasTooltip = Object.prototype.hasOwnProperty.call(cfg, 'tooltip');
            if (!hasContext && !hasTooltip) return null;

            const currentDisplay = this.display[displayName] || { name: displayName, context: null, tooltip: null };

            if (hasContext) {
                currentDisplay.context = typeof cfg.context === 'function' ? cfg.context : null;
            }

            if (hasTooltip) {
                currentDisplay.tooltip = typeof cfg.tooltip === 'function' ? cfg.tooltip : null;
            }

            this.display[displayName] = currentDisplay;
            return currentDisplay;
        }

        setupQuery(rawQuery, displayName, delegate = true) {
            if (!rawQuery || typeof displayName !== 'string' || !displayName.trim()) return null;

            const tokens = String(rawQuery || '').trim().split(/\s+/).filter(Boolean);
            const scope = [];
            const selectorTokens = [];

            tokens.forEach(function(token) {
                if (token.startsWith('@')) {
                    scope.push(token.slice(1));
                    return;
                }
                selectorTokens.push(token);
            });

            const normalizedDisplayName = displayName.trim();

            const compiledQuery = {
                raw: rawQuery,
                scope: scope,
                selector: selectorTokens.join(' '),
                delegate: delegate !== false,
                display: normalizedDisplayName
            };

            this.queries[rawQuery] = compiledQuery;
            return compiledQuery;
        }

        removeQuery(rawQuery) {
            if (!Object.prototype.hasOwnProperty.call(this.queries, rawQuery)) {
                return false;
            }

            delete this.queries[rawQuery];
            return true;
        }

        getQueryCtx(query) {
            return this.queries[query] || null;
        }

        getCompiledQueries() {
            return Object.values(this.queries);
        }

    // Floater query execution

        /* execQuery's ctx = {
            mode: 'context' or 'tooltip',
            scope: array of scope tokens,
            target: the original event target element
        } */
        execQuery(ctx) {
            let target = ctx.target;
            if (!target) return null;

            const compiledQueries = handler.getCompiledQueries();

            // If this a text node, use its parent instead (should not happen, i think)
            if (target && target.nodeType === Node.TEXT_NODE) {
                target = target.parentElement;
            }

            // Not a node = GTFO
            if (!target || target.nodeType !== Node.ELEMENT_NODE) {
                return null;
            }

            // Iterate through all compiled queries to find the match
            for (let i = 0; i < compiledQueries.length; i += 1) {
                const query = compiledQueries[i];

                // This thing is not even a valid query object
                if (!query.selector) continue;

                // Scop length not the same = not it man
                if (query.scope.length !== ctx.scope.length) continue;

                // Scope comparison, support '*' as well
                let scopeOk = true;
                for (let j = 0; j < query.scope.length; j += 1) {
                    if (query.scope[j] !== '*' && query.scope[j] !== ctx.scope[j]) {
                        scopeOk = false;
                        break;
                    }
                }
                if (!scopeOk) continue;


                // Find the matched element
                const matched = query.delegate === false
                    ? (target.matches(query.selector) ? target : null)
                    : target.closest(query.selector);
                if (!matched) continue;

                const display = handler.display[query.display] || null;
                if (!display) continue;

                // Run either context or tooltip mode function, if exists
                const runFn = ctx.mode === 'context' ? display.context : display.tooltip;
                if (typeof runFn !== 'function') continue; // should not happen

                const content = runFn(matched, ctx);
                if (!content) return null;

                return {
                    query: query,     // The matched query object
                    matched: matched, // The matched element
                    content: content  // The content to show in floater
                };
            }

            return null;
        }
    }
    const handler = new EzFloater();
    handler.init();

    const runtime = {
        frameSelector: '#preview-frame',
        docContexthandler: new WeakMap(),
        docClickhandler: new WeakMap(),
        docKeyhandler: new WeakMap(),
        docMovehandler: new WeakMap(),
        docOuthandler: new WeakMap(),
        docLeavehandler: new WeakMap(),
        watchedIframes: new WeakSet()
    };

    function getOrCreateHandler(map, key, factory) {
        let rthandler = map.get(key);
        if (!rthandler) {
            rthandler = factory();
            map.set(key, rthandler);
        }
        return rthandler;
    }

    // Getting the real clientX/Y by accumulating offsets from all frames in the chain
    function resolveClientPoint(event, frameChain) {
        let x = event.clientX;
        let y = event.clientY;

        frameChain.forEach(function(frameEl) {
            const rect = frameEl.getBoundingClientRect();
            x += rect.left;
            y += rect.top;
        });

        return { x: x, y: y };
    }

    function bindDocumentContext(doc, scopeChain, frameChain) {
        if (!doc) {
            return;
        }

        const contextHandler = getOrCreateHandler(runtime.docContexthandler, doc, function() {
            return function(event) {
                event.preventDefault();
                event.stopPropagation();

                let result = null;
                let point = null;
                try {
                    point = resolveClientPoint(event, frameChain);
                    result = handler.execQuery({
                        mode: 'context',
                        scope: scopeChain,
                        target: event.target
                    });
                } catch (error) {
                    handler.hideFloater();
                    return;
                }

                if (!result) {
                    handler.hideFloater();
                    return;
                }

                handler.showFloater(result.content, point.x, point.y, 'context');
            };
        });

        doc.removeEventListener('contextmenu', contextHandler, true);
        doc.addEventListener('contextmenu', contextHandler, true);

        const moveHandler = getOrCreateHandler(runtime.docMovehandler, doc, function() {
            return function(event) {
                if (handler.state.mode === 'context') {
                    return;
                }

                const point = resolveClientPoint(event, frameChain);
                const result = handler.execQuery({
                    scope: scopeChain,
                    target: event.target,
                    mode: 'tooltip'
                });

                if (!result) {
                    if (handler.state.mode === 'tooltip') {
                        handler.hideFloater();
                    }
                    return;
                }

                const scopeKey = scopeChain.join('>');
                const isSameHoverTarget =
                    handler.state.mode === 'tooltip' &&
                    handler.state.hoverElement === result.matched &&
                    handler.state.hoverDocument === doc &&
                    handler.state.hoverScopeKey === scopeKey;

                if (!isSameHoverTarget) {
                    handler.showFloater(result.content, point.x, point.y, 'tooltip');
                } else {
                    handler.setFloaterCoord(point.x, point.y);
                }

                handler.state.hoverElement = result.matched;
                handler.state.hoverDocument = doc;
                handler.state.hoverScopeKey = scopeKey;
            };
        });

        doc.removeEventListener('mousemove', moveHandler, true);
        doc.addEventListener('mousemove', moveHandler, true);

        const outHandler = getOrCreateHandler(runtime.docOuthandler, doc, function() {
            return function(event) {
                if (handler.state.mode !== 'tooltip' || handler.state.hoverDocument !== doc || !handler.state.hoverElement) {
                    return;
                }

                const nextTarget = event.relatedTarget;
                if (nextTarget && handler.state.hoverElement.contains(nextTarget)) {
                    return;
                }

                handler.hideFloater();
            };
        });

        doc.removeEventListener('mouseout', outHandler, true);
        doc.addEventListener('mouseout', outHandler, true);

        const leaveHandler = getOrCreateHandler(runtime.docLeavehandler, doc, function() {
            return function() {
                if (handler.state.mode === 'tooltip' && handler.state.hoverDocument === doc) {
                    handler.hideFloater();
                }
            };
        });

        doc.removeEventListener('mouseleave', leaveHandler, true);
        doc.addEventListener('mouseleave', leaveHandler, true);

        const clickHandler = getOrCreateHandler(runtime.docClickhandler, doc, function() {
            return function(event) {
                if (doc === document && handler.floater.contains(event.target)) {
                    return;
                }
                handler.hideFloater();
            };
        });

        doc.removeEventListener('click', clickHandler, true);
        doc.addEventListener('click', clickHandler, true);

        const keyHandler = getOrCreateHandler(runtime.docKeyhandler, doc, function() {
            return function(event) {
                if (event.key === 'Escape') {
                    handler.hideFloater();
                }
            };
        });

        doc.removeEventListener('keydown', keyHandler, true);
        doc.addEventListener('keydown', keyHandler, true);

        const iframes = Array.from(doc.querySelectorAll('iframe'));
        iframes.forEach(function(iframeEl, index) {
            const scopeId = iframeEl.getAttribute('data-scope-id') || iframeEl.id || iframeEl.name || ('frame-' + index);
            const nextScope = scopeChain.concat(scopeId);
            const nextFrameChain = frameChain.concat(iframeEl);

            function bindCurrentIframeDoc() {
                let childDoc;
                try {
                    childDoc = iframeEl.contentDocument;
                } catch (error) {
                    return;
                }

                if (!childDoc) {
                    return;
                }

                bindDocumentContext(childDoc, nextScope, nextFrameChain);
            }

            bindCurrentIframeDoc();

            if (!runtime.watchedIframes.has(iframeEl)) {
                runtime.watchedIframes.add(iframeEl);
                iframeEl.addEventListener('load', bindCurrentIframeDoc);
            }
        });
    }

    bindDocumentContext(document, [], []);

    document.addEventListener('wc:frame-rendered', function(event) {
        const detail = event.detail || {};
        const previewFrame = document.querySelector(runtime.frameSelector);
        const frameDoc = detail.frameDocument || (previewFrame ? previewFrame.contentDocument : null);
        if (!previewFrame || !frameDoc) {
            return;
        }

        bindDocumentContext(frameDoc, ['preview-frame'], [previewFrame]);
    });

    {
        const previewFrame = document.querySelector(runtime.frameSelector);
        const frameDoc = previewFrame ? previewFrame.contentDocument : null;
        if (previewFrame && frameDoc) {
            bindDocumentContext(frameDoc, ['preview-frame'], [previewFrame]);
        }
    }

    // Unique instance every page
    window.EzFloater = { handler: handler };
})();

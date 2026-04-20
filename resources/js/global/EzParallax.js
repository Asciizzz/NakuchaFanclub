/*
EzParallax
By Asciiz

# Parallax template model:
- data-ezparallax-template : transform template with token placeholders, e.g. translate3d($tx%,$ty%,0)
- data-ezparallax-value    : whitespace-delimited starting values in token order, e.g. "10 20"

# Tokens are replaced with raw numeric values. Units are defined directly in the template.
*/
(function() {
    const TEMPLATE_ATTR = "data-ezparallax-template";
    const VALUE_ATTR = "data-ezparallax-value";
    const TEMPLATE_ATTR_ALIASES = ["data-ez-parallax-template", "data-ez-parallax-transform"];
    const VALUE_ATTR_ALIASES = ["data-ez-parallax-value", "data-exparallax-value"];
    const DEFAULT_TEMPLATE = "translate3d($x,$y,$z) rotateX($rx) rotateY($ry) rotateZ($rz) scale3d($sx,$sy,$sz)";

    const instances = new Set();

    function clamp01(value) {
        return Math.max(0, Math.min(1, value));
    }

    function isScaleKey(key) {
        return /^s([xyz])?$/i.test(key) || /^scale/i.test(key);
    }

    function isRotationKey(key) {
        return /^r[xyz]$/i.test(key) || /^rot/i.test(key);
    }

    function getDefaultValueForKey(key) {
        return isScaleKey(key) ? 1 : 0;
    }

    function getImplicitUnitForKey(key) {
        if (isScaleKey(key)) return "";
        if (isRotationKey(key)) return "deg";
        return "px";
    }

    function getBaseTransform(element) {
        const computed = window.getComputedStyle(element).transform;
        return computed && computed !== "none" ? computed : "";
    }

    function readCssBaseTransform(element) {
        const previousInlineTransform = element.style.transform;
        element.style.transform = "";

        const baseTransform = getBaseTransform(element);

        element.style.transform = previousInlineTransform;
        return baseTransform;
    }

    function extractTemplateTokens(template) {
        const tokens = [];
        const seen = new Set();
        const tokenRegex = /\$([a-zA-Z_][a-zA-Z0-9_]*)/g;
        let match = tokenRegex.exec(template);

        while (match) {
            const key = match[1];
            if (!seen.has(key)) {
                tokens.push(key);
                seen.add(key);
            }
            match = tokenRegex.exec(template);
        }

        return tokens;
    }

    function parseValue(value) {
        const num = Number(value);
        return Number.isFinite(num) ? num : null;
    }

    function parseTemplateValueString(raw) {
        if (!raw || typeof raw !== "string") return [];
        return raw.trim().split(/\s+/).filter(Boolean).map((part) => Number(part)).filter((num) => Number.isFinite(num));
    }

    function normalizeInitialValues(rawValues, tokenOrder) {
        const resolved = new Map();

        if (Array.isArray(rawValues)) {
            for (let i = 0; i < tokenOrder.length; i += 1) {
                const value = parseValue(rawValues[i]);
                if (value !== null) {
                    resolved.set(tokenOrder[i], value);
                }
            }
            return resolved;
        }

        if (rawValues && typeof rawValues === "object") {
            tokenOrder.forEach((token) => {
                const value = parseValue(rawValues[token]);
                if (value !== null) {
                    resolved.set(token, value);
                }
            });
            return resolved;
        }

        if (typeof rawValues === "string") {
            const values = parseTemplateValueString(rawValues);
            for (let i = 0; i < tokenOrder.length; i += 1) {
                if (!Number.isFinite(values[i])) continue;
                resolved.set(tokenOrder[i], values[i]);
            }
        }

        return resolved;
    }

    function normalizeAxisMap(axisMap) {
        if (!axisMap || typeof axisMap !== "object") return [];

        const channelsByKey = new Map();

        for (const [rawProgress, valueMap] of Object.entries(axisMap)) {
            const progress = clamp01(Number(rawProgress));
            if (!Number.isFinite(progress) || !valueMap || typeof valueMap !== "object") continue;

            for (const [key, rawValue] of Object.entries(valueMap)) {
                const value = parseValue(rawValue);
                if (value === null) continue;

                if (!channelsByKey.has(key)) {
                    channelsByKey.set(key, {
                        key,
                        stops: [],
                    });
                }

                channelsByKey.get(key).stops.push({ progress, value });
            }
        }

        const channels = [];
        channelsByKey.forEach((channel) => {
            channel.stops.sort((a, b) => a.progress - b.progress);
            if (channel.stops.length > 1) channels.push(channel);
        });

        return channels;
    }

    function interpolateStops(stops, t) {
        if (t <= stops[0].progress) return stops[0].value;
        if (t >= stops[stops.length - 1].progress) return stops[stops.length - 1].value;

        for (let i = 0; i < stops.length - 1; i += 1) {
            const a = stops[i];
            const b = stops[i + 1];

            if (t >= a.progress && t <= b.progress) {
                const span = b.progress - a.progress || 1;
                const localT = (t - a.progress) / span;
                return a.value + (b.value - a.value) * localT;
            }
        }

        return stops[stops.length - 1].value;
    }

    class EzParallaxMouse {
        constructor(config) {
            this.owner = config.owner;
            this.ease = Number.isFinite(config.ease) ? config.ease : 0.08;
            this.restThreshold = Number.isFinite(config.restThreshold) ? config.restThreshold : 0.02;
            this.exitProgress = config.exitProgress || { x: 0.5, y: 0.5 };
            this.targetProgress = { x: 0.5, y: 0.5 };
            this.activePointerId = null;
            this.activePointerType = null;

            this.channels = [];
            this.state = new Map();
            this.targetEntries = [];
            this.rafId = 0;

            const attrs = Array.isArray(config.attrs) ? config.attrs : [];
            attrs.forEach((attr, attrIndex) => {
                if (!attr || !attr.element) return;

                const element = attr.element;
                const template = attr.template
                    || element.getAttribute(TEMPLATE_ATTR)
                    || TEMPLATE_ATTR_ALIASES.map((name) => element.getAttribute(name)).find(Boolean)
                    || DEFAULT_TEMPLATE;
                const tokenOrder = extractTemplateTokens(template);
                const baseTransformSource = typeof attr.baseTransform === "function" || typeof attr.baseTransform === "string"
                    ? attr.baseTransform
                    : null;

                const valueSource = attr.values
                    || element.getAttribute(VALUE_ATTR)
                    || VALUE_ATTR_ALIASES.map((name) => element.getAttribute(name)).find(Boolean)
                    || "";
                const initialValues = normalizeInitialValues(valueSource, tokenOrder);

                element.setAttribute(TEMPLATE_ATTR, template);

                const entry = {
                    id: `${attrIndex}:${element.tagName || "el"}`,
                    element,
                    baseTransform: getBaseTransform(element),
                    baseTransformSource,
                    template,
                    tokenOrder,
                    values: new Map(),
                };
                this.targetEntries.push(entry);

                tokenOrder.forEach((token) => {
                    const value = initialValues.has(token)
                        ? initialValues.get(token)
                        : getDefaultValueForKey(token);
                    entry.values.set(token, value);
                });

                const axisX = normalizeAxisMap(attr.axisX || attr.x || attr.axis).map((ch) => ({ ...ch, axis: "x", entry }));
                const axisY = normalizeAxisMap(attr.axisY || attr.y).map((ch) => ({ ...ch, axis: "y", entry }));
                const axisZ = normalizeAxisMap(attr.axisZ || attr.z).map((ch) => ({ ...ch, axis: "z", entry }));
                const combined = [...axisX, ...axisY, ...axisZ];

                combined.forEach((channel, index) => {
                    const key = `${entry.id}:${channel.axis}:${channel.key}:${index}`;
                    this.channels.push({ ...channel, id: key });
                    const startValue = entry.values.has(channel.key)
                        ? entry.values.get(channel.key)
                        : getDefaultValueForKey(channel.key);
                    this.state.set(key, startValue);
                    entry.values.set(channel.key, startValue);
                });
            });

            this.onPointerMove = this.onPointerMove.bind(this);
            this.onPointerDown = this.onPointerDown.bind(this);
            this.onPointerUp = this.onPointerUp.bind(this);
            this.onPointerCancel = this.onPointerCancel.bind(this);
            this.onPointerLeave = this.onPointerLeave.bind(this);
            this.onDragStart = this.onDragStart.bind(this);
            this.onSelectStart = this.onSelectStart.bind(this);
            this.runFrame = this.runFrame.bind(this);

            this.owner.style.touchAction = "none";
            this.owner.style.userSelect = "none";
            this.owner.style.webkitUserSelect = "none";
            this.owner.style.msUserSelect = "none";
            this.owner.style.webkitTouchCallout = "none";
            this.owner.style.webkitUserDrag = "none";
            this.owner.addEventListener("pointermove", this.onPointerMove, { passive: true });
            this.owner.addEventListener("pointerdown", this.onPointerDown, { passive: false });
            this.owner.addEventListener("pointerup", this.onPointerUp, { passive: true });
            this.owner.addEventListener("pointercancel", this.onPointerCancel, { passive: true });
            this.owner.addEventListener("pointerleave", this.onPointerLeave, { passive: true });
            this.owner.addEventListener("dragstart", this.onDragStart, { passive: false });
            this.owner.addEventListener("selectstart", this.onSelectStart, { passive: false });

            this.setProgress(this.exitProgress.x, this.exitProgress.y);
            this.refresh();
            this.ensureRunning();
        }

        setProgress(x, y) {
            this.targetProgress.x = clamp01(x);
            this.targetProgress.y = clamp01(y);
        }

        setProgressFromEvent(event) {
            const rect = this.owner.getBoundingClientRect();
            if (!rect.width || !rect.height) return false;

            const x = (event.clientX - rect.left) / rect.width;
            const y = (event.clientY - rect.top) / rect.height;
            this.setProgress(x, y);
            this.ensureRunning();
            return true;
        }

        onPointerMove(event) {
            if (event.pointerType === "mouse") {
                this.setProgressFromEvent(event);
                return;
            }

            if (this.activePointerId === event.pointerId) {
                this.setProgressFromEvent(event);
            }
        }

        onPointerDown(event) {
            if (event.pointerType === "mouse") {
                this.setProgressFromEvent(event);
                return;
            }

            this.activePointerId = event.pointerId;
            this.activePointerType = event.pointerType;

            if (typeof this.owner.setPointerCapture === "function") {
                try {
                    this.owner.setPointerCapture(event.pointerId);
                } catch {
                    // Ignore capture failures on unsupported browsers or detached nodes.
                }
            }

            this.setProgressFromEvent(event);
            event.preventDefault();
        }

        onPointerUp(event) {
            if (this.activePointerId !== event.pointerId) return;
            this.clearActivePointer(event.pointerId);
        }

        onPointerCancel(event) {
            if (this.activePointerId !== event.pointerId) return;
            this.clearActivePointer(event.pointerId);
        }

        clearActivePointer(pointerId) {
            if (typeof this.owner.releasePointerCapture === "function") {
                try {
                    this.owner.releasePointerCapture(pointerId);
                } catch {
                    // Ignore release failures when capture was already lost.
                }
            }

            this.activePointerId = null;
            this.activePointerType = null;
            this.setProgress(this.exitProgress.x, this.exitProgress.y);
            this.ensureRunning();
        }

        onPointerLeave() {
            if (this.activePointerType && this.activePointerType !== "mouse") {
                return;
            }
            this.setProgress(this.exitProgress.x, this.exitProgress.y);
            this.ensureRunning();
        }

        onDragStart(event) {
            event.preventDefault();
        }

        onSelectStart(event) {
            event.preventDefault();
        }

        ensureRunning() {
            if (this.rafId) return;
            this.rafId = requestAnimationFrame(this.runFrame);
        }

        refresh() {
            this.targetEntries.forEach((entry) => {
                entry.element.style.transform = this.buildTransform(entry);
                entry.element.setAttribute(VALUE_ATTR, this.serializeEntryValues(entry));
            });
        }

        serializeEntryValues(entry) {
            return entry.tokenOrder.map((key) => {
                const value = entry.values.has(key)
                    ? entry.values.get(key)
                    : getDefaultValueForKey(key);
                return `${value}`;
            }).join(" ");
        }

        resolveBaseTransform(entry) {
            if (typeof entry.baseTransformSource === "function") {
                return entry.baseTransformSource() || "";
            }

            if (typeof entry.baseTransformSource === "string") {
                return entry.baseTransformSource;
            }

            return entry.baseTransform;
        }

        buildTransform(entry) {
            const parallaxTransform = entry.template.replace(/\$([a-zA-Z_][a-zA-Z0-9_]*)/g, (match, key, offset, source) => {
                const value = entry.values.has(key)
                    ? entry.values.get(key)
                    : getDefaultValueForKey(key);

                const nextChar = source[offset + match.length] || "";
                const hasExplicitUnit = /[%a-zA-Z]/.test(nextChar);
                const unit = hasExplicitUnit ? "" : getImplicitUnitForKey(key);
                return `${value}${unit}`;
            });

            const baseTransform = this.resolveBaseTransform(entry);
            if (!baseTransform) return parallaxTransform;
            return `${baseTransform} ${parallaxTransform}`;
        }

        runFrame() {
            if (!this.channels.length) {
                this.rafId = 0;
                return;
            }

            let maxDelta = 0;

            this.channels.forEach((channel) => {
                const axisProgress = channel.axis === "x" ? this.targetProgress.x : this.targetProgress.y;
                const resolved = interpolateStops(channel.stops, axisProgress);
                const current = this.state.get(channel.id) ?? getDefaultValueForKey(channel.key);
                const delta = resolved - current;
                const next = current + delta * this.ease;

                this.state.set(channel.id, next);
                channel.entry.values.set(channel.key, next);
                maxDelta = Math.max(maxDelta, Math.abs(delta));
            });

            this.refresh();

            if (maxDelta < this.restThreshold) {
                this.rafId = 0;
                return;
            }

            this.rafId = requestAnimationFrame(this.runFrame);
        }

        syncBaseTransforms() {
            this.targetEntries.forEach((entry) => {
                if (entry.baseTransformSource) return;
                entry.baseTransform = readCssBaseTransform(entry.element);
            });

            this.refresh();
            this.ensureRunning();
        }

        destroy() {
            if (this.rafId) {
                cancelAnimationFrame(this.rafId);
                this.rafId = 0;
            }

            this.owner.removeEventListener("pointermove", this.onPointerMove);
            this.owner.removeEventListener("pointerdown", this.onPointerDown);
            this.owner.removeEventListener("pointerup", this.onPointerUp);
            this.owner.removeEventListener("pointercancel", this.onPointerCancel);
            this.owner.removeEventListener("pointerleave", this.onPointerLeave);
            this.owner.removeEventListener("dragstart", this.onDragStart);
            this.owner.removeEventListener("selectstart", this.onSelectStart);
        }
    }

    function create(config) {
        if (!config || !config.owner) return null;
        const instance = new EzParallaxMouse(config);
        instances.add(instance);
        return instance;
    }

    function destroy(instance) {
        if (!instance) return;
        instance.destroy();
        instances.delete(instance);
    }

    function destroyAll() {
        instances.forEach((instance) => {
            instance.destroy();
        });
        instances.clear();
    }

    window.ezParallax = {
        create,
        destroy,
        destroyAll,
    };
})();

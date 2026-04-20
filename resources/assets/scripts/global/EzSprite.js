/*
Sprite Animation Engine
By Asciiz

This script was built because html is a b*tch and doesn't support gif functionality with custom frame timing, starting frame, or tinting without using the <canvas> element directly. It provides a simple attribute-based way to use sprite sheets as animations.

Supported attributes:
- data-anime-active   : true/false (default: true)
- data-anime-src      : sprite sheet URL (required)
- data-anime-rows     : number of rows (default: 1)
- data-anime-cols     : number of columns (default: 1)
- data-anime-interval : frame interval in milliseconds (default: 100)
- data-anime-offset   : 1-based starting frame number in row-major order (default: 1)
- data-anime-tintfill : CSS color for full-frame tint (default: none)

Retrievable value:
- data-anime-frame : current 1-based frame number in row-major order

Usage example:
<div data-anime-src="assets/jellyfish.png" data-anime-rows="1" data-anime-cols="5" data-anime-interval="100" data-anime-offset="3" data-anime-tintfill="#ffffff"></div>

I remember trying to create more or less the same thing in like 2024 lmao
But I didn't know jacksht about OOP back then

*/

(function() {
	const SELECTOR = "[data-anime-src]";
	const OBSERVED_ATTRIBUTES = [
		"data-anime-active",
		"data-anime-src",
		"data-anime-rows",
		"data-anime-cols",
		"data-anime-interval",
		"data-anime-offset",
		"data-anime-tintfill"
	];
	const MAX_FRAME_DELTA_MS = 250;
	const instances = new Map();

	function parsePositiveInt(value, fallback) {
		const num = Number.parseInt(value, 10);
		return Number.isFinite(num) && num > 0 ? num : fallback;
	}

	function parsePositiveNumber(value, fallback) {
		const num = Number(value);
		return Number.isFinite(num) && num > 0 ? num : fallback;
	}

	function parseBool(value, fallback) {
		if (value == null || value === "") {
			return fallback;
		}
		return !/^(false|0|off|no)$/i.test(String(value).trim());
	}

	class EzSpriteInstance {
		constructor(element) {
			this.element = element;
			this.canvas = document.createElement("canvas");
			this.ctx = this.canvas.getContext("2d", { alpha: true });
			this.image = new Image();
			this.resizeObserver = null;
			this.windowResizeHandler = null;

			this.imageLoaded = false;
			this.currentFrame = 0;
			this.lastTime = 0;
			this.accumulator = 0;
			this.rafId = null;
			this.isPlaying = false;

			this.src = "";
			this.rows = 1;
			this.cols = 1;
			this.frameInterval = 100;
			this.active = true;
			this.offset = 1;
			this.tintFill = null;
			this.frameWidth = 1;
			this.frameHeight = 1;
			this.totalFrames = 1;
			this.lastPublishedFrame = null;

			this.canvas.className = "sprite-canvas";
			this.canvas.style.display = "block";
			this.element.style.display = "inline-block";
			this.element.style.lineHeight = "0";
			this.element.textContent = "";
			this.element.appendChild(this.canvas);
			this.bindResizeSync();

			this.image.onload = () => {
				this.imageLoaded = true;
				this.calcFrameSize();
				this.syncDisplaySize();
				this.renderFrame();
				if (this.active) {
					this.play();
				}
			};

			this.image.onerror = () => {
				this.imageLoaded = false;
				this.pause();
				console.error(`[ezSprite] Failed to load: ${this.src}`);
			};

			this.refresh();
		}

		refresh() {
			const nextSrc = this.element.dataset.animeSrc || "";
			const nextRows = parsePositiveInt(this.element.dataset.animeRows, 1);
			const nextCols = parsePositiveInt(this.element.dataset.animeCols, 1);
			const nextInterval = parsePositiveNumber(this.element.dataset.animeInterval, 100);
			const nextActive = parseBool(this.element.dataset.animeActive, true);
			const nextOffset = parsePositiveInt(this.element.dataset.animeOffset, 1);
			const nextTint = this.element.dataset.animeTintfill;

			const layoutChanged = nextRows !== this.rows || nextCols !== this.cols;
			if (layoutChanged) {
				this.rows = nextRows;
				this.cols = nextCols;
				this.totalFrames = this.rows * this.cols;
				this.currentFrame = ((this.currentFrame % this.totalFrames) + this.totalFrames) % this.totalFrames;
			}

			const intervalChanged = nextInterval !== this.frameInterval;
			if (intervalChanged) { this.setInterval(nextInterval); }

			const offsetChanged = nextOffset !== this.offset;
			if (offsetChanged) { this.setOffset(nextOffset); }

			const nrmlTint = nextTint && nextTint.trim() ? nextTint.trim() : null;
			const tintChanged = nrmlTint !== this.tintFill;
			if (tintChanged) { this.setTint(nrmlTint); }

			const activeChanged = nextActive !== this.active;
			if (activeChanged) { this.setActive(nextActive); }

			const srcChanged = nextSrc !== this.src;
			if (srcChanged) {
				this.setSrc(nextSrc);
			} else if (this.imageLoaded && layoutChanged) {
				this.calcFrameSize();
				this.renderFrame();
			}
		}

		setSrc(src) {
			this.src = src;
			this.currentFrame = Math.max(0, this.offset - 1);
			this.lastPublishedFrame = null;
			this.lastTime = 0;
			this.accumulator = 0;

			if (!this.src) {
				this.imageLoaded = false;
				this.pause();
				this.clear();
				return;
			}

			this.imageLoaded = false;
			this.image.src = this.src;
		}

		setInterval(intervalMs) {
			this.frameInterval = parsePositiveNumber(intervalMs, 100);
		}

		setOffset(offset) {
			this.offset = parsePositiveInt(offset, 1);
			this.currentFrame = Math.max(0, this.offset - 1);
			this.lastPublishedFrame = null;
			if (this.imageLoaded) {
				this.renderFrame();
			}
		}

		setTint(color) {
			this.tintFill = color;
			if (this.imageLoaded) {
				this.renderFrame();
			}
		}

		setActive(active) {
			this.active = Boolean(active);
			if (!this.active) {
				this.pause();
			} else if (this.imageLoaded) {
				this.play();
			}
		}

		calcFrameSize() {
			this.frameWidth = Math.max(1, Math.floor(this.image.width / this.cols));
			this.frameHeight = Math.max(1, Math.floor(this.image.height / this.rows));

			this.canvas.width = this.frameWidth;
			this.canvas.height = this.frameHeight;
			this.syncDisplaySize();
		}

		syncDisplaySize() {
			const rect = this.element.getBoundingClientRect();
			const hasCustomWidth = Math.abs(rect.width - this.frameWidth) > 0.5;
			const hasCustomHeight = Math.abs(rect.height - this.frameHeight) > 0.5;

			const displayWidth = hasCustomWidth && rect.width > 0 ? rect.width : this.frameWidth;
			const displayHeight = hasCustomHeight && rect.height > 0 ? rect.height : this.frameHeight;

			this.canvas.style.width = `${displayWidth}px`;
			this.canvas.style.height = `${displayHeight}px`;
		}

		bindResizeSync() {
			if ("ResizeObserver" in window) {
				this.resizeObserver = new ResizeObserver(() => {
					this.syncDisplaySize();
				});
				this.resizeObserver.observe(this.element);
				return;
			}

			this.windowResizeHandler = () => this.syncDisplaySize();
			window.addEventListener("resize", this.windowResizeHandler);
		}

		clear() {
			this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
		}

		renderFrame() {
			if (!this.imageLoaded) {
				return;
			}

			const frameIndex = ((this.currentFrame % this.totalFrames) + this.totalFrames) % this.totalFrames;
			const col = frameIndex % this.cols;
			const row = Math.floor(frameIndex / this.cols);
			const frameNumber = frameIndex + 1;

			const sx = col * this.frameWidth;
			const sy = row * this.frameHeight;

			if (this.lastPublishedFrame !== frameNumber) {
				this.element.dataset.animeFrame = String(frameNumber);
				this.lastPublishedFrame = frameNumber;
			}

			this.clear();
			this.ctx.drawImage(
				this.image,
				sx,
				sy,
				this.frameWidth,
				this.frameHeight,
				0,
				0,
				this.frameWidth,
				this.frameHeight
			);

			if (this.tintFill) {
				this.ctx.globalCompositeOperation = "source-atop";
				this.ctx.fillStyle = this.tintFill;
				this.ctx.fillRect(0, 0, this.frameWidth, this.frameHeight);
				this.ctx.globalCompositeOperation = "source-over";
			}
		}

		play() {
			if (this.isPlaying || !this.imageLoaded) {
				return;
			}

			this.isPlaying = true;
			this.lastTime = 0;
			this.accumulator = 0;

			const tick = (now) => {
				if (!this.isPlaying) {
					return;
				}

				if (!this.lastTime) {
					this.lastTime = now;
				}

				const delta = Math.min(now - this.lastTime, MAX_FRAME_DELTA_MS);
				this.lastTime = now;
				this.accumulator += delta;

				while (this.accumulator >= this.frameInterval) {
					this.accumulator -= this.frameInterval;
					this.currentFrame = (this.currentFrame + 1) % this.totalFrames;
					this.renderFrame();
				}

				this.rafId = requestAnimationFrame(tick);
			};

			this.rafId = requestAnimationFrame(tick);
		}

		pause() {
			this.isPlaying = false;
			if (this.rafId) {
				cancelAnimationFrame(this.rafId);
				this.rafId = null;
			}
		}

		destroy() {
			this.pause();
			this.resizeObserver?.disconnect?.();
			if (this.windowResizeHandler) {
				window.removeEventListener("resize", this.windowResizeHandler);
			}
			this.element.textContent = "";
		}
	}

	function initElement(el) {
		if (!el || instances.has(el)) {
			return;
		}
		const instance = new EzSpriteInstance(el);
		instances.set(el, instance);
	}

	function init(root = document) {
		root.querySelectorAll(SELECTOR).forEach(initElement);
	}

	function refreshElement(el) {
		const instance = instances.get(el);
		if (instance) {
			instance.refresh();
			return;
		}
		if (el.matches && el.matches(SELECTOR)) {
			initElement(el);
		}
	}

	function destroyElement(el) {
		const instance = instances.get(el);
		if (!instance) {
			return;
		}
		instance.destroy();
		instances.delete(el);
	}

	function destroyAll() {
		instances.forEach((instance) => {
			instance.destroy();
		});
		instances.clear();
	}

	function visitSpriteElements(node, visitor) {
		if (!(node instanceof Element)) {
			return;
		}

		if (node.matches(SELECTOR)) {
			visitor(node);
		}

		node.querySelectorAll?.(SELECTOR).forEach(visitor);
	}

	const observer = new MutationObserver((mutations) => {
		for (const mutation of mutations) {
			if (mutation.type === "attributes") {
				refreshElement(mutation.target);
			}

			if (mutation.type === "childList") {
				mutation.addedNodes.forEach((node) => {
					visitSpriteElements(node, initElement);
				});

				mutation.removedNodes.forEach((node) => {
					visitSpriteElements(node, destroyElement);
				});
			}
		}
	});

	let observerStarted = false;

	function startObserver() {
		if (observerStarted) {
			return;
		}

		observer.observe(document.documentElement, {
			subtree: true,
			childList: true,
			attributes: true,
			attributeFilter: OBSERVED_ATTRIBUTES,
		});

		observerStarted = true;
	}

	function stopObserver() {
		if (!observerStarted) {
			return;
		}

		observer.disconnect();
		observerStarted = false;
	}

	if (document.readyState === "loading") {
		document.addEventListener("DOMContentLoaded", () => {
			init();
			startObserver();
		});
	} else {
		init();
		startObserver();
	}

	window.ezSprite = {
		init,
		refresh: refreshElement,
		destroy: destroyElement,
		destroyAll,
		startObserver,
		stopObserver,
		getInstance: (el) => instances.get(el) || null,
	};

})();
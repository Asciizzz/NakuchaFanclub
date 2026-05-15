/* ZCanvasWGPU
By Asciiz

Thin WebGPU canvas/device/context wrapper built on AzWGPU.
*/

(function () {
    if (!window.AzWGPU) throw new Error("[ZCanvasWGPU] AzWGPU is required");

    const {
        AzAdapter,
        AzDevice,
        AzContext,
        AzFormat,
    } = window.AzWGPU;

    class ZCanvasWGPU {
        name = null;

        #canvas = null;
        #adapter = null;
        #device = null;
        #context = null;
        #format = null;
        #config = null;
        #depthTexture = null;
        #depthView = null;
        #logicalWidth = 800;
        #logicalHeight = 600;
        #pixelRatio = 1;
        #maxPixelRatio = 2;

        constructor(name = "z-gpu-canvas", opts = {}) {
            this.name = String(name ?? "z-gpu-canvas");

            const c = document.createElement("canvas");
            c.width = 800;
            c.height = 600;
            c.style.background = "transparent";
            this.#canvas = c;

            this.#maxPixelRatio = (typeof opts.maxPixelRatio === "number" && Number.isFinite(opts.maxPixelRatio))
                ? Math.max(1, opts.maxPixelRatio)
                : 2;
            const initialPR = opts.pixelRatio ?? (typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1);
            this.#pixelRatio = this.#clampPixelRatio(initialPR);
        }

        get canvas() { return this.#canvas; }
        get adapter() { return this.#adapter; }
        get device() { return this.#device; }
        get context() { return this.#context; }
        get format() { return this.#format; }
        get depthView() { return this.#depthView; }
        get depthTexture() { return this.#depthTexture; }
        get ready() { return !!(this.#device && this.#context); }

        get info() {
            return {
                width: this.#canvas.width,
                height: this.#canvas.height,
                logicalWidth: this.#logicalWidth,
                logicalHeight: this.#logicalHeight,
                aspectRatio: this.#logicalWidth / Math.max(1e-6, this.#logicalHeight),
                pixelRatio: this.#pixelRatio,
                format: this.#format,
            };
        }

        async init(opts = {}) {
            if (this.#device && this.#context) return this;

            this.#adapter = opts.adapter ?? null;
            if (!this.#adapter) {
                const picked = await AzAdapter.pickBest(opts.pickBest ?? {});
                this.#adapter = picked.adapter;
            }

            this.#device = opts.device ?? await AzDevice.create(this.#adapter, opts.deviceDescriptor ?? {});
            this.#format = opts.format ?? AzFormat.preferredCanvas();
            this.#config = {
                device: this.#device,
                format: this.#format,
                alphaMode: opts.alphaMode ?? "premultiplied",
            };

            this.#context = AzContext.create(this.#device, this.#canvas, this.#config);
            AzDevice.onLost(this.#device, (info) => {
                console.error("[ZCanvasWGPU] Device lost", info);
            });

            this.#applyViewportSize();
            this.#recreateDepth();
            return this;
        }

        mount(el) {
            if (el instanceof Element) el.appendChild(this.#canvas);
            return this;
        }

        unmount() {
            this.#canvas.parentElement?.removeChild(this.#canvas);
            return this;
        }

        fitContainer() {
            const parent = this.#canvas.parentElement;
            if (!parent) return this;
            const rect = parent.getBoundingClientRect();
            return this.resize(rect.width, rect.height);
        }

        resize(w, h) {
            this.#logicalWidth = Math.max(1, Math.round(Number(w) || 1));
            this.#logicalHeight = Math.max(1, Math.round(Number(h) || 1));
            this.#applyViewportSize();
            this.#recreateDepth();
            return this;
        }

        setPixelRatio(ratio) {
            this.#pixelRatio = this.#clampPixelRatio(ratio);
            this.#applyViewportSize();
            this.#recreateDepth();
            return this.#pixelRatio;
        }

        reconfigure(config = {}) {
            if (!this.#context || !this.#device) throw new Error("[ZCanvasWGPU] reconfigure() requires init()");
            this.#config = {
                ...this.#config,
                ...config,
                device: this.#device,
                format: config.format ?? this.#format,
            };
            this.#format = this.#config.format;
            AzContext.reconfigure(this.#context, this.#config);
            this.#recreateDepth();
            return this;
        }

        beginRenderPass(encoder, opts = {}) {
            if (!this.#context || !this.#device) throw new Error("[ZCanvasWGPU] beginRenderPass() requires init()");
            if (!encoder) throw new Error("[ZCanvasWGPU] beginRenderPass() requires a command encoder");

            const clearColor = opts.clearColor ?? { r: 0, g: 0, b: 0, a: 0 };
            const clearDepth = Number(opts.clearDepth ?? 1);
            const colorView = this.#context.getCurrentTexture().createView();

            return encoder.beginRenderPass({
                label: opts.label ?? "ZCanvasWGPU.RenderPass",
                colorAttachments: [
                    {
                        view: colorView,
                        clearValue: clearColor,
                        loadOp: opts.colorLoadOp ?? "clear",
                        storeOp: opts.colorStoreOp ?? "store",
                    },
                ],
                depthStencilAttachment: this.#depthView
                    ? {
                        view: this.#depthView,
                        depthClearValue: clearDepth,
                        depthLoadOp: opts.depthLoadOp ?? "clear",
                        depthStoreOp: opts.depthStoreOp ?? "store",
                    }
                    : undefined,
            });
        }

        destroy() {
            if (this.#depthTexture) {
                this.#depthTexture.destroy();
                this.#depthTexture = null;
                this.#depthView = null;
            }
            if (this.#context) {
                AzContext.unconfigure(this.#context);
                this.#context = null;
            }
            this.#device = null;
            this.#adapter = null;
            return this;
        }

        #clampPixelRatio(v) {
            const n = Number(v);
            if (!Number.isFinite(n) || n <= 0) return 1;
            return Math.min(Math.max(0.5, n), this.#maxPixelRatio);
        }

        #applyViewportSize() {
            const drawW = Math.max(1, Math.round(this.#logicalWidth * this.#pixelRatio));
            const drawH = Math.max(1, Math.round(this.#logicalHeight * this.#pixelRatio));

            this.#canvas.style.width = `${this.#logicalWidth}px`;
            this.#canvas.style.height = `${this.#logicalHeight}px`;
            if (this.#canvas.width !== drawW) this.#canvas.width = drawW;
            if (this.#canvas.height !== drawH) this.#canvas.height = drawH;
        }

        #recreateDepth() {
            if (!this.#device) return;
            if (this.#depthTexture) this.#depthTexture.destroy();
            this.#depthTexture = this.#device.createTexture({
                size: [this.#canvas.width, this.#canvas.height, 1],
                format: "depth24plus",
                usage: GPUTextureUsage.RENDER_ATTACHMENT,
            });
            this.#depthView = this.#depthTexture.createView();
        }
    }

    window.ZCanvasWGPU = ZCanvasWGPU;
})();


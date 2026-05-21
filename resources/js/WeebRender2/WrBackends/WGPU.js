import AzWGPU from "../../AzLib/AzWGPU.js";
import WrBackend from "./Base.js";

const WR_WGPU_DEPTH_FORMAT = "depth24plus";

export class WrBackendWGPU extends WrBackend {
	constructor(canvas = null, options = {}) {
		super(canvas, options);
		this.adapter = null;
		this.device = null;
		this.context = null;
		this.format = null;
		this.#encoder = null;
		this.#frame = null;
		this.#colorView = null;
		this.#depthTexture = null;
		this.#depthView = null;
		this.#depthWidth = 0;
		this.#depthHeight = 0;
	}

	get kind() { return "webgpu"; }

	async init() {
		if (!this.canvas) throw new Error("[WrBackendWGPU] canvas is required");

		const pick = await AzWGPU.Adapter.pickBest(this.options.pickBest ?? {});
		const adapter = pick.adapter ?? pick;
		const device = await AzWGPU.Device.create(adapter, this.options.device ?? {});
		const format = this.options.format ?? AzWGPU.Format.preferredCanvas();
		const context = AzWGPU.Context.create(device, this.canvas, {
			...(this.options.context ?? {}),
			format,
		});

		this.adapter = adapter;
		this.device = device;
		this.context = context;
		this.format = format;
		this.ready = true;
		this.report = {
			kind: this.kind,
			format,
			pickScore: pick.score ?? null,
			pickRequest: pick.request ?? null,
			adapter: AzWGPU.Adapter.getCapabilities(adapter),
			limits: AzWGPU.Limits.inspect(adapter),
			features: Array.from(adapter.features ?? []),
		};
		return this;
	}

	resize(options = {}) {
		if (!this.ready || !this.context || !this.canvas || !this.device) return false;
		const size = WrBackend.resolveCanvasSize(this.canvas, options);
		if (!size) return false;

		const changed = this.canvas.width !== size.width || this.canvas.height !== size.height;
		if (!changed) return false;
		this.canvas.width = size.width;
		this.canvas.height = size.height;

		AzWGPU.Context.reconfigure(this.context, {
			device: this.device,
			format: this.format,
			alphaMode: this.options.context?.alphaMode ?? "premultiplied",
		});
		this.#releaseDepthTarget();
		return true;
	}

	beginFrame(frameOptions = {}) {
		if (!this.ready || !this.context || !this.device) return null;
		if (this.#encoder) this.endFrame();

		this.#frame = WrBackend.normalizeFrameOptions(frameOptions);
		this.#encoder = AzWGPU.Command.createEncoder(this.device, "Wr2Frame");
		this.#colorView = this.context.getCurrentTexture().createView();

		if (this.#frame.clearColorEnabled || this.#frame.clearDepthEnabled) {
			const pass = AzWGPU.Pass.beginRender(this.#encoder, this.#passDescriptor(this.#frame));
			AzWGPU.Pass.end(pass);
		}
		return this.#frame;
	}

	beginRenderPass(options = {}) {
		if (!this.#encoder || !this.#colorView) return null;
		const frame = this.#frame ?? WrBackend.normalizeFrameOptions();
		const merged = {
			...frame,
			...options,
			clearColor: options.clearColor ? WrBackend.normalizeClearColor(options.clearColor) : frame.clearColor,
		};
		return AzWGPU.Pass.beginRender(this.#encoder, this.#passDescriptor(merged));
	}

	endFrame() {
		if (!this.ready || !this.device || !this.#encoder) return;
		const command = AzWGPU.Command.finish(this.#encoder);
		AzWGPU.Command.submit(this.device, [command]);
		this.#encoder = null;
		this.#frame = null;
		this.#colorView = null;
	}

	destroy() {
		if (this.#encoder) {
			this.#encoder = null;
		}
		if (this.context) {
			try {
				AzWGPU.Context.unconfigure(this.context);
			} catch (_error) {}
		}
		this.#releaseDepthTarget();
		this.adapter = null;
		this.device = null;
		this.context = null;
		this.format = null;
		this.report = null;
		this.ready = false;
	}

	#passDescriptor(frame) {
		const clearColor = frame.clearColor ?? WrBackend.normalizeClearColor();
		const needsDepth = frame.useDepth || frame.clearDepthEnabled;
		const depthView = needsDepth ? this.#ensureDepthTarget() : null;

		return {
			colorAttachments: [{
				view: this.#colorView,
				loadOp: frame.clearColorEnabled ? "clear" : "load",
				storeOp: "store",
				clearValue: clearColor,
			}],
			depthStencilAttachment: depthView ? {
				view: depthView,
				depthLoadOp: frame.clearDepthEnabled ? "clear" : "load",
				depthStoreOp: "store",
				depthClearValue: Number(frame.clearDepth ?? 1),
			} : undefined,
		};
	}

	#ensureDepthTarget() {
		if (!this.device || !this.canvas) return null;
		const width = Math.max(1, this.canvas.width | 0);
		const height = Math.max(1, this.canvas.height | 0);
		if (this.#depthView && width === this.#depthWidth && height === this.#depthHeight) {
			return this.#depthView;
		}

		this.#releaseDepthTarget();
		this.#depthTexture = AzWGPU.Texture.create2D(this.device, {
			label: "Wr2Depth",
			width,
			height,
			format: WR_WGPU_DEPTH_FORMAT,
			usage: globalThis.GPUTextureUsage?.RENDER_ATTACHMENT ?? 0x10,
		});
		this.#depthView = AzWGPU.Texture.createView(this.#depthTexture, { dimension: "2d" });
		this.#depthWidth = width;
		this.#depthHeight = height;
		return this.#depthView;
	}

	#releaseDepthTarget() {
		if (this.#depthTexture?.destroy) this.#depthTexture.destroy();
		this.#depthTexture = null;
		this.#depthView = null;
		this.#depthWidth = 0;
		this.#depthHeight = 0;
	}

	#encoder;
	#frame;
	#colorView;
	#depthTexture;
	#depthView;
	#depthWidth;
	#depthHeight;
}

if (typeof window !== "undefined") {
	window.WrBackendWGPU = WrBackendWGPU;
}

export default WrBackendWGPU;

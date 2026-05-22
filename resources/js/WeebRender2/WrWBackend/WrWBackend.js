import AzWGPU from "../../AzLib/AzWGPU.js";
import AzWGL2 from "../../AzLib/AzWGL2.js";

function toNumber(value, fallback = 0) {
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
}

function resolveCanvas(canvasRef) {
	if (!canvasRef) return null;
	if (typeof HTMLCanvasElement !== "undefined" && canvasRef instanceof HTMLCanvasElement) {
		return canvasRef;
	}
	if (typeof canvasRef === "string" && typeof document !== "undefined") {
		const found = document.querySelector(canvasRef);
		if (typeof HTMLCanvasElement !== "undefined" && found instanceof HTMLCanvasElement) {
			return found;
		}
	}
	return null;
}

const WR_WGPU_DEPTH_FORMAT = "depth24plus";

export class Base {
	constructor(canvas = null, options = {}) {
		this.canvas = resolveCanvas(canvas);
		this.options = options ?? {};
		this.ready = false;
		this.report = null;
	}

	get kind() { return "unknown"; }

	setCanvas(canvasRef) {
		this.canvas = resolveCanvas(canvasRef);
		return this.canvas;
	}

	async init() {
		throw new Error("[WrWBackend.Base] init() is required");
	}

	resize() {
		return false;
	}

	beginFrame(_frameOptions = {}) {}
	endFrame() {}
	destroy() {
		this.ready = false;
	}

	getCapabilities() {
		return this.report ?? {};
	}

	static resolveCanvas(canvasRef) {
		return resolveCanvas(canvasRef);
	}

	static normalizeClearColor(value) {
		const src = (Array.isArray(value) || ArrayBuffer.isView(value))
			? value
			: [0, 0, 0, 0];
		return {
			r: toNumber(src[0], 0),
			g: toNumber(src[1], 0),
			b: toNumber(src[2], 0),
			a: toNumber(src[3], 0),
		};
	}

	static normalizeFrameOptions(options = {}) {
		const src = options && typeof options === "object" ? options : {};
		return {
			clearColor: Base.normalizeClearColor(src.clearColor),
			clearColorEnabled: src.clearColorEnabled !== false,
			clearDepth: toNumber(src.clearDepth, 1),
			clearDepthEnabled: src.clearDepthEnabled !== false,
			useDepth: src.useDepth !== false,
		};
	}

	static resolveCanvasSize(canvas, options = {}) {
		if (!canvas) return null;
		const src = options && typeof options === "object" ? options : {};
		const dpr = Math.max(1, toNumber(src.pixelRatio, globalThis.devicePixelRatio ?? 1));
		const maxPixelRatio = Math.max(1, toNumber(src.maxPixelRatio, 2));
		const useDpr = Math.min(dpr, maxPixelRatio);

		const baseWidth = src.width ?? canvas.clientWidth ?? canvas.width ?? 1;
		const baseHeight = src.height ?? canvas.clientHeight ?? canvas.height ?? 1;
		const width = Math.max(1, Math.floor(toNumber(baseWidth, 1) * useDpr));
		const height = Math.max(1, Math.floor(toNumber(baseHeight, 1) * useDpr));
		return { width, height, pixelRatio: useDpr };
	}

	static async choose(canvasRef, options = {}) {
		const canvas = Base.resolveCanvas(canvasRef);
		if (!canvas) throw new Error("[WrWBackend] valid canvas is required");

		const src = options && typeof options === "object" ? options : {};
		const preferred = String(src.prefer ?? "webgpu").toLowerCase() === "webgl2"
			? "webgl2"
			: "webgpu";
		const report = {
			preferred,
			chosen: null,
			reason: null,
			details: {},
		};

		const order = preferred === "webgl2"
			? ["webgl2", "webgpu"]
			: ["webgpu", "webgl2"];

		for (const kind of order) {
			if (kind === "webgpu") {
				if (!globalThis.navigator?.gpu) {
					report.details.webgpuError = "navigator.gpu is unavailable";
					continue;
				}
				try {
					const backend = new WGPU(canvas, src.webgpu ?? src);
					await backend.init();
					report.chosen = "webgpu";
					report.reason = preferred === "webgl2" && report.details.webgl2Error
						? "webgl2_failed_fallback_webgpu"
						: null;
					report.details.webgpu = backend.getCapabilities();
					return { backend, report };
				} catch (error) {
					report.details.webgpuError = String(error?.message ?? error);
					continue;
				}
			}

			try {
				const backend = new WGL2(canvas, src.webgl2 ?? src);
				await backend.init();
				report.chosen = "webgl2";
				report.reason = preferred === "webgpu"
					? (report.details.webgpuError
						? "webgpu_failed_fallback_webgl2"
						: "webgpu_unavailable")
					: null;
				report.details.webgl2 = backend.getCapabilities();
				return { backend, report };
			} catch (error) {
				report.details.webgl2Error = String(error?.message ?? error);
			}
		}

		throw new Error("[WrWBackend] choose() failed: " + JSON.stringify(report));
	}
}

export class WGPU extends Base {
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
		if (!this.canvas) throw new Error("[WrWBackendWGPU] canvas is required");

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
		const size = Base.resolveCanvasSize(this.canvas, options);
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

		this.#frame = Base.normalizeFrameOptions(frameOptions);
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
		const frame = this.#frame ?? Base.normalizeFrameOptions();
		const merged = {
			...frame,
			...options,
			clearColor: options.clearColor ? Base.normalizeClearColor(options.clearColor) : frame.clearColor,
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
		const clearColor = frame.clearColor ?? Base.normalizeClearColor();
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

export class WGL2 extends Base {
	constructor(canvas = null, options = {}) {
		super(canvas, options);
		this.gl = null;
		this.#frame = null;
	}

	get kind() { return "webgl2"; }

	async init() {
		if (!this.canvas) throw new Error("[WrWBackendWGL2] canvas is required");

		const gl = AzWGL2.Context.create(this.canvas, {
			alpha: true,
			depth: true,
			...(this.options.context ?? this.options),
		});

		this.gl = gl;
		this.ready = true;
		this.report = {
			kind: this.kind,
			info: AzWGL2.Context.info(gl),
			limits: AzWGL2.Limits.inspect(gl),
			timer: AzWGL2.Timer.supportInfo(gl),
		};
		return this;
	}

	resize(options = {}) {
		if (!this.ready || !this.gl || !this.canvas) return false;
		const size = Base.resolveCanvasSize(this.canvas, options);
		if (!size) return false;

		const changed = this.canvas.width !== size.width || this.canvas.height !== size.height;
		if (!changed) return false;

		this.canvas.width = size.width;
		this.canvas.height = size.height;
		this.gl.viewport(0, 0, size.width, size.height);
		return true;
	}

	beginFrame(frameOptions = {}) {
		if (!this.ready || !this.gl) return null;
		this.#frame = Base.normalizeFrameOptions(frameOptions);
		this.#applyFrameClear(this.#frame);
		return this.#frame;
	}

	beginRenderPass(options = {}) {
		if (!this.ready || !this.gl) return null;
		const base = this.#frame ?? Base.normalizeFrameOptions();
		const next = {
			...base,
			...options,
			clearColor: options.clearColor ? Base.normalizeClearColor(options.clearColor) : base.clearColor,
		};
		this.#applyFrameClear(next);
		return next;
	}

	endFrame() {}

	destroy() {
		this.#frame = null;
		this.gl = null;
		this.report = null;
		this.ready = false;
	}

	#applyFrameClear(frame) {
		const gl = this.gl;
		if (!gl) return;

		let mask = 0;
		if (frame.clearColorEnabled) {
			const c = frame.clearColor;
			gl.clearColor(c.r, c.g, c.b, c.a);
			mask |= gl.COLOR_BUFFER_BIT;
		}
		if (frame.clearDepthEnabled) {
			gl.clearDepth(Number(frame.clearDepth ?? 1));
			mask |= gl.DEPTH_BUFFER_BIT;
		}
		if (mask) gl.clear(mask);
	}

	#frame;
}

export const WrWBackend = Object.freeze({
	Base,
	WGPU,
	WGL2,
});

if (typeof window !== "undefined") {
	window.WrWBackend = WrWBackend;
	window.WrWBackendBase = Base;
	window.WrWBackendWGPU = WGPU;
	window.WrWBackendWGL2 = WGL2;
}

export default WrWBackend;

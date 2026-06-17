function resolveCanvas(canvasRef) {
	if (!canvasRef) return null;
	if (typeof HTMLCanvasElement !== "undefined" && canvasRef instanceof HTMLCanvasElement) return canvasRef;
	if (typeof canvasRef === "string" && typeof document !== "undefined") {
		const found = document.querySelector(canvasRef);
		if (typeof HTMLCanvasElement !== "undefined" && found instanceof HTMLCanvasElement) return found;
	}
	return null;
}

function toNumber(value, fallback = 0) {
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
}

export class Backend {
	canvas = null;
	options = null;
	adapter = null;
	device = null;
	queue = null;
	canvasContext = null;
	format = null;
	depthFormat = "depth24plus";
	ready = false;

	constructor(canvas = null, options = {}) {
		this.canvas = resolveCanvas(canvas);
		this.options = options ?? {};
	}

	static async create(canvas, options = {}) {
		const backend = new Backend(canvas, options);
		await backend.init();
		return backend;
	}

	async init() {
		if (!this.canvas) throw new Error("[Awgpu.Backend] canvas is required");
		if (!navigator?.gpu) throw new Error("[Awgpu.Backend] WebGPU is not available");
		const adapter = await navigator.gpu.requestAdapter(this.options.pickBest ?? {});
		if (!adapter) throw new Error("[Awgpu.Backend] adapter request failed");
		const device = await adapter.requestDevice(this.options.device ?? {});
		const format = this.options.format ?? navigator.gpu.getPreferredCanvasFormat();
		const context = this.canvas.getContext("webgpu");
		if (!context) throw new Error("[Awgpu.Backend] canvas webgpu context is required");
		context.configure({
			...(this.options.context ?? {}),
			device,
			format,
			alphaMode: this.options.context?.alphaMode ?? "premultiplied",
		});
		this.adapter = adapter;
		this.device = device;
		this.queue = device.queue;
		this.canvasContext = context;
		this.format = format;
		this.depthFormat = this.options.depthFormat ?? "depth24plus";
		this.ready = true;
		return this;
	}

	resize(options = {}) {
		if (!this.ready || !this.canvas || !this.canvasContext || !this.device) return false;
		const dpr = Math.max(1, toNumber(options.pixelRatio, globalThis.devicePixelRatio ?? 1));
		const maxPixelRatio = Math.max(1, toNumber(options.maxPixelRatio, 2));
		const ratio = Math.min(dpr, maxPixelRatio);
		const width = Math.max(1, Math.floor(toNumber(options.width ?? this.canvas.clientWidth ?? this.canvas.width, 1) * ratio));
		const height = Math.max(1, Math.floor(toNumber(options.height ?? this.canvas.clientHeight ?? this.canvas.height, 1) * ratio));
		if (this.canvas.width === width && this.canvas.height === height) return false;
		this.canvas.width = width;
		this.canvas.height = height;
		this.canvasContext.configure({
			device: this.device,
			format: this.format,
			alphaMode: this.options.context?.alphaMode ?? "premultiplied",
		});
		return true;
	}

	/**
	 * Creates a command encoder (external use only; steps use ctx.device directly)
	 */
	createEncoder(label = "AwgpuFrame") {
		if (!this.device) return null;
		return this.device.createCommandEncoder({ label });
	}

	/**
	 * Submits command buffers to the GPU (external use only; steps use ctx.queue directly)
	 */
	submit(encoderOrCommands) {
		if (!this.queue || !encoderOrCommands) return false;
		const commands = Array.isArray(encoderOrCommands)
			? encoderOrCommands
			: [typeof encoderOrCommands.finish === "function" ? encoderOrCommands.finish() : encoderOrCommands];
		this.queue.submit(commands);
		return true;
	}

	newCtx() {
		return {
			// GPU primitives - full access for steps
			device: this.device,
			queue: this.queue,
			canvas: this.canvas,
			canvasContext: this.canvasContext,
			format: this.format,
			depthFormat: this.depthFormat,

			// Per-frame state tracking
			encoder: null,
			pass: null,
			passKind: null,
			pipeline: null,

			// Resource tracking
			buffers: {
				vertex: new Map(),
				index: null,
				indirect: null,
			},
			bindGroups: new Map(),
			textures: new Map(),

			// Frame state
			ended: false,
		};
	}

	destroy() {
		if (this.canvasContext) {
			try {
				this.canvasContext.unconfigure?.();
			} catch (_error) {}
		}
		this.ready = false;
		this.adapter = null;
		this.device = null;
		this.queue = null;
		this.canvasContext = null;
	}
}

export default Backend;

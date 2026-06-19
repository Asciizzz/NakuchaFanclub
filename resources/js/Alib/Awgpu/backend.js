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
	canvasCtx = null;
	format = null;
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
		this.canvasCtx = context;
		this.format = format;

		this.ready = true;
		return this;
	}

	/* Gets the current view of the canvas context */
	currentView() {
		if (!this.canvasCtx) return null;
		const currentTexture = this.canvasCtx.getCurrentTexture();
		return currentTexture ? currentTexture.createView() : null;
	}

	/* Creates a command encoder */
	createEncoder(label = "AwgpuFrame") {
		if (!this.device) return null;
		return this.device.createCommandEncoder({ label });
	}

	/* Submits command buffers to the GPU */
	submit(encoderOrCommands) {
		if (!this.queue || !encoderOrCommands) return false;
		const commands = Array.isArray(encoderOrCommands)
			? encoderOrCommands
			: [typeof encoderOrCommands.finish === "function" ? encoderOrCommands.finish() : encoderOrCommands];
		this.queue.submit(commands);
		return true;
	}

	/* Creates new render context for Aflow execution */
	newCtx() {
		return {
			device: this.device,
			queue: this.queue,
			canvas: this.canvas,
			canvasCtx: this.canvasCtx,
			format: this.format,

			encoder: null,
			pass: null,
			passKind: null,
			pipeline: null,

			buffers: {
				vertex: new Map(),
				index: null,
				indirect: null,
			},
			bindGroups: new Map(),
			textures: new Map(),

			ended: false,
		};
	}

	destroy() {
		if (this.canvasCtx) {
			try {
				this.canvasCtx.unconfigure?.();
			} catch (_error) {}
		}
		this.ready = false;
		this.adapter = null;
		this.device = null;
		this.queue = null;
		this.canvasCtx = null;
	}
}

export default Backend;

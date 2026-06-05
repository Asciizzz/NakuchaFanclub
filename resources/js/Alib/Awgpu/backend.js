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

function toColor(value) {
	const src = (Array.isArray(value) || ArrayBuffer.isView(value)) ? value : [0, 0, 0, 1];
	return {
		r: toNumber(src[0], 0),
		g: toNumber(src[1], 0),
		b: toNumber(src[2], 0),
		a: toNumber(src[3], 1),
	};
}

export class Backend {
	canvas = null;
	options = null;
	adapter = null;
	device = null;
	queue = null;
	context = null;
	format = null;
	depthFormat = "depth24plus";
	depth = {
		texture: null,
		view: null,
		width: 0,
		height: 0,
	};
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
		this.context = context;
		this.format = format;
		this.depthFormat = this.options.depthFormat ?? "depth24plus";
		this.ready = true;
		return this;
	}

	resize(options = {}) {
		if (!this.ready || !this.canvas || !this.context || !this.device) return false;
		const dpr = Math.max(1, toNumber(options.pixelRatio, globalThis.devicePixelRatio ?? 1));
		const maxPixelRatio = Math.max(1, toNumber(options.maxPixelRatio, 2));
		const ratio = Math.min(dpr, maxPixelRatio);
		const width = Math.max(1, Math.floor(toNumber(options.width ?? this.canvas.clientWidth ?? this.canvas.width, 1) * ratio));
		const height = Math.max(1, Math.floor(toNumber(options.height ?? this.canvas.clientHeight ?? this.canvas.height, 1) * ratio));
		if (this.canvas.width === width && this.canvas.height === height) return false;
		this.canvas.width = width;
		this.canvas.height = height;
		this.context.configure({
			device: this.device,
			format: this.format,
			alphaMode: this.options.context?.alphaMode ?? "premultiplied",
		});
		this.releaseDepth();
		return true;
	}

	createEncoder(label = "AwgpuFrame") {
		if (!this.device) return null;
		return this.device.createCommandEncoder({ label });
	}

	newState() {
		return {
			backend: this,
			device: this.device,
			queue: this.queue,
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
			screen: {
				texture: null,
				view: null,
			},
			ended: false,
		};
	}

	getScreenColorAttachment(options = {}, state = null) {
		if (!this.context) return null;
		let view = state?.screen?.view ?? null;
		if (!view) {
			const texture = this.context.getCurrentTexture();
			view = texture.createView();
			if (state?.screen) {
				state.screen.texture = texture;
				state.screen.view = view;
			}
		}
		return {
			view,
			loadOp: options.clearColorEnabled === false ? "load" : "clear",
			storeOp: options.storeOp ?? "store",
			clearValue: toColor(options.clearColor ?? [0, 0, 0, 1]),
		};
	}

	getDepthAttachment(options = {}) {
		if (options.useDepth === false) return null;
		const view = this.getDepthView();
		if (!view) return null;
		return {
			view,
			depthLoadOp: options.clearDepthEnabled === false ? "load" : "clear",
			depthStoreOp: options.depthStoreOp ?? "store",
			depthClearValue: toNumber(options.clearDepth, 1),
		};
	}

	getDepthView() {
		if (!this.device || !this.canvas) return null;
		const width = Math.max(1, this.canvas.width | 0);
		const height = Math.max(1, this.canvas.height | 0);
		if (this.depth.view && this.depth.width === width && this.depth.height === height) {
			return this.depth.view;
		}
		this.releaseDepth();
		this.depth.texture = this.device.createTexture({
			label: "AwgpuDepth",
			size: [width, height, 1],
			format: this.depthFormat,
			usage: globalThis.GPUTextureUsage.RENDER_ATTACHMENT,
		});
		this.depth.view = this.depth.texture.createView();
		this.depth.width = width;
		this.depth.height = height;
		return this.depth.view;
	}

	submit(encoderOrCommands) {
		if (!this.queue || !encoderOrCommands) return false;
		const commands = Array.isArray(encoderOrCommands)
			? encoderOrCommands
			: [typeof encoderOrCommands.finish === "function" ? encoderOrCommands.finish() : encoderOrCommands];
		this.queue.submit(commands);
		return true;
	}

	destroy() {
		if (this.context) {
			try {
				this.context.unconfigure?.();
			} catch (_error) {}
		}
		this.ready = false;
		this.releaseDepth();
		this.adapter = null;
		this.device = null;
		this.queue = null;
		this.context = null;
	}

	releaseDepth() {
		if (this.depth.texture?.destroy) this.depth.texture.destroy();
		this.depth.texture = null;
		this.depth.view = null;
		this.depth.width = 0;
		this.depth.height = 0;
	}
}

export default Backend;

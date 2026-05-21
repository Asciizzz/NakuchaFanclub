import AzWGL from "../../AzLib/AzWGL.js";
import WrBackend from "./Base.js";

export class WrBackendWGL extends WrBackend {
	constructor(canvas = null, options = {}) {
		super(canvas, options);
		this.gl = null;
		this.#frame = null;
	}

	get kind() { return "webgl2"; }

	async init() {
		if (!this.canvas) throw new Error("[WrBackendWGL] canvas is required");

		const gl = AzWGL.Context.create(this.canvas, {
			alpha: true,
			depth: true,
			...(this.options.context ?? this.options),
		});

		this.gl = gl;
		this.ready = true;
		this.report = {
			kind: this.kind,
			info: AzWGL.Context.info(gl),
			limits: AzWGL.Limits.inspect(gl),
			timer: AzWGL.Timer.supportInfo(gl),
		};
		return this;
	}

	resize(options = {}) {
		if (!this.ready || !this.gl || !this.canvas) return false;
		const size = WrBackend.resolveCanvasSize(this.canvas, options);
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
		this.#frame = WrBackend.normalizeFrameOptions(frameOptions);
		this.#applyFrameClear(this.#frame);
		return this.#frame;
	}

	beginRenderPass(options = {}) {
		if (!this.ready || !this.gl) return null;
		const base = this.#frame ?? WrBackend.normalizeFrameOptions();
		const next = {
			...base,
			...options,
			clearColor: options.clearColor ? WrBackend.normalizeClearColor(options.clearColor) : base.clearColor,
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

if (typeof window !== "undefined") {
	window.WrBackendWGL = WrBackendWGL;
}

export default WrBackendWGL;

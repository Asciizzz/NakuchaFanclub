/* AzWBackend
By Asciiz

Backend foundation
It doesn't give a fck what a 3d even it

#Base:
* Shared backend base with canvas helpers and backend selection
* Methods
	+ setCanvas(canvasRef)
	+ init()
	+ resize(options = {})
	+ beginFrame(frameOptions = {})
	+ endFrame()
	+ destroy()
	+ getCapabilities()
	+ resolveCanvas(canvasRef)
	+ normalizeClearColor(value)
	+ normalizeFrameOptions(options = {})
	+ resolveCanvasSize(canvas, options = {})
	+ choose(canvasRef, options = {})

#WGPU:
* WebGPU backend implementation
* Methods
	+ init()
	+ resize(options = {})
	+ createShaderModule(descriptor)
	+ createRenderPipeline(descriptor)
	+ createComputePipeline(descriptor)
	+ createBindGroupLayout(descriptor)
	+ createBindGroup(descriptor)
	+ createBuffer(descriptor)
	+ writeBuffer(buffer, data, offset = 0)
	+ createTexture2D(options = {})
	+ writeTexture(texture, source, layout, size)
	+ createSampler(descriptor = {})
	+ beginFrame(frameOptions = {})
	+ beginComputePass(options = {})
	+ beginRenderPass(options = {})
	+ endFrame()
	+ destroy()

#WGL2:
* WebGL2 backend implementation
* Methods (noticably fewer than WGPU because "fork found in kitchen")
	+ init()
	+ resize(options = {})
	+ createShaderProgram(descriptor)
	+ createPipeline(options = {})
	+ createTexture2D(options = {})
	+ writeTexture2D(texture, source, options = {})
	+ beginFrame(frameOptions = {})
	+ beginRenderPass(options = {})
	+ endFrame()
	+ destroy()
*/

import AzWGPU from "./AzWGPU.js";
import AzWGL2 from "./AzWGL2.js";

const AZ_WGPU_DEPTH_FORMAT = "depth24plus";

/**
 * Convert value to finite number with fallback
 * @param {any} value source value
 * @param {number} [fallback=0] fallback value
 * @returns {number}
 */
function toNumber(value, fallback = 0) {
	const n = Number(value);
	return Number.isFinite(n) ? n : fallback;
}

/**
 * Resolve canvas from element or selector
 * @param {HTMLCanvasElement|string|null} canvasRef canvas ref
 * @returns {HTMLCanvasElement|null}
 */
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

/**
 * Shared backend base class
 */
export class Base {
	/**
	 * @param {HTMLCanvasElement|string|null} [canvas=null] canvas ref
	 * @param {object} [options={}] backend options
	 */
	constructor(canvas = null, options = {}) {
		this.canvas = resolveCanvas(canvas);
		this.options = options ?? {};
		this.ready = false;
		this.report = null;
	}

	/**
	 * Backend kind tag
	 * @returns {string}
	 */
	get kind() { return "unknown"; }

	/**
	 * Set canvas from element or selector
	 * @param {HTMLCanvasElement|string|null} canvasRef canvas ref
	 * @returns {HTMLCanvasElement|null}
	 */
	setCanvas(canvasRef) {
		this.canvas = resolveCanvas(canvasRef);
		return this.canvas;
	}

	/**
	 * Init backend resources
	 * @returns {Promise<Base>}
	 */
	async init() {
		throw new Error("[AzWBackend.Base] init() is required");
	}

	/**
	 * Resize backend targets
	 * @param {object} [_options={}] resize options
	 * @returns {boolean}
	 */
	resize(_options = {}) {
		return false;
	}

	/**
	 * Begin one frame
	 * @param {object} [_frameOptions={}] frame options
	 * @returns {object|null}
	 */
	beginFrame(_frameOptions = {}) {
		return null;
	}

	/**
	 * End one frame
	 * @returns {void}
	 */
	endFrame() {}

	/**
	 * Release backend resources
	 * @returns {void}
	 */
	destroy() {
		this.ready = false;
	}

	/**
	 * Read capability report
	 * @returns {object}
	 */
	getCapabilities() {
		return this.report ?? {};
	}

	/**
	 * Resolve canvas from element or selector
	 * @param {HTMLCanvasElement|string|null} canvasRef canvas ref
	 * @returns {HTMLCanvasElement|null}
	 */
	static resolveCanvas(canvasRef) {
		return resolveCanvas(canvasRef);
	}

	/**
	 * Normalize clear color into rgba object
	 * (needed cuz some dumbass tried passing in color as hex/rgb string as if this was css)
	 * @param {ArrayLike<number>|null} value color input
	 * @returns {{r:number,g:number,b:number,a:number}}
	 */
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

	/**
	 * Normalize generic frame options
	 * @param {object} [options={}] frame options
	 * @returns {object}
	 */
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

	/**
	 * Resolve canvas output size using dpr and cap
	 * @param {HTMLCanvasElement|null} canvas target canvas
	 * @param {object} [options={}] size options
	 * @returns {{width:number,height:number,pixelRatio:number}|null}
	 */
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

	/**
	 * Choose and init backend with fallback
	 * @param {HTMLCanvasElement|string} canvasRef canvas ref
	 * @param {object} [options={}] choose options
	 * @returns {Promise<{backend: Base, report: object}>}
	 */
	static async choose(canvasRef, options = {}) {
		const canvas = Base.resolveCanvas(canvasRef);
		if (!canvas) throw new Error("[AzWBackend] valid canvas is required");

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

		throw new Error("[AzWBackend] choose() failed: " + JSON.stringify(report));
	}
}

/**
 * WebGPU backend implementation
 */
export class WGPU extends Base {
	/**
	 * @param {HTMLCanvasElement|string|null} [canvas=null] canvas ref
	 * @param {object} [options={}] backend options
	 */
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

	#encoder;
	#frame;
	#colorView;
	#depthTexture;
	#depthView;
	#depthWidth;
	#depthHeight;

	/**
	 * Backend kind tag
	 * @returns {string}
	 */
	get kind() { return "webgpu"; }

	/**
	 * Init adapter, device, and context
	 * @returns {Promise<WGPU>}
	 */
	async init() {
		if (!this.canvas) throw new Error("[AzWBackendWGPU] canvas is required");

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

	/**
	 * Resize canvas and reconfigure context
	 * @param {object} [options={}] resize options
	 * @returns {boolean}
	 */
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

	/**
	 * Begin frame encoder and optional clear pass
	 * @param {object} [frameOptions={}] frame options
	 * @returns {object|null}
	 */
	beginFrame(frameOptions = {}) {
		if (!this.ready || !this.context || !this.device) return null;
		if (this.#encoder) this.endFrame();

		this.#frame = Base.normalizeFrameOptions(frameOptions);
		this.#encoder = AzWGPU.Command.createEncoder(this.device, "AzFrame");
		this.#colorView = this.context.getCurrentTexture().createView();
		return this.#frame;
	}

	/**
	 * Begin one render pass on current frame
	 * @param {object} [options={}] pass options
	 * @returns {GPURenderPassEncoder|null}
	 */
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

	/**
	 * Begin one compute pass on current frame
	 * @param {GPUComputePassDescriptor} [options={}] pass options
	 * @returns {GPUComputePassEncoder|null}
	 */
	beginComputePass(options = {}) {
		if (!this.#encoder) return null;
		return this.#encoder.beginComputePass(options);
	}

	/**
	 * Finish and submit frame command buffer
	 * @returns {void}
	 */
	endFrame() {
		if (!this.ready || !this.device || !this.#encoder) return;
		const command = AzWGPU.Command.finish(this.#encoder);
		AzWGPU.Command.submit(this.device, [command]);
		this.#encoder = null;
		this.#frame = null;
		this.#colorView = null;
	}

	/**
	 * Release backend resources
	 * @returns {void}
	 */
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

	/**
	 * Build pass descriptor from frame config
	 * @param {object} frame frame options
	 * @returns {GPURenderPassDescriptor}
	 */
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

	/**
	 * Ensure depth target for current canvas size
	 * @returns {GPUTextureView|null}
	 */
	#ensureDepthTarget() {
		if (!this.device || !this.canvas) return null;
		const width = Math.max(1, this.canvas.width | 0);
		const height = Math.max(1, this.canvas.height | 0);
		if (this.#depthView && width === this.#depthWidth && height === this.#depthHeight) {
			return this.#depthView;
		}

		this.#releaseDepthTarget();
		this.#depthTexture = AzWGPU.Texture.create2D(this.device, {
			label: "AzDepth",
			width,
			height,
			format: AZ_WGPU_DEPTH_FORMAT,
			usage: globalThis.GPUTextureUsage?.RENDER_ATTACHMENT ?? 0x10,
		});
		this.#depthView = AzWGPU.Texture.createView(this.#depthTexture, { dimension: "2d" });
		this.#depthWidth = width;
		this.#depthHeight = height;
		return this.#depthView;
	}

	/**
	 * Release cached depth resources
	 * @returns {void}
	 */
	#releaseDepthTarget() {
		if (this.#depthTexture?.destroy) this.#depthTexture.destroy();
		this.#depthTexture = null;
		this.#depthView = null;
		this.#depthWidth = 0;
		this.#depthHeight = 0;
	}

	// ----------

	/**
	 * Create WGSL shader module
	 * @param {object} descriptor shader descriptor
	 * @returns {GPUShaderModule|null}
	 */
	createShaderModule(descriptor) {
		if (!this.device || !descriptor) return null;
		return AzWGPU.Shader.create(this.device, descriptor);
	}

	/**
	 * Create render pipeline
	 * @param {object} descriptor render pipeline descriptor
	 * @returns {GPURenderPipeline|null}
	 */
	createRenderPipeline(descriptor) {
		if (!this.device || !descriptor) return null;
		return AzWGPU.Pipeline.createRender(this.device, descriptor);
	}

	/**
	 * Create compute pipeline
	 * @param {object} descriptor compute pipeline descriptor
	 * @returns {GPUComputePipeline|null}
	 */
	createComputePipeline(descriptor) {
		if (!this.device || !descriptor) return null;
		return AzWGPU.Pipeline.createCompute(this.device, descriptor);
	}

	/**
	 * Create bind group layout
	 * @param {object} descriptor layout descriptor
	 * @returns {GPUBindGroupLayout|null}
	 */
	createBindGroupLayout(descriptor) {
		if (!this.device || !descriptor) return null;
		return AzWGPU.BindGroup.createLayout(this.device, descriptor);
	}

	/**
	 * Create bind group
	 * @param {object} descriptor bind group descriptor
	 * @returns {GPUBindGroup|null}
	 */
	createBindGroup(descriptor) {
		if (!this.device || !descriptor) return null;
		return AzWGPU.BindGroup.create(this.device, descriptor);
	}

	/**
	 * Create buffer
	 * @param {object} descriptor buffer descriptor
	 * @returns {GPUBuffer|null}
	 */
	createBuffer(descriptor) {
		if (!this.device || !descriptor) return null;
		return AzWGPU.Buffer.create(this.device, descriptor);
	}

	/**
	 * Write data into GPU buffer
	 * @param {GPUBuffer} buffer target buffer
	 * @param {ArrayBuffer|ArrayBufferView} data source bytes
	 * @param {number} [offset=0] buffer byte offset
	 * @returns {boolean}
	 */
	writeBuffer(buffer, data, offset = 0) {
		if (!this.device || !buffer || !data) return false;
		AzWGPU.Buffer.write(this.device, buffer, data, offset);
		return true;
	}

	/**
	 * Create 2D texture
	 * @param {object} [options={}] texture options
	 * @returns {GPUTexture|null}
	 */
	createTexture2D(options = {}) {
		if (!this.device) return null;
		return AzWGPU.Texture.create2D(this.device, options);
	}

	/**
	 * Write pixels into texture
	 * @param {GPUTexture} texture target texture
	 * @param {ArrayBuffer|ArrayBufferView} source source bytes
	 * @param {GPUTexelCopyBufferLayout} layout bytes layout
	 * @param {GPUExtent3D} size write size
	 * @returns {boolean}
	 */
	writeTexture(texture, source, layout, size) {
		if (!this.device || !texture || !source || !layout || !size) return false;
		AzWGPU.Texture.write(this.device, texture, source, layout, size);
		return true;
	}

	/**
	 * Create sampler
	 * @param {object} [descriptor={}] sampler descriptor
	 * @returns {GPUSampler|null}
	 */
	createSampler(descriptor = {}) {
		if (!this.device) return null;
		return AzWGPU.Sampler.create(this.device, descriptor);
	}

}

/**
 * WebGL2 backend implementation
 */
export class WGL2 extends Base {
	/**
	 * @param {HTMLCanvasElement|string|null} [canvas=null] canvas ref
	 * @param {object} [options={}] backend options
	 */
	constructor(canvas = null, options = {}) {
		super(canvas, options);
		this.gl = null;
		this.#frame = null;
	}

	#frame;

	/**
	 * Backend kind tag
	 * @returns {string}
	 */
	get kind() { return "webgl2"; }

	/**
	 * Init WebGL2 context
	 * @returns {Promise<WGL2>}
	 */
	async init() {
		if (!this.canvas) throw new Error("[AzWBackendWGL2] canvas is required");

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

	/**
	 * Resize canvas and viewport
	 * @param {object} [options={}] resize options
	 * @returns {boolean}
	 */
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

	/**
	 * Begin frame and apply clear state
	 * @param {object} [frameOptions={}] frame options
	 * @returns {object|null}
	 */
	beginFrame(frameOptions = {}) {
		if (!this.ready || !this.gl) return null;
		this.#frame = Base.normalizeFrameOptions(frameOptions);
		this.#applyFrameClear(this.#frame);
		return this.#frame;
	}

	/**
	 * Begin one render pass style block
	 * @param {object} [options={}] pass options
	 * @returns {object|null}
	 */
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

	/**
	 * End frame hook
	 * @returns {void}
	 */
	endFrame() {}

	/**
	 * Release backend resources
	 * @returns {void}
	 */
	destroy() {
		this.#frame = null;
		this.gl = null;
		this.report = null;
		this.ready = false;
	}

	/**
	 * Apply clear state from normalized frame options
	 * @param {object} frame frame options
	 * @returns {void}
	 */
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

	// ----------

	/**
	 * Create GLSL shader program
	 * @param {object} descriptor shader descriptor
	 * @returns {WebGLProgram|null}
	 */
	createShaderProgram(descriptor) {
		if (!this.gl || !descriptor) return null;
		return AzWGL2.Shader.create(this.gl, descriptor);
	}

	/**
	 * Create pipeline bundle for WebGL2 draw path
	 * @param {object} [options={}] pipeline options
	 * @returns {object|null}
	 */
	createPipeline(options = {}) {
		if (!this.gl) return null;
		return AzWGL2.Pipeline.create(this.gl, options);
	}

	/**
	 * Create 2D texture
	 * @param {object} [options={}] texture options
	 * @returns {WebGLTexture|null}
	 */
	createTexture2D(options = {}) {
		if (!this.gl) return null;
		return AzWGL2.Texture.create2D(this.gl, options);
	}

	/**
	 * Write 2D texture pixels
	 * @param {WebGLTexture} texture target texture
	 * @param {TexImageSource|ArrayBufferView|null} source source pixels
	 * @param {object} [options={}] upload options
	 * @returns {boolean}
	 */
	writeTexture2D(texture, source, options = {}) {
		if (!this.gl || !texture || !source) return false;
		AzWGL2.Texture.write2D(this.gl, texture, source, options);
		return true;
	}

}

export const AzWBackend = Object.freeze({
	Base,
	WGPU,
	WGL2,
});

if (typeof window !== "undefined") {
	window.AzWBackend = AzWBackend;
	window.AzWBackendBase = Base;
	window.AzWBackendWGPU = WGPU;
	window.AzWBackendWGL2 = WGL2;
}

export default AzWBackend;

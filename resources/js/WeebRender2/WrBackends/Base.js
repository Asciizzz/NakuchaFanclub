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

export class WrBackend {
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
		throw new Error("[WrBackend] init() is required");
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
			clearColor: WrBackend.normalizeClearColor(src.clearColor),
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
		const canvas = WrBackend.resolveCanvas(canvasRef);
		if (!canvas) throw new Error("[WrBackend] valid canvas is required");

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
					const { WrBackendWGPU } = await import("./WGPU.js");
					const backend = new WrBackendWGPU(canvas, src.webgpu ?? src);
					await backend.init();
					report.chosen = "webgpu";
					report.reason = preferred === "webgl2" && report.details.webglError
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
				const { WrBackendWGL } = await import("./WGL.js");
				const backend = new WrBackendWGL(canvas, src.webgl ?? src);
				await backend.init();
				report.chosen = "webgl2";
				report.reason = preferred === "webgpu"
					? (report.details.webgpuError
						? "webgpu_failed_fallback_webgl2"
						: "webgpu_unavailable")
					: null;
				report.details.webgl = backend.getCapabilities();
				return { backend, report };
			} catch (error) {
				report.details.webglError = String(error?.message ?? error);
			}
		}

		throw new Error("[WrBackend] choose() failed: " + JSON.stringify(report));
	}
}

if (typeof window !== "undefined") {
	window.WrBackend = WrBackend;
}

export default WrBackend;

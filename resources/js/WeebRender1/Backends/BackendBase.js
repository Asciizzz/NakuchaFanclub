/**
 * Base backend interface for Wr render backends
 */
export class WrBackendBase {
    /**
     * @param {HTMLCanvasElement|null} canvas target canvas
     * @param {object} [options={}] backend options
     */
    constructor(canvas, options = {}) {
        this.canvas = canvas ?? null;
        this.options = options ?? {};
        this.ready = false;
    }

    /**
     * Backend kind tag
     * @returns {string}
     */
    get kind() { return "unknown"; }

    /**
     * Initialize backend resources
     * @returns {Promise<void>}
     */
    async init() {
        throw new Error("[WrBackendBase] init() must be implemented");
    }

    /**
     * Resize backend targets
     * @returns {void}
     */
    resize() {}
    /**
     * Begin frame work
     * @returns {void}
     */
    beginFrame() {}
    /**
     * Execute render queue
     * @returns {void}
     */
    executeRenderQueue() {}
    /**
     * End frame work
     * @returns {void}
     */
    endFrame() {}
    /**
     * Release backend resources
     * @returns {void}
     */
    destroy() {}

    /**
     * Return backend capability report
     * @returns {object}
     */
    getCapabilities() { return {}; }

    /**
     * Normalize clear color input to numeric RGBA fields
     * @param {ArrayLike<number>|null|undefined} value input color
     * @returns {{r:number,g:number,b:number,a:number}}
     */
    static normalizeClearColor(value) {
        const src = Array.isArray(value) || ArrayBuffer.isView(value)
            ? value
            : [0, 0, 0, 0];
        return {
            r: Number(src[0] ?? 0) || 0,
            g: Number(src[1] ?? 0) || 0,
            b: Number(src[2] ?? 0) || 0,
            a: Number(src[3] ?? 0) || 0,
        };
    }

    /**
     * Choose and initialize backend with automatic fallback
     * @param {HTMLCanvasElement} canvas target canvas
     * @param {object} [options={}] backend options
     * @returns {Promise<{backend: object, report: object}>}
     */
    static async choose(canvas, options = {}) {
        const preferred = (options.prefer ?? "webgpu") === "webgl2" ? "webgl2" : "webgpu";
        const report = {
            preferred,
            chosen: null,
            reason: null,
            details: {},
        };

        const tryWebGPUFirst = preferred !== "webgl2";
        const order = tryWebGPUFirst ? ["webgpu", "webgl2"] : ["webgl2", "webgpu"];

        for (const next of order) {
            if (next === "webgpu") {
                try {
                    const { default: WrBackendWGPU } = await import("./WGPUBackend.js");
                    const backend = new WrBackendWGPU(canvas, {
                        pickBest: options.pickBest,
                        device: options.device,
                        context: options.context,
                        format: options.format,
                        ...(options.webgpu ?? {}),
                    });
                    await backend.init();
                    report.chosen = "webgpu";
                    report.reason = preferred === "webgl2" && report.details.webgl2Error
                        ? "webgl2_failed_fallback_webgpu"
                        : null;
                    report.details.webgpu = backend.getCapabilities();
                    return { backend, report };
                } catch (error) {
                    report.details.webgpuError = String(error?.message ?? error);
                }
                continue;
            }

            try {
                const { default: WrBackendWGL2 } = await import("./WGL2Backend.js");
                const backend = new WrBackendWGL2(canvas, options.webgl2 ?? {});
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

        throw new Error("[Wr] backend selection failed: " + JSON.stringify(report));
    }
}

export default WrBackendBase;


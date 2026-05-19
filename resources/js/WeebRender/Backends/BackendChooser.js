import WrBackendWGPU from "./WGPUBackend.js";
import WrBackendWGL from "./WGLBackend.js";

/**
 * Choose and initialize a backend with automatic fallback.
 * @param {HTMLCanvasElement} canvas target canvas
 * @param {object} [options={}] backend selection options
 * @returns {Promise<{backend: object, report: object}>}
 */
export async function wrChooseBackend(canvas, options = {}) {
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
                const backend = new WrBackendWGPU(canvas, {
                    pickBest: options.pickBest,
                    device: options.device,
                    context: options.context,
                    format: options.format,
                    ...(options.webgpu ?? {}),
                });
                await backend.init();
                report.chosen = "webgpu";
                report.reason = preferred === "webgl2" && report.details.webglError
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
            const backend = new WrBackendWGL(canvas, options.webgl ?? {});
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

    throw new Error("[Wr] backend selection failed: " + JSON.stringify(report));
}

export default wrChooseBackend;

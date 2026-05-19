/**
 * Base backend interface for Wr render backends.
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
     * Backend kind tag.
     * @returns {string}
     */
    get kind() { return "unknown"; }

    /**
     * Initialize backend resources.
     * @returns {Promise<void>}
     */
    async init() {
        throw new Error("[WrBackendBase] init() must be implemented");
    }

    /**
     * Resize backend targets.
     * @returns {void}
     */
    resize() {}
    /**
     * Begin frame work.
     * @returns {void}
     */
    beginFrame() {}
    /**
     * Execute render queue.
     * @returns {void}
     */
    executeRenderQueue() {}
    /**
     * End frame work.
     * @returns {void}
     */
    endFrame() {}
    /**
     * Release backend resources.
     * @returns {void}
     */
    destroy() {}

    /**
     * Return backend capability report.
     * @returns {object}
     */
    getCapabilities() { return {}; }

    /**
     * Normalize clear color input to numeric RGBA fields.
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
}

export default WrBackendBase;

export class WrBackendBase {
    constructor(canvas, options = {}) {
        this.canvas = canvas ?? null;
        this.options = options ?? {};
        this.ready = false;
    }

    get kind() { return "unknown"; }

    async init() {
        throw new Error("[WrBackendBase] init() must be implemented");
    }

    resize() {}
    beginFrame() {}
    executeRenderQueue() {}
    endFrame() {}
    destroy() {}

    getCapabilities() { return {}; }

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

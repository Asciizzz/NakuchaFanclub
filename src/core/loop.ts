import { GPUManager } from "./gpu.js";

export type FrameCallback = (time: number, dt: number, encoder: GPUCommandEncoder) => void;

export class RenderLoop {
    readonly gpu: GPUManager;
    private _running = false;
    private _animFrameId = 0;
    private _startTime = performance.now();
    private _lastTime = performance.now();
    private _callbacks: FrameCallback[] = [];

    constructor(gpu: GPUManager) {
        this.gpu = gpu;
        this._tick = this._tick.bind(this);
    }

    onFrame(cb: FrameCallback): void {
        this._callbacks.push(cb);
    }

    start(): void {
        if (this._running) return;
        this._running = true;
        this._startTime = performance.now();
        this._lastTime = performance.now();
        this._animFrameId = requestAnimationFrame(this._tick);
    }

    stop(): void {
        this._running = false;
        if (this._animFrameId) {
            cancelAnimationFrame(this._animFrameId);
            this._animFrameId = 0;
        }
    }

    private _tick(now: number): void {
        if (!this._running) return;

        const time = (now - this._startTime) * 0.001;
        const dt = Math.min((now - this._lastTime) * 0.001, 0.1);
        this._lastTime = now;

        const encoder = this.gpu.device.createCommandEncoder("FrameCommandEncoder");

        for (const cb of this._callbacks) {
            cb(time, dt, encoder);
        }

        this.gpu.device.submit(encoder);

        this._animFrameId = requestAnimationFrame(this._tick);
    }
}

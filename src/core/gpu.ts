import { Device } from "@asciiz/atoolkit/awgpu";
import { EventBus } from "./events.js";

export interface CanvasPair {
    backCanvas: HTMLCanvasElement;
    frontCanvas: HTMLCanvasElement;
}

export class GPUManager {
    readonly device: Device;
    readonly backCanvas: HTMLCanvasElement;
    readonly frontCanvas: HTMLCanvasElement;
    readonly backContext: GPUCanvasContext;
    readonly frontContext: GPUCanvasContext;
    readonly format: GPUTextureFormat;

    private _dpr = 1;
    private _width = 0;
    private _height = 0;

    private constructor(
        device: Device,
        backCanvas: HTMLCanvasElement,
        frontCanvas: HTMLCanvasElement,
        backContext: GPUCanvasContext,
        frontContext: GPUCanvasContext,
        format: GPUTextureFormat
    ) {
        this.device = device;
        this.backCanvas = backCanvas;
        this.frontCanvas = frontCanvas;
        this.backContext = backContext;
        this.frontContext = frontContext;
        this.format = format;

        this._handleResize = this._handleResize.bind(this);
        window.addEventListener("resize", this._handleResize);
        this._handleResize();
    }

    static async create(backCanvas: HTMLCanvasElement, frontCanvas: HTMLCanvasElement): Promise<GPUManager> {
        if (!navigator.gpu) {
            throw new Error("WebGPU is not supported on this browser or platform.");
        }

        // Initialize single device from @asciiz/atoolkit/awgpu
        const device = await Device.createHeadless({
            powerPreference: "high-performance",
        });

        const format = navigator.gpu.getPreferredCanvasFormat();

        const backContext = backCanvas.getContext("webgpu");
        const frontContext = frontCanvas.getContext("webgpu");

        if (!backContext || !frontContext) {
            throw new Error("Failed to acquire WebGPU canvas contexts for back and front canvases.");
        }

        // Configure back canvas
        backContext.configure({
            device: device.device,
            format,
            alphaMode: "premultiplied",
        });

        // Configure front canvas as transparent glass sheet
        frontContext.configure({
            device: device.device,
            format,
            alphaMode: "premultiplied",
        });

        return new GPUManager(
            device,
            backCanvas,
            frontCanvas,
            backContext,
            frontContext,
            format
        );
    }

    private _handleResize(): void {
        this._dpr = Math.min(window.devicePixelRatio || 1, 1.25);
        this._width = window.innerWidth;
        this._height = window.innerHeight;

        const physW = Math.max(1, Math.floor(this._width * this._dpr));
        const physH = Math.max(1, Math.floor(this._height * this._dpr));

        if (this.backCanvas.width !== physW || this.backCanvas.height !== physH) {
            this.backCanvas.width = physW;
            this.backCanvas.height = physH;
        }

        if (this.frontCanvas.width !== physW || this.frontCanvas.height !== physH) {
            this.frontCanvas.width = physW;
            this.frontCanvas.height = physH;
        }

        EventBus.get().emit("resize", {
            width: this._width,
            height: this._height,
            dpr: this._dpr,
        });
    }

    get dpr(): number {
        return this._dpr;
    }

    get width(): number {
        return this._width;
    }

    get height(): number {
        return this._height;
    }

    get physicalWidth(): number {
        return this.backCanvas.width;
    }

    get physicalHeight(): number {
        return this.backCanvas.height;
    }

    destroy(): void {
        window.removeEventListener("resize", this._handleResize);
        this.device.destroy();
    }
}

import { RasterPipeline } from "@asciiz/atoolkit/awgpu";
import { GPUManager } from "../../core/gpu.js";
import { GRID_PLATFORM_WGSL } from "./grid-platform.wgsl.js";

export interface GridPlatformConfig {
    squareSize: number;       // CSS pixels
    topMainHeight: number;    // CSS pixels
    bottomMainHeight: number; // CSS pixels
    topSpeed: number;         // CSS pixels / sec
    topDirection: number;     // -1: left, 1: right
    bottomSpeed: number;      // CSS pixels / sec
    bottomDirection: number;  // -1: left, 1: right
    darkColor: [number, number, number, number];   // #1A2838
    lightColor: [number, number, number, number];  // #FFFFFF
    rectColor: [number, number, number, number];   // Solid rect background
}

export const DEFAULT_GRID_CONFIG: GridPlatformConfig = {
    squareSize: 10,
    topMainHeight: 58,
    bottomMainHeight: 38,
    topSpeed: 34,
    topDirection: -1,
    bottomSpeed: 34,
    bottomDirection: 1,
    darkColor: [26 / 255, 40 / 255, 56 / 255, 1.0], // #1A2838 deep navy
    lightColor: [0.0, 0.0, 0.0, 0.0],               // Transparent stencil cutout holes
    rectColor: [26 / 255, 40 / 255, 56 / 255, 1.0], // #1A2838 deep navy solid rect
};

export class GridPlatform {
    readonly gpu: GPUManager;
    readonly config: GridPlatformConfig;

    private _pipeline: RasterPipeline;
    private _bindGroup: GPUBindGroup;
    private _uniformBuffer: GPUBuffer;
    private _uniformData = new Float32Array(32); // 128 bytes

    // Bottom border downward hide offset (0.0 = visible, totalHeight = completely hidden)
    private _bottomHideOffset = 0.0;
    private _targetBottomHideOffset = 0.0;

    constructor(gpu: GPUManager, config: Partial<GridPlatformConfig> = {}) {
        this.gpu = gpu;
        this.config = { ...DEFAULT_GRID_CONFIG, ...config };
        const nativeDevice = gpu.device.device;

        this._uniformBuffer = nativeDevice.createBuffer({
            label: "GridPlatform_UniformBuffer",
            size: 128,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const bindGroupLayout = nativeDevice.createBindGroupLayout({
            label: "GridPlatform_BindGroupLayout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" },
                },
            ],
        });

        this._bindGroup = nativeDevice.createBindGroup({
            label: "GridPlatform_BindGroup",
            layout: bindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this._uniformBuffer },
                },
            ],
        });

        this._pipeline = RasterPipeline.create(gpu.device, {
            vertex: {
                code: GRID_PLATFORM_WGSL,
                entryPoint: "vs_main",
            },
            fragment: {
                code: GRID_PLATFORM_WGSL,
                entryPoint: "fs_main",
                targets: [
                    {
                        format: gpu.format,
                        blend: {
                            color: {
                                srcFactor: "one",
                                dstFactor: "one-minus-src-alpha",
                                operation: "add",
                            },
                            alpha: {
                                srcFactor: "one",
                                dstFactor: "one-minus-src-alpha",
                                operation: "add",
                            },
                        },
                    },
                ],
            },
            layouts: [bindGroupLayout],
        });

        // Default: visible (Welcome starts with bottom border active)
        this._bottomHideOffset = 0.0;
        this._targetBottomHideOffset = 0.0;
    }

    setBottomHidden(hidden: boolean): void {
        const dpr = this.gpu.dpr;
        const bottomTotal = (this.config.bottomMainHeight + this.config.squareSize * 2) * dpr;
        this._targetBottomHideOffset = hidden ? bottomTotal : 0.0;
    }

    render(time: number, dt: number, pass: GPURenderPassEncoder): void {
        const dpr = this.gpu.dpr;

        // Smooth downward translation of bottom border
        this._bottomHideOffset += (this._targetBottomHideOffset - this._bottomHideOffset) * Math.min(dt * 7.0, 1.0);

        // Uniforms layout (32 floats = 128 bytes)
        this._uniformData[0] = this.gpu.physicalWidth;
        this._uniformData[1] = this.gpu.physicalHeight;
        this._uniformData[2] = time;
        this._uniformData[3] = this.config.squareSize * dpr;

        this._uniformData[4] = this.config.topMainHeight * dpr;
        this._uniformData[5] = this.config.topSpeed * dpr;
        this._uniformData[6] = this.config.topDirection;
        this._uniformData[7] = this.config.bottomMainHeight * dpr;

        this._uniformData[8] = this.config.bottomSpeed * dpr;
        this._uniformData[9] = this.config.bottomDirection;
        this._uniformData[10] = this._bottomHideOffset;
        this._uniformData[11] = 0.0;

        // [12..15] darkColor
        this._uniformData.set(this.config.darkColor, 12);
        // [16..19] lightColor
        this._uniformData.set(this.config.lightColor, 16);
        // [20..23] rectColor
        this._uniformData.set(this.config.rectColor, 20);

        this.gpu.device.device.queue.writeBuffer(
            this._uniformBuffer,
            0,
            this._uniformData.buffer,
            0,
            128
        );

        pass.setPipeline(this._pipeline.native);
        pass.setBindGroup(0, this._bindGroup);
        pass.draw(3, 1, 0, 0);
    }
}

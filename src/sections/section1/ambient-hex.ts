import { RasterPipeline } from "@asciiz/atoolkit/awgpu";
import { GPUManager } from "../../core/gpu.js";
import { AMBIENT_HEX_WGSL } from "./ambient-hex.wgsl.js";

export class Section1AmbientRenderer {
    readonly gpu: GPUManager;
    private _pipeline: RasterPipeline;
    private _bindGroup: GPUBindGroup;
    private _uniformBuffer: GPUBuffer;
    private _uniformData = new Float32Array(4); // 16 bytes

    constructor(gpu: GPUManager) {
        this.gpu = gpu;
        const nativeDevice = gpu.device.device;

        this._uniformBuffer = nativeDevice.createBuffer({
            label: "Section1_UniformBuffer",
            size: 16,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        const bindGroupLayout = nativeDevice.createBindGroupLayout({
            label: "Section1_BindGroupLayout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" },
                },
            ],
        });

        this._bindGroup = nativeDevice.createBindGroup({
            label: "Section1_BindGroup",
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
                code: AMBIENT_HEX_WGSL,
                entryPoint: "vs_main",
            },
            fragment: {
                code: AMBIENT_HEX_WGSL,
                entryPoint: "fs_main",
                targets: [{ format: gpu.format }],
            },
            layouts: [bindGroupLayout],
        });
    }

    render(time: number, visualOffset: number, pass: GPURenderPassEncoder): void {
        this._uniformData[0] = this.gpu.physicalWidth;
        this._uniformData[1] = this.gpu.physicalHeight;
        this._uniformData[2] = time;
        this._uniformData[3] = visualOffset;

        this.gpu.device.device.queue.writeBuffer(
            this._uniformBuffer,
            0,
            this._uniformData.buffer,
            0,
            16
        );

        pass.setPipeline(this._pipeline.native);
        pass.setBindGroup(0, this._bindGroup);
        pass.draw(3, 1, 0, 0);
    }
}

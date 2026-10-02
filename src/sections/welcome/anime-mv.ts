import { RasterPipeline } from "@asciiz/atoolkit/awgpu";
import { GPUManager } from "../../core/gpu.js";
import { ANIME_MV_WGSL } from "./anime-mv.wgsl.js";

export class AnimeMVRenderer {
    readonly gpu: GPUManager;
    private _pipeline: RasterPipeline;
    private _bindGroup: GPUBindGroup;
    private _uniformBuffer: GPUBuffer;
    private _textTexture: GPUTexture;
    private _textSampler: GPUSampler;
    private _uniformData = new Float32Array(16); // 64 bytes

    constructor(gpu: GPUManager) {
        this.gpu = gpu;
        const nativeDevice = gpu.device.device;

        this._uniformBuffer = nativeDevice.createBuffer({
            label: "AnimeMV_UniformBuffer",
            size: 64,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });

        // Create 2D Japanese typography character atlas (5 cells of 256x256 = 1280x256)
        const textCanvas = document.createElement("canvas");
        textCanvas.width = 1280;
        textCanvas.height = 256;
        const ctx = textCanvas.getContext("2d")!;
        ctx.clearRect(0, 0, 1280, 256);

        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillStyle = "#FFFFFF";
        ctx.font = "900 180px 'Hiragino Kaku Gothic ProN', 'Yu Gothic', 'Meiryo', 'Noto Sans JP', sans-serif";

        // 5 individual Japanese glyphs: \u85cd, \u6708, \u306a, \u304f, \u308b (Aitsuki Nakuru)
        const glyphs = ["\u85cd", "\u6708", "\u306a", "\u304f", "\u308b"];
        for (let i = 0; i < 5; i++) {
            ctx.fillText(glyphs[i], i * 256 + 128, 134);
        }

        this._textTexture = nativeDevice.createTexture({
            label: "AnimeMV_TextTexture",
            size: [1280, 256, 1],
            format: "rgba8unorm",
            usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
        });

        nativeDevice.queue.copyExternalImageToTexture(
            { source: textCanvas },
            { texture: this._textTexture },
            [1280, 256]
        );

        this._textSampler = nativeDevice.createSampler({
            label: "AnimeMV_TextSampler",
            magFilter: "linear",
            minFilter: "linear",
            addressModeU: "clamp-to-edge",
            addressModeV: "clamp-to-edge",
        });

        const bindGroupLayout = nativeDevice.createBindGroupLayout({
            label: "AnimeMV_BindGroupLayout",
            entries: [
                {
                    binding: 0,
                    visibility: GPUShaderStage.FRAGMENT,
                    buffer: { type: "uniform" },
                },
                {
                    binding: 1,
                    visibility: GPUShaderStage.FRAGMENT,
                    texture: { sampleType: "float" },
                },
                {
                    binding: 2,
                    visibility: GPUShaderStage.FRAGMENT,
                    sampler: { type: "filtering" },
                },
            ],
        });

        this._bindGroup = nativeDevice.createBindGroup({
            label: "AnimeMV_BindGroup",
            layout: bindGroupLayout,
            entries: [
                {
                    binding: 0,
                    resource: { buffer: this._uniformBuffer },
                },
                {
                    binding: 1,
                    resource: this._textTexture.createView(),
                },
                {
                    binding: 2,
                    resource: this._textSampler,
                },
            ],
        });

        this._pipeline = RasterPipeline.create(gpu.device, {
            vertex: {
                code: ANIME_MV_WGSL,
                entryPoint: "vs_main",
            },
            fragment: {
                code: ANIME_MV_WGSL,
                entryPoint: "fs_main",
                targets: [{ format: gpu.format }],
            },
            layouts: [bindGroupLayout],
        });
    }

    render(
        time: number,
        visualOffset: number,
        mouse: [number, number],
        mouseVel: [number, number],
        pass: GPURenderPassEncoder
    ): void {
        this._uniformData[0] = this.gpu.physicalWidth;
        this._uniformData[1] = this.gpu.physicalHeight;
        this._uniformData[2] = time;
        this._uniformData[3] = visualOffset;
        this._uniformData[4] = mouse[0];
        this._uniformData[5] = mouse[1];
        this._uniformData[6] = mouseVel[0];
        this._uniformData[7] = mouseVel[1];
        this._uniformData[8] = 0;

        this.gpu.device.device.queue.writeBuffer(
            this._uniformBuffer,
            0,
            this._uniformData.buffer,
            0,
            64
        );

        pass.setPipeline(this._pipeline.native);
        pass.setBindGroup(0, this._bindGroup);
        pass.draw(3, 1, 0, 0);
    }
}

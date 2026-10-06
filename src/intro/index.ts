import { RasterPipeline } from "@asciiz/atoolkit/awgpu";
import { GPUManager } from "../core/gpu.js";
import { INTRO_WGSL } from "./intro.wgsl.js";

export type IntroPhase = "loading" | "morph" | "split" | "complete";

/**
 * Controller for pure minimalist WebGPU intro sequence.
 * Renders #1A2838 background with chalk white wheel that morphs into a line and splits open.
 */
export class IntroController {
	readonly gpu: GPUManager;

	phase: IntroPhase = "loading";
	isActive = true;
	isComplete = false;

	private _pipeline: RasterPipeline;
	private _bindGroup: GPUBindGroup;
	private _uniformBuffer: GPUBuffer;
	private _uniformData = new Float32Array(8); // 32 bytes

	// Timing parameters
	private _loadTimer = 0;
	private readonly _loadDuration = 1.6; // 1.6s for wheel to turn 360 deg

	private _morphTimer = 0;
	private readonly _morphDuration = 0.35; // 0.35s for wheel to flatten into line

	private _splitTimer = 0;
	private readonly _splitDuration = 0.65; // 0.65s for doors to split open

	// Normalized progressions
	loadProgress = 0;
	morphProgress = 0;
	splitProgress = 0;

	private _topBarEl: HTMLElement | null = null;

	constructor(gpu: GPUManager) {
		this.gpu = gpu;
		const nativeDevice = gpu.device.device;

		this._uniformBuffer = nativeDevice.createBuffer({
			label: "Intro_UniformBuffer",
			size: 32,
			usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
		});

		const bindGroupLayout = nativeDevice.createBindGroupLayout({
			label: "Intro_BindGroupLayout",
			entries: [
				{
					binding: 0,
					visibility: GPUShaderStage.FRAGMENT,
					buffer: { type: "uniform" },
				},
			],
		});

		this._bindGroup = nativeDevice.createBindGroup({
			label: "Intro_BindGroup",
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
				code: INTRO_WGSL,
				entryPoint: "vs_main",
			},
			fragment: {
				code: INTRO_WGSL,
				entryPoint: "fs_main",
				targets: [
					{
						format: gpu.format,
						blend: {
							color: {
								srcFactor: "src-alpha",
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

		this._topBarEl = document.getElementById("header-bar");
		if (this._topBarEl) {
			this._topBarEl.classList.add("intro-hidden");
		}
	}

	update(_time: number, dt: number): void {
		if (this.phase === "complete") {
			return;
		}

		if (this.phase === "loading") {
			this._loadTimer += dt;
			const raw = Math.min(1.0, this._loadTimer / this._loadDuration);
			// Smooth ease-out for the loading wheel
			this.loadProgress = raw * raw * (3.0 - 2.0 * raw);

			if (this.loadProgress >= 1.0) {
				this.loadProgress = 1.0;
				this.phase = "morph";
				document.body.classList.remove("intro-active");
			}
		} else if (this.phase === "morph") {
			this._morphTimer += dt;
			const raw = Math.min(1.0, this._morphTimer / this._morphDuration);
			// Snappy cubic ease for snapping into a line
			this.morphProgress = raw * raw * (3.0 - 2.0 * raw);

			if (this.morphProgress >= 1.0) {
				this.morphProgress = 1.0;
				this.phase = "split";
			}
		} else if (this.phase === "split") {
			this._splitTimer += dt;
			const raw = Math.min(1.0, this._splitTimer / this._splitDuration);
			// Smooth cubic ease-out for sliding doors
			this.splitProgress = 1.0 - Math.pow(1.0 - raw, 3.0);

			if (raw >= 1.0) {
				this.splitProgress = 1.0;
				this.phase = "complete";
				this.isActive = false;
				this.isComplete = true;

				if (this._topBarEl) {
					this._topBarEl.classList.remove("intro-hidden");
				}
			}
		}
	}

	renderFront(pass: GPURenderPassEncoder, time: number): void {
		if (this.phase === "complete") {
			return;
		}

		const width = this.gpu.physicalWidth;
		const height = this.gpu.physicalHeight;
		const aspect = width / Math.max(1.0, height);

		let phaseIndex = 0;
		if (this.phase === "morph") {
			phaseIndex = 1;
		} else if (this.phase === "split") {
			phaseIndex = 2;
		}

		this._uniformData[0] = width;
		this._uniformData[1] = height;
		this._uniformData[2] = time;
		this._uniformData[3] = phaseIndex;
		this._uniformData[4] = this.loadProgress;
		this._uniformData[5] = this.morphProgress;
		this._uniformData[6] = this.splitProgress;
		this._uniformData[7] = aspect;

		this.gpu.device.device.queue.writeBuffer(
			this._uniformBuffer,
			0,
			this._uniformData.buffer,
			0,
			32
		);

		pass.setPipeline(this._pipeline.native);
		pass.setBindGroup(0, this._bindGroup);
		pass.draw(3);
	}

	restart(): void {
		this.phase = "loading";
		this.isActive = true;
		this.isComplete = false;
		this._loadTimer = 0;
		this._morphTimer = 0;
		this._splitTimer = 0;
		this.loadProgress = 0;
		this.morphProgress = 0;
		this.splitProgress = 0;

		document.body.classList.add("intro-active");
		if (this._topBarEl) {
			this._topBarEl.classList.add("intro-hidden");
		}
	}

	dispose(): void {
		this._uniformBuffer.destroy();
	}
}

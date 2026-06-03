import { AzCamera } from "../AzLib/AzCamera.js";
import * as Azm from "../AzLib/Azm.js";
import { FCamera } from "./FCamera.js";
import { WrCtx, WrWGPU } from "../WeebRender3/index.js";

const container = document.getElementById("main-canvas");

run().catch((error) => {
	console.error("[WR3Test] fatal", error);
});

function makeBuffer(device, label, data, usage) {
	const buffer = device.createBuffer({
		label,
		size: data.byteLength,
		usage,
	});
	device.queue.writeBuffer(buffer, 0, data);
	return buffer;
}

function createCheckerTexture(device, size = 64) {
	const data = new Uint8Array(size * size * 4);
	for (let y = 0; y < size; y++) {
		for (let x = 0; x < size; x++) {
			const i = (y * size + x) * 4;
			const check = ((x >> 3) + (y >> 3)) & 1;
			const base = check ? 235 : 45;
			data[i] = check ? base : 35;
			data[i + 1] = check ? 185 : 55;
			data[i + 2] = check ? 255 : 95;
			data[i + 3] = 255;
		}
	}
	const texture = device.createTexture({
		label: "WR3CheckerTexture",
		size: [size, size, 1],
		format: "rgba8unorm",
		usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
	});
	device.queue.writeTexture(
		{ texture },
		data,
		{ bytesPerRow: size * 4, rowsPerImage: size },
		{ width: size, height: size, depthOrArrayLayers: 1 },
	);
	return texture;
}

function createCube() {
	const p = 0.5;
	return {
		vertices: new Float32Array([
			-p, -p,  p, 0, 1,  p, -p,  p, 1, 1,  p,  p,  p, 1, 0, -p,  p,  p, 0, 0,
			 p, -p, -p, 0, 1, -p, -p, -p, 1, 1, -p,  p, -p, 1, 0,  p,  p, -p, 0, 0,
			-p, -p, -p, 0, 1, -p, -p,  p, 1, 1, -p,  p,  p, 1, 0, -p,  p, -p, 0, 0,
			 p, -p,  p, 0, 1,  p, -p, -p, 1, 1,  p,  p, -p, 1, 0,  p,  p,  p, 0, 0,
			-p,  p,  p, 0, 1,  p,  p,  p, 1, 1,  p,  p, -p, 1, 0, -p,  p, -p, 0, 0,
			-p, -p, -p, 0, 1,  p, -p, -p, 1, 1,  p, -p,  p, 1, 0, -p, -p,  p, 0, 0,
		]),
		indices: new Uint16Array([
			 0,  1,  2,  0,  2,  3,
			 4,  5,  6,  4,  6,  7,
			 8,  9, 10,  8, 10, 11,
			12, 13, 14, 12, 14, 15,
			16, 17, 18, 16, 18, 19,
			20, 21, 22, 20, 22, 23,
		]),
	};
}

function createInstanceState() {
	return new Float32Array([
		-1.65, 0.0, 0.0, 0.0, 0.00, 0.85, 0.0, 0.26,
		 0.00, 0.0, -0.35, 0.0, 1.70, 1.15, 1.7, 0.30,
		 1.65, 0.0, 0.0, 0.0, 3.10, 0.65, 3.1, 0.23,
	]);
}

async function run() {
	const canvas = document.createElement("canvas");
	canvas.id = "wr-canvas-3";
	canvas.style.width = "100%";
	canvas.style.height = "100%";
	container.replaceChildren(canvas);

	const backend = await WrWGPU.Backend.create(canvas);
	const camera = new AzCamera({
		position: [0, 1.25, 5],
		near: 0.1,
		far: 100,
		fov: 48,
	});
	camera.lookAt([0, 0, 0]);

	const fcam = new FCamera({
		canvas,
		camera,
		cfg: {
			move: {
				walkSpeed: 3.2,
				sprintScale: 2.5,
			},
		},
	});
	fcam.attach();

	const resize = () => {
		backend.resize({ maxPixelRatio: 2 });
		const w = Math.max(1, canvas.clientWidth || canvas.width || 1);
		const h = Math.max(1, canvas.clientHeight || canvas.height || 1);
		camera.aspect = w / h;
	};
	resize();
	new ResizeObserver(resize).observe(container);

	const device = backend.device;
	const usage = GPUBufferUsage;
	const cube = createCube();
	const vertexBuffer = makeBuffer(device, "WR3CubeVertexBuffer", cube.vertices, usage.VERTEX | usage.COPY_DST);
	const indexBuffer = makeBuffer(device, "WR3CubeIndexBuffer", cube.indices, usage.INDEX | usage.COPY_DST);
	const sceneBuffer = device.createBuffer({
		label: "WR3SceneBuffer",
		size: 64,
		usage: usage.UNIFORM | usage.COPY_DST,
	});
	const computeParams = new Float32Array(4);
	const computeParamBuffer = device.createBuffer({
		label: "WR3ComputeParams",
		size: computeParams.byteLength,
		usage: usage.UNIFORM | usage.COPY_DST,
	});
	const instanceState = createInstanceState();
	const instanceStateBuffer = makeBuffer(device, "WR3InstanceStateBuffer", instanceState, usage.STORAGE | usage.COPY_DST);
	const instanceBuffer = device.createBuffer({
		label: "WR3InstanceBuffer",
		size: 16 * 3 * 4,
		usage: usage.VERTEX | usage.STORAGE | usage.COPY_DST,
	});
	const checker = createCheckerTexture(device);
	const sampler = device.createSampler({
		magFilter: "nearest",
		minFilter: "nearest",
		addressModeU: "repeat",
		addressModeV: "repeat",
	});

	const shader = device.createShaderModule({
		label: "WR3InstancedCubeShader",
		code: `
			struct Scene {
				viewProj: mat4x4f,
			}

			struct ComputeParams {
				time: f32,
				deltaTime: f32,
				count: u32,
				_pad: u32,
			}

			struct InstanceState {
				pos: vec4f,
				rot: vec4f,
			}

			@group(0) @binding(0) var<uniform> scene: Scene;
			@group(0) @binding(1) var texSampler: sampler;
			@group(0) @binding(2) var tex: texture_2d<f32>;
			@group(0) @binding(3) var<uniform> params: ComputeParams;
			@group(0) @binding(4) var<storage, read_write> states: array<InstanceState>;
			@group(0) @binding(5) var<storage, read_write> models: array<mat4x4f>;

			struct VertexIn {
				@location(0) position: vec3f,
				@location(1) uv: vec2f,
				@location(2) model0: vec4f,
				@location(3) model1: vec4f,
				@location(4) model2: vec4f,
				@location(5) model3: vec4f,
			}

			struct VertexOut {
				@builtin(position) position: vec4f,
				@location(0) uv: vec2f,
			}

			@vertex
			fn vs_main(input: VertexIn) -> VertexOut {
				let model = mat4x4f(input.model0, input.model1, input.model2, input.model3);
				var out: VertexOut;
				out.position = scene.viewProj * model * vec4f(input.position, 1.0);
				out.uv = input.uv;
				return out;
			}

			@vertex
			fn vs_outline(input: VertexIn) -> VertexOut {
				let model = mat4x4f(input.model0, input.model1, input.model2, input.model3);
				let dir = normalize(input.position);
				var out: VertexOut;
				out.position = scene.viewProj * model * vec4f(input.position + dir * 0.075, 1.0);
				out.uv = input.uv;
				return out;
			}

			@fragment
			fn fs_main(input: VertexOut) -> @location(0) vec4f {
				return textureSample(tex, texSampler, input.uv);
			}

			@fragment
			fn fs_outline(_input: VertexOut) -> @location(0) vec4f {
				return vec4f(0.0, 0.0, 0.0, 1.0);
			}

			@compute @workgroup_size(64)
			fn cs_main(@builtin(global_invocation_id) gid: vec3u) {
				let i = gid.x;
				if (i >= params.count) {
					return;
				}

				var state = states[i];
				state.rot.x = state.rot.x + state.rot.y * params.deltaTime;
				states[i] = state;

				let a = state.rot.x;
				let c = cos(a);
				let s = sin(a);
				let y = state.pos.y + sin(params.time * 1.35 + state.rot.z) * state.rot.w;

				models[i] = mat4x4f(
					vec4f(c, 0.0, -s, 0.0),
					vec4f(0.0, 1.0, 0.0, 0.0),
					vec4f(s, 0.0, c, 0.0),
					vec4f(state.pos.x, y, state.pos.z, 1.0)
				);
			}
		`,
	});

	const renderBGL = device.createBindGroupLayout({
		label: "WR3RenderBGL",
		entries: [
			{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } },
			{ binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
			{ binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
		],
	});
	const computeBGL = device.createBindGroupLayout({
		label: "WR3ComputeBGL",
		entries: [
			{ binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
			{ binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
			{ binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
		],
	});
	const renderPipelineLayout = device.createPipelineLayout({
		label: "WR3RenderPipelineLayout",
		bindGroupLayouts: [renderBGL],
	});
	const computePipelineLayout = device.createPipelineLayout({
		label: "WR3ComputePipelineLayout",
		bindGroupLayouts: [computeBGL],
	});

	const pipeline = device.createRenderPipeline({
		label: "WR3InstancedCubePipeline",
		layout: renderPipelineLayout,
		vertex: {
			module: shader,
			entryPoint: "vs_main",
			buffers: [
				{
					arrayStride: 20,
					attributes: [
						{ shaderLocation: 0, offset: 0, format: "float32x3" },
						{ shaderLocation: 1, offset: 12, format: "float32x2" },
					],
				},
				{
					arrayStride: 64,
					stepMode: "instance",
					attributes: [
						{ shaderLocation: 2, offset: 0, format: "float32x4" },
						{ shaderLocation: 3, offset: 16, format: "float32x4" },
						{ shaderLocation: 4, offset: 32, format: "float32x4" },
						{ shaderLocation: 5, offset: 48, format: "float32x4" },
					],
				},
			],
		},
		fragment: {
			module: shader,
			entryPoint: "fs_main",
			targets: [{ format: backend.format }],
		},
		primitive: {
			topology: "triangle-list",
			cullMode: "back",
		},
		depthStencil: {
			format: backend.depthFormat,
			depthWriteEnabled: true,
			depthCompare: "less",
		},
	});

	const outlinePipeline = device.createRenderPipeline({
		label: "WR3InstancedCubeOutlinePipeline",
		layout: renderPipelineLayout,
		vertex: {
			module: shader,
			entryPoint: "vs_outline",
			buffers: [
				{
					arrayStride: 20,
					attributes: [
						{ shaderLocation: 0, offset: 0, format: "float32x3" },
						{ shaderLocation: 1, offset: 12, format: "float32x2" },
					],
				},
				{
					arrayStride: 64,
					stepMode: "instance",
					attributes: [
						{ shaderLocation: 2, offset: 0, format: "float32x4" },
						{ shaderLocation: 3, offset: 16, format: "float32x4" },
						{ shaderLocation: 4, offset: 32, format: "float32x4" },
						{ shaderLocation: 5, offset: 48, format: "float32x4" },
					],
				},
			],
		},
		fragment: {
			module: shader,
			entryPoint: "fs_outline",
			targets: [{ format: backend.format }],
		},
		primitive: {
			topology: "triangle-list",
			cullMode: "front",
		},
		depthStencil: {
			format: backend.depthFormat,
			depthWriteEnabled: true,
			depthCompare: "less",
		},
	});

	const computePipeline = device.createComputePipeline({
		label: "WR3InstanceComputePipeline",
		layout: computePipelineLayout,
		compute: {
			module: shader,
			entryPoint: "cs_main",
		},
	});

	const renderBindGroup = device.createBindGroup({
		label: "WR3CubeBindGroup",
		layout: renderBGL,
		entries: [
			{ binding: 0, resource: { buffer: sceneBuffer } },
			{ binding: 1, resource: sampler },
			{ binding: 2, resource: checker.createView() },
		],
	});
	const instanceComputeBindGroup = device.createBindGroup({
		label: "WR3ComputeBindGroup",
		layout: computeBGL,
		entries: [
			{ binding: 3, resource: { buffer: computeParamBuffer } },
			{ binding: 4, resource: { buffer: instanceStateBuffer } },
			{ binding: 5, resource: { buffer: instanceBuffer } },
		],
	});

	const ctx = new WrCtx();
	const runner = new WrWGPU.Runner({ backend });

	const root = ctx.addNode();
	root.addComp(new WrWGPU.BeginFrame());

	const compute = root.addChild();
	compute.addComp(new WrWGPU.ComputePass({ label: "compute-instances" }));
	compute.addComp(new WrWGPU.UsePipeline(computePipeline));
	compute.addComp(new WrWGPU.SetBindGroups([
		{ index: 0, bindGroup: instanceComputeBindGroup },
	]));
	compute.addComp(new WrWGPU.Dispatch({ x: 1 }));
	compute.addComp(new WrWGPU.EndPass());

	const pass = root.addChild();
	pass.addComp(new WrWGPU.RenderPass({
		clearColor: [0.08, 0.09, 0.12, 1],
		clearDepth: 1,
		useDepth: true,
	}));

	const outlineShader = pass.addChild();
	outlineShader.addComp(new WrWGPU.UsePipeline(outlinePipeline));

	const mainShader = pass.addChild();
	mainShader.addComp(new WrWGPU.UsePipeline(pipeline));

	const cubes = ctx.addNode();
	outlineShader.linkChild(cubes);
	mainShader.linkChild(cubes);
	cubes.addComp(new WrWGPU.SetBindGroups([
		{ index: 0, bindGroup: renderBindGroup },
	]));
	cubes.addComp(new WrWGPU.SetBuffers({
		vertex: [
			{ slot: 0, buffer: vertexBuffer },
			{ slot: 1, buffer: instanceBuffer },
		],
		index: {
			buffer: indexBuffer,
			format: "uint16",
		},
	}));
	cubes.addComp(new WrWGPU.DrawIndexed({
		indexCount: cube.indices.length,
		instanceCount: 3,
	}));

	let last = performance.now();
	function frame(now) {
		const dt = Math.max(0, (now - last) * 0.001);
		last = now;
		fcam.update(dt);

		const viewProj = Azm.Mat4.mul(camera.projection, camera.view);
		device.queue.writeBuffer(sceneBuffer, 0, viewProj);
		computeParams[0] = now * 0.001;
		computeParams[1] = dt;
		computeParams[2] = 3;
		computeParams[3] = 0;
		device.queue.writeBuffer(computeParamBuffer, 0, computeParams);

		runner.run(root);
		requestAnimationFrame(frame);
	}
	requestAnimationFrame(frame);

	if (typeof window !== "undefined") {
		window.wr3 = { backend, ctx, runner, root, compute, pass, outlineShader, mainShader, cubes, pipeline, outlinePipeline, computePipeline, camera, fcam };
	}
}

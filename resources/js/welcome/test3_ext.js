import { Acamera } from "../Alib/Acamera.js";
import * as Alm from "../Alib/Alm.js";
import { Awgpu } from "../Alib/Awgpu/index.js";
import { Ctx } from "../Alib/AwDAG.js";
import { FCamera } from "./FCamera.js";
import { ExtWGPU, Other } from "../WeebRender3/index.js";

const container = document.getElementById("main-canvas");
const INSTANCE_COUNT = 3;
const SCENE_SHADER_URL = new URL("./shaders/scene4_ext.wgsl", import.meta.url).href;

run().catch((error) => {
	console.error("[WR3ExtTest] fatal", error);
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

function createCanvas() {
	const canvas = document.createElement("canvas");
	canvas.id = "wr-canvas-3";
	canvas.style.width = "100%";
	canvas.style.height = "100%";
	container.replaceChildren(canvas);
	return canvas;
}

function createCubeData() {
	const p = 0.5;
	const positions = new Float32Array([
		-p, -p,  p,  p, -p,  p,  p,  p,  p, -p,  p,  p,
		 p, -p, -p, -p, -p, -p, -p,  p, -p,  p,  p, -p,
		-p, -p, -p, -p, -p,  p, -p,  p,  p, -p,  p, -p,
		 p, -p,  p,  p, -p, -p,  p,  p, -p,  p,  p,  p,
		-p,  p,  p,  p,  p,  p,  p,  p, -p, -p,  p, -p,
		-p, -p, -p,  p, -p, -p,  p, -p,  p, -p, -p,  p,
	]);
	const uvs = new Float32Array([
		0, 1, 1, 1, 1, 0, 0, 0,
		0, 1, 1, 1, 1, 0, 0, 0,
		1, 1, 0, 1, 0, 0, 1, 0,
		1, 1, 0, 1, 0, 0, 1, 0,
		0, 1, 1, 1, 1, 0, 0, 0,
		0, 1, 1, 1, 1, 0, 0, 0,
	]);
	const normals = new Float32Array(positions.length);
	const faceNormals = [
		[0, 0, 1],
		[0, 0, -1],
		[-1, 0, 0],
		[1, 0, 0],
		[0, 1, 0],
		[0, -1, 0],
	];
	for (let face = 0; face < faceNormals.length; face++) {
		for (let i = 0; i < 4; i++) {
			normals.set(faceNormals[face], (face * 4 + i) * 3);
		}
	}

	const count = positions.length / 3;
	const boneIDs = new Float32Array(count * 4);
	const boneWeights = new Float32Array(count * 4);
	for (let i = 0; i < count; i++) {
		const topHalf = positions[i * 3 + 1] > 0;
		boneIDs[i * 4] = topHalf ? 1 : 0;
		boneWeights[i * 4] = 1;
	}

	return {
		vertices: ExtWGPU.Mesh.packVertices({ positions, normals, uvs, boneIDs, boneWeights }),
		indices: new Uint16Array([
			 0,  1,  2,  0,  2,  3,
			 4,  5,  6,  4,  6,  7,
			 8,  9, 10,  8, 10, 11,
			12, 13, 14, 12, 14, 15,
			16, 17, 18, 16, 18, 19,
			20, 21, 22, 20, 22, 23,
		]),
		submeshes: [
			{ name: "side-front", indexStart: 0, indexCount: 6 },
			{ name: "side-back", indexStart: 6, indexCount: 6 },
			{ name: "side-left", indexStart: 12, indexCount: 6 },
			{ name: "side-right", indexStart: 18, indexCount: 6 },
			{ name: "cap-top", indexStart: 24, indexCount: 6 },
			{ name: "cap-bottom", indexStart: 30, indexCount: 6 },
		],
	};
}

function createInstanceState() {
	return new Float32Array([
		-1.65, 0.0, 0.0, 0.0, 0.00, 0.85, 0.0, 0.26,
		 0.00, 0.0, -0.35, 0.0, 1.70, 1.15, 1.7, 0.30,
		 1.65, 0.0, 0.0, 0.0, 3.10, 0.65, 3.1, 0.23,
	]);
}

async function loadShaderCode() {
	return Other.Loader.readWGSL(SCENE_SHADER_URL);
}

async function run() {
	// ---------- Runtime
	const canvas = createCanvas();
	const backend = await Awgpu.Backend.create(canvas);
	const device = backend.device;
	const usage = GPUBufferUsage;

	const camera = new Acamera({
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

	// ---------- Source modules
	const sceneCode = await loadShaderCode();
	const sceneShader = ExtWGPU.ShaderBuilder.create({
		backend,
		label: "WR3SceneShader",
		source: sceneCode,
		cfg: {
			testGroup: 0,
			deformGroup: 1,
			maxBones: 2,
			maxMorphs: 4,
		},
		keys: {
			"$STD_TEST_BINDINGS$": ({ cfg }) => `
@group(${cfg.testGroup}) @binding(0) var<uniform> scene: Scene;
@group(${cfg.testGroup}) @binding(1) var texSampler: sampler;
@group(${cfg.testGroup}) @binding(2) var tex: texture_2d<f32>;
@group(${cfg.testGroup}) @binding(3) var<uniform> params: ComputeParams;
@group(${cfg.testGroup}) @binding(4) var<storage, read_write> states: array<InstanceState>;
@group(${cfg.testGroup}) @binding(5) var<storage, read_write> models: array<mat4x4f>;
@group(${cfg.testGroup}) @binding(6) var<uniform> gradient: GradientTime;`,
			"$VIEW_PROJ$": "scene.viewProj",
			"$ALBEDO_TEXTURE$": "tex",
			"$ALBEDO_SAMPLER$": "texSampler",
		},
	});
	const sceneModule = sceneShader.module;

	// ---------- Cube mesh
	const cubeData = createCubeData();
	const cubeMesh = new ExtWGPU.Mesh({
		backend,
		label: "WR3CubeMesh",
		vertices: cubeData.vertices,
		indices: cubeData.indices,
		skeleton: {
			joints: [
				{ name: "base", parentIndex: -1 },
				{ name: "top", parentIndex: -1 },
			],
		},
		submeshes: cubeData.submeshes,
	});
	cubeMesh.vertexLayout = [
		ExtWGPU.Mesh.STD_VERTEX_BUFFER,
		{
			arrayStride: 64,
			stepMode: "instance",
			attributes: [
				{ shaderLocation: 7, offset: 0, format: "float32x4" },
				{ shaderLocation: 8, offset: 16, format: "float32x4" },
				{ shaderLocation: 9, offset: 32, format: "float32x4" },
				{ shaderLocation: 10, offset: 48, format: "float32x4" },
			],
		},
	];
	const deformBindGroupLayout = device.createBindGroupLayout({
		label: "WR3DeformBGL",
		entries: [
			{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
			{ binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
		],
	});
	const cubeDeform = cubeMesh.createDeform({
		backend,
		bindGroupLayout: deformBindGroupLayout,
		groupIndex: 1,
		morphCount: 1,
	});

	// ---------- Cube render shared state
	const cubeRender = {
		sceneBuffer: device.createBuffer({
			label: "WR3SceneBuffer",
			size: 64,
			usage: usage.UNIFORM | usage.COPY_DST,
		}),
		sampler: device.createSampler({
			magFilter: "linear",
			minFilter: "linear",
			addressModeU: "repeat",
			addressModeV: "repeat",
		}),
		bindGroupLayout: device.createBindGroupLayout({
			label: "WR3RenderBGL",
			entries: [
				{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } },
				{ binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
				{ binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
			],
		}),
		bindEntry: { index: 0, bindGroup: null },
		depth: {
			format: backend.depthFormat,
			depthWriteEnabled: true,
			depthCompare: "less",
		},
	};
	cubeRender.pipelineLayout = device.createPipelineLayout({
		label: "WR3RenderPipelineLayout",
		bindGroupLayouts: [cubeRender.bindGroupLayout, deformBindGroupLayout],
	});

	// ---------- Main cube render
	const mainRender = {
		pipeline: device.createRenderPipeline({
			label: "WR3InstancedCubePipeline",
			layout: cubeRender.pipelineLayout,
			vertex: {
				module: sceneModule,
				entryPoint: "vs_main",
				buffers: cubeMesh.vertexLayout,
			},
			fragment: {
				module: sceneModule,
				entryPoint: "fs_main",
				targets: [{ format: backend.format }],
			},
			primitive: {
				topology: "triangle-list",
				cullMode: "back",
			},
			depthStencil: cubeRender.depth,
		}),
	};

	// ---------- Outline cube render
	const outlineRender = {
		pipeline: device.createRenderPipeline({
			label: "WR3InstancedCubeOutlinePipeline",
			layout: cubeRender.pipelineLayout,
			vertex: {
				module: sceneModule,
				entryPoint: "vs_outline",
				buffers: cubeMesh.vertexLayout,
			},
			fragment: {
				module: sceneModule,
				entryPoint: "fs_outline",
				targets: [{ format: backend.format }],
			},
			primitive: {
				topology: "triangle-list",
				cullMode: "front",
			},
			depthStencil: cubeRender.depth,
		}),
	};

	// ---------- Instance compute
	const instanceCompute = {
		params: new Float32Array(4),
		paramsBuffer: null,
		stateBuffer: makeBuffer(device, "WR3InstanceStateBuffer", createInstanceState(), usage.STORAGE | usage.COPY_DST),
		instanceBuffer: device.createBuffer({
			label: "WR3InstanceBuffer",
			size: 16 * INSTANCE_COUNT * 4,
			usage: usage.VERTEX | usage.STORAGE | usage.COPY_DST,
		}),
		bindGroupLayout: device.createBindGroupLayout({
			label: "WR3ComputeBGL",
			entries: [
				{ binding: 3, visibility: GPUShaderStage.COMPUTE, buffer: { type: "uniform" } },
				{ binding: 4, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
				{ binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: "storage" } },
			],
		}),
	};
	instanceCompute.paramsBuffer = device.createBuffer({
		label: "WR3ComputeParams",
		size: instanceCompute.params.byteLength,
		usage: usage.UNIFORM | usage.COPY_DST,
	});
	instanceCompute.pipelineLayout = device.createPipelineLayout({
		label: "WR3ComputePipelineLayout",
		bindGroupLayouts: [instanceCompute.bindGroupLayout],
	});
	instanceCompute.pipeline = device.createComputePipeline({
		label: "WR3InstanceComputePipeline",
		layout: instanceCompute.pipelineLayout,
		compute: {
			module: sceneModule,
			entryPoint: "cs_main",
		},
	});
	instanceCompute.bindGroup = device.createBindGroup({
		label: "WR3ComputeBindGroup",
		layout: instanceCompute.bindGroupLayout,
		entries: [
			{ binding: 3, resource: { buffer: instanceCompute.paramsBuffer } },
			{ binding: 4, resource: { buffer: instanceCompute.stateBuffer } },
			{ binding: 5, resource: { buffer: instanceCompute.instanceBuffer } },
		],
	});

	// ---------- Gradient texture pass
	const gradient = {
		time: new Float32Array(4),
		timeBuffer: null,
		texture: null,
		passOptions: {
			label: "gradient-to-texture",
			colorAttachments: [],
			depthStencilAttachment: null,
		},
		bindGroupLayout: device.createBindGroupLayout({
			label: "WR3GradientBGL",
			entries: [
				{ binding: 6, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
			],
		}),
	};
	gradient.timeBuffer = device.createBuffer({
		label: "WR3GradientTime",
		size: gradient.time.byteLength,
		usage: usage.UNIFORM | usage.COPY_DST,
	});
	gradient.pipelineLayout = device.createPipelineLayout({
		label: "WR3GradientPipelineLayout",
		bindGroupLayouts: [gradient.bindGroupLayout],
	});
	gradient.pipeline = device.createRenderPipeline({
		label: "WR3GradientPipeline",
		layout: gradient.pipelineLayout,
		vertex: {
			module: sceneModule,
			entryPoint: "vs_gradient",
		},
		fragment: {
			module: sceneModule,
			entryPoint: "fs_gradient",
			targets: [{ format: "rgba8unorm" }],
		},
		primitive: {
			topology: "triangle-list",
		},
	});
	gradient.bindGroup = device.createBindGroup({
		label: "WR3GradientBG",
		layout: gradient.bindGroupLayout,
		entries: [
			{ binding: 6, resource: { buffer: gradient.timeBuffer } },
		],
	});
	gradient.resizeTarget = () => {
		const side = Math.max(1, canvas.width | 0, canvas.height | 0);
		const width = side;
		const height = side;
		if (gradient.texture?.width === width && gradient.texture?.height === height) return;

		gradient.texture?.texture?.destroy?.();
		const texture = device.createTexture({
			label: "WR3GradientTarget",
			size: [width, height, 1],
			format: "rgba8unorm",
			usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
		});
		const view = texture.createView();
		gradient.texture = { texture, view, width, height };
		gradient.passOptions.colorAttachments = [{
			view,
			loadOp: "clear",
			storeOp: "store",
			clearValue: [0.0, 0.0, 0.0, 1.0],
		}];
		cubeRender.bindEntry.bindGroup = device.createBindGroup({
			label: "WR3CubeBindGroup",
			layout: cubeRender.bindGroupLayout,
			entries: [
				{ binding: 0, resource: { buffer: cubeRender.sceneBuffer } },
				{ binding: 1, resource: cubeRender.sampler },
				{ binding: 2, resource: view },
			],
		});
	};
	gradient.resizeTarget();

	const resize = () => {
		backend.resize({ maxPixelRatio: 2 });
		const w = Math.max(1, canvas.clientWidth || canvas.width || 1);
		const h = Math.max(1, canvas.clientHeight || canvas.height || 1);
		camera.aspect = w / h;
		gradient.resizeTarget();
	};
	resize();
	new ResizeObserver(resize).observe(container);

	// ---------- Render graph
	const ctx = new Ctx();
	const root = ctx.addNode();
	root.addComp(new Awgpu.BeginFrame());

	const gradientCycle = root.addChild();
	const gradientPass = gradientCycle.addChild();
	gradientPass.addComp(new Awgpu.RenderPass(gradient.passOptions));

	const gradientDraw = gradientPass.addChild();
	gradientDraw.addComp(new Awgpu.UsePipeline(gradient.pipeline));
	gradientDraw.addComp(new Awgpu.SetBindGroups([
		{ index: 0, bindGroup: gradient.bindGroup },
	]));
	gradientDraw.addComp(new Awgpu.Draw({ vertexCount: 3 }));

	const gradientEnd = gradientCycle.addChild();
	gradientEnd.addComp(new Awgpu.EndPass());

	const computeCycle = root.addChild();
	const compute = computeCycle.addChild();
	compute.addComp(new Awgpu.ComputePass({ label: "compute-instances" }));
	compute.addComp(new Awgpu.UsePipeline(instanceCompute.pipeline));
	compute.addComp(new Awgpu.SetBindGroups([
		{ index: 0, bindGroup: instanceCompute.bindGroup },
	]));
	compute.addComp(new Awgpu.Dispatch({ x: 1 }));

	const computeEnd = computeCycle.addChild();
	computeEnd.addComp(new Awgpu.EndPass());

	const mainCycle = root.addChild();
	const pass = mainCycle.addChild();
	pass.addComp(new Awgpu.RenderPass({
		clearColor: [0, 0, 0, 1],
		clearDepth: 1,
		useDepth: true,
	}));

	const outlineShader = pass.addChild();
	outlineShader.addComp(new Awgpu.UsePipeline(outlineRender.pipeline));

	const mainShader = pass.addChild();
	mainShader.addComp(new Awgpu.UsePipeline(mainRender.pipeline));

	const cubeState = ctx.addNode();
	outlineShader.linkChild(cubeState);
	mainShader.linkChild(cubeState);
	cubeState.addComp(new Awgpu.SetBindGroups([cubeRender.bindEntry]));
	cubeState.addComp(new Awgpu.SetBuffers({
		vertex: [
			{ slot: 1, buffer: instanceCompute.instanceBuffer },
		],
	}));
	const cubeDeformNode = cubeDeform.attach(ctx, cubeState);
	const cubeDraw = cubeMesh.attach(ctx, cubeDeformNode ?? cubeState, {
		instanceCount: INSTANCE_COUNT,
	});

	const mainEnd = mainCycle.addChild();
	mainEnd.addComp(new Awgpu.EndPass());

	const frameEnd = root.addChild();
	frameEnd.addComp(new Awgpu.EndFrame());

	// ---------- Frame loop
	const topBoneMatrix = new Float32Array(16);
	let last = performance.now();
	function frame(now) {
		const dt = Math.max(0, (now - last) * 0.001);
		last = now;
		fcam.update(dt);

		const viewProj = Alm.Mat4.mul(camera.projection, camera.view);
		device.queue.writeBuffer(cubeRender.sceneBuffer, 0, viewProj);

		gradient.time[0] = now * 0.001;
		gradient.time[1] = Math.max(1, gradient.texture?.width || canvas.width || 1);
		gradient.time[2] = Math.max(1, gradient.texture?.height || canvas.height || 1);
		gradient.time[3] = 0;
		device.queue.writeBuffer(gradient.timeBuffer, 0, gradient.time);

		instanceCompute.params[0] = now * 0.001;
		instanceCompute.params[1] = dt;
		instanceCompute.params[2] = INSTANCE_COUNT;
		instanceCompute.params[3] = 0;
		device.queue.writeBuffer(instanceCompute.paramsBuffer, 0, instanceCompute.params);

		cubeDeform.setWorldBone(0, Alm.Mat4.IDENTITY);
		Alm.Mat4.fromTranslation([
			Math.sin(now * 0.0021) * 0.32,
			Math.sin(now * 0.0013) * 0.08,
			Math.cos(now * 0.0017) * 0.12,
		], topBoneMatrix);
		cubeDeform.setWorldBone(1, topBoneMatrix);
		cubeDeform.setMorph(0, 0.06 + Math.sin(now * 0.003) * 0.05);
		cubeDeform.write();

		ctx.exec(root, backend.newState());
		requestAnimationFrame(frame);
	}
	requestAnimationFrame(frame);

	if (typeof window !== "undefined") {
		window.wr3 = { backend, ctx, root, sceneShader, gradient, instanceCompute, cubeMesh, cubeDeform, cubeDraw, cubeRender, mainRender, outlineRender, camera, fcam };
	}
}

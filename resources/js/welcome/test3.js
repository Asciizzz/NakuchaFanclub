import { AzCamera } from "../AzLib/AzCamera.js";
import * as Azm from "../AzLib/Azm.js";
import { FCamera } from "./FCamera.js";
import { ExtWGPU, WrCtx, WrWGPU } from "../WeebRender3/index.js";

const container = document.getElementById("main-canvas");
const INSTANCE_COUNT = 3;
const SCENE_SHADER_URL = new URL("./shaders/scene4.wgsl", import.meta.url).href;

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

function createCanvas() {
	const canvas = document.createElement("canvas");
	canvas.id = "wr-canvas-3";
	canvas.style.width = "100%";
	canvas.style.height = "100%";
	container.replaceChildren(canvas);
	return canvas;
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

async function loadShaderCode() {
	return ExtWGPU.Loader.readWGSL(SCENE_SHADER_URL);
}

async function run() {
	// ---------- Runtime
	const canvas = createCanvas();
	const backend = await WrWGPU.Backend.create(canvas);
	const device = backend.device;
	const usage = GPUBufferUsage;

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

	// ---------- Source modules
	const sceneCode = await loadShaderCode();
	const sceneModule = device.createShaderModule({
		label: "WR3SceneShader",
		code: sceneCode,
	});

	// ---------- Cube mesh
	const cube = createCube();
	const cubeMesh = {
		indexCount: cube.indices.length,
		vertexBuffer: makeBuffer(device, "WR3CubeVertexBuffer", cube.vertices, usage.VERTEX | usage.COPY_DST),
		indexBuffer: makeBuffer(device, "WR3CubeIndexBuffer", cube.indices, usage.INDEX | usage.COPY_DST),
		vertexLayout: [
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
	};

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
		bindGroupLayouts: [cubeRender.bindGroupLayout],
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
	const ctx = new WrCtx();
	const runner = new WrWGPU.Runner({ backend });
	const root = ctx.addNode();
	root.addComp(new WrWGPU.BeginFrame());

	const gradientPass = root.addChild();
	gradientPass.addComp(new WrWGPU.RenderPass(gradient.passOptions));

	const gradientDraw = gradientPass.addChild();
	gradientDraw.addComp(new WrWGPU.UsePipeline(gradient.pipeline));
	gradientDraw.addComp(new WrWGPU.SetBindGroups([
		{ index: 0, bindGroup: gradient.bindGroup },
	]));
	gradientDraw.addComp(new WrWGPU.Draw({ vertexCount: 3 }));
	gradientDraw.addComp(new WrWGPU.EndPass());

	const compute = root.addChild();
	compute.addComp(new WrWGPU.ComputePass({ label: "compute-instances" }));
	compute.addComp(new WrWGPU.UsePipeline(instanceCompute.pipeline));
	compute.addComp(new WrWGPU.SetBindGroups([
		{ index: 0, bindGroup: instanceCompute.bindGroup },
	]));
	compute.addComp(new WrWGPU.Dispatch({ x: 1 }));
	compute.addComp(new WrWGPU.EndPass());

	const pass = root.addChild();
	pass.addComp(new WrWGPU.RenderPass({
		clearColor: [0, 0, 0, 1],
		clearDepth: 1,
		useDepth: true,
	}));

	const outlineShader = pass.addChild();
	outlineShader.addComp(new WrWGPU.UsePipeline(outlineRender.pipeline));

	const mainShader = pass.addChild();
	mainShader.addComp(new WrWGPU.UsePipeline(mainRender.pipeline));

	const cubes = ctx.addNode();
	outlineShader.linkChild(cubes);
	mainShader.linkChild(cubes);
	cubes.addComp(new WrWGPU.SetBindGroups([cubeRender.bindEntry]));
	cubes.addComp(new WrWGPU.SetBuffers({
		vertex: [
			{ slot: 0, buffer: cubeMesh.vertexBuffer },
			{ slot: 1, buffer: instanceCompute.instanceBuffer },
		],
		index: {
			buffer: cubeMesh.indexBuffer,
			format: "uint16",
		},
	}));
	cubes.addComp(new WrWGPU.DrawIndexed({
		indexCount: cubeMesh.indexCount,
		instanceCount: INSTANCE_COUNT,
	}));

	// ---------- Frame loop
	let last = performance.now();
	function frame(now) {
		const dt = Math.max(0, (now - last) * 0.001);
		last = now;
		fcam.update(dt);

		const viewProj = Azm.Mat4.mul(camera.projection, camera.view);
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

		runner.run(root);
		requestAnimationFrame(frame);
	}
	requestAnimationFrame(frame);

	if (typeof window !== "undefined") {
		window.wr3 = { backend, ctx, runner, root, gradient, instanceCompute, cubeMesh, cubeRender, mainRender, outlineRender, camera, fcam };
	}
}

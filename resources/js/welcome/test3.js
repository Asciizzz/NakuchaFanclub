import { Acamera } from "../Alib/Acamera.js";
import * as Alm from "../Alib/Alm.js";
import { Awgpu } from "../Alib/Awgpu/index.js";
import { Aflow, Afstep } from "../Alib/Aflow.js";
import { Agraph } from "../Alib/Agraph.js";
import { FCamera } from "./FCamera.js";
import { Other } from "../WeebRenderBeta/index.js";

const container = document.getElementById("main-canvas");
const INSTANCE_COUNT = 3;
const SCENE_SHADER_URL = new URL("./shaders/scene4.wgsl", import.meta.url).href;
const STD_VERTEX_STRIDE = 96;
const STD_VERTEX_BUFFER = Object.freeze({
	arrayStride: STD_VERTEX_STRIDE,
	attributes: Object.freeze([
		Object.freeze({ shaderLocation: 0, offset: 0, format: "float32x3" }),
		Object.freeze({ shaderLocation: 1, offset: 12, format: "float32x3" }),
		Object.freeze({ shaderLocation: 2, offset: 24, format: "float32x2" }),
		Object.freeze({ shaderLocation: 3, offset: 32, format: "float32x4" }),
		Object.freeze({ shaderLocation: 4, offset: 48, format: "float32x4" }),
		Object.freeze({ shaderLocation: 5, offset: 64, format: "float32x4" }),
		Object.freeze({ shaderLocation: 6, offset: 80, format: "float32x4" }),
	]),
});

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

function packVertices(attributes = {}) {
	const positions = attributes.positions ?? [];
	const count = Math.max(0, Number(attributes.count ?? (positions.length / 3)) | 0);
	const out = new Float32Array(count * 24);
	for (let i = 0; i < count; i++) {
		const o = i * 24;
		out[o + 0] = positions[i * 3 + 0] ?? 0;
		out[o + 1] = positions[i * 3 + 1] ?? 0;
		out[o + 2] = positions[i * 3 + 2] ?? 0;
		out[o + 3] = attributes.normals?.[i * 3 + 0] ?? 0;
		out[o + 4] = attributes.normals?.[i * 3 + 1] ?? 1;
		out[o + 5] = attributes.normals?.[i * 3 + 2] ?? 0;
		out[o + 6] = attributes.uvs?.[i * 2 + 0] ?? 0;
		out[o + 7] = attributes.uvs?.[i * 2 + 1] ?? 0;
		out[o + 8] = attributes.tangents?.[i * 4 + 0] ?? 1;
		out[o + 9] = attributes.tangents?.[i * 4 + 1] ?? 0;
		out[o + 10] = attributes.tangents?.[i * 4 + 2] ?? 0;
		out[o + 11] = attributes.tangents?.[i * 4 + 3] ?? 1;
		out[o + 12] = attributes.colors?.[i * 4 + 0] ?? 1;
		out[o + 13] = attributes.colors?.[i * 4 + 1] ?? 1;
		out[o + 14] = attributes.colors?.[i * 4 + 2] ?? 1;
		out[o + 15] = attributes.colors?.[i * 4 + 3] ?? 1;
		out[o + 16] = attributes.boneIDs?.[i * 4 + 0] ?? 0;
		out[o + 17] = attributes.boneIDs?.[i * 4 + 1] ?? 0;
		out[o + 18] = attributes.boneIDs?.[i * 4 + 2] ?? 0;
		out[o + 19] = attributes.boneIDs?.[i * 4 + 3] ?? 0;
		out[o + 20] = attributes.boneWeights?.[i * 4 + 0] ?? 0;
		out[o + 21] = attributes.boneWeights?.[i * 4 + 1] ?? 0;
		out[o + 22] = attributes.boneWeights?.[i * 4 + 2] ?? 0;
		out[o + 23] = attributes.boneWeights?.[i * 4 + 3] ?? 0;
	}
	return out;
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
	return {
		vertices: packVertices({ positions, uvs }),
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
	return Other.readText(SCENE_SHADER_URL);
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
	const sceneModule = device.createShaderModule({
		label: "WR3SceneShader",
		code: sceneCode,
	});

	// ---------- Cube mesh
	const cubeData = createCubeData();
	const cubeMesh = {
		vertexBuffer: makeBuffer(device, "WR3CubeVertexBuffer", cubeData.vertices, usage.VERTEX | usage.COPY_DST),
		indexBuffer: makeBuffer(device, "WR3CubeIndexBuffer", cubeData.indices, usage.INDEX | usage.COPY_DST),
		indexFormat: "uint16",
		submeshes: cubeData.submeshes,
		vertexLayout: [
			STD_VERTEX_BUFFER,
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
	const flow = new Aflow(new Agraph({ label: "WR3" }));
	const rootNode = flow.addNode({ payload: [new Awgpu.BeginFrame()] });
	const rootId = rootNode.id;

	const gradientNode = flow.addNode({ payload: [
		new Awgpu.RenderPass(gradient.passOptions),
		new Awgpu.UsePipeline(gradient.pipeline),
		new Awgpu.SetBindGroups([{ index: 0, bindGroup: gradient.bindGroup }]),
		new Awgpu.Draw({ vertexCount: 3 }),
		new Awgpu.EndPass()
	]});

	const computeNode = flow.addNode({ payload: [
		new Awgpu.ComputePass({ label: "compute-instances" }),
		new Awgpu.UsePipeline(instanceCompute.pipeline),
		new Awgpu.SetBindGroups([{ index: 0, bindGroup: instanceCompute.bindGroup }]),
		new Awgpu.Dispatch({ x: 1 }),
		new Awgpu.EndPass()
	]});

	const mainPassNode = flow.addNode({ payload: [
		new Awgpu.RenderPass({
			clearColor: [0, 0, 0, 1],
			clearDepth: 1,
			useDepth: true,
		})
	]});

	const outlineShaderNode = flow.addNode({ payload: [new Awgpu.UsePipeline(outlineRender.pipeline)] });
	const mainShaderNode = flow.addNode({ payload: [new Awgpu.UsePipeline(mainRender.pipeline)] });

	const cubeStateNode = flow.addNode({ payload: [
		new Awgpu.SetBindGroups([cubeRender.bindEntry]),
		new Awgpu.SetBuffers({
			vertex: [
				{ slot: 0, buffer: cubeMesh.vertexBuffer },
				{ slot: 1, buffer: instanceCompute.instanceBuffer },
			],
			index: {
				buffer: cubeMesh.indexBuffer,
				format: cubeMesh.indexFormat,
			},
		})
	]});

	const drawNodes = cubeMesh.submeshes.map(submesh => flow.addNode({
		payload: [
			new Awgpu.DrawIndexed({
				indexCount: submesh.indexCount,
				instanceCount: INSTANCE_COUNT,
				firstIndex: submesh.indexStart,
				baseVertex: submesh.vertexStart ?? 0,
			})
		]
	}));

	const mainEndNode = flow.addNode({ payload: [new Awgpu.EndPass()] });
	const frameEndNode = flow.addNode({ payload: [new Awgpu.EndFrame()] });

	// Topology
	flow.addLink({ srcId: rootId, dstId: gradientNode.id });
	flow.addLink({ srcId: gradientNode.id, dstId: computeNode.id });
	flow.addLink({ srcId: computeNode.id, dstId: mainPassNode.id });
	
	flow.addLink({ srcId: mainPassNode.id, dstId: outlineShaderNode.id, data: { order: 0 } });
	flow.addLink({ srcId: mainPassNode.id, dstId: mainShaderNode.id, data: { order: 1 } });
	
	flow.addLink({ srcId: outlineShaderNode.id, dstId: cubeStateNode.id });
	flow.addLink({ srcId: mainShaderNode.id, dstId: cubeStateNode.id });

	for (const drawNode of drawNodes) {
		flow.addLink({ srcId: cubeStateNode.id, dstId: drawNode.id });
		flow.addLink({ srcId: drawNode.id, dstId: mainEndNode.id });
	}

	flow.addLink({ srcId: mainEndNode.id, dstId: frameEndNode.id });

	// ---------- Frame loop
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

		flow.run({ from: rootId, ctx: backend.newCtx() });
		requestAnimationFrame(frame);
	}
	requestAnimationFrame(frame);

	if (typeof window !== "undefined") {
		window.wr3 = { backend, flow, rootId, gradient, instanceCompute, cubeMesh, drawNodes, cubeRender, mainRender, outlineRender, camera, fcam };
	}
}

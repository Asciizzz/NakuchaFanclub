import { Acamera } from "../Alib/Acamera.js";
import * as Alm from "../Alib/Alm.js";
import { Awgpu } from "../Alib/Awgpu/index.js";
import { Ctx } from "../Alib/AwDAG.js";
import { FCamera } from "./FCamera.js";
import { WrGPU } from "../WeebRender3/index.js";

const container = document.getElementById("main-canvas");

run().catch((error) => {
	console.error("[WR3WorldTest] fatal", error);
});

function createCanvas() {
	const canvas = document.createElement("canvas");
	canvas.id = "wr-canvas-3";
	canvas.style.width = "100%";
	canvas.style.height = "100%";
	container.replaceChildren(canvas);
	return canvas;
}

function createBuffer(device, label, size, usage) {
	return device.createBuffer({ label, size, usage });
}

function createWhiteTexture(device) {
	const texture = device.createTexture({
		label: "WR3WhiteTexture",
		size: [1, 1, 1],
		format: "rgba8unorm",
		usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST | GPUTextureUsage.RENDER_ATTACHMENT,
	});
	const canvas = document.createElement("canvas");
	canvas.width = 1;
	canvas.height = 1;
	const ctx = canvas.getContext("2d");
	ctx.fillStyle = "#fff";
	ctx.fillRect(0, 0, 1, 1);
	device.queue.copyExternalImageToTexture(
		{ source: canvas, flipY: false },
		{ texture },
		{ width: 1, height: 1 },
	);
	const sampler = device.createSampler({
		magFilter: "linear",
		minFilter: "linear",
		mipmapFilter: "linear",
		addressModeU: "repeat",
		addressModeV: "repeat",
	});
	return { texture, view: texture.createView(), sampler };
}

function objectShaderSource() {
	return `
struct Scene {
	viewProj: mat4x4f,
	lightDir: vec4f,
	time: vec4f,
}

@group(0) @binding(0) var<uniform> scene: Scene;
$SKIN_BIND$
$MORPH_BIND$
$MATERIAL_BIND$
$MODEL_BIND$
$SKIN_FN$

struct VertexIn {
$VERTEX_FIELDS$
}

struct VertexOut {
	@builtin(position) position: vec4f,
	@location(0) uv: vec2f,
	@location(1) normal: vec3f,
}

fn identity4() -> mat4x4f {
	return mat4x4f(
		vec4f(1.0, 0.0, 0.0, 0.0),
		vec4f(0.0, 1.0, 0.0, 0.0),
		vec4f(0.0, 0.0, 1.0, 0.0),
		vec4f(0.0, 0.0, 0.0, 1.0)
	);
}

fn vertexSkin(input: VertexIn) -> mat4x4f {
	let wsum = input.boneWeight.x + input.boneWeight.y + input.boneWeight.z + input.boneWeight.w;
	if (wsum <= 0.00001) {
		return identity4();
	}
	return skinMatrix(input.boneID, input.boneWeight);
}

@vertex
fn vs_main(input: VertexIn) -> VertexOut {
	let skinMat = vertexSkin(input);
	let localPos = skinMat * vec4f(input.position, 1.0);
	let localNrm = normalize((skinMat * vec4f(input.normal, 0.0)).xyz);
	var out: VertexOut;
	out.position = scene.viewProj * model.modelMat * localPos;
	out.uv = input.uv;
	out.normal = normalize((model.modelMat * vec4f(localNrm, 0.0)).xyz);
	return out;
}

@fragment
fn fs_main(input: VertexOut) -> @location(0) vec4f {
	let tex = textureSample(albedoTexture, albedoSampler, input.uv);
	let lit = max(0.18, dot(normalize(input.normal), normalize(scene.lightDir.xyz)));
	let rgb = tex.rgb * material.albedoColor.rgb * (0.62 + 0.38 * lit);
	return vec4f(rgb, tex.a * material.albedoColor.a);
}

@vertex
fn vs_outline(input: VertexIn) -> VertexOut {
	let skinMat = vertexSkin(input);
	let localPos = skinMat * vec4f(input.position, 1.0);
	let localNrm = normalize((skinMat * vec4f(input.normal, 0.0)).xyz);
	let worldNrm = normalize((model.modelMat * vec4f(localNrm, 0.0)).xyz);
	let worldPos = (model.modelMat * localPos).xyz + worldNrm * model.outlineThickness.x;
	var out: VertexOut;
	out.position = scene.viewProj * vec4f(worldPos, 1.0);
	out.uv = input.uv;
	out.normal = worldNrm;
	return out;
}

@fragment
fn fs_outline(_input: VertexOut) -> @location(0) vec4f {
	return vec4f(0.025, 0.018, 0.04, 1.0);
}
`;
}

function backgroundShaderSource() {
	return `
struct Background {
	time: vec4f,
	resolution: vec4f,
}

@group(0) @binding(0) var<uniform> bg: Background;

struct BgOut {
	@builtin(position) position: vec4f,
	@location(0) uv: vec2f,
}

@vertex
fn vs_main(@builtin(vertex_index) id: u32) -> BgOut {
	let pos = array<vec2f, 3>(
		vec2f(-1.0, -1.0),
		vec2f(3.0, -1.0),
		vec2f(-1.0, 3.0)
	);
	let p = pos[id];
	var out: BgOut;
	out.position = vec4f(p, 0.0, 1.0);
	out.uv = p * 0.5 + vec2f(0.5);
	return out;
}

fn hash(p: vec2f) -> f32 {
	return fract(sin(dot(p, vec2f(127.1, 311.7))) * 43758.5453);
}

fn noise(p: vec2f) -> f32 {
	let i = floor(p);
	let f = fract(p);
	let u = f * f * (vec2f(3.0) - 2.0 * f);
	return mix(
		mix(hash(i), hash(i + vec2f(1.0, 0.0)), u.x),
		mix(hash(i + vec2f(0.0, 1.0)), hash(i + vec2f(1.0, 1.0)), u.x),
		u.y
	);
}

@fragment
fn fs_main(input: BgOut) -> @location(0) vec4f {
	let res = max(bg.resolution.xy, vec2f(1.0));
	var uv = input.uv;
	uv.x *= res.x / res.y;
	let t = bg.time.x;
	let n = noise(uv * 5.0 + vec2f(t * 0.08, -t * 0.04));
	let band = 0.5 + 0.5 * cos((uv.x + n * 0.12 + t * 0.06) * 3.14159265);
	let pink = vec3f(0.92, 0.55, 0.82);
	let blue = vec3f(0.48, 0.62, 0.98);
	let purple = vec3f(0.34, 0.18, 0.58);
	let color = mix(mix(blue, pink, smoothstep(0.1, 0.95, band)), purple, uv.y * 0.45);
	return vec4f(color, 1.0);
}
`;
}

function createObjectShader(backend, sceneBindGroupLayout, deformBindGroupLayout, materialBindGroupLayout, modelBindGroupLayout) {
	const device = backend.device;
	const doc = new WrGPU.ShaderDoc();
	WrGPU.Mesh.createVertexLayout(doc, "$VERTEX_FIELDS$", { fieldsOnly: true });
	WrGPU.MeshDeform.createSkinBind(doc, "$SKIN_BIND$", { group: 1, binding: 0, maxBones: 128 });
	WrGPU.MeshDeform.createMorphBind(doc, "$MORPH_BIND$", { group: 1, binding: 1, maxMorphs: 64 });
	WrGPU.MeshDeform.createSkinFn(doc, "$SKIN_FN$");
	WrGPU.Material.createStandardBind(doc, "$MATERIAL_BIND$", { group: 2 });
	WrGPU.World.createModelLayout(doc, "$MODEL_BIND$", {
		group: 3,
		binding: 0,
		slot0: "outlineThickness",
	});
	doc.setRaw(objectShaderSource());

	const module = doc.createModule({ backend, label: "WR3WorldObjectShader" }).module;
	const layout = device.createPipelineLayout({
		label: "WR3WorldObjectPipelineLayout",
		bindGroupLayouts: [
			sceneBindGroupLayout,
			deformBindGroupLayout,
			materialBindGroupLayout,
			modelBindGroupLayout,
		],
	});
	const depthStencil = {
		format: backend.depthFormat,
		depthWriteEnabled: true,
		depthCompare: "less",
	};
	const mainPipeline = device.createRenderPipeline({
		label: "WR3WorldMainPipeline",
		layout,
		vertex: {
			module,
			entryPoint: "vs_main",
			buffers: [WrGPU.Mesh.STD_VERTEX_BUFFER],
		},
		fragment: {
			module,
			entryPoint: "fs_main",
			targets: [{ format: backend.format }],
		},
		primitive: {
			topology: "triangle-list",
			cullMode: "back",
		},
		depthStencil,
	});
	const outlinePipeline = device.createRenderPipeline({
		label: "WR3WorldOutlinePipeline",
		layout,
		vertex: {
			module,
			entryPoint: "vs_outline",
			buffers: [WrGPU.Mesh.STD_VERTEX_BUFFER],
		},
		fragment: {
			module,
			entryPoint: "fs_outline",
			targets: [{ format: backend.format }],
		},
		primitive: {
			topology: "triangle-list",
			cullMode: "front",
		},
		depthStencil,
	});
	return { doc, module, mainPipeline, outlinePipeline };
}

function createBackground(backend) {
	const device = backend.device;
	const buffer = createBuffer(device, "WR3BackgroundBuffer", 32, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
	const bindGroupLayout = device.createBindGroupLayout({
		label: "WR3BackgroundBGL",
		entries: [
			{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
		],
	});
	const bindGroup = device.createBindGroup({
		label: "WR3BackgroundBG",
		layout: bindGroupLayout,
		entries: [
			{ binding: 0, resource: { buffer } },
		],
	});
	const module = device.createShaderModule({
		label: "WR3BackgroundShader",
		code: backgroundShaderSource(),
	});
	const pipeline = device.createRenderPipeline({
		label: "WR3BackgroundPipeline",
		layout: device.createPipelineLayout({
			label: "WR3BackgroundPipelineLayout",
			bindGroupLayouts: [bindGroupLayout],
		}),
		vertex: {
			module,
			entryPoint: "vs_main",
		},
		fragment: {
			module,
			entryPoint: "fs_main",
			targets: [{ format: backend.format }],
		},
		primitive: {
			topology: "triangle-list",
		},
	});
	return {
		buffer,
		bindGroup,
		pipeline,
		data: new Float32Array(8),
	};
}

function createSceneBind(device) {
	const buffer = createBuffer(device, "WR3WorldSceneBuffer", 96, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
	const layout = device.createBindGroupLayout({
		label: "WR3WorldSceneBGL",
		entries: [
			{ binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
		],
	});
	const bindGroup = device.createBindGroup({
		label: "WR3WorldSceneBG",
		layout,
		entries: [
			{ binding: 0, resource: { buffer } },
		],
	});
	return {
		buffer,
		layout,
		bindGroup,
		data: new Float32Array(24),
	};
}

function createMaterialLayout(device) {
	return device.createBindGroupLayout({
		label: "WR3WorldMaterialBGL",
		entries: [
			{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
			{ binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: "float" } },
			{ binding: 2, visibility: GPUShaderStage.FRAGMENT, sampler: { type: "filtering" } },
		],
	});
}

function createDeformLayout(device) {
	return device.createBindGroupLayout({
		label: "WR3WorldDeformBGL",
		entries: [
			{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
			{ binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: "read-only-storage" } },
		],
	});
}

function createModelLayout(device) {
	return device.createBindGroupLayout({
		label: "WR3WorldModelBGL",
		entries: [
			{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: "uniform" } },
		],
	});
}

function createMaterialBindGroups(model, backend, layout, fallbackTexture) {
	const device = backend.device;
	const seen = new Set();
	const makeBindGroup = (material) => {
		const buffer = createBuffer(device, `WR3Material:${material.name}`, 16, GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST);
		device.queue.writeBuffer(buffer, 0, material.albedoColor);
		const tex = material.albedoTexture ?? fallbackTexture;
		const view = tex.view ?? fallbackTexture.view;
		const sampler = tex.sampler ?? fallbackTexture.sampler;
		material.bindGroup = device.createBindGroup({
			label: `WR3MaterialBG:${material.name}`,
			layout,
			entries: [
				{ binding: 0, resource: { buffer } },
				{ binding: 1, resource: view },
				{ binding: 2, resource: sampler },
			],
		});
	};
	const fallbackMaterial = new WrGPU.Material({
		name: "default",
		albedoColor: [1, 1, 1, 1],
		albedoTexture: fallbackTexture,
	});
	makeBindGroup(fallbackMaterial);

	for (const mesh of model.meshes) {
		for (const material of mesh.materials) {
			if (!material || seen.has(material)) continue;
			seen.add(material);
			makeBindGroup(material);
		}
		for (const submesh of mesh.submeshes) {
			if (!submesh.material) submesh.material = fallbackMaterial;
		}
	}
}

function setOutline(root, thickness) {
	for (const [node] of root.traverse({ from: root.id })) {
		for (const comp of node.components ?? []) {
			if (!(comp instanceof WrGPU.MeshRenderer)) continue;
			comp.modelData ??= new WrGPU.ModelData();
			comp.modelData.setSlot(0, [thickness, 0, 0, 0]);
		}
	}
}

async function run() {
	const canvas = createCanvas();
	const backend = await Awgpu.Backend.create(canvas);
	const device = backend.device;

	const camera = new Acamera({
		position: [0, 1.1, 4.5],
		near: 0.1,
		far: 250,
		fov: 45,
	});
	camera.lookAt([0, 1, 0]);

	const fcam = new FCamera({
		canvas,
		camera,
		cfg: {
			look: { sensitivity: 0.0022 },
			move: { walkSpeed: 2.8, sprintScale: 2.2 },
			zoom: { wheelScale: 0.04, minFov: 20, maxFov: 90 },
		},
	});
	fcam.attach();

	const scene = createSceneBind(device);
	const deformBindGroupLayout = createDeformLayout(device);
	const materialBindGroupLayout = createMaterialLayout(device);
	const modelBindGroupLayout = createModelLayout(device);
	const objectShader = createObjectShader(backend, scene.layout, deformBindGroupLayout, materialBindGroupLayout, modelBindGroupLayout);
	const background = createBackground(backend);
	const whiteTexture = createWhiteTexture(device);

	const world = new WrGPU.World({ backend });
	const loader = new WrGPU.Loader({ backend });
	const worldRoot = world.addNode(null);
	worldRoot.name = "world-root";

	const shaderNode = world.addNode(worldRoot);
	shaderNode.name = "object-shaders";
	shaderNode.addComp(new WrGPU.Shader({
		label: "outline",
		pipeline: objectShader.outlinePipeline,
		bindGroups: [
			{ index: 0, bindGroup: scene.bindGroup },
		],
	}));
	shaderNode.addComp(new WrGPU.Shader({
		label: "main",
		pipeline: objectShader.mainPipeline,
		bindGroups: [
			{ index: 0, bindGroup: scene.bindGroup },
		],
	}));

	const roomModel = await loader.loadModelFromURL("/Models/Room.glb");
	const nakuModel = await loader.loadModelFromURL("/Models/Nakurin.glb");
	createMaterialBindGroups(roomModel, backend, materialBindGroupLayout, whiteTexture);
	createMaterialBindGroups(nakuModel, backend, materialBindGroupLayout, whiteTexture);

	const roomRoot = world.instantiate(roomModel, shaderNode);
	const nakuRoot = world.instantiate(nakuModel, shaderNode);
	const roomTx = roomRoot?.components.find((comp) => comp instanceof WrGPU.Transform) ?? null;
	if (roomTx) Alm.Mat4.scale(roomTx.local, [0.5, 0.5, 0.5], roomTx.local);
	if (roomRoot) setOutline(roomRoot, 0.012);
	if (nakuRoot) setOutline(nakuRoot, 0.008);

	const resize = () => {
		backend.resize({ maxPixelRatio: 2 });
		const w = Math.max(1, canvas.clientWidth || canvas.width || 1);
		const h = Math.max(1, canvas.clientHeight || canvas.height || 1);
		camera.aspect = w / h;
	};
	resize();
	new ResizeObserver(resize).observe(container);

	const renderCtx = new Ctx();
	const root = renderCtx.addNode();
	root.addComp(new Awgpu.BeginFrame());

	const bgCycle = root.addChild();
	const bgPass = bgCycle.addChild();
	bgPass.addComp(new Awgpu.RenderPass({
		label: "wr3-background-pass",
		clearColor: [0, 0, 0, 1],
		clearDepth: 1,
		useDepth: true,
	}));
	const bgDraw = bgPass.addChild();
	bgDraw.addComp(new Awgpu.UsePipeline(background.pipeline));
	bgDraw.addComp(new Awgpu.SetBindGroups([{ index: 0, bindGroup: background.bindGroup }]));
	bgDraw.addComp(new Awgpu.Draw({ vertexCount: 3 }));
	bgCycle.addChild().addComp(new Awgpu.EndPass());

	const mainCycle = root.addChild();
	const mainPass = mainCycle.addChild();
	mainPass.addComp(new Awgpu.RenderPass({
		label: "wr3-world-pass",
		clearColorEnabled: false,
		clearDepth: 1,
		clearDepthEnabled: true,
		useDepth: true,
	}));
	const worldSlot = mainPass.addChild();
	const worldBinding = world.bind(worldSlot, {
		from: worldRoot,
		renderNow: false,
		backend,
		modelBindGroupLayout,
		deformBindGroupLayout,
		modelGroupIndex: 3,
		deformGroupIndex: 1,
		materialGroupIndex: 2,
	});
	mainCycle.addChild().addComp(new Awgpu.EndPass());

	root.addChild().addComp(new Awgpu.EndFrame());

	let last = performance.now();
	function frame(now) {
		const dt = Math.max(0, (now - last) * 0.001);
		last = now;
		fcam.update(dt);

		const viewProj = Alm.Mat4.mul(camera.projection, camera.view);
		scene.data.set(viewProj, 0);
		scene.data.set([0.5, 1.0, 0.5, 0.0], 16);
		scene.data.set([now * 0.001, dt, 0, 0], 20);
		device.queue.writeBuffer(scene.buffer, 0, scene.data);

		background.data.set([now * 0.001, dt, 0, 0], 0);
		background.data.set([canvas.width, canvas.height, 0, 0], 4);
		device.queue.writeBuffer(background.buffer, 0, background.data);

		worldBinding.render(worldRoot);
		renderCtx.exec(root, backend.newState());
		requestAnimationFrame(frame);
	}
	requestAnimationFrame(frame);

	if (typeof window !== "undefined") {
		window.wr3 = {
			backend,
			camera,
			fcam,
			world,
			loader,
			renderCtx,
			worldRoot,
			shaderNode,
			roomRoot,
			nakuRoot,
			worldBinding,
			objectShader,
			background,
		};
	}
}

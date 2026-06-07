import { Acamera } from "../Alib/Acamera.js";
import * as Alm from "../Alib/Alm.js";
import { Awgpu } from "../Alib/Awgpu/index.js";
import { Aflow, Afcmd } from "../Alib/Aflow.js";
import { Agraph } from "../Alib/Agraph.js";
import { FCamera } from "./FCamera.js";
import { Other, WrGPU } from "../WeebRender3/index.js";

const container = document.getElementById("main-canvas");
const SAMPLE_COUNT = 4;
const WELCOME_SHADER_URL = new URL("./shaders/welcome.wgsl", import.meta.url).href;

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

function createBackground(backend) {
	const device = backend.device;
	const buffer = device.createBuffer({
		label: "WR3BackgroundBuffer",
		size: 32,
		usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
	});
	const layout = device.createBindGroupLayout({
		label: "WR3BackgroundBGL",
		entries: [
			{ binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: "uniform" } },
		],
	});
	const bindGroup = device.createBindGroup({
		label: "WR3BackgroundBG",
		layout,
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
			bindGroupLayouts: [layout],
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
		multisample: {
			count: SAMPLE_COUNT,
		},
	});
	return {
		buffer,
		bindGroup,
		pipeline,
		data: new Float32Array(8),
	};
}

function createObjectShaders(world, source) {
	const doc = new WrGPU.Shader();
	world.createShader(doc, {
		label: "WR3WorldObjectShader",
		src: source,
		vertex: { slot: "$VERTEX_FIELDS$", fieldsOnly: true },
		skin: { slot: "$SKIN_BIND$", group: 1, binding: 0, maxBones: 128 },
		morph: { slot: "$MORPH_BIND$", group: 1, binding: 1, maxMorphs: 64 },
		skinFn: { slot: "$SKIN_FN$" },
		material: { slot: "$MATERIAL_BIND$", group: 2 },
		instance: { slot: "$INSTANCE_BIND$", group: 3, binding: 0, slot0: "outlineThickness" },
	});

	const outline = world.createRenderPipeline(new WrGPU.Shader("", {
		label: "outline",
		module: doc.module,
		meta: doc.meta,
	}), {
		label: "WR3WorldOutlinePipeline",
		module: doc.module,
		vertexEntry: "vs_outline",
		fragmentEntry: "fs_outline",
		cullMode: "front",
	});
	const main = world.createRenderPipeline(new WrGPU.Shader("", {
		label: "main",
		module: doc.module,
		meta: doc.meta,
	}), {
		label: "WR3WorldMainPipeline",
		module: doc.module,
		vertexEntry: "vs_main",
		fragmentEntry: "fs_main",
		cullMode: "back",
	});

	return { doc, outline, main };
}

function setOutline(root, thickness) {
	for (const node of root.traverse({ from: root.id })) {
		for (const comp of node.components ?? []) {
			if (comp instanceof WrGPU.MeshRenderer) comp.setSlot(0, [thickness, 0, 0, 0]);
		}
	}
}

async function run() {
	const canvas = createCanvas();
	const backend = await Awgpu.Backend.create(canvas, { sampleCount: SAMPLE_COUNT });

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

	const world = new WrGPU.World({
		backend,
		camera,
		sampleCount: SAMPLE_COUNT,
	}).createDefaultGpu();
	const objectShaders = createObjectShaders(world, await Other.readText(WELCOME_SHADER_URL));
	const background = createBackground(backend);
	const loader = new WrGPU.Loader({ backend, world });
	const worldRoot = world.newNode(null);
	worldRoot.name = "world-root";

	const shaders = [objectShaders.outline, objectShaders.main];
	const roomRoot = await loader.loadModelFromURL("/Models/Room.glb", {
		parent: worldRoot,
		shaders,
	});
	const nakuRoot = await loader.loadModelFromURL("/Models/Nakurin.glb", {
		parent: worldRoot,
		shaders,
	});

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

	const flow = new Aflow(new Agraph({ label: "WR3" }));
	const rootNode = flow.addNode({ payload: [new Awgpu.BeginFrame()] });
	const rootId = rootNode.id;

	const bgNode = flow.addNode({ payload: [
		new Awgpu.RenderPass({
			label: "wr3-background-pass",
			clearColor: [0, 0, 0, 1],
			useDepth: false,
			sampleCount: SAMPLE_COUNT,
		}),
		new Awgpu.UsePipeline(background.pipeline),
		new Awgpu.SetBindGroups([{ index: 0, bindGroup: background.bindGroup }]),
		new Awgpu.Draw({ vertexCount: 3 }),
		new Awgpu.EndPass()
	]});

	const mainNode = flow.addNode({ payload: [
		new Awgpu.RenderPass({
			label: "wr3-world-pass",
			clearColorEnabled: false,
			clearDepth: 1,
			clearDepthEnabled: true,
			useDepth: true,
			sampleCount: SAMPLE_COUNT,
		})
	]});

	const worldNode = flow.addNode({ payload: [] });
	world.setRenderEntry(worldNode);

	const mainEndNode = flow.addNode({ payload: [new Awgpu.EndPass()] });

	const frameEndNode = flow.addNode({ payload: [new Awgpu.EndFrame()] });

	flow.addLink({ srcId: rootId, dstId: bgNode.id });
	flow.addLink({ srcId: bgNode.id, dstId: mainNode.id });
	flow.addLink({ srcId: mainNode.id, dstId: worldNode.id });
	flow.addLink({ srcId: worldNode.id, dstId: mainEndNode.id });
	flow.addLink({ srcId: mainEndNode.id, dstId: frameEndNode.id });

	let last = performance.now();
	function frame(now) {
		const dt = Math.max(0, (now - last) * 0.001);
		last = now;
		fcam.update(dt);

		world
			.setCamera(camera)
			.writeScene({ time: now * 0.001, deltaTime: dt })
			.update(worldRoot);

		background.data.set([now * 0.001, dt, 0, 0], 0);
		background.data.set([canvas.width, canvas.height, 0, 0], 4);
		backend.queue.writeBuffer(background.buffer, 0, background.data);

		flow.run({ from: rootId, state: backend.newState() });
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
			roomRoot,
			nakuRoot,
			objectShaders,
			background,
		};
	}
}

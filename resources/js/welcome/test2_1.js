import { AzWBackend } from "../AzLib/AzWBackend.js";
import { AzCamera } from "../AzLib/AzCamera.js";
import * as Azm from "../AzLib/Azm.js";
import { FCamera } from "./FCamera.js";
import {
	WrWorld,
	WrTransform,
	WrShaderComp,
	WrRenderPass,
	WrShader,
	WrStores,
	WrLoader,
	WrRenderer,
} from "../WeebRender2.1/index.js";

const container = document.getElementById("main-canvas");

if (!container) {
	console.warn("[WrScene2_1] #main-canvas is missing");
} else {
	run().catch((error) => {
		console.error("[WrScene2_1] fatal", error);
	});
}

async function run() {
	let prefer = "webgpu";
	if (typeof window !== "undefined" && typeof window.prompt === "function") {
		const raw = String(window.prompt("Select backend: 0 = webgpu, 1 = webgl2", "0") ?? "").trim();
		if (raw === "1") prefer = "webgl2";
	}

	const canvas = document.createElement("canvas");
	canvas.id = "wr-canvas-2_1";
	canvas.style.width = "100%";
	canvas.style.height = "100%";
	container.replaceChildren(canvas);

	const { backend, report } = await AzWBackend.Base.choose(canvas, { prefer });
	console.info("[WrScene2_1] backend", report);

	const world = new WrWorld();
	const stores = new WrStores();
	const loader = new WrLoader({ backend, world, stores });
	const renderer = new WrRenderer({ backend, world, stores });

	const camera = new AzCamera({
		position: [0, 1.1, 4.5],
		near: 0.1,
		far: 250,
		fov: 45,
	});
	camera.lookAt([0, 1, 0]);

	const resize = () => {
		backend.resize({ maxPixelRatio: 2 });
		const w = Math.max(1, canvas.clientWidth || canvas.width || 1);
		const h = Math.max(1, canvas.clientHeight || canvas.height || 1);
		camera.aspect = w / h;
	};
	resize();
	new ResizeObserver(resize).observe(container);

	const mainShaderId = stores.shaders.add(new WrShader({
		id: "main-shader",
		kind: "object",
		renderCfg: {
			depthTest: true,
			depthWrite: true,
			cull: "back",
			blend: false,
		},
		wgsl: {
			links: [
				{ name: "out_uv", type: "vec2f" },
			],
			vertex: {
				main: `
					out_uv = $UV$;
					var localPos = $POSITION$;
					if ($HAS_MORPH$) {
						localPos += $MORPH_POS$ * $MORPH_WEIGHT$;
					}
					var skinnedPos = vec4f(localPos, 1.0);
					if ($SKIN_ENABLED$) {
						let weights = $BONE_WEIGHT$;
						let wsum = weights.x + weights.y + weights.z + weights.w;
						if (wsum > 0.00001) {
							let ids = vec4i($BONE_ID$);
							let skin =
								weights.x * $SKIN_PALETTE$[clamp(ids.x, 0, 127)] +
								weights.y * $SKIN_PALETTE$[clamp(ids.y, 0, 127)] +
								weights.z * $SKIN_PALETTE$[clamp(ids.z, 0, 127)] +
								weights.w * $SKIN_PALETTE$[clamp(ids.w, 0, 127)];
							skinnedPos = skin * vec4f(localPos, 1.0);
						}
					}
					output.position = $PROJECTION$ * $VIEW$ * $INST_MODEL$ * skinnedPos;
				`,
			},
			fragment: {
				main: `
					var texColor = textureSample($ALBEDO_TEX$, texSampler, out_uv) * $ALBEDO_COLOR$;
					if (texColor.a < 0.5) { discard; }
					$OUT_COLOR$ = texColor;
				`,
			},
		},
		glsl: {
			links: [
				{ name: "out_uv", type: "vec2" },
			],
			vertex: {
				main: `
					out_uv = $UV$;
					vec3 localPos = $POSITION$;
					if ($HAS_MORPH$) {
						localPos += $MORPH_POS$ * $MORPH_WEIGHT$;
					}
					vec4 skinnedPos = vec4(localPos, 1.0);
					if ($SKIN_ENABLED$) {
						vec4 weights = $BONE_WEIGHT$;
						float wsum = weights.x + weights.y + weights.z + weights.w;
						if (wsum > 0.00001) {
							ivec4 ids = ivec4($BONE_ID$);
							mat4 skin =
								weights.x * $SKIN_PALETTE$[clamp(ids.x, 0, 127)] +
								weights.y * $SKIN_PALETTE$[clamp(ids.y, 0, 127)] +
								weights.z * $SKIN_PALETTE$[clamp(ids.z, 0, 127)] +
								weights.w * $SKIN_PALETTE$[clamp(ids.w, 0, 127)];
							skinnedPos = skin * vec4(localPos, 1.0);
						}
					}
					gl_Position = $PROJECTION$ * $VIEW$ * $INST_MODEL$ * skinnedPos;
				`,
			},
			fragment: {
				main: `
					vec4 texColor = texture($ALBEDO_TEX$, out_uv) * $ALBEDO_COLOR$;
					if (texColor.a < 0.5) { discard; }
					$OUT_COLOR$ = texColor;
				`,
			},
		},
	}));

	const outlineShaderId = stores.shaders.add(new WrShader({
		id: "outline-shader",
		kind: "object",
		renderCfg: {
			depthTest: true,
			depthWrite: false,
			cull: "front",
			blend: false,
		},
		wgsl: {
			vertex: {
				main: `
					var localPos = $POSITION$;
					var localNrm = normalize($NORMAL$);
					if ($HAS_MORPH$) {
						localPos += $MORPH_POS$ * $MORPH_WEIGHT$;
					}
					var skinnedPos = vec4f(localPos, 1.0);
					var skinnedNrm = localNrm;
					if ($SKIN_ENABLED$) {
						let weights = $BONE_WEIGHT$;
						let wsum = weights.x + weights.y + weights.z + weights.w;
						if (wsum > 0.00001) {
							let ids = vec4i($BONE_ID$);
							let skin =
								weights.x * $SKIN_PALETTE$[clamp(ids.x, 0, 127)] +
								weights.y * $SKIN_PALETTE$[clamp(ids.y, 0, 127)] +
								weights.z * $SKIN_PALETTE$[clamp(ids.z, 0, 127)] +
								weights.w * $SKIN_PALETTE$[clamp(ids.w, 0, 127)];
							skinnedPos = skin * vec4f(localPos, 1.0);
							skinnedNrm = normalize((skin * vec4f(localNrm, 0.0)).xyz);
						}
					}
					let worldNrm = normalize(($INST_MODEL$ * vec4f(skinnedNrm, 0.0)).xyz);
					let worldPos = ($INST_MODEL$ * skinnedPos).xyz + worldNrm * 0.005;
					output.position = $PROJECTION$ * $VIEW$ * vec4f(worldPos, 1.0);
				`,
			},
			fragment: {
				main: `
					$OUT_COLOR$ = vec4f(0.0, 0.0, 0.0, 1.0);
				`,
			},
		},
		glsl: {
			vertex: {
				main: `
					vec3 localPos = $POSITION$;
					vec3 localNrm = normalize($NORMAL$);
					if ($HAS_MORPH$) {
						localPos += $MORPH_POS$ * $MORPH_WEIGHT$;
					}
					vec4 skinnedPos = vec4(localPos, 1.0);
					vec3 skinnedNrm = localNrm;
					if ($SKIN_ENABLED$) {
						vec4 weights = $BONE_WEIGHT$;
						float wsum = weights.x + weights.y + weights.z + weights.w;
						if (wsum > 0.00001) {
							ivec4 ids = ivec4($BONE_ID$);
							mat4 skin =
								weights.x * $SKIN_PALETTE$[clamp(ids.x, 0, 127)] +
								weights.y * $SKIN_PALETTE$[clamp(ids.y, 0, 127)] +
								weights.z * $SKIN_PALETTE$[clamp(ids.z, 0, 127)] +
								weights.w * $SKIN_PALETTE$[clamp(ids.w, 0, 127)];
							skinnedPos = skin * vec4(localPos, 1.0);
							skinnedNrm = normalize((skin * vec4(localNrm, 0.0)).xyz);
						}
					}
					vec3 worldNrm = normalize(($INST_MODEL$ * vec4(skinnedNrm, 0.0)).xyz);
					vec3 worldPos = ($INST_MODEL$ * skinnedPos).xyz + worldNrm * 0.005;
					gl_Position = $PROJECTION$ * $VIEW$ * vec4(worldPos, 1.0);
				`,
			},
			fragment: {
				main: `
					$OUT_COLOR$ = vec4(0.0, 0.0, 0.0, 1.0);
				`,
			},
		},
	}));

	const renderRoot = world.addNode(null);
	renderRoot.name = "render-root";
	const passComp = renderRoot.addComp(WrRenderPass);
	passComp.set({
		clearColor: [0, 0, 0, 0],
		clearColorEnabled: true,
		clearDepth: 1,
		clearDepthEnabled: true,
		useDepth: true,
	});
	const shaderComp = renderRoot.addComp(WrShaderComp);
	shaderComp.useShader(outlineShaderId);
	shaderComp.useShader(mainShaderId);

	const roomRoot = await loader.registerGLTF("/Models/Room.glb", {
		parent: renderRoot.id,
		uploadGpu: true,
	});
	const nakuRoot = await loader.registerGLTF("/Models/Nakurin.glb", {
		parent: renderRoot.id,
		uploadGpu: true,
	});
	const roomTx = roomRoot?.getComp(WrTransform) ?? null;
	if (roomTx) Azm.Mat4.scale(roomTx.local, [0.5, 0.5, 0.5], roomTx.local);
	if (!roomRoot || !nakuRoot) {
		console.warn("[WrScene2_1] one or more scene branches failed to load");
	}

	const fcam = new FCamera({
		canvas,
		camera,
		cfg: {
			look: {
				sensitivity: 0.0022,
			},
			move: {
				walkSpeed: 2.8,
				sprintScale: 2.2,
			},
			zoom: {
				wheelScale: 0.04,
				minFov: 20,
				maxFov: 90,
			},
		},
	});
	fcam.attach();
	renderer.setCamera(camera);

	let last = performance.now();
	let t = 0;
	let dt = 0;
	function frame(now) {
		dt = Math.max(0, (now - last) * 0.001);
		last = now;
		t += dt;

		fcam.update(dt);

		renderer.render({
			from: renderRoot.id,
			time: t,
			deltaTime: dt,
			beginFrame: true,
			endFrame: true,
		});
		requestAnimationFrame(frame);
	}
	requestAnimationFrame(frame);

	if (typeof window !== "undefined") {
		window.wr21 = { world, stores, loader, renderer, camera, fcam, backend, renderRoot };
	}
}

import { AzWBackend } from "../AzLib/AzWBackend.js";
import { AzCamera } from "../AzLib/AzCamera.js";
import * as Azm from "../AzLib/Azm.js";
import { FCamera } from "./FCamera.js";
import {
	WrWorld,
	WrTransform,
	WrShaderOBJComp,
	WrShaderFSCComp,
	WrRenderPass,
	WrShaderOBJ,
	WrShaderFSC,
	WrStores,
	WrLoader,
	WrRenderer,
	WrRenderPassAsset,
} from "../WeebRender2.1/index.js";

const container = document.getElementById("main-canvas");
run().catch((error) => {
	console.error("[WrScene2_1] fatal", error);
});

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
	const renderer = new WrRenderer({ backend, world });

	const camera = new AzCamera({
		position: [0, 1.1, 4.5],
		near: 0.1,
		far: 250,
		fov: 45,
	});
	camera.lookAt([0, 1, 0]);

	// Camera with fps controls
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

	const resize = () => {
		backend.resize({ maxPixelRatio: 2 });
		const w = Math.max(1, canvas.clientWidth || canvas.width || 1);
		const h = Math.max(1, canvas.clientHeight || canvas.height || 1);
		camera.aspect = w / h;
	};
	resize();
	new ResizeObserver(resize).observe(container);

	const mainShader = stores.shaderOBJs.add(new WrShaderOBJ({
		label: "main-shader",
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

	const outlineShader = stores.shaderOBJs.add(new WrShaderOBJ({
		label: "outline-shader",
		kind: "object",
		renderCfg: {
			depthTest: true,
			depthWrite: true,
			cull: "front",
			blend: true,
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
					let worldPos = ($INST_MODEL$ * skinnedPos).xyz + worldNrm * 0.02;
					output.position = $PROJECTION$ * $VIEW$ * vec4f(worldPos, 1.0);
				`,
			},
			fragment: {
				main: `
					$OUT_COLOR$ = vec4f(0.0, 0.0, 0.0, 0.0);
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
					$OUT_COLOR$ = vec4(0.0, 0.0, 0.0, 0.0);
				`,
			},
		},
	}));

	const backgroundShader = stores.shaderFSCs.add(new WrShaderFSC({
		label: "background-fsc",
		renderCfg: {
			depthTest: false,
			depthWrite: false,
			blend: false,
		},
		wgsl: {
			fragment: `
				let t = $TIME$;
				let uv = $UV$;
				let horizon = smoothstep(0.0, 1.0, uv.y);
				let pulse = 0.5 + 0.5 * sin(t * 1.2 + uv.x * 4.0 + uv.y * 2.0);
				let timeWave = 0.5 + 0.5 * sin(t * 2.0 + (uv.x + uv.y) * 10.0);
				let frameStep = step(0.5, fract($FRAME$ / 36.0));
				let fpsTint = clamp($FRAME_RATE$ / 120.0, 0.0, 1.0);
				let dayPulse = 0.5 + 0.5 * sin($DATE$.w * 0.02);
				let mouseUv = $MOUSE$.xy / max($RESOLUTION$, vec2f(1.0, 1.0));
				let mouseOn = select(0.0, 1.0, $MOUSE$.x > 0.0 || $MOUSE$.y > 0.0);
				let mouseGlow = exp(-dot(uv - mouseUv, uv - mouseUv) * 14.0) * mouseOn;
				let skyTop = vec3f(0.54, 0.64, 0.94);
				let skyMid = vec3f(0.76, 0.72, 0.98);
				let skyLow = vec3f(0.93, 0.79, 0.92);
				var color = mix(skyLow, skyMid, smoothstep(0.05, 0.55, horizon));
				color = mix(color, skyTop, smoothstep(0.45, 1.0, horizon));
				color += vec3f(0.025, 0.018, 0.04) * pulse;
				color += vec3f(0.05, 0.025, 0.07) * timeWave;
				color += vec3f(0.015, 0.0, 0.03) * frameStep;
				color = mix(color, color + vec3f(0.0, 0.025, 0.04), fpsTint);
				color += vec3f(0.015, 0.01, 0.0) * dayPulse;
				color += vec3f(0.05, 0.04, 0.08) * mouseGlow;
				$OUT_COLOR$ = vec4f(color, 1.0);
			`,
		},
		glsl: {
			fragment: `
				float t = $TIME$;
				vec2 uv = $UV$;
				float horizon = smoothstep(0.0, 1.0, uv.y);
				float pulse = 0.5 + 0.5 * sin(t * 1.2 + uv.x * 4.0 + uv.y * 2.0);
				float timeWave = 0.5 + 0.5 * sin(t * 2.0 + (uv.x + uv.y) * 10.0);
				float frameStep = step(0.5, fract($FRAME$ / 36.0));
				float fpsTint = clamp($FRAME_RATE$ / 120.0, 0.0, 1.0);
				float dayPulse = 0.5 + 0.5 * sin($DATE$.w * 0.02);
				vec2 mouseUv = $MOUSE$.xy / max($RESOLUTION$, vec2(1.0, 1.0));
				float mouseOn = ($MOUSE$.x > 0.0 || $MOUSE$.y > 0.0) ? 1.0 : 0.0;
				float mouseGlow = exp(-dot(uv - mouseUv, uv - mouseUv) * 14.0) * mouseOn;
				vec3 skyTop = vec3(0.54, 0.64, 0.94);
				vec3 skyMid = vec3(0.76, 0.72, 0.98);
				vec3 skyLow = vec3(0.93, 0.79, 0.92);
				vec3 color = mix(skyLow, skyMid, smoothstep(0.05, 0.55, horizon));
				color = mix(color, skyTop, smoothstep(0.45, 1.0, horizon));
				color += vec3(0.025, 0.018, 0.04) * pulse;
				color += vec3(0.05, 0.025, 0.07) * timeWave;
				color += vec3(0.015, 0.0, 0.03) * frameStep;
				color = mix(color, color + vec3(0.0, 0.025, 0.04), fpsTint);
				color += vec3(0.015, 0.01, 0.0) * dayPulse;
				color += vec3(0.05, 0.04, 0.08) * mouseGlow;
				$OUT_COLOR$ = vec4(color, 1.0);
			`,
		},
	}));

	const backgroundPass = stores.renderPasses.add(new WrRenderPassAsset({
		target: "screen",
		clearColor: [0, 0, 0, 0],
		clearColorEnabled: true,
		clearDepth: 1,
		clearDepthEnabled: true,
		useDepth: true,
		traverseMode: "bfs",
		batchMode: "shader",
	}));

	const mainPass = stores.renderPasses.add(new WrRenderPassAsset({
		target: "screen",
		clearColor: [0, 0, 0, 0],
		clearColorEnabled: false,
		clearDepth: 1,
		clearDepthEnabled: true,
		useDepth: true,
		traverseMode: "bfs",
		batchMode: "shader",
	}));

	const renderRoot = world.addNode(null);
	renderRoot.name = "render-root";

	const backgroundPassNode = world.addNode(renderRoot);
	backgroundPassNode.name = "background-pass";
	const backgroundPassComp = backgroundPassNode.addComp(WrRenderPass);
	backgroundPassComp.usePass(backgroundPass);
	const backgroundComp = backgroundPassNode.addComp(WrShaderFSCComp);
	backgroundComp.useShader(backgroundShader);

	const mainPassNode = world.addNode(renderRoot);
	mainPassNode.name = "main-pass";
	const mainPassComp = mainPassNode.addComp(WrRenderPass);
	mainPassComp.usePass(mainPass);
	const shaderComp = mainPassNode.addComp(WrShaderOBJComp);
	shaderComp.useShader(outlineShader);
	shaderComp.useShader(mainShader);

	// Create 2 new models
	const roomRoot = await loader.registerGLTF("/Models/Room.glb", { uploadGpu: true });
	const nakuRoot = await loader.registerGLTF("/Models/Nakurin.glb", { uploadGpu: true });

	// The room is too fcking big
	const roomTx = roomRoot?.getComp(WrTransform) ?? null;
	if (roomTx) Azm.Mat4.scale(roomTx.local, [0.5, 0.5, 0.5], roomTx.local);

	mainPassNode.attachCopy(roomRoot);
	mainPassNode.attachCopy(nakuRoot);

	let last = performance.now();
	let dt = 0;
	function frame(now) {
		dt = Math.max(0, (now - last) * 0.001);
		last = now;

		fcam.update(dt);

		renderer.render({
			from: renderRoot.id,
			time: now * 0.001,
			deltaTime: dt,
			beginFrame: true,
			endFrame: true,
		});
		requestAnimationFrame(frame);
	}
	requestAnimationFrame(frame);

	if (typeof window !== "undefined") {
		window.wr21 = { world, stores, loader, renderer, camera, fcam, backend, renderRoot, backgroundPassNode, mainPassNode };
	}
}

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
			blend: true,
		},
		wgsl: {
			links: [
				{ name: "out_uv", type: "vec2f" },
				{ name: "out_normal", type: "vec3f" },
			],
			vertex: {
				main: `
					out_uv = $UV$;
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
					out_normal = normalize(($INST_MODEL$ * vec4f(skinnedNrm, 0.0)).xyz);
					output.position = $PROJECTION$ * $VIEW$ * $INST_MODEL$ * skinnedPos;
				`,
			},
			fragment: {
				main: `
					var texColor = textureSample($ALBEDO_TEX$, texSampler, out_uv) * $ALBEDO_COLOR$;
					// if (texColor.a < 0.5) { discard; }

					var lit = dot(out_normal, normalize(vec3f(0.5, 1.0, 0.5)));
					texColor.a *= 0.8 + 0.2 * lit; // Extremely cool effect to expose the fsc layer

					$OUT_COLOR$ = texColor;
				`,
			},
		},
		glsl: {
			links: [
				{ name: "out_uv", type: "vec2" },
				{ name: "out_normal", type: "vec3" },
			],
			vertex: {
				main: `
					out_uv = $UV$;
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
					out_normal = normalize(($INST_MODEL$ * vec4(skinnedNrm, 0.0)).xyz);
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

	const backgroundShader = stores.shaderFSCs.add(new WrShaderFSC({
		label: "background-fsc",
		renderCfg: {
			depthTest: false,
			depthWrite: false,
			blend: false,
		},
		wgsl: {
			methods: [`
				const PI: f32 = 3.141592653589793;

				fn wrRot(v: vec2f, a: f32) -> vec2f {
					let c = cos(a);
					let s = sin(a);
					return vec2f(c * v.x - s * v.y, s * v.x + c * v.y);
				}

				fn wrHash(p: vec2f) -> f32 {
					let h = dot(p, vec2f(127.1, 311.7));
					return fract(sin(h) * 43758.5453123);
				}

				fn wrNoise(p: vec2f) -> f32 {
					let i = floor(p);
					let f = fract(p);
					let u = f * f * (vec2f(3.0, 3.0) - 2.0 * f);
					let a = wrHash(i);
					let b = wrHash(i + vec2f(1.0, 0.0));
					let c = wrHash(i + vec2f(0.0, 1.0));
					let d = wrHash(i + vec2f(1.0, 1.0));
					return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
				}

				fn wrFbm(p: vec2f, t: f32) -> f32 {
					var pos = p;
					var amp = 0.5;
					var sum = 0.0;
					for (var i = 0; i < 5; i++) {
						sum += amp * wrNoise(pos + vec2f(t, -t * 0.37));
						pos = wrRot(pos * 2.03, 0.5);
						amp *= 0.5;
					}
					return sum;
				}

				fn wrBounceOut(x: f32) -> f32 {
					let n1 = 7.5625;
					let d1 = 2.75;
					if (x < 1.0 / d1) {
						return n1 * x * x;
					}
					if (x < 2.0 / d1) {
						let y = x - 1.5 / d1;
						return n1 * y * y + 0.75;
					}
					if (x < 2.5 / d1) {
						let y = x - 2.25 / d1;
						return n1 * y * y + 0.9375;
					}
					let y = x - 2.625 / d1;
					return n1 * y * y + 0.984375;
				}

				fn wrBounceIn(x: f32) -> f32 {
					let v = clamp(x, 0.0, 1.0);
					return 1.0 - wrBounceOut(1.0 - v);
				}
			`],
			fragment: `
				let res = max($RESOLUTION$, vec2f(1.0, 1.0));
				let mouse = $MOUSE$.xy / res;
				var st = $UV$ * vec2f(res.x / res.y, 1.0);
				st = wrRot(st, -PI / 8.0);
				let n = wrFbm(vec2f(3.0, 3.0) * st, 1.2 * $TIME$ + mouse.y * PI);
				let lines = cos((st.x + n * 0.1 + mouse.x + 0.2) * PI);
				let band = wrBounceIn(lines * 0.5 + 0.5);
				let pink = vec3f(0.949, 0.561, 0.792);
				let purple = vec3f(0.463, 0.169, 0.690);
				let glow = 0.08 * pow(1.0 - abs(lines), 2.0);
				let color = mix(pink, purple, band) + vec3f(glow, glow * 0.35, glow * 0.8);
				$OUT_COLOR$ = vec4f(color, 1.0);
			`,
		},
		glsl: {
			methods: [`
				const float PI = 3.141592653589793;

				vec2 wrRot(vec2 v, float a) {
					float c = cos(a);
					float s = sin(a);
					return vec2(c * v.x - s * v.y, s * v.x + c * v.y);
				}

				float wrHash(vec2 p) {
					float h = dot(p, vec2(127.1, 311.7));
					return fract(sin(h) * 43758.5453123);
				}

				float wrNoise(vec2 p) {
					vec2 i = floor(p);
					vec2 f = fract(p);
					vec2 u = f * f * (vec2(3.0) - 2.0 * f);
					float a = wrHash(i);
					float b = wrHash(i + vec2(1.0, 0.0));
					float c = wrHash(i + vec2(0.0, 1.0));
					float d = wrHash(i + vec2(1.0, 1.0));
					return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
				}

				float wrFbm(vec2 p, float t) {
					vec2 pos = p;
					float amp = 0.5;
					float sum = 0.0;
					for (int i = 0; i < 5; i++) {
						sum += amp * wrNoise(pos + vec2(t, -t * 0.37));
						pos = wrRot(pos * 2.03, 0.5);
						amp *= 0.5;
					}
					return sum;
				}

				float wrBounceOut(float x) {
					float n1 = 7.5625;
					float d1 = 2.75;
					if (x < 1.0 / d1) {
						return n1 * x * x;
					}
					if (x < 2.0 / d1) {
						float y = x - 1.5 / d1;
						return n1 * y * y + 0.75;
					}
					if (x < 2.5 / d1) {
						float y = x - 2.25 / d1;
						return n1 * y * y + 0.9375;
					}
					float y = x - 2.625 / d1;
					return n1 * y * y + 0.984375;
				}

				float wrBounceIn(float x) {
					float v = clamp(x, 0.0, 1.0);
					return 1.0 - wrBounceOut(1.0 - v);
				}
			`],
			fragment: `
				vec2 res = max($RESOLUTION$, vec2(1.0, 1.0));
				vec2 mouse = $MOUSE$.xy / res;
				vec2 st = $UV$ * vec2(res.x / res.y, 1.0);
				st = wrRot(st, -PI / 8.0);
				float n = wrFbm(vec2(3.0) * st, 1.2 * $TIME$ + mouse.y * PI);
				float lines = cos((st.x + n * 0.1 + mouse.x + 0.2) * PI);
				float band = wrBounceIn(lines * 0.5 + 0.5);
				vec3 pink = vec3(0.949, 0.561, 0.792);
				vec3 purple = vec3(0.463, 0.169, 0.690);
				float glow = 0.08 * pow(1.0 - abs(lines), 2.0);
				vec3 color = mix(pink, purple, band) + vec3(glow, glow * 0.35, glow * 0.8);
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
	shaderComp.useShader(mainShader);
	// shaderComp.useShader(outlineShader);

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

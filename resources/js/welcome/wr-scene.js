import { AzWBackend } from "../AzLib/AzWBackend.js";
import { AzCamera } from "../AzLib/AzCamera.js";
import * as Azm from "../AzLib/Azm.js";
import {
	WrWorld,
	WrMeshRenderer,
	WrLiveSkeleton,
} from "../WeebRender2/index.js";

const EYE_CLOSE_MORPH = "Eye_2_R(CloseA)[M_Face]";
const container = document.getElementById("main-canvas");

function collectBranchNodes(rootNode) {
	if (!rootNode) return [];
	const out = [];
	for (const node of rootNode.traverse({ mode: "dfs_pre", includeFrom: true })) {
		out.push(node);
	}
	return out;
}

function resolveHipDriver(skeletons) {
	for (const live of skeletons) {
		const hip = live.resolveBoneIndex("hip");
		if (hip >= 0) return { live, bone: "hip" };
		const hips = live.resolveBoneIndex("Hips");
		if (hips >= 0) return { live, bone: "Hips" };
	}
	return null;
}

if (!container) {
	console.warn("[WrScene] #main-canvas is missing");
} else {
	run().catch((error) => {
		console.error("[WrScene] fatal", error);
	});
}

async function run() {
	let prefer = "webgpu";
	if (typeof window !== "undefined" && typeof window.prompt === "function") {
		const raw = String(window.prompt("Select backend: 0 = webgpu, 1 = webgl2", "0") ?? "").trim();
		if (raw === "1") prefer = "webgl2";
	}

	const canvas = document.createElement("canvas");
	canvas.id = "wr-canvas";
	canvas.style.width = "100%";
	canvas.style.height = "100%";
	container.replaceChildren(canvas);

	const { backend, report } = await AzWBackend.Base.choose(canvas, {
		prefer,
	});
	console.info("[WrScene] backend", report);

	const world = new WrWorld({ backend });
	const camera = new AzCamera({
		position: [0, 1.1, 4.5],
		near: 0.1,
		far: 250,
		fov: 45,
	});
	camera.lookAt([0, 1, 0]);
	world.setCamera(camera);

	const resize = () => {
		backend.resize({ maxPixelRatio: 2 });
		const w = Math.max(1, canvas.clientWidth || canvas.width || 1);
		const h = Math.max(1, canvas.clientHeight || canvas.height || 1);
		camera.aspect = w / h;
	};
	resize();
	new ResizeObserver(resize).observe(container);

	world.registerShader("wr-default", {
		renderCfg: {
			depthTest: true,
			depthWrite: true,
			cull: "back",
			blend: false,
			clearColor: [0.62, 0.72, 0.92, 1],
			clearDepth: 1,
		},
		wgsl: {
			link: [
				{ name: "out_uv", type: "vec2f" },
			],
			vertex: {
				main: `
					out_uv = $UV$;
					var localPos = $POSITION$;
					if ($HAS_MORPH$) {
						localPos += $MORPH_POS$ * $MORPH_WEIGHT$;
					}

					var skinned = vec4f(localPos, 1.0);
					if ($HAS_RIG$) {
						let weights = $BONE_WEIGHT$;
						let wsum = weights.x + weights.y + weights.z + weights.w;
						if (wsum > 0.00001) {
							let ids = vec4i($BONE_ID$);
							let skin =
								weights.x * $SKIN_PALETTE$[clamp(ids.x, 0, 127)] +
								weights.y * $SKIN_PALETTE$[clamp(ids.y, 0, 127)] +
								weights.z * $SKIN_PALETTE$[clamp(ids.z, 0, 127)] +
								weights.w * $SKIN_PALETTE$[clamp(ids.w, 0, 127)];
							skinned = skin * vec4f(localPos, 1.0);
						}
					}

					output.position = $PROJECTION$ * $VIEW$ * $INST_MODEL$ * skinned;
				`,
			},
			fragment: {
				main: `
					$OUT_COLOR$ = textureSample($ALBEDO_TEX$, texSampler, out_uv) * $ALBEDO_COLOR$;
				`,
			},
		},
		glsl: {
			link: [
				{ name: "out_uv", type: "vec2" },
			],
			vertex: {
				main: `
					out_uv = $UV$;
					vec3 localPos = $POSITION$;
					if ($HAS_MORPH$) {
						localPos += $MORPH_POS$ * $MORPH_WEIGHT$;
					}

					vec4 skinned = vec4(localPos, 1.0);
					if ($HAS_RIG$) {
						vec4 weights = $BONE_WEIGHT$;
						float wsum = weights.x + weights.y + weights.z + weights.w;
						if (wsum > 0.00001) {
							ivec4 ids = ivec4($BONE_ID$);
							mat4 skin =
								weights.x * $SKIN_PALETTE$[clamp(ids.x, 0, 127)] +
								weights.y * $SKIN_PALETTE$[clamp(ids.y, 0, 127)] +
								weights.z * $SKIN_PALETTE$[clamp(ids.z, 0, 127)] +
								weights.w * $SKIN_PALETTE$[clamp(ids.w, 0, 127)];
							skinned = skin * vec4(localPos, 1.0);
						}
					}

					gl_Position = $PROJECTION$ * $VIEW$ * $INST_MODEL$ * skinned;
				`,
			},
			fragment: {
				main: `
					$OUT_COLOR$ = texture($ALBEDO_TEX$, out_uv) * $ALBEDO_COLOR$;
				`,
			},
		},
	});

	const rootNode = await world.loadModelFromURL("/Models/Agnes.glb", {
		shaderId: "wr-default",
	});
	console.info("[WrScene] model loaded", rootNode.id);

	const branchNodes = collectBranchNodes(rootNode);
	const meshRenderers = branchNodes
		.map((node) => node.getComp(WrMeshRenderer))
		.filter(Boolean);
	const skeletons = branchNodes
		.map((node) => node.getComp(WrLiveSkeleton))
		.filter(Boolean);
	const hipDriver = resolveHipDriver(skeletons);

	for (const meshRenderer of meshRenderers) {
		const morphIndex = meshRenderer.resolveMorphIndex(EYE_CLOSE_MORPH);
		if (morphIndex < 0) continue;
		meshRenderer.setMorphWeight(EYE_CLOSE_MORPH, 0);
	}

	let last = performance.now();
	let t = 0;
	function frame(now) {
		const dt = Math.max(0, (now - last) * 0.001);
		last = now;
		t += dt;

		const eye = 0.5 + 0.5 * Math.sin(t * 5.0);
		for (const meshRenderer of meshRenderers) {
			if (meshRenderer.resolveMorphIndex(EYE_CLOSE_MORPH) < 0) continue;
			meshRenderer.setMorphWeight(EYE_CLOSE_MORPH, eye);
		}

		if (hipDriver) {
			const angle = Math.sin(t * 2.0) * 0.35;
			hipDriver.live.set(hipDriver.bone, Azm.Mat4.fromRotationY(angle));
		}

		const queue = world.render(rootNode, { time: t });
		if ((now | 0) % 2000 < 16) {
			console.info("[WrScene] queue", {
				from: queue.from,
				count: queue.count,
				groups: queue.groups,
				backend: queue.backend,
			});
		}

		requestAnimationFrame(frame);
	}

	requestAnimationFrame(frame);
}

import { AzWBackend } from "../AzLib/AzWBackend.js";
import { AzCamera } from "../AzLib/AzCamera.js";
import * as Azm from "../AzLib/Azm.js";
import {
	WrWorld,
	WrMeshRenderer,
	WrLiveSkeleton,
	WrTransform,
} from "../WeebRender2/index.js";

const EYE_CLOSE_MORPH = "Eye_2_R(CloseA)[M_Face]";
const container = document.getElementById("main-canvas");

function collectBranchNodes(modelRoot) {
	if (!modelRoot) return [];
	const out = [];
	for (const node of modelRoot.traverse({ mode: "dfs_pre", includeFrom: true })) {
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

function raycastBranchMeshAABB(rootNode, time, deltaTime, ray) {
	const queue = rootNode.render({ collectOnly: true, time, deltaTime });
	let nearest = null;
	for (const draw of queue.draws) {
		const meshBounds = draw.mesh?.getAABB?.();
		if (!meshBounds) continue;
		const hit = AzCamera.hitAABB(ray, meshBounds.min, meshBounds.max, draw.modelMatrix);
		if (!hit.hit) continue;
		if (!nearest || hit.distance < nearest.distance) {
			nearest = {
				nodeId: draw.nodeId,
				distance: hit.distance,
			};
		}
	}
	return nearest;
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

	world.registerShader("main-shader", {
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
				{ name: "out_nrm", type: "vec3f" },
				{ name: "out_fx", type: "f32" },
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
							skinnedPos = skin * vec4f(localPos, 1.0);
							skinnedNrm = normalize((skin * vec4f(localNrm, 0.0)).xyz);
						}
					}

					let wobble = sin($TIME$ * 2.0 + skinnedPos.x * 1.3 + skinnedPos.y * 0.8 + $DELTA_TIME$ * 20.0) * 0.02;
					skinnedPos = vec4f(skinnedPos.xyz + skinnedNrm * wobble, skinnedPos.w);
					out_nrm = normalize(($INST_MODEL$ * vec4f(skinnedNrm, 0.0)).xyz);
					out_fx = wobble;
					output.position = $PROJECTION$ * $VIEW$ * $INST_MODEL$ * skinnedPos;
				`,
			},
			fragment: {
				main: `
					let n = normalize(out_nrm) * 0.5 + vec3f(0.5, 0.5, 0.5);
					let wave = 0.5 + 0.5 * sin($TIME$ * 2.4 + out_fx * 32.0 + n.y * 6.0);
					let gradA = vec3f(0.24, 0.46, 1.0);
					let gradB = vec3f(1.0, 0.34, 0.66);
					let grad = mix(gradA, gradB, wave);
					let base = textureSample($ALBEDO_TEX$, texSampler, out_uv) * $ALBEDO_COLOR$;
					let nl = 0.35 + 0.65 * n.y;
					$OUT_COLOR$ = vec4f(base.rgb * grad * nl, base.a);
				`,
			},
		},
		glsl: {
			link: [
				{ name: "out_uv", type: "vec2" },
				{ name: "out_nrm", type: "vec3" },
				{ name: "out_fx", type: "float" },
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
							skinnedPos = skin * vec4(localPos, 1.0);
							skinnedNrm = normalize((skin * vec4(localNrm, 0.0)).xyz);
						}
					}

					float wobble = sin($TIME$ * 2.0 + skinnedPos.x * 1.3 + skinnedPos.y * 0.8 + $DELTA_TIME$ * 20.0) * 0.02;
					skinnedPos.xyz += skinnedNrm * wobble;
					out_nrm = normalize(($INST_MODEL$ * vec4(skinnedNrm, 0.0)).xyz);
					out_fx = wobble;
					gl_Position = $PROJECTION$ * $VIEW$ * $INST_MODEL$ * skinnedPos;
				`,
			},
			fragment: {
				main: `
					vec3 n = normalize(out_nrm) * 0.5 + vec3(0.5);
					float wave = 0.5 + 0.5 * sin($TIME$ * 2.4 + out_fx * 32.0 + n.y * 6.0);
					vec3 gradA = vec3(0.24, 0.46, 1.0);
					vec3 gradB = vec3(1.0, 0.34, 0.66);
					vec3 grad = mix(gradA, gradB, wave);
					vec4 base = texture($ALBEDO_TEX$, out_uv) * $ALBEDO_COLOR$;
					float nl = 0.35 + 0.65 * n.y;
					$OUT_COLOR$ = vec4(base.rgb * grad * nl, base.a);
				`,
			},
		},
	});

	const modelRoot = await world.loadModelFromURL("/Models/Nakurin.glb", {
		shaderId: "main-shader",
	});

	const renderRoot = world.addNode(null);
	renderRoot.name = "world";

	const clones = [
		world.copyBranch(modelRoot.id, renderRoot.id),
		world.copyBranch(modelRoot.id, renderRoot.id),
		world.copyBranch(modelRoot.id, renderRoot.id),
	].filter(Boolean);

	const spacing = 2.0;
	const startX = -((clones.length - 1) * spacing) * 0.5;
	for (let i = 0; i < clones.length; i++) {
		const clone = clones[i];
		const tx = clone.getComp(WrTransform) ?? clone.addComp(WrTransform);
		Azm.Mat4.translate(tx.local, [startX + i * spacing, 0, 0], tx.local);
		tx.world.set(tx.local);
	}

	const branchNodes = collectBranchNodes(renderRoot);
	const meshRenderers = branchNodes
		.map((node) => node.getComp(WrMeshRenderer))
		.filter(Boolean);
	const hipDrivers = clones
		.map((clone) => {
			const cloneSkeletons = collectBranchNodes(clone)
				.map((node) => node.getComp(WrLiveSkeleton))
				.filter(Boolean);
			return resolveHipDriver(cloneSkeletons);
		})
		.filter(Boolean)
		.map((driver, index) => ({
			...driver,
			speed: 1 + index * 0.6,
			phase: index * 0.75,
		}));

	for (const meshRenderer of meshRenderers) {
		const morphIndex = meshRenderer.resolveMorphIndex(EYE_CLOSE_MORPH);
		if (morphIndex < 0) continue;
		meshRenderer.setMorphWeight(EYE_CLOSE_MORPH, 0);
	}

	console.log(world.nodes);

	let last = performance.now();
	let t = 0;
	let dt = 0;

	canvas.addEventListener("pointerdown", (event) => {
		if (event.button !== 0) return;
		const rect = canvas.getBoundingClientRect();
		const x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
		const y = 1 - ((event.clientY - rect.top) / Math.max(1, rect.height)) * 2;
		const ray = camera.raytrace([x, y]);
		const hit = raycastBranchMeshAABB(renderRoot, t, dt, ray);
		if (!hit) return;
		alert(`${hit.nodeId} hit!`);
	});

	function frame(now) {
		dt = Math.max(0, (now - last) * 0.001);
		last = now;
		t += dt;

		const eye = 0.5 + 0.5 * Math.sin(t * 5.0);
		for (const meshRenderer of meshRenderers) {
			if (meshRenderer.resolveMorphIndex(EYE_CLOSE_MORPH) < 0) continue;
			meshRenderer.setMorphWeight(EYE_CLOSE_MORPH, eye);
		}

		if (hipDrivers.length > 0) {
			for (const driver of hipDrivers) {
				const angle = Math.sin((t * 2.0 * driver.speed) + driver.phase) * 0.35;
				driver.live.set(driver.bone, Azm.Mat4.fromRotationY(angle));
			}
		}

		modelRoot.render({
			time: t,
			deltaTime: dt,
			beginFrame: true,
			endFrame: false,
			clearColorEnabled: true,
			clearDepthEnabled: true,
		});
		renderRoot.render({
			time: t,
			deltaTime: dt,
			beginFrame: false,
			endFrame: true,
			clearColorEnabled: false,
			clearDepthEnabled: false,
		});

		requestAnimationFrame(frame);
	}

	requestAnimationFrame(frame);
}

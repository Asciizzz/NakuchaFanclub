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

function buildWorldAABB(localAABB, modelMatrix) {
	if (!localAABB?.min || !localAABB?.max || !modelMatrix) return null;
	const min = localAABB.min;
	const max = localAABB.max;
	const corners = [
		[min[0], min[1], min[2]],
		[max[0], min[1], min[2]],
		[min[0], max[1], min[2]],
		[max[0], max[1], min[2]],
		[min[0], min[1], max[2]],
		[max[0], min[1], max[2]],
		[min[0], max[1], max[2]],
		[max[0], max[1], max[2]],
	];

	let outMin = null;
	let outMax = null;
	for (const corner of corners) {
		const p = Azm.Mat4.transformV3(modelMatrix, corner);
		if (!outMin) {
			outMin = Azm.Vec3.copy(p);
			outMax = Azm.Vec3.copy(p);
			continue;
		}
		if (p[0] < outMin[0]) outMin[0] = p[0];
		if (p[1] < outMin[1]) outMin[1] = p[1];
		if (p[2] < outMin[2]) outMin[2] = p[2];
		if (p[0] > outMax[0]) outMax[0] = p[0];
		if (p[1] > outMax[1]) outMax[1] = p[1];
		if (p[2] > outMax[2]) outMax[2] = p[2];
	}
	if (!outMin || !outMax) return null;
	return { min: outMin, max: outMax };
}

function raycastBranchMeshAABB(world, rootNode, ray, time) {
	const queue = world.render(rootNode, { collectOnly: true, time });
	let nearest = null;
	for (const draw of queue.draws) {
		const meshBounds = draw.mesh?.getAABB?.();
		if (!meshBounds) continue;
		const worldBounds = buildWorldAABB(meshBounds, draw.modelMatrix);
		if (!worldBounds) continue;
		const hit = AzCamera.hitAABB(ray, worldBounds.min, worldBounds.max);
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

	const modelRoot = await world.loadModelFromURL("/Models/Agnes.glb", {
		shaderId: "wr-default",
	});

	const renderRoot = world.addNode(null);
	if (!renderRoot) throw new Error("[WrScene] failed to create render root node");
	renderRoot.name = "wr-copy-root";

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

	canvas.addEventListener("pointerdown", (event) => {
		if (event.button !== 0) return;
		const rect = canvas.getBoundingClientRect();
		const x = ((event.clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
		const y = 1 - ((event.clientY - rect.top) / Math.max(1, rect.height)) * 2;
		const ray = camera.raytrace([x, y]);
		const hit = raycastBranchMeshAABB(world, renderRoot, ray, t);
		if (!hit) return;
		alert(`${hit.nodeId} hit!`);
	});

	function frame(now) {
		const dt = Math.max(0, (now - last) * 0.001);
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

		world.render(renderRoot, { time: t });

		requestAnimationFrame(frame);
	}

	requestAnimationFrame(frame);
}

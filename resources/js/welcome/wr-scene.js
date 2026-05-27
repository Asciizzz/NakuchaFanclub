import { AzWBackend } from "../AzLib/AzWBackend.js";
import { AzCamera } from "../AzLib/AzCamera.js";
import * as Azm from "../AzLib/Azm.js";
import {
	WrWorld,
	WrMeshRenderer,
	WrLiveSkeleton,
	WrTransform,
} from "../WeebRender2/index.js";
import { WrScreenHover } from "./WrScreenHover.js";

const EYE_CLOSE_MORPH = "Eye_2_R(CloseA)[M_Face]";
const container = document.getElementById("main-canvas");

function collectBranchNodes(roomRoot) {
	if (!roomRoot) return [];
	const out = [];
	for (const node of roomRoot.traverse({ mode: "dfs_pre", includeFrom: true })) {
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
	const hoverElement = document.getElementById("wr-hover");
	const hover = new WrScreenHover({
		world,
		camera,
		canvas,
		element: hoverElement,
		offsetY: -8,
	});
	hover.setRenderCondition((ctx, node) => !!node.getComp(WrMeshRenderer));
	hover.setRenderFunc((ctx, self) => {
		const node = self.node;
		const block = document.createElement("div");
		const title = document.createElement("div");
		title.className = "wr-hover__title";
		title.textContent = node.name || node.id;
		const meta = document.createElement("div");
		meta.className = "wr-hover__meta";
		meta.textContent = `#${node.id}`;
		block.appendChild(title);
		block.appendChild(meta);
		return block;
	});
	if (typeof window !== "undefined") {
		window.wrHover = hover;
		window.showHoverNode = (nodeId) => hover.render(nodeId);
	}

	const resize = () => {
		backend.resize({ maxPixelRatio: 2 });
		const w = Math.max(1, canvas.clientWidth || canvas.width || 1);
		const h = Math.max(1, canvas.clientHeight || canvas.height || 1);
		camera.aspect = w / h;
	};
	resize();
	new ResizeObserver(resize).observe(container);

	const pressed = new Set();
	const camForward = camera.forward;
	let camYaw = Math.atan2(camForward[0], -camForward[2]);
	let camPitch = Math.asin(Math.max(-1, Math.min(1, camForward[1])));
	const lookSpeed = 0.0022;
	const walkSpeed = 2.8;
	const sprintScale = 2.2;
	const pitchLimit = (Math.PI * 0.5) - 0.01;
	const fovMin = 20;
	const fovMax = 90;
	const fovWheelScale = 0.04;

	function onKeyDown(event) {
		pressed.add(event.code);
	}

	function onKeyUp(event) {
		pressed.delete(event.code);
	}

	function onMouseMove(event) {
		if (document.pointerLockElement !== canvas) return;
		camYaw -= event.movementX * lookSpeed;
		camPitch -= event.movementY * lookSpeed;
		if (camPitch > pitchLimit) camPitch = pitchLimit;
		if (camPitch < -pitchLimit) camPitch = -pitchLimit;
		camera.setYawPitch(camYaw, camPitch);
	}

	function onWheel(event) {
		event.preventDefault();
		camera.fov += event.deltaY * fovWheelScale;
		if (camera.fov < fovMin) camera.fov = fovMin;
		if (camera.fov > fovMax) camera.fov = fovMax;
	}

	canvas.addEventListener("pointerdown", (event) => {
		if (event.button === 2) return;
		if (document.pointerLockElement !== canvas) canvas.requestPointerLock();
	});
	window.addEventListener("keydown", onKeyDown);
	window.addEventListener("keyup", onKeyUp);
	window.addEventListener("mousemove", onMouseMove);
	canvas.addEventListener("wheel", onWheel, { passive: false });

	world.registerShader("main-shader", {
		renderCfg: {
			depthTest: true,
			depthWrite: true,
			cull: "back",
			blend: false,
			clearColor: [0, 0, 0, 0],
			clearDepth: 1,
		},
		wgsl: {
			links: [
				{ name: "out_uv", type: "vec2f" },
				{ name: "out_nrm", type: "vec3f" },
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

					out_nrm = normalize(($INST_MODEL$ * vec4f(skinnedNrm, 0.0)).xyz);
					output.position = $PROJECTION$ * $VIEW$ * $INST_MODEL$ * skinnedPos;
				`,
			},
			fragment: {
				main: `
					var texColor = textureSample($ALBEDO_TEX$, texSampler, out_uv) * $ALBEDO_COLOR$;
					if (texColor.a < 0.5) { discard; }
					texColor.a = 1.0;

					$OUT_COLOR$ = texColor;
				`,
			},
		},
		glsl: {
			links: [
				{ name: "out_uv", type: "vec2" },
				{ name: "out_nrm", type: "vec3" },
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

					out_nrm = normalize(($INST_MODEL$ * vec4(skinnedNrm, 0.0)).xyz);
					gl_Position = $PROJECTION$ * $VIEW$ * $INST_MODEL$ * skinnedPos;
				`,
			},
			fragment: {
				main: `
					vec4 texColor = texture($ALBEDO_TEX$, out_uv);
					if (texColor.a < 0.5) { discard; }

					// texColor.r = 0.0;

					$OUT_COLOR$ = texColor * $ALBEDO_COLOR$;
				`,
			},
		},
	});

	world.registerShader("outline-shader", {
		renderCfg: {
			depthTest: true,
			depthWrite: false,
			cull: "front",
			blend: false,
		},
		wgsl: {
			links: [
				{ name: "out_uv", type: "vec2f" },
				{ name: "out_nrm", type: "vec3f" },
			],
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
					let worldPos = ($INST_MODEL$ * skinnedPos).xyz + worldNrm * 0.015;
					output.position = $PROJECTION$ * $VIEW$ * vec4f(worldPos, 1.0);

					out_uv = $UV$;
					out_nrm = worldNrm;
				`,
			},
			fragment: {
				main: `
					// $OUT_COLOR$ = vec4f(out_uv.x, out_uv.y, 0.0, 1.0);

					// Color based on normal for testing
					$OUT_COLOR$ = vec4f(out_nrm * 0.5 + 0.5, 1.0);
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
					vec3 worldPos = ($INST_MODEL$ * skinnedPos).xyz + worldNrm * 0.035;
					gl_Position = $PROJECTION$ * $VIEW$ * vec4(worldPos, 1.0);
				`,
			},
			fragment: {
				main: `
					$OUT_COLOR$ = vec4(0.0, 0.0, 0.0, 1.0);
				`,
			},
		},
	});

	const roomRoot = await world.loadModelFromURL("/Models/Room.glb", {
		shaderIds: ["main-shader"]
	});

	const nakuRoot = await world.loadModelFromURL("/Models/Nakurin.glb", {
		shaderIds: ["main-shader"]
	});

	
	const renderRoot = world.addNode(null);
	renderRoot.name = "world";

	roomRoot.copyBranchTo(renderRoot.id);
	nakuRoot.copyBranchTo(renderRoot.id);

	/*

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
	*/

	// console.log(world.nodes);

	let last = performance.now();
	let t = 0;
	let dt = 0;

	canvas.addEventListener("pointerdown", (event) => {
		if (event.button !== 0) return;
		return; // disable for the time being
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
		const speed = walkSpeed * (pressed.has("ShiftLeft") || pressed.has("ShiftRight") ? sprintScale : 1) * dt;
		if (speed > 0) {
			const f = camera.forward;
			const r = camera.right;
			let dx = 0;
			let dy = 0;
			let dz = 0;
			if (pressed.has("KeyW")) {
				dx += f[0];
				dy += f[1];
				dz += f[2];
			}
			if (pressed.has("KeyS")) {
				dx -= f[0];
				dy -= f[1];
				dz -= f[2];
			}
			if (pressed.has("KeyD")) {
				dx += r[0];
				dy += r[1];
				dz += r[2];
			}
			if (pressed.has("KeyA")) {
				dx -= r[0];
				dy -= r[1];
				dz -= r[2];
			}
			const len = Math.hypot(dx, dy, dz);
			if (len > 0.00001) {
				const inv = speed / len;
				camera.position[0] += dx * inv;
				camera.position[1] += dy * inv;
				camera.position[2] += dz * inv;
			}
		}

		/*
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
		//*/

		renderRoot.render({
			time: t,
			deltaTime: dt,
			beginFrame: true,
			endFrame: true,
			clearColorEnabled: true,
			clearDepthEnabled: true,
		});
		hover.render(renderRoot.id);
		// renderRoot.render({
		// 	time: t,
		// 	deltaTime: dt,
		// 	beginFrame: false,
		// 	endFrame: true,
		// 	clearColorEnabled: true,
		// 	clearDepthEnabled: false,
		// });

		requestAnimationFrame(frame);
	}

	requestAnimationFrame(frame);
}

import * as Alm from "../../Alib/Alm.js";
import Awgpu from "../WrGPU.js";
import { Ctx } from "../../Alib/Atree.js";
import { MeshRenderer } from "../WrWorld/meshRenderer.js";
import { ShaderOBJ as ShaderOBJComp } from "../WrWorld/shaderObj.js";
import { ShaderFSC as ShaderFSCComp } from "../WrWorld/shaderFSC.js";
import { RenderPass as RenderPassComp } from "../WrWorld/renderPass.js";
import { Transform } from "../WrWorld/transform.js";
import { LiveSkeleton } from "../WrWorld/liveSkeleton.js";
import { WrRenderPass } from "../WrAssets/RenderPass.js";

const SCENE_UBO_F32 = 84;
const OBJECT_UBO_F32 = 2096;
const SKIN_BONE_CAP = 128;
const SKIN_BASE_F32 = 48;
const VERTEX_STRIDE = 76;
const VERTEX_ATTRS = Object.freeze([
	Object.freeze({ location: 0, size: 3, offset: 0 }),
	Object.freeze({ location: 1, size: 3, offset: 12 }),
	Object.freeze({ location: 2, size: 2, offset: 24 }),
	Object.freeze({ location: 3, size: 4, offset: 32 }),
	Object.freeze({ location: 4, size: 4, offset: 48 }),
	Object.freeze({ location: 5, size: 3, offset: 64 }),
]);
const GPU_BUFFER_USAGE = Object.freeze({
	COPY_DST: globalThis.GPUBufferUsage?.COPY_DST ?? 0x8,
	UNIFORM: globalThis.GPUBufferUsage?.UNIFORM ?? 0x40,
	VERTEX: globalThis.GPUBufferUsage?.VERTEX ?? 0x20,
	INDEX: globalThis.ferUsage?.INDEX ?? 0x10,
});
const KEYBOARD_TEX_W = 256;
const KEYBOARD_TEX_H = 1;

function asId(value) {
	if (value == null) return null;
	const id = String(value).trim();
	return id || null;
}

function asNode(world, from) {
	if (!world) return null;
	if (from && typeof from === "object" && from.ctx === world) return from;
	const id = asId(from);
	if (!id) return null;
	return world.getNode(id);
}

function assetKey(asset, fallback = "") {
	if (!asset || typeof asset !== "object") return fallback;
	const key = asset.ref?.id ?? asset.hash ?? asset.label ?? fallback;
	return key == null ? fallback : String(key);
}

function pushShaders(target, values) {
	if (!Array.isArray(values)) return;
	for (const value of values) {
		if (!value || typeof value !== "object") continue;
		target.push(value);
	}
}

function sortRenderQueue(queue, batchMode = "shader") {
	if (String(batchMode ?? "shader").toLowerCase() === "none") return queue;
	const fsc = [];
	const mesh = [];
	for (const op of queue) {
		if (op?.type === "mesh") mesh.push(op);
		else fsc.push(op);
	}
	mesh.sort((a, b) => {
		const shaderA = Number(a.shaderOrder ?? 0) || 0;
		const shaderB = Number(b.shaderOrder ?? 0) || 0;
		if (shaderA !== shaderB) return shaderA - shaderB;
		const orderA = Number(a.queueOrder ?? 0) || 0;
		const orderB = Number(b.queueOrder ?? 0) || 0;
		return orderA - orderB;
	});
	return [...fsc, ...mesh];
}

function readColor4(value, fallback = [1, 1, 1, 1]) {
	const src = (Array.isArray(value) || ArrayBuffer.isView(value)) ? value : fallback;
	return [
		Number(src[0] ?? fallback[0]) || 0,
		Number(src[1] ?? fallback[1]) || 0,
		Number(src[2] ?? fallback[2]) || 0,
		Number(src[3] ?? fallback[3]) || 0,
	];
}

function resolveTexture(meshRenderer, material) {
	const fromComp = meshRenderer?.textures?.albedo;
	if (fromComp && typeof fromComp === "object") return fromComp;
	const fromMat = material?.albedoTex;
	if (fromMat && typeof fromMat === "object") return fromMat;
	return null;
}

function resolveSlotId(shaderFSC, slot) {
	const tex = shaderFSC?.textureSlots?.[`slot${slot}`] ?? null;
	return assetKey(tex, null);
}

function resolveSlotTexture(shaderFSC, slot) {
	const tex = shaderFSC?.textureSlots?.[`slot${slot}`] ?? null;
	return tex && typeof tex === "object" ? tex : null;
}

function resolveMorphWeight(meshRenderer) {
	if (!meshRenderer?.morphWeights) return 0;
	return Number(meshRenderer.morphWeights[0] ?? 0) || 0;
}

function collectSubmeshFlags(draw, submeshIndex) {
	const submesh = draw?.mesh?.submeshes?.[submeshIndex] ?? null;
	const staticPart = submesh?.static ?? {};
	const rigPart = submesh?.rigged ?? submesh?.rig ?? {};
	const morphPart = submesh?.morph ?? {};
	const hasArray = (value, minCount = 1) => {
		if (ArrayBuffer.isView(value) || Array.isArray(value)) return value.length >= minCount;
		return false;
	};
	const hasUV = hasArray(staticPart.uvs ?? staticPart.uv, 2);
	const hasNormal = hasArray(staticPart.normals, 3);
	const hasColor = hasArray(staticPart.colors ?? staticPart.color, 3);
	const hasTangent = hasArray(staticPart.tangents, 4);
	const hasBoneIDs = hasArray(rigPart.boneIDs ?? rigPart.ids ?? rigPart.bones, 4);
	const hasBoneWeights = hasArray(rigPart.boneWeights ?? rigPart.weights, 4);
	const hasBone = hasBoneIDs && hasBoneWeights;
	const morphHasPos = hasArray(morphPart.dPositions ?? morphPart.dPos, 3);
	const morphHasNormal = hasArray(morphPart.dNormals, 3);
	const morphHasTangent = hasArray(morphPart.dTangents, 4);
	return {
		hasUV,
		hasNormal,
		hasColor,
		hasTangent,
		hasBone,
		morphHasPos,
		morphHasNormal,
		morphHasTangent,
	};
}

function resolveParentNode(node) {
	if (!node?.ctx || node.parentId == null) return null;
	return node.ctx.getNode(node.parentId);
}

function resolveNearestLiveSkeleton(node) {
	let current = node ?? null;
	while (current) {
		const live = current.getComp?.(LiveSkeleton) ?? null;
		if (live) return live;
		current = resolveParentNode(current);
	}
	return null;
}

function normalizeFrameOptions(options = {}, passCfg = null) {
	const src = options && typeof options === "object" ? options : {};
	const pass = passCfg && typeof passCfg === "object" ? passCfg : {};
	return {
		clearColor: src.clearColor ?? pass.clearColor ?? [0, 0, 0, 0],
		clearColorEnabled: src.clearColorEnabled ?? pass.clearColorEnabled ?? true,
		clearDepth: src.clearDepth ?? pass.clearDepth ?? 1,
		clearDepthEnabled: src.clearDepthEnabled ?? pass.clearDepthEnabled ?? true,
		useDepth: src.useDepth ?? pass.useDepth ?? true,
		sampleCount: src.sampleCount,
	};
}

function alignTo4(n) {
	return Math.ceil(n / 4) * 4;
}

function alignTo256(n) {
	return Math.ceil(n / 256) * 256;
}

function padTo4Bytes(data) {
	if (!data) return data;
	if (ArrayBuffer.isView(data)) {
		const byteLength = data.byteLength;
		const byteOffset = data.byteOffset ?? 0;
		if ((byteLength % 4) === 0 && (byteOffset % 4) === 0) return data;
		const padded = new Uint8Array(alignTo4(byteLength));
		padded.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), 0);
		return padded;
	}
	return data;
}

function getCamera(camera) {
	return camera ?? null;
}

function resolveRenderPassAsset(passComp) {
	if (!passComp) return null;
	if (passComp.pass) return passComp.pass;
	if (passComp.cfg && typeof passComp.cfg === "object") {
		return WrRenderPass.from({
			...passComp.cfg,
		});
	}
	return null;
}

function renderPassFrameOptions(passAsset) {
	if (passAsset && typeof passAsset.toFrameOptions === "function") return passAsset.toFrameOptions();
	return passAsset ?? null;
}

function applyWglState(gl, state) {
	if (!gl || !state) return;
	if (state.depthTest) gl.enable(gl.DEPTH_TEST);
	else gl.disable(gl.DEPTH_TEST);
	gl.depthMask(state.depthMask !== false);
	if (state.depthFunc != null) gl.depthFunc(state.depthFunc);

	if (state.cull) {
		gl.enable(gl.CULL_FACE);
		gl.cullFace(state.cullFace ?? gl.BACK);
	} else {
		gl.disable(gl.CULL_FACE);
	}
	if (state.frontFace != null) gl.frontFace(state.frontFace);

	if (state.blend) {
		gl.enable(gl.BLEND);
		if (state.blendEquationSeparate) {
			gl.blendEquationSeparate(state.blendEquationSeparate[0], state.blendEquationSeparate[1]);
		}
		if (state.blendFuncSeparate) {
			gl.blendFuncSeparate(
				state.blendFuncSeparate[0],
				state.blendFuncSeparate[1],
				state.blendFuncSeparate[2],
				state.blendFuncSeparate[3],
			);
		}
	} else {
		gl.disable(gl.BLEND);
	}
	if (state.colorMask) gl.colorMask(!!state.colorMask[0], !!state.colorMask[1], !!state.colorMask[2], !!state.colorMask[3]);
}

export class WrRenderer {
	#gpuByBackend = new WeakMap();
	backend = null;
	world = null;
	camera = null;

	constructor(options = {}) {
		const src = options && typeof options === "object" ? options : {};
		this.backend = src.backend ?? null;
		this.world = src.world ?? null;
		this.camera = src.camera ?? null;
	}

	setBackend(backend) {
		this.backend = backend ?? null;
		return this;
	}

	setWorld(world) {
		this.world = world ?? null;
		return this;
	}

	setCamera(camera) {
		this.camera = camera ?? null;
		return this;
	}

	render(options = {}) {
		const src = options && typeof options === "object" ? options : {};
		const world = src.world ?? this.world ?? null;
		const backend = src.backend ?? this.backend ?? null;
		const camera = getCamera(src.camera ?? this.camera ?? null);
		const fromNode = asNode(world, src.from ?? src.fromId ?? null);
		if (!world || !fromNode) {
			return { from: null, passNodeId: null, count: 0, ops: [], reason: "missing_input" };
		}
		const modelByNode = this.#updateTransforms(fromNode);
		const passRoots = this.#collectPassRoots(fromNode);
		if (passRoots.length <= 0) {
			return {
				from: fromNode.id,
				passNodeId: null,
				passCount: 0,
				count: 0,
				ops: [],
				passes: [],
				backend: backend?.kind ?? null,
				reason: "missing_renderpass",
			};
		}

		const passResults = [];
		const mergedStats = {
			passRoots: passRoots.length,
			nodesVisited: 0,
			prunedNestedRenderPass: 0,
			skippedMeshNoShader: 0,
			skippedMeshInvalidShader: 0,
		};
		const allOps = [];
		for (const passNode of passRoots) {
			const passComp = passNode.getComp(RenderPassComp) ?? null;
			const passAsset = resolveRenderPassAsset(passComp);
			if (!passComp || !passAsset) continue;
			if (String(passAsset.target?.type ?? "screen") !== "screen") {
				const passResult = {
					from: fromNode.id,
					passNodeId: passNode.id,
					passHash: passAsset.hash ?? null,
					passCfg: renderPassFrameOptions(passAsset),
					target: passAsset.target,
					count: 0,
					ops: [],
					stats: {
						nodesVisited: 0,
						prunedNestedRenderPass: 0,
						skippedMeshNoShader: 0,
						skippedMeshInvalidShader: 0,
					},
					backend: backend?.kind ?? null,
					reason: "unsupported_render_target",
				};
				passComp.setResult(passResult);
				passResults.push(passResult);
				continue;
			}
			const collected = this.#buildQueue(world, passNode, modelByNode, passAsset);
			const passResult = {
				from: fromNode.id,
				passNodeId: passNode.id,
				passHash: passAsset.hash ?? null,
				passCfg: renderPassFrameOptions(passAsset),
				target: passAsset.target,
				count: collected.ops.length,
				ops: collected.ops,
				stats: collected.stats,
				backend: backend?.kind ?? null,
				reason: null,
			};
			passComp.setResult(passResult);
			passResults.push(passResult);
			allOps.push(...collected.ops);
			mergedStats.nodesVisited += collected.stats.nodesVisited;
			mergedStats.prunedNestedRenderPass += collected.stats.prunedNestedRenderPass;
			mergedStats.skippedMeshNoShader += collected.stats.skippedMeshNoShader;
			mergedStats.skippedMeshInvalidShader += collected.stats.skippedMeshInvalidShader;
		}

		if (!backend || src.collectOnly === true) {
			return {
				from: fromNode.id,
				passNodeId: passResults[0]?.passNodeId ?? null,
				passCount: passResults.length,
				count: allOps.length,
				ops: allOps,
				passes: passResults,
				stats: mergedStats,
				backend: backend?.kind ?? null,
				reason: null,
			};
		}
		const runtimeState = this.#getGpuState(backend);
		this.#updateFscRuntime(backend, runtimeState, src);

		const passOverrides = (baseOptions, passCfg) => ({
			...baseOptions,
			clearColor: baseOptions.clearColor ?? passCfg?.clearColor,
			clearColorEnabled: baseOptions.clearColorEnabled ?? passCfg?.clearColorEnabled,
			clearDepth: baseOptions.clearDepth ?? passCfg?.clearDepth,
			clearDepthEnabled: baseOptions.clearDepthEnabled ?? passCfg?.clearDepthEnabled,
			useDepth: baseOptions.useDepth ?? passCfg?.useDepth,
		});

		if (backend.kind === "webgpu") {
			const firstCfg = passResults[0]?.passCfg ?? null;
			backend.beginFrame(passOverrides(src, firstCfg));
			for (const passResult of passResults) {
				this.#renderWgpu(backend, camera, passResult.ops, {
					...passOverrides(src, passResult.passCfg),
					beginFrame: false,
					endFrame: false,
				});
			}
			backend.endFrame();
		}
		if (backend.kind === "webgl2") {
			const firstCfg = passResults[0]?.passCfg ?? null;
			backend.beginFrame(passOverrides(src, firstCfg));
			for (const passResult of passResults) {
				this.#renderWgl2(backend, camera, passResult.ops, {
					...passOverrides(src, passResult.passCfg),
					beginFrame: false,
					endFrame: false,
				});
			}
			backend.endFrame();
		}
		if (runtimeState.keyboardUploaded) this.#clearKeyboardTransient(runtimeState);

		return {
			from: fromNode.id,
			passNodeId: passResults[0]?.passNodeId ?? null,
			passCount: passResults.length,
			count: allOps.length,
			ops: allOps,
			passes: passResults.map((entry) => ({ ...entry, backend: backend.kind })),
			stats: mergedStats,
			backend: backend.kind,
			reason: null,
		};
	}

	#collectPassRoots(fromNode) {
		const roots = [];
		for (const [node] of fromNode.traverse({
			mode: "bfs",
			includeFrom: true,
			ignore: {
				checkNode: (node) => {
					const passComp = node.getComp(RenderPassComp) ?? null;
					if (node !== fromNode && passComp) return 0;
					return 0;
				},
			},
		})) {
			const passComp = node.getComp(RenderPassComp) ?? null;
			if (passComp) {
				roots.push(node);
			}
		}
		return roots;
	}

	#buildQueue(world, fromNode, modelByNode, passAsset = null) {
		const queue = [];
		const stats = {
			nodesVisited: 0,
			prunedNestedRenderPass: 0,
			skippedMeshNoShader: 0,
			skippedMeshInvalidShader: 0,
		};
		const traverseMode = String(passAsset?.traverseMode ?? "bfs").toLowerCase();
		const batchMode = String(passAsset?.batchMode ?? "shader").toLowerCase();
		const ctxById = new Map([[fromNode.id, { pass: null, shaders: [] }]]);
		const shaderRank = new Map();
		let nextShaderRank = 0;
		let queueOrder = 0;

		for (const [node] of fromNode.traverse({
			mode: traverseMode,
			includeFrom: true,
			ignore: {
				checkNode: (node) => {
					if (node === fromNode) return 0;
					const passComp = node.getComp(RenderPassComp) ?? null;
					if (passComp) {
						stats.prunedNestedRenderPass += 1;
						return Ctx.CHECK.BREAK_BRANCH | Ctx.CHECK.SKIP_YIELD;
					}
					return 0;
				},
			},
		})) {
			stats.nodesVisited += 1;
			const parentCtx = ctxById.get(node.id) ?? { pass: null, shaders: [] };
			const ownPass = node.getComp(RenderPassComp) ?? null;
			const passComp = ownPass ?? parentCtx.pass ?? null;
			const shaderComp = node.getComp(ShaderOBJComp);
			const shaderFSCComp = node.getComp(ShaderFSCComp);
			const shaders = parentCtx.shaders.slice();
			if (shaderComp) {
				for (const shader of shaderComp.shaders) {
					if (!shader || typeof shader !== "object") continue;
					if (!shaderRank.has(shader)) shaderRank.set(shader, nextShaderRank++);
				}
				pushShaders(shaders, shaderComp.shaders);
			}

			if (shaderFSCComp) {
				for (const shader of shaderFSCComp.shaders) {
					if (!shader) continue;
					queue.push({
						type: "fsc",
						node,
						nodeId: node.id,
						shader,
						pass: passComp,
						shaderFSC: shaderFSCComp,
					});
				}
			}

			const meshRenderer = node.getComp(MeshRenderer);
			if (meshRenderer && meshRenderer.cfg?.display !== false) {
				const mesh = meshRenderer.mesh ?? null;
				if (mesh) {
					const liveSkeleton = meshRenderer.cfg?.hasRig ? resolveNearestLiveSkeleton(node) : null;
					let skinPalette = null;
					if (liveSkeleton) {
						const skeleton = liveSkeleton.skeleton ?? null;
						if (skeleton?.buildPalette) skinPalette = skeleton.buildPalette(liveSkeleton.bones, SKIN_BONE_CAP);
					}
					const drawShaders = [];
					for (const shader of shaders) {
						if (!shader) {
							stats.skippedMeshInvalidShader += 1;
							continue;
						}
						drawShaders.push(shader);
					}
					if (drawShaders.length <= 0) {
						stats.skippedMeshNoShader += 1;
					}
					for (const shader of drawShaders) {
						queue.push({
							type: "mesh",
							node,
							nodeId: node.id,
							mesh,
							meshRenderer,
							shader,
							shaderOrder: shaderRank.get(shader) ?? 0,
							queueOrder: queueOrder++,
							pass: passComp,
							modelMatrix: modelByNode.get(node.id) ?? Alm.Mat4.makeIdentity(),
							skinPalette,
						});
					}
				}
			}

			for (const child of node.children) {
				ctxById.set(child.id, { pass: passComp, shaders });
			}
		}

		return { ops: sortRenderQueue(queue, batchMode), stats };
	}

	#updateTransforms(fromNode) {
		const modelByNode = new Map();
		const parentWorldByNode = new Map();
		parentWorldByNode.set(fromNode.id, this.#resolveAncestorWorld(fromNode));

		for (const [node] of fromNode.traverse({ mode: "bfs", includeFrom: true })) {
			const parentWorld = parentWorldByNode.get(node.id) ?? Alm.Mat4.IDENTITY;
			const tx = node.getComp(Transform);
			let nodeWorld = null;
			if (tx) {
				tx.world = Alm.Mat4.mul(parentWorld, tx.local);
				nodeWorld = tx.world;
			} else {
				nodeWorld = new Float32Array(parentWorld);
			}
			modelByNode.set(node.id, nodeWorld);
			for (const child of node.children) {
				parentWorldByNode.set(child.id, nodeWorld);
			}
		}
		return modelByNode;
	}

	#resolveAncestorWorld(fromNode) {
		const chain = [];
		let current = resolveParentNode(fromNode);
		while (current) {
			chain.push(current);
			current = resolveParentNode(current);
		}

		let world = Alm.Mat4.IDENTITY;
		for (let i = chain.length - 1; i >= 0; i -= 1) {
			const tx = chain[i].getComp(Transform);
			if (!tx) continue;
			tx.world = Alm.Mat4.mul(world, tx.local);
			world = tx.world;
		}
		return world;
	}

	#getGpuState(backend) {
		let state = this.#gpuByBackend.get(backend);
		if (state) return state;
		state = {
			sceneScratch: new Float32Array(SCENE_UBO_F32),
			objectHeaderScratch: new Float32Array(SKIN_BASE_F32),
			objectScratch: new Float32Array(OBJECT_UBO_F32),
			sceneBuffer: null,
			assetGpu: new WeakMap(),
			objectBuffers: new Map(),
			sceneBindGroups: new WeakMap(),
			objectBindGroups: new WeakMap(),
			fscBindGroups: new WeakMap(),
			wgpuFallbackTexture: null,
			wglFallbackTexture: null,
			wgpuKeyboardTexture: null,
			wglKeyboardTexture: null,
			wglUniformCache: new WeakMap(),
			identityPalette: null,
			inputCanvas: null,
			inputHandlers: null,
			mouse: new Float32Array([0, 0, -1, -1]),
			date: new Float32Array(4),
			frame: new Float32Array(4),
			channelSizes: new Float32Array(16),
			keyboard: new Uint8Array(KEYBOARD_TEX_W * KEYBOARD_TEX_H * 4),
			frameIndex: 0,
			keyboardUploaded: false,
		};
		this.#gpuByBackend.set(backend, state);
		return state;
	}

	#identityPalette(state) {
		if (state.identityPalette) return state.identityPalette;
		const out = new Float32Array(SKIN_BONE_CAP * 16);
		for (let i = 0; i < SKIN_BONE_CAP; i += 1) out.set(Alm.Mat4.IDENTITY, i * 16);
		state.identityPalette = out;
		return out;
	}

	#assetCache(state, asset) {
		if (!asset || typeof asset !== "object") return null;
		let cache = state.assetGpu.get(asset);
		if (cache) return cache;
		cache = new Map();
		state.assetGpu.set(asset, cache);
		return cache;
	}

	#gpuShader(backend, state, shader, options = {}) {
		if (!backend || !shader || typeof shader.buildBackend !== "function") return null;
		const cache = this.#assetCache(state, shader);
		if (!cache) return null;
		const key = [
			"shader",
			backend.kind,
			`samples:${Math.max(1, Number(options.sampleCount ?? 1) || 1)}`,
			`depth:${options.useDepth ? "1" : "0"}`,
			shader.hash ?? shader.label ?? "",
		].join("|");
		const cached = cache.get(key);
		if (cached) return cached;
		const built = shader.buildBackend(backend, options);
		if (!built) return null;
		cache.set(key, built);
		return built;
	}

	#gpuMesh(backend, state, mesh, options = {}) {
		if (!backend || !mesh || typeof mesh.packSubmeshes !== "function") return null;
		const cache = this.#assetCache(state, mesh);
		if (!cache) return null;
		const morphTargetIndex = Math.max(0, Number(options.morphTargetIndex ?? 0) | 0);
		const key = ["mesh", backend.kind, `morph:${morphTargetIndex}`, mesh.hash ?? ""].join("|");
		const cached = cache.get(key);
		if (cached) return cached;
		const packed = mesh.packSubmeshes({ morphTargetIndex });
		if (!Array.isArray(packed) || packed.length <= 0) return null;
		let out = null;
		if (backend.kind === "webgpu") out = this.#gpuMeshWgpu(backend, packed, mesh.hash ?? "mesh");
		if (backend.kind === "webgl2") out = this.#gpuMeshWgl2(backend, packed);
		if (!out) return null;
		cache.set(key, out);
		return out;
	}

	#gpuMeshWgpu(backend, packed, label) {
		const submeshes = [];
		for (const item of packed) {
			const vertexBuffer = backend.createBuffer({
				label: `Wr21VB:${label}`,
				size: alignTo4(item.vertexData.byteLength),
				usage: GPU_BUFFER_USAGE.VERTEX | GPU_BUFFER_USAGE.COPY_DST,
			});
			const indexBuffer = backend.createBuffer({
				label: `Wr21IB:${label}`,
				size: alignTo4(item.indexData.byteLength),
				usage: GPU_BUFFER_USAGE.INDEX | GPU_BUFFER_USAGE.COPY_DST,
			});
			backend.writeBuffer(vertexBuffer, padTo4Bytes(item.vertexData), 0);
			backend.writeBuffer(indexBuffer, padTo4Bytes(item.indexData), 0);
			submeshes.push({
				vertexBuffer,
				indexBuffer,
				indexFormat: item.indexFormat,
				indexCount: item.indexCount,
				layout: item.layout,
			});
		}
		return { kind: "webgpu", submeshes };
	}

	#gpuMeshWgl2(backend, packed) {
		const gl = backend.gl ?? null;
		if (!gl) return null;
		const submeshes = [];
		for (const item of packed) {
			const vbo = gl.createBuffer();
			const ibo = gl.createBuffer();
			gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
			gl.bufferData(gl.ARRAY_BUFFER, item.vertexData, gl.STATIC_DRAW);
			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
			gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, item.indexData, gl.STATIC_DRAW);
			submeshes.push({
				vbo,
				ibo,
				indexCount: item.indexCount,
				indexType: item.indexFormat === "uint32" ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
				layout: item.layout,
			});
		}
		gl.bindBuffer(gl.ARRAY_BUFFER, null);
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
		return { kind: "webgl2", submeshes };
	}

	#gpuTexture(backend, state, texture) {
		if (!backend || !texture) return null;
		const cache = this.#assetCache(state, texture);
		if (!cache) return null;
		const key = ["texture", backend.kind, texture.hash ?? ""].join("|");
		const cached = cache.get(key);
		if (cached) return cached;
		let out = null;
		if (backend.kind === "webgpu") out = this.#gpuTextureWgpu(backend, texture);
		if (backend.kind === "webgl2") out = this.#gpuTextureWgl2(backend, texture);
		if (!out) return null;
		cache.set(key, out);
		return out;
	}

	#gpuTextureWgpu(backend, texture) {
		const width = Math.max(1, Number(texture.width ?? texture.source?.width ?? 1) | 0);
		const height = Math.max(1, Number(texture.height ?? texture.source?.height ?? 1) | 0);
		const gpuTexture = backend.createTexture2D({
			label: `Wr21Tex:${texture.hash ?? "texture"}`,
			width,
			height,
			format: texture.format ?? "rgba8unorm",
		});
		if (!gpuTexture) return null;

		const source = texture.source ?? null;
		if (ArrayBuffer.isView(source)) {
			const bytesPerPixel = Math.max(1, Number(texture.bytesPerPixel ?? 4) | 0);
			const rowBytes = width * bytesPerPixel;
			const bytesPerRow = alignTo256(rowBytes);
			let data = source;
			if (bytesPerRow !== rowBytes) {
				const srcBytes = new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
				const padded = new Uint8Array(bytesPerRow * height);
				for (let y = 0; y < height; y += 1) {
					const srcOffset = y * rowBytes;
					const dstOffset = y * bytesPerRow;
					padded.set(srcBytes.subarray(srcOffset, srcOffset + rowBytes), dstOffset);
				}
				data = padded;
			}
			backend.writeTexture(
				gpuTexture,
				data,
				{ offset: 0, bytesPerRow, rowsPerImage: height },
				{ width, height, depthOrArrayLayers: 1 },
			);
		} else if (source && backend.device?.queue?.copyExternalImageToTexture) {
			Awgpu.Texture.writeExternal(backend.device, gpuTexture, source, {
				width,
				height,
				flipY: false,
			});
		}

		const view = gpuTexture.createView();
		const sampler = backend.createSampler({
			minFilter: texture.sampler?.minFilter ?? "linear",
			magFilter: texture.sampler?.magFilter ?? "linear",
			mipmapFilter: texture.sampler?.mipmapFilter ?? "linear",
			addressModeU: texture.sampler?.wrapU ?? "clamp-to-edge",
			addressModeV: texture.sampler?.wrapV ?? "clamp-to-edge",
		});
		return { kind: "webgpu", texture: gpuTexture, view, sampler };
	}

	#gpuTextureWgl2(backend, texture) {
		const gl = backend.gl ?? null;
		if (!gl) return null;
		const width = Math.max(1, Number(texture.width ?? texture.source?.width ?? 1) | 0);
		const height = Math.max(1, Number(texture.height ?? texture.source?.height ?? 1) | 0);
		const tex = backend.createTexture2D({
			width,
			height,
			wrapS: texture.sampler?.wrapU === "repeat" ? gl.REPEAT : gl.CLAMP_TO_EDGE,
			wrapT: texture.sampler?.wrapV === "repeat" ? gl.REPEAT : gl.CLAMP_TO_EDGE,
			minFilter: gl.LINEAR,
			magFilter: gl.LINEAR,
		});
		if (!tex) return null;
		const source = texture.source ?? null;
		if (source) {
			if (ArrayBuffer.isView(source)) backend.writeTexture2D(tex, source, { width, height, format: gl.RGBA, type: gl.UNSIGNED_BYTE });
			else backend.writeTexture2D(tex, source, { format: gl.RGBA, type: gl.UNSIGNED_BYTE });
		}
		return { kind: "webgl2", texture: tex };
	}

	#updateFscRuntime(backend, state, options) {
		this.#attachInputCanvas(state, backend?.canvas ?? null);
		const dt = Number(options.deltaTime ?? 0) || 0;
		state.frameIndex += 1;
		state.frame[0] = state.frameIndex;
		state.frame[1] = dt > 0 ? 1 / dt : 0;
		state.frame[2] = 0;
		state.frame[3] = 0;

		const now = new Date();
		const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate());
		state.date[0] = now.getFullYear();
		state.date[1] = now.getMonth() + 1;
		state.date[2] = now.getDate();
		state.date[3] = (now.getTime() - midnight.getTime()) * 0.001;
		state.keyboardUploaded = false;
	}

	#attachInputCanvas(state, canvas) {
		if (!canvas || state.inputCanvas === canvas) return;
		this.#detachInputCanvas(state);
		state.inputCanvas = canvas;

		const readMouse = (event) => {
			const rect = canvas.getBoundingClientRect();
			const sx = canvas.width / Math.max(1, rect.width);
			const sy = canvas.height / Math.max(1, rect.height);
			state.mouse[0] = (event.clientX - rect.left) * sx;
			state.mouse[1] = (event.clientY - rect.top) * sy;
		};
		const move = (event) => readMouse(event);
		const down = (event) => {
			readMouse(event);
			state.mouse[2] = state.mouse[0];
			state.mouse[3] = state.mouse[1];
		};
		const up = () => {
			state.mouse[2] = -1;
			state.mouse[3] = -1;
		};
		const keyDown = (event) => {
			const code = Math.max(0, Math.min(255, Number(event.keyCode ?? event.which ?? 0) | 0));
			const offset = code * 4;
			if (state.keyboard[offset] === 0) state.keyboard[offset + 1] = 255;
			state.keyboard[offset] = 255;
		};
		const keyUp = (event) => {
			const code = Math.max(0, Math.min(255, Number(event.keyCode ?? event.which ?? 0) | 0));
			const offset = code * 4;
			state.keyboard[offset] = 0;
			state.keyboard[offset + 2] = 255;
		};

		canvas.addEventListener("mousemove", move);
		canvas.addEventListener("mousedown", down);
		globalThis.addEventListener?.("mouseup", up);
		globalThis.addEventListener?.("keydown", keyDown);
		globalThis.addEventListener?.("keyup", keyUp);
		state.inputHandlers = { move, down, up, keyDown, keyUp };
	}

	#detachInputCanvas(state) {
		const canvas = state.inputCanvas;
		const handlers = state.inputHandlers;
		if (!canvas || !handlers) return;
		canvas.removeEventListener("mousemove", handlers.move);
		canvas.removeEventListener("mousedown", handlers.down);
		globalThis.removeEventListener?.("mouseup", handlers.up);
		globalThis.removeEventListener?.("keydown", handlers.keyDown);
		globalThis.removeEventListener?.("keyup", handlers.keyUp);
		state.inputCanvas = null;
		state.inputHandlers = null;
	}

	#clearKeyboardTransient(state) {
		const keys = state.keyboard;
		for (let i = 0; i < keys.length; i += 4) {
			keys[i + 1] = 0;
			keys[i + 2] = 0;
		}
	}

	#renderWgpu(backend, camera, queue, options) {
		if (!backend?.ready) return;
		if (!Array.isArray(queue) || queue.length <= 0) return;

		const state = this.#getGpuState(backend);
		const frameOptions = normalizeFrameOptions(options, queue[0]?.pass?.cfg ?? null);
		const beginFrame = options.beginFrame !== false;
		const endFrame = options.endFrame !== false;
		if (beginFrame) backend.beginFrame(frameOptions);

		const time = Number(options.time ?? 0) || 0;
		const deltaTime = Number(options.deltaTime ?? 0) || 0;
		this.#writeSceneWgpu(backend, state, camera, time, deltaTime, null);
		const pass = backend.beginRenderPass(frameOptions);
		if (!pass) {
			if (endFrame) backend.endFrame();
			return;
		}

		for (const draw of queue) {
			if (draw.type === "fsc") {
				const backendShader = this.#gpuShader(backend, state, draw.shader, {
					createPipeline: true,
					sampleCount: frameOptions.sampleCount ?? backend.sampleCount ?? 1,
					useDepth: !!(frameOptions.useDepth || frameOptions.clearDepthEnabled),
				});
				const pipeline = backendShader?.pipeline ?? null;
				if (!pipeline) continue;
				this.#writeSceneWgpu(backend, state, camera, time, deltaTime, draw.shaderFSC);
				const sceneBG = this.#ensureSceneBindGroupWgpu(backend, state, pipeline);
				if (!sceneBG) continue;
				pass.setPipeline(pipeline);
				pass.setBindGroup(0, sceneBG);
				if (backendShader.features?.needsInputGroup) {
					const inputBG = this.#ensureFscBindGroupWgpu(backend, state, pipeline, draw.shaderFSC, backendShader.features);
					if (!inputBG) continue;
					pass.setBindGroup(1, inputBG);
				}
				pass.draw(3, 1, 0, 0);
				continue;
			}
			if (draw.type !== "mesh") continue;
			const shader = draw.shader ?? null;
			if (!shader) continue;
			const backendShader = this.#gpuShader(backend, state, shader, {
				createPipeline: true,
				sampleCount: frameOptions.sampleCount ?? backend.sampleCount ?? 1,
			});
			const pipeline = backendShader?.pipeline ?? null;
			if (!pipeline) continue;

			const mesh = draw.mesh ?? null;
			if (!mesh) continue;
			const morphTargetIndex = 0;
			const gpuMesh = this.#gpuMesh(backend, state, mesh, { morphTargetIndex });
			if (!gpuMesh?.submeshes?.length) continue;

			const sceneBG = this.#ensureSceneBindGroupWgpu(backend, state, pipeline);
			if (!sceneBG) continue;
			pass.setPipeline(pipeline);
			pass.setBindGroup(0, sceneBG);

			for (let i = 0; i < gpuMesh.submeshes.length; i += 1) {
				const submeshGpu = gpuMesh.submeshes[i];
				const material = mesh.submeshes?.[i]?.material ?? {};
				const tex = resolveTexture(draw.meshRenderer, material);
				const textureGpu = tex ? this.#gpuTexture(backend, state, tex) : this.#fallbackWgpuTexture(backend, state);
				if (!textureGpu) continue;

				this.#writeObjectWgpu(
					backend,
					state,
					`${draw.nodeId}|${mesh.hash ?? "mesh"}|${i}`,
					draw,
					mesh,
					i,
					material,
					resolveMorphWeight(draw.meshRenderer),
				);
				const objectBG = this.#ensureObjectBindGroupWgpu(
					backend,
					state,
					pipeline,
					`${draw.nodeId}|${mesh.hash ?? "mesh"}|${i}`,
					textureGpu,
				);
				if (!objectBG) continue;

				pass.setBindGroup(1, objectBG);
				pass.setVertexBuffer(0, submeshGpu.vertexBuffer);
				pass.setIndexBuffer(submeshGpu.indexBuffer, submeshGpu.indexFormat);
				pass.drawIndexed(submeshGpu.indexCount, 1, 0, 0, 0);
			}
		}

		pass.end();
		if (endFrame) backend.endFrame();
	}

	#writeSceneWgpu(backend, state, camera, time, deltaTime, shaderFSC = null) {
		const scene = state.sceneScratch;
		scene.fill(0);
		const view = camera?.view ?? Alm.Mat4.IDENTITY;
		const projection = camera?.projection ?? Alm.Mat4.IDENTITY;
		const viewProj = Alm.Mat4.mul(projection, view);
		scene.set(view, 0);
		scene.set(projection, 16);
		scene.set(viewProj, 32);
		if (camera?.position) {
			scene[48] = Number(camera.position[0] ?? 0) || 0;
			scene[49] = Number(camera.position[1] ?? 0) || 0;
			scene[50] = Number(camera.position[2] ?? 0) || 0;
			scene[51] = 1;
		}
		scene[52] = time;
		scene[53] = deltaTime;
		scene[54] = Number(backend?.canvas?.width ?? 0) || 0;
		scene[55] = Number(backend?.canvas?.height ?? 0) || 0;
		scene.set(state.mouse, 56);
		scene.set(state.date, 60);
		scene.set(state.frame, 64);
		this.#writeChannelSizes(state, shaderFSC);
		scene.set(state.channelSizes, 68);
		const buffer = this.#ensureSceneBufferWgpu(backend, state);
		backend.writeBuffer(buffer, scene, 0);
	}

	#writeChannelSizes(state, shaderFSC = null) {
		const out = state.channelSizes;
		for (let i = 0; i < 4; i += 1) {
			const tex = resolveSlotTexture(shaderFSC, i);
			const width = Math.max(1, Number(tex?.width ?? tex?.source?.width ?? 1) || 1);
			const height = Math.max(1, Number(tex?.height ?? tex?.source?.height ?? 1) || 1);
			const offset = i * 4;
			out[offset] = width;
			out[offset + 1] = height;
			out[offset + 2] = 1 / width;
			out[offset + 3] = 1 / height;
		}
	}

	#ensureSceneBufferWgpu(backend, state) {
		if (state.sceneBuffer) return state.sceneBuffer;
		state.sceneBuffer = backend.createBuffer({
			label: "Wr21SceneUBO",
			size: SCENE_UBO_F32 * 4,
			usage: GPU_BUFFER_USAGE.UNIFORM | GPU_BUFFER_USAGE.COPY_DST,
		});
		return state.sceneBuffer;
	}

	#ensureObjectBufferWgpu(backend, state, key) {
		const cached = state.objectBuffers.get(key);
		if (cached) return cached;
		const buffer = backend.createBuffer({
			label: `Wr21ObjectUBO:${key}`,
			size: OBJECT_UBO_F32 * 4,
			usage: GPU_BUFFER_USAGE.UNIFORM | GPU_BUFFER_USAGE.COPY_DST,
		});
		state.objectBuffers.set(key, buffer);
		return buffer;
	}

	#writeObjectWgpu(backend, state, objectKey, draw, mesh, submeshIndex, material, morphWeight) {
		const flags = collectSubmeshFlags({ mesh, hasRig: !!draw.meshRenderer?.cfg?.hasRig }, submeshIndex);
		const skinEnabled = !!(draw.meshRenderer?.cfg?.hasRig && flags.hasBone);
		const object = skinEnabled ? state.objectScratch : state.objectHeaderScratch;
		object.fill(0);
		object.set(draw.modelMatrix, 0);

		const inst = draw.meshRenderer?.instData ?? {};
		const slot0 = inst.slot0 ?? [0, 0, 0, 0];
		const slot1 = inst.slot1 ?? [0, 0, 0, 0];
		const slot2 = inst.slot2 ?? [0, 0, 0, 0];
		const slot3 = inst.slot3 ?? [0, 0, 0, 0];
		object[16] = Number(slot0[0] ?? 0) || 0;
		object[17] = Number(slot0[1] ?? 0) || 0;
		object[18] = Number(slot0[2] ?? 0) || 0;
		object[19] = Number(slot0[3] ?? 0) || 0;
		object[20] = Number(slot1[0] ?? 0) || 0;
		object[21] = Number(slot1[1] ?? 0) || 0;
		object[22] = Number(slot1[2] ?? 0) || 0;
		object[23] = Number(slot1[3] ?? 0) || 0;
		object[24] = Number(slot2[0] ?? 0) || 0;
		object[25] = Number(slot2[1] ?? 0) || 0;
		object[26] = Number(slot2[2] ?? 0) || 0;
		object[27] = Number(slot2[3] ?? 0) || 0;
		object[28] = Number(slot3[0] ?? 0) || 0;
		object[29] = Number(slot3[1] ?? 0) || 0;
		object[30] = Number(slot3[2] ?? 0) || 0;
		object[31] = Number(slot3[3] ?? 0) || 0;

		const color = readColor4(material?.albedoColor, [1, 1, 1, 1]);
		object[32] = color[0];
		object[33] = color[1];
		object[34] = color[2];
		object[35] = color[3];

		object[36] = skinEnabled ? 1 : 0;
		object[37] = flags.morphHasPos ? 1 : 0;
		object[38] = flags.hasUV ? 1 : 0;
		object[39] = flags.hasNormal ? 1 : 0;
		object[40] = flags.hasColor ? 1 : 0;
		object[41] = flags.hasBone ? 1 : 0;
		object[42] = flags.hasTangent ? 1 : 0;
		object[43] = flags.morphHasPos ? 1 : 0;
		object[44] = morphWeight;
		object[45] = flags.morphHasNormal ? 1 : 0;
		object[46] = flags.morphHasTangent ? 1 : 0;
		object[47] = 0;

		if (skinEnabled) {
			object.set(this.#identityPalette(state), SKIN_BASE_F32);
			if (draw.skinPalette && (ArrayBuffer.isView(draw.skinPalette) || Array.isArray(draw.skinPalette))) {
				const max = SKIN_BONE_CAP * 16;
				const count = Math.min(max, draw.skinPalette.length | 0);
				for (let i = 0; i < count; i += 1) object[SKIN_BASE_F32 + i] = Number(draw.skinPalette[i] ?? object[SKIN_BASE_F32 + i]) || 0;
			}
		}

		const buffer = this.#ensureObjectBufferWgpu(backend, state, objectKey);
		backend.writeBuffer(buffer, object, 0);
	}

	#ensureSceneBindGroupWgpu(backend, state, pipeline) {
		const cached = state.sceneBindGroups.get(pipeline);
		if (cached) return cached;
		const layout = pipeline.getBindGroupLayout(0);
		const buffer = this.#ensureSceneBufferWgpu(backend, state);
		const bindGroup = backend.createBindGroup({
			label: "Wr21SceneBG",
			layout,
			entries: [{ binding: 0, resource: { buffer } }],
		});
		if (!bindGroup) return null;
		state.sceneBindGroups.set(pipeline, bindGroup);
		return bindGroup;
	}

	#ensureObjectBindGroupWgpu(backend, state, pipeline, objectKey, textureGpu) {
		let byPipeline = state.objectBindGroups.get(pipeline);
		if (!byPipeline) {
			byPipeline = new Map();
			state.objectBindGroups.set(pipeline, byPipeline);
		}
		const texRef = textureGpu.texture ?? textureGpu.view ?? textureGpu;
		const texKey = String(texRef);
		const key = `${objectKey}|${texKey}`;
		const cached = byPipeline.get(key);
		if (cached) return cached;

		const layout = pipeline.getBindGroupLayout(1);
		const objectBuffer = this.#ensureObjectBufferWgpu(backend, state, objectKey);
		const bindGroup = backend.createBindGroup({
			label: "Wr21ObjectBG",
			layout,
			entries: [
				{ binding: 0, resource: { buffer: objectBuffer } },
				{ binding: 1, resource: textureGpu.sampler },
				{ binding: 2, resource: textureGpu.view },
			],
		});
		if (!bindGroup) return null;
		byPipeline.set(key, bindGroup);
		return bindGroup;
	}

	#ensureFscBindGroupWgpu(backend, state, pipeline, shaderFSC, features) {
		let byPipeline = state.fscBindGroups.get(pipeline);
		if (!byPipeline) {
			byPipeline = new Map();
			state.fscBindGroups.set(pipeline, byPipeline);
		}
		const slotIds = [0, 1, 2, 3].map((slot) => resolveSlotId(shaderFSC, slot) ?? "_");
		const key = `${slotIds.join("|")}|keyboard:${features?.keyboard ? 1 : 0}`;
		const cached = byPipeline.get(key);
		if (cached) {
			if (features?.keyboard) this.#writeKeyboardWgpu(backend, state);
			return cached;
		}

		const layout = pipeline.getBindGroupLayout(1);
		const entries = [];
		for (const slot of features?.channels ?? []) {
			const tex = resolveSlotTexture(shaderFSC, slot);
			const texGpu = tex ? this.#gpuTexture(backend, state, tex) : null;
			const resource = texGpu ?? this.#fallbackWgpuTexture(backend, state);
			if (!resource) return null;
			entries.push({ binding: slot * 2, resource: resource.sampler });
			entries.push({ binding: slot * 2 + 1, resource: resource.view });
		}
		if (features?.keyboard) {
			const keyboard = this.#ensureKeyboardWgpu(backend, state);
			if (!keyboard) return null;
			this.#writeKeyboardWgpu(backend, state);
			entries.push({ binding: 8, resource: keyboard.view });
		}

		const bindGroup = backend.createBindGroup({
			label: "Wr21FSCInputBG",
			layout,
			entries,
		});
		if (!bindGroup) return null;
		byPipeline.set(key, bindGroup);
		return bindGroup;
	}

	#ensureKeyboardWgpu(backend, state) {
		if (state.wgpuKeyboardTexture) return state.wgpuKeyboardTexture;
		const texture = backend.createTexture2D({
			label: "Wr21Keyboard",
			width: KEYBOARD_TEX_W,
			height: KEYBOARD_TEX_H,
			format: "rgba8unorm",
		});
		if (!texture) return null;
		const view = texture.createView();
		state.wgpuKeyboardTexture = { texture, view };
		return state.wgpuKeyboardTexture;
	}

	#writeKeyboardWgpu(backend, state) {
		const keyboard = this.#ensureKeyboardWgpu(backend, state);
		if (!keyboard) return false;
		backend.writeTexture(
			keyboard.texture,
			state.keyboard,
			{ offset: 0, bytesPerRow: 256 * 4, rowsPerImage: 1 },
			{ width: KEYBOARD_TEX_W, height: KEYBOARD_TEX_H, depthOrArrayLayers: 1 },
		);
		state.keyboardUploaded = true;
		return true;
	}

	#fallbackWgpuTexture(backend, state) {
		if (state.wgpuFallbackTexture) return state.wgpuFallbackTexture;
		const texture = backend.createTexture2D({
			label: "Wr21FallbackWhite",
			width: 1,
			height: 1,
			format: "rgba8unorm",
		});
		if (!texture) return null;
		backend.writeTexture(
			texture,
			new Uint8Array([255, 255, 255, 255]),
			{ offset: 0, bytesPerRow: 256, rowsPerImage: 1 },
			{ width: 1, height: 1, depthOrArrayLayers: 1 },
		);
		const view = texture.createView();
		const sampler = backend.createSampler({
			minFilter: "linear",
			magFilter: "linear",
			mipmapFilter: "linear",
			addressModeU: "repeat",
			addressModeV: "repeat",
		});
		state.wgpuFallbackTexture = { texture, view, sampler };
		return state.wgpuFallbackTexture;
	}

	#renderWgl2(backend, camera, queue, options) {
		if (!backend?.ready || !backend.gl) return;
		if (!Array.isArray(queue) || queue.length <= 0) return;
		const state = this.#getGpuState(backend);
		const gl = backend.gl;
		const frameOptions = normalizeFrameOptions(options, queue[0]?.pass?.cfg ?? null);
		const beginFrame = options.beginFrame !== false;
		const endFrame = options.endFrame !== false;
		if (beginFrame) backend.beginFrame(frameOptions);
		else backend.beginRenderPass(frameOptions);

		const time = Number(options.time ?? 0) || 0;
		const deltaTime = Number(options.deltaTime ?? 0) || 0;
		const view = camera?.view ?? Alm.Mat4.IDENTITY;
		const projection = camera?.projection ?? Alm.Mat4.IDENTITY;
		const viewProj = Alm.Mat4.mul(projection, view);

		for (const draw of queue) {
			if (draw.type === "fsc") {
				const backendShader = this.#gpuShader(backend, state, draw.shader, { createPipeline: true });
				const glPipeline = backendShader?.glPipeline ?? null;
				if (!glPipeline?.program) continue;
				applyWglState(gl, glPipeline.state);
				gl.useProgram(glPipeline.program);

				const uniform = this.#ensureWglUniforms(state, gl, glPipeline.program);
				if (uniform.u_view) gl.uniformMatrix4fv(uniform.u_view, false, view);
				if (uniform.u_projection) gl.uniformMatrix4fv(uniform.u_projection, false, projection);
				if (uniform.u_viewProj) gl.uniformMatrix4fv(uniform.u_viewProj, false, viewProj);
				if (uniform.u_cameraPos && camera?.position) {
					gl.uniform4f(
						uniform.u_cameraPos,
						Number(camera.position[0] ?? 0) || 0,
						Number(camera.position[1] ?? 0) || 0,
						Number(camera.position[2] ?? 0) || 0,
						1,
					);
				}
				if (uniform.u_time) {
					gl.uniform4f(
						uniform.u_time,
						time,
						deltaTime,
						Number(backend?.canvas?.width ?? 0) || 0,
						Number(backend?.canvas?.height ?? 0) || 0,
					);
				}
				if (uniform.u_mouse) gl.uniform4fv(uniform.u_mouse, state.mouse);
				if (uniform.u_date) gl.uniform4fv(uniform.u_date, state.date);
				if (uniform.u_frame) gl.uniform4fv(uniform.u_frame, state.frame);
				this.#writeChannelSizes(state, draw.shaderFSC);
				for (let i = 0; i < 4; i += 1) {
					const loc = uniform[`u_channelSize${i}`];
					if (loc) gl.uniform4fv(loc, state.channelSizes.subarray(i * 4, i * 4 + 4));
				}
				this.#bindFscInputsWgl2(backend, state, draw.shaderFSC, backendShader.features ?? null, uniform);
				gl.drawArrays(gl.TRIANGLES, 0, 3);
				continue;
			}
			if (draw.type !== "mesh") continue;
			const shader = draw.shader ?? null;
			if (!shader) continue;
			const backendShader = this.#gpuShader(backend, state, shader, { createPipeline: true });
			const glPipeline = backendShader?.glPipeline ?? null;
			if (!glPipeline?.program) continue;
			applyWglState(gl, glPipeline.state);
			gl.useProgram(glPipeline.program);

			const uniform = this.#ensureWglUniforms(state, gl, glPipeline.program);
			if (uniform.u_view) gl.uniformMatrix4fv(uniform.u_view, false, view);
			if (uniform.u_projection) gl.uniformMatrix4fv(uniform.u_projection, false, projection);
			if (uniform.u_viewProj) gl.uniformMatrix4fv(uniform.u_viewProj, false, viewProj);
			if (uniform.u_cameraPos && camera?.position) {
				gl.uniform4f(
					uniform.u_cameraPos,
					Number(camera.position[0] ?? 0) || 0,
					Number(camera.position[1] ?? 0) || 0,
					Number(camera.position[2] ?? 0) || 0,
					1,
				);
			}
			if (uniform.u_time) gl.uniform4f(uniform.u_time, time, deltaTime, 0, 0);

			const mesh = draw.mesh ?? null;
			if (!mesh) continue;
			const morphTargetIndex = 0;
			const gpuMesh = this.#gpuMesh(backend, state, mesh, { morphTargetIndex });
			if (!gpuMesh?.submeshes?.length) continue;

			for (let i = 0; i < gpuMesh.submeshes.length; i += 1) {
				const submeshGpu = gpuMesh.submeshes[i];
				const material = mesh.submeshes?.[i]?.material ?? {};
				const flags = collectSubmeshFlags({ mesh, hasRig: !!draw.meshRenderer?.cfg?.hasRig }, i);
				const inst = draw.meshRenderer?.instData ?? {};
				const slot0 = inst.slot0 ?? [0, 0, 0, 0];
				const slot1 = inst.slot1 ?? [0, 0, 0, 0];
				const slot2 = inst.slot2 ?? [0, 0, 0, 0];
				const slot3 = inst.slot3 ?? [0, 0, 0, 0];

				if (uniform.u_model) gl.uniformMatrix4fv(uniform.u_model, false, draw.modelMatrix);
				if (uniform.u_instData0) gl.uniform4f(uniform.u_instData0, slot0[0] ?? 0, slot0[1] ?? 0, slot0[2] ?? 0, slot0[3] ?? 0);
				if (uniform.u_instData1) gl.uniform4f(uniform.u_instData1, slot1[0] ?? 0, slot1[1] ?? 0, slot1[2] ?? 0, slot1[3] ?? 0);
				if (uniform.u_instData2) gl.uniform4f(uniform.u_instData2, slot2[0] ?? 0, slot2[1] ?? 0, slot2[2] ?? 0, slot2[3] ?? 0);
				if (uniform.u_instData3) gl.uniform4f(uniform.u_instData3, slot3[0] ?? 0, slot3[1] ?? 0, slot3[2] ?? 0, slot3[3] ?? 0);
				const color = readColor4(material?.albedoColor, [1, 1, 1, 1]);
				if (uniform.u_albedoColor) gl.uniform4f(uniform.u_albedoColor, color[0], color[1], color[2], color[3]);
				if (uniform.u_vtxFlags0) {
					const skinEnabled = draw.meshRenderer?.cfg?.hasRig && flags.hasBone;
					gl.uniform4f(
						uniform.u_vtxFlags0,
						skinEnabled ? 1 : 0,
						flags.morphHasPos ? 1 : 0,
						flags.hasUV ? 1 : 0,
						flags.hasNormal ? 1 : 0,
					);
				}
				if (uniform.u_vtxFlags1) {
					gl.uniform4f(
						uniform.u_vtxFlags1,
						flags.hasColor ? 1 : 0,
						flags.hasBone ? 1 : 0,
						flags.hasTangent ? 1 : 0,
						flags.morphHasPos ? 1 : 0,
					);
				}
				if (uniform.u_extras) {
					gl.uniform4f(
						uniform.u_extras,
						resolveMorphWeight(draw.meshRenderer),
						flags.morphHasNormal ? 1 : 0,
						flags.morphHasTangent ? 1 : 0,
						0,
					);
				}
				const skinEnabled = draw.meshRenderer?.cfg?.hasRig && flags.hasBone;
				if (uniform.u_skinPalette && skinEnabled) {
					const palette = draw.skinPalette instanceof Float32Array ? draw.skinPalette : this.#identityPalette(state);
					gl.uniformMatrix4fv(uniform.u_skinPalette, false, palette);
				}

				const tex = resolveTexture(draw.meshRenderer, material);
				const texGpu = tex ? this.#gpuTexture(backend, state, tex) : null;
				const texture = texGpu?.texture ?? null;
				if (uniform.u_albedoTex && texture) {
					gl.activeTexture(gl.TEXTURE0);
					gl.bindTexture(gl.TEXTURE_2D, texture);
					gl.uniform1i(uniform.u_albedoTex, 0);
				}

				gl.bindBuffer(gl.ARRAY_BUFFER, submeshGpu.vbo);
				gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, submeshGpu.ibo);
				for (const attr of VERTEX_ATTRS) {
					gl.enableVertexAttribArray(attr.location);
					gl.vertexAttribPointer(attr.location, attr.size, gl.FLOAT, false, VERTEX_STRIDE, attr.offset);
				}
				gl.drawElements(gl.TRIANGLES, submeshGpu.indexCount, submeshGpu.indexType, 0);
			}
		}

		gl.bindBuffer(gl.ARRAY_BUFFER, null);
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
		gl.useProgram(null);
		if (endFrame) backend.endFrame();
	}

	#bindFscInputsWgl2(backend, state, shaderFSC, features, uniform) {
		const gl = backend.gl ?? null;
		if (!gl || !features) return;
		for (const slot of features.channels ?? []) {
			const tex = resolveSlotTexture(shaderFSC, slot);
			const texGpu = tex ? this.#gpuTexture(backend, state, tex) : null;
			const texture = texGpu?.texture ?? this.#fallbackWglTexture(backend, state);
			const loc = uniform[`u_channel${slot}`];
			if (!texture || !loc) continue;
			gl.activeTexture(gl.TEXTURE0 + slot);
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.uniform1i(loc, slot);
		}
		if (features.keyboard && uniform.u_keyboard) {
			const texture = this.#ensureKeyboardWgl2(backend, state);
			if (!texture) return;
			this.#writeKeyboardWgl2(backend, state);
			gl.activeTexture(gl.TEXTURE0 + 4);
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.uniform1i(uniform.u_keyboard, 4);
		}
	}

	#fallbackWglTexture(backend, state) {
		if (state.wglFallbackTexture) return state.wglFallbackTexture;
		const gl = backend.gl ?? null;
		if (!gl) return null;
		const texture = backend.createTexture2D({
			width: 1,
			height: 1,
			minFilter: gl.LINEAR,
			magFilter: gl.LINEAR,
			wrapS: gl.CLAMP_TO_EDGE,
			wrapT: gl.CLAMP_TO_EDGE,
		});
		if (!texture) return null;
		backend.writeTexture2D(texture, new Uint8Array([255, 255, 255, 255]), { width: 1, height: 1, format: gl.RGBA, type: gl.UNSIGNED_BYTE });
		state.wglFallbackTexture = texture;
		return texture;
	}

	#ensureKeyboardWgl2(backend, state) {
		if (state.wglKeyboardTexture) return state.wglKeyboardTexture;
		const gl = backend.gl ?? null;
		if (!gl) return null;
		const texture = backend.createTexture2D({
			width: KEYBOARD_TEX_W,
			height: KEYBOARD_TEX_H,
			minFilter: gl.NEAREST,
			magFilter: gl.NEAREST,
			wrapS: gl.CLAMP_TO_EDGE,
			wrapT: gl.CLAMP_TO_EDGE,
		});
		if (!texture) return null;
		state.wglKeyboardTexture = texture;
		return texture;
	}

	#writeKeyboardWgl2(backend, state) {
		const gl = backend.gl ?? null;
		const texture = this.#ensureKeyboardWgl2(backend, state);
		if (!gl || !texture) return false;
		backend.writeTexture2D(texture, state.keyboard, { width: KEYBOARD_TEX_W, height: KEYBOARD_TEX_H, format: gl.RGBA, type: gl.UNSIGNED_BYTE });
		state.keyboardUploaded = true;
		return true;
	}

	#ensureWglUniforms(state, gl, program) {
		const cached = state.wglUniformCache.get(program);
		if (cached) return cached;
		const uniform = {
			u_view: gl.getUniformLocation(program, "u_view"),
			u_projection: gl.getUniformLocation(program, "u_projection"),
			u_viewProj: gl.getUniformLocation(program, "u_viewProj"),
			u_cameraPos: gl.getUniformLocation(program, "u_cameraPos"),
			u_time: gl.getUniformLocation(program, "u_time"),
			u_mouse: gl.getUniformLocation(program, "u_mouse"),
			u_date: gl.getUniformLocation(program, "u_date"),
			u_frame: gl.getUniformLocation(program, "u_frame"),
			u_channelSize0: gl.getUniformLocation(program, "u_channelSize0"),
			u_channelSize1: gl.getUniformLocation(program, "u_channelSize1"),
			u_channelSize2: gl.getUniformLocation(program, "u_channelSize2"),
			u_channelSize3: gl.getUniformLocation(program, "u_channelSize3"),
			u_channel0: gl.getUniformLocation(program, "u_channel0"),
			u_channel1: gl.getUniformLocation(program, "u_channel1"),
			u_channel2: gl.getUniformLocation(program, "u_channel2"),
			u_channel3: gl.getUniformLocation(program, "u_channel3"),
			u_keyboard: gl.getUniformLocation(program, "u_keyboard"),
			u_model: gl.getUniformLocation(program, "u_model"),
			u_instData0: gl.getUniformLocation(program, "u_instData0"),
			u_instData1: gl.getUniformLocation(program, "u_instData1"),
			u_instData2: gl.getUniformLocation(program, "u_instData2"),
			u_instData3: gl.getUniformLocation(program, "u_instData3"),
			u_albedoColor: gl.getUniformLocation(program, "u_albedoColor"),
			u_vtxFlags0: gl.getUniformLocation(program, "u_vtxFlags0"),
			u_vtxFlags1: gl.getUniformLocation(program, "u_vtxFlags1"),
			u_extras: gl.getUniformLocation(program, "u_extras"),
			u_skinPalette: gl.getUniformLocation(program, "u_skinPalette[0]"),
			u_albedoTex: gl.getUniformLocation(program, "u_albedoTex"),
		};
		state.wglUniformCache.set(program, uniform);
		return uniform;
	}
}

if (typeof window !== "undefined") {
	window.WrRenderer21 = WrRenderer;
}

export default WrRenderer;

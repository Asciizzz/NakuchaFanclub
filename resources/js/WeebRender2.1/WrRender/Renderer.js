import * as Azm from "../../AzLib/Azm.js";
import { MeshRenderer } from "../WrWorld/meshRenderer.js";
import { ShaderOBJ as ShaderOBJComp } from "../WrWorld/shaderObj.js";
import { ShaderFSC as ShaderFSCComp } from "../WrWorld/shaderFSC.js";
import { RenderPass as RenderPassComp } from "../WrWorld/renderPass.js";
import { Transform } from "../WrWorld/transform.js";
import { LiveSkeleton } from "../WrWorld/liveSkeleton.js";
import { WrRenderPass } from "../WrAssets/RenderPass.js";

const SCENE_UBO_F32 = 56;
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
});

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

function pushShaderIds(target, values) {
	if (!Array.isArray(values)) return;
	for (const value of values) {
		const id = asId(value);
		if (!id) continue;
		target.push(id);
	}
}

function childNodeList(node) {
	if (!node || !node.ctx) return [];
	const out = [];
	for (const childId of node.childIds) {
		const child = node.ctx.getNode(childId);
		if (child) out.push(child);
	}
	return out;
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

function resolveTextureId(meshRenderer, material) {
	const fromComp = asId(meshRenderer?.textures?.albedo);
	if (fromComp) return fromComp;
	const fromMat = asId(material?.albedoTex);
	if (fromMat) return fromMat;
	return null;
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

function resolveRenderPassAsset(stores, passComp) {
	if (!passComp) return null;
	const passId = asId(passComp.id);
	const stored = passId ? (stores?.renderPasses?.get(passId) ?? null) : null;
	if (stored) return stored;
	if (passComp.cfg && typeof passComp.cfg === "object") {
		return WrRenderPass.from({
			id: passId,
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
	stores = null;
	camera = null;

	constructor(options = {}) {
		const src = options && typeof options === "object" ? options : {};
		this.backend = src.backend ?? null;
		this.world = src.world ?? null;
		this.stores = src.stores ?? src.assets ?? null;
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

	setStores(stores) {
		this.stores = stores ?? null;
		return this;
	}

	setAssets(assets) {
		this.stores = assets ?? null;
		return this;
	}

	setCamera(camera) {
		this.camera = camera ?? null;
		return this;
	}

	render(options = {}) {
		const src = options && typeof options === "object" ? options : {};
		const world = src.world ?? this.world ?? null;
		const stores = src.stores ?? src.assets ?? this.stores ?? null;
		const backend = src.backend ?? this.backend ?? null;
		const camera = getCamera(src.camera ?? this.camera ?? null);
		const fromNode = asNode(world, src.from ?? src.fromId ?? null);
		if (!world || !stores || !fromNode) {
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
			const passAsset = resolveRenderPassAsset(stores, passComp);
			if (!passComp || !passAsset) continue;
			if (String(passAsset.target?.type ?? "screen") !== "screen") {
				const passResult = {
					from: fromNode.id,
					passNodeId: passNode.id,
					passId: passAsset.id ?? passComp.id ?? null,
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
			const collected = this.#buildQueue(world, stores, passNode, modelByNode);
			const passResult = {
				from: fromNode.id,
				passNodeId: passNode.id,
				passId: passAsset.id ?? passComp.id ?? null,
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
				this.#renderWgpu(backend, camera, stores, passResult.ops, {
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
				this.#renderWgl2(backend, camera, stores, passResult.ops, {
					...passOverrides(src, passResult.passCfg),
					beginFrame: false,
					endFrame: false,
				});
			}
			backend.endFrame();
		}

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
		const bfs = [fromNode];
		while (bfs.length > 0) {
			const node = bfs.shift();
			const passComp = node.getComp(RenderPassComp) ?? null;
			if (passComp) {
				roots.push(node);
				continue;
			}
			for (const child of childNodeList(node)) bfs.push(child);
		}
		return roots;
	}

	#buildQueue(world, stores, fromNode, modelByNode) {
		const queue = [];
		const stats = {
			nodesVisited: 0,
			prunedNestedRenderPass: 0,
			skippedMeshNoShader: 0,
			skippedMeshInvalidShader: 0,
		};
		const ctxById = new Map();
		const bfs = [fromNode];
		ctxById.set(fromNode.id, { pass: null, ids: [] });

		while (bfs.length > 0) {
			const node = bfs.shift();
			stats.nodesVisited += 1;
			const parentCtx = ctxById.get(node.id) ?? { pass: null, ids: [] };
			const ownPass = node.getComp(RenderPassComp) ?? null;
			if (node !== fromNode && ownPass) {
				stats.prunedNestedRenderPass += 1;
				continue;
			}
			const passComp = ownPass ?? parentCtx.pass ?? null;
			const shaderComp = node.getComp(ShaderOBJComp);
			const shaderFSCComp = node.getComp(ShaderFSCComp);
			const ids = parentCtx.ids.slice();
			if (shaderComp) pushShaderIds(ids, shaderComp.ids);

			if (shaderFSCComp) {
				for (const shaderId of shaderFSCComp.ids) {
					const id = asId(shaderId);
					if (!id) continue;
					const shader = stores.shaderFSCs?.get(id) ?? null;
					if (!shader) continue;
					queue.push({
						type: "fsc",
						node,
						nodeId: node.id,
						shaderId: id,
						pass: passComp,
						shaderFSC: shaderFSCComp,
					});
				}
			}

			const meshRenderer = node.getComp(MeshRenderer);
			if (meshRenderer && meshRenderer.cfg?.display !== false) {
				const meshId = asId(meshRenderer.meshId);
				if (meshId && stores.meshes?.has(meshId)) {
					const liveSkeleton = meshRenderer.cfg?.hasRig ? resolveNearestLiveSkeleton(node) : null;
					let skinPalette = null;
					if (liveSkeleton) {
						const skeleton = stores.skeletons?.get(liveSkeleton.skeletonId) ?? null;
						if (skeleton?.buildPalette) skinPalette = skeleton.buildPalette(liveSkeleton.bones, SKIN_BONE_CAP);
					}
					const drawShaderIds = [];
					for (const shaderId of ids) {
						const id = asId(shaderId);
						if (!id) continue;
						const shader = stores.shaderOBJs?.get(id) ?? null;
						if (!shader) {
							stats.skippedMeshInvalidShader += 1;
							continue;
						}
						drawShaderIds.push(id);
					}
					if (drawShaderIds.length <= 0) {
						stats.skippedMeshNoShader += 1;
					}
					for (const id of drawShaderIds) {
						queue.push({
							type: "mesh",
							node,
							nodeId: node.id,
							meshId,
							meshRenderer,
							shaderId: id,
							pass: passComp,
							modelMatrix: modelByNode.get(node.id) ?? Azm.Mat4.makeIdentity(),
							skinPalette,
						});
					}
				}
			}

			for (const child of childNodeList(node)) {
				ctxById.set(child.id, { pass: passComp, ids });
				bfs.push(child);
			}
		}

		return { ops: queue, stats };
	}

	#updateTransforms(fromNode) {
		const modelByNode = new Map();
		const bfs = [fromNode];
		const parentWorldByNode = new Map();
		parentWorldByNode.set(fromNode.id, this.#resolveAncestorWorld(fromNode));

		while (bfs.length > 0) {
			const node = bfs.shift();
			const parentWorld = parentWorldByNode.get(node.id) ?? Azm.Mat4.IDENTITY;
			const tx = node.getComp(Transform);
			let nodeWorld = null;
			if (tx) {
				tx.world = Azm.Mat4.mul(parentWorld, tx.local);
				nodeWorld = tx.world;
			} else {
				nodeWorld = new Float32Array(parentWorld);
			}
			modelByNode.set(node.id, nodeWorld);
			for (const child of childNodeList(node)) {
				parentWorldByNode.set(child.id, nodeWorld);
				bfs.push(child);
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

		let world = Azm.Mat4.IDENTITY;
		for (let i = chain.length - 1; i >= 0; i -= 1) {
			const tx = chain[i].getComp(Transform);
			if (!tx) continue;
			tx.world = Azm.Mat4.mul(world, tx.local);
			world = tx.world;
		}
		return world;
	}

	#getGpuState(backend) {
		let state = this.#gpuByBackend.get(backend);
		if (state) return state;
		state = {
			sceneScratch: new Float32Array(SCENE_UBO_F32),
			objectScratch: new Float32Array(OBJECT_UBO_F32),
			sceneBuffer: null,
			objectBuffers: new Map(),
			sceneBindGroups: new WeakMap(),
			objectBindGroups: new WeakMap(),
			wgpuFallbackTexture: null,
			wglUniformCache: new WeakMap(),
			identityPalette: null,
		};
		this.#gpuByBackend.set(backend, state);
		return state;
	}

	#identityPalette(state) {
		if (state.identityPalette) return state.identityPalette;
		const out = new Float32Array(SKIN_BONE_CAP * 16);
		for (let i = 0; i < SKIN_BONE_CAP; i += 1) out.set(Azm.Mat4.IDENTITY, i * 16);
		state.identityPalette = out;
		return out;
	}

	#renderWgpu(backend, camera, stores, queue, options) {
		if (!backend?.ready) return;
		if (!Array.isArray(queue) || queue.length <= 0) return;

		const state = this.#getGpuState(backend);
		const frameOptions = normalizeFrameOptions(options, queue[0]?.pass?.cfg ?? null);
		const beginFrame = options.beginFrame !== false;
		const endFrame = options.endFrame !== false;
		if (beginFrame) backend.beginFrame(frameOptions);

		const time = Number(options.time ?? 0) || 0;
		const deltaTime = Number(options.deltaTime ?? 0) || 0;
		this.#writeSceneWgpu(backend, state, camera, time, deltaTime);
		const pass = backend.beginRenderPass(frameOptions);
		if (!pass) {
			if (endFrame) backend.endFrame();
			return;
		}

		for (const draw of queue) {
			if (draw.type === "fsc") {
				const backendShader = stores.shaderFSCs?.createGpu(backend, draw.shaderId, {
					createPipeline: true,
					sampleCount: frameOptions.sampleCount ?? backend.sampleCount ?? 1,
					useDepth: !!(frameOptions.useDepth || frameOptions.clearDepthEnabled),
				});
				const pipeline = backendShader?.pipeline ?? null;
				if (!pipeline) continue;
				const sceneBG = this.#ensureSceneBindGroupWgpu(backend, state, pipeline);
				if (!sceneBG) continue;
				pass.setPipeline(pipeline);
				pass.setBindGroup(0, sceneBG);
				pass.draw(3, 1, 0, 0);
				continue;
			}
			if (draw.type !== "mesh") continue;
			const shader = stores.shaderOBJs?.get(draw.shaderId) ?? null;
			if (!shader) continue;
			const backendShader = stores.shaderOBJs.createGpu(backend, draw.shaderId, {
				createPipeline: true,
				sampleCount: frameOptions.sampleCount ?? backend.sampleCount ?? 1,
			});
			const pipeline = backendShader?.pipeline ?? null;
			if (!pipeline) continue;

			const mesh = stores.meshes?.get(draw.meshId) ?? null;
			if (!mesh) continue;
			const morphTargetIndex = 0;
			const gpuMesh = stores.meshes.createGpu(backend, draw.meshId, { morphTargetIndex });
			if (!gpuMesh?.submeshes?.length) continue;

			const sceneBG = this.#ensureSceneBindGroupWgpu(backend, state, pipeline);
			if (!sceneBG) continue;
			pass.setPipeline(pipeline);
			pass.setBindGroup(0, sceneBG);

			for (let i = 0; i < gpuMesh.submeshes.length; i += 1) {
				const submeshGpu = gpuMesh.submeshes[i];
				const material = mesh.submeshes?.[i]?.material ?? {};
				const texId = resolveTextureId(draw.meshRenderer, material);
				const textureGpu = texId ? stores.textures.createGpu(backend, texId) : this.#fallbackWgpuTexture(backend, state);
				if (!textureGpu) continue;

				this.#writeObjectWgpu(
					backend,
					state,
					`${draw.nodeId}|${draw.meshId}|${i}`,
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
					`${draw.nodeId}|${draw.meshId}|${i}`,
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

	#writeSceneWgpu(backend, state, camera, time, deltaTime) {
		const scene = state.sceneScratch;
		scene.fill(0);
		const view = camera?.view ?? Azm.Mat4.IDENTITY;
		const projection = camera?.projection ?? Azm.Mat4.IDENTITY;
		const viewProj = Azm.Mat4.mul(projection, view);
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
		const buffer = this.#ensureSceneBufferWgpu(backend, state);
		backend.writeBuffer(buffer, scene, 0);
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
		const object = state.objectScratch;
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

		const flags = collectSubmeshFlags({ mesh, hasRig: !!draw.meshRenderer?.cfg?.hasRig }, submeshIndex);
		object[36] = draw.meshRenderer?.cfg?.hasRig && flags.hasBone ? 1 : 0;
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

		object.set(this.#identityPalette(state), SKIN_BASE_F32);
		if (draw.skinPalette && (ArrayBuffer.isView(draw.skinPalette) || Array.isArray(draw.skinPalette))) {
			const max = SKIN_BONE_CAP * 16;
			const count = Math.min(max, draw.skinPalette.length | 0);
			for (let i = 0; i < count; i += 1) object[SKIN_BASE_F32 + i] = Number(draw.skinPalette[i] ?? object[SKIN_BASE_F32 + i]) || 0;
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

	#renderWgl2(backend, camera, stores, queue, options) {
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
		const view = camera?.view ?? Azm.Mat4.IDENTITY;
		const projection = camera?.projection ?? Azm.Mat4.IDENTITY;
		const viewProj = Azm.Mat4.mul(projection, view);

		for (const draw of queue) {
			if (draw.type === "fsc") {
				const backendShader = stores.shaderFSCs?.createGpu(backend, draw.shaderId, { createPipeline: true });
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
				gl.drawArrays(gl.TRIANGLES, 0, 3);
				continue;
			}
			if (draw.type !== "mesh") continue;
			const shader = stores.shaderOBJs?.get(draw.shaderId) ?? null;
			if (!shader) continue;
			const backendShader = stores.shaderOBJs.createGpu(backend, draw.shaderId, { createPipeline: true });
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

			const mesh = stores.meshes?.get(draw.meshId) ?? null;
			if (!mesh) continue;
			const morphTargetIndex = 0;
			const gpuMesh = stores.meshes.createGpu(backend, draw.meshId, { morphTargetIndex });
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

				const texId = resolveTextureId(draw.meshRenderer, material);
				const texGpu = texId ? stores.textures.createGpu(backend, texId) : null;
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

	#ensureWglUniforms(state, gl, program) {
		const cached = state.wglUniformCache.get(program);
		if (cached) return cached;
		const uniform = {
			u_view: gl.getUniformLocation(program, "u_view"),
			u_projection: gl.getUniformLocation(program, "u_projection"),
			u_viewProj: gl.getUniformLocation(program, "u_viewProj"),
			u_cameraPos: gl.getUniformLocation(program, "u_cameraPos"),
			u_time: gl.getUniformLocation(program, "u_time"),
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

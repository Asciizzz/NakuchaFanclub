import { Ctx, Node } from "../../AzLib/AzHie.js";
import * as Azm from "../../AzLib/Azm.js";
import {
	WrMeshStore,
	WrTextureStore,
	WrShaderStore,
	WrSkeletonStore
} from "./Store.js";
import { load as wrLoadGLB } from "../WrLoader/GltfLoader.js";

import {
	Component,
	Transform,
	MeshRenderer,
	LiveSkeleton,
} from "./Components.js";

const WR_NODE_STATIC_KEYS = new Set(["ctx", "id", "parentId", "childIds", "components"]);
const WR_SCENE_SKIP_KEYS = new Set(["id", "parent", "children", "components", "$"]);
const WR_SCENE_UBO_F32 = 56;
const WR_OBJECT_UBO_F32 = 2096;
const WR_OBJECT_UBO_BYTES = WR_OBJECT_UBO_F32 * 4;
const WR_SKIN_BONE_CAP = 128;
const WR_SKIN_BASE_F32 = 48;
const WR_VERTEX_STRIDE = 76;
const WR_VERTEX_ATTRS = Object.freeze([
	Object.freeze({ location: 0, size: 3, offset: 0 }),
	Object.freeze({ location: 1, size: 3, offset: 12 }),
	Object.freeze({ location: 2, size: 2, offset: 24 }),
	Object.freeze({ location: 3, size: 4, offset: 32 }),
	Object.freeze({ location: 4, size: 4, offset: 48 }),
	Object.freeze({ location: 5, size: 3, offset: 64 }),
]);
const WR_GPU_BUFFER_USAGE = Object.freeze({
	COPY_DST: globalThis.GPUBufferUsage?.COPY_DST ?? 0x8,
	VERTEX: globalThis.GPUBufferUsage?.VERTEX ?? 0x20,
	INDEX: globalThis.GPUBufferUsage?.INDEX ?? 0x10,
	UNIFORM: globalThis.GPUBufferUsage?.UNIFORM ?? 0x40,
});

function isCompType(Type) {
	return typeof Type === "function" && (Type === Component || Type.prototype instanceof Component);
}

export class WrNode extends Node {
	components = new Map();

	addComp(Type) {
		if (!isCompType(Type)) return null;
		const existing = this.components.get(Type) ?? null;
		if (existing) return existing;
		const comp = new Type(this);
		this.components.set(Type, comp);
		return comp;
	}

	getComp(Type) {
		if (!isCompType(Type)) return null;
		return this.components.get(Type) ?? null;
	}

	removeComp(Type) {
		if (!isCompType(Type)) return null;
		const value = this.components.get(Type) ?? null;
		if (!value) return null;
		this.components.delete(Type);
		return value;
	}

	render(options = {}) {
		if (!this.ctx || typeof this.ctx.render !== "function") return null;
		return this.ctx.render(this, options);
	}

	copyBranchTo(toId = null) {
		if (!this.ctx || typeof this.ctx.copyBranch !== "function") return null;
		return this.ctx.copyBranch(this.id, toId);
	}
}

function asId(value) {
	if (value == null) return null;
	const key = String(value).trim();
	return key || null;
}

function asObject(value) {
	return value && typeof value === "object" ? value : {};
}

function asList(value) {
	return Array.isArray(value) ? value : [];
}

function normalizeShaderPriorities(value) {
	const out = [];
	const seen = new Set();
	for (const item of asList(value)) {
		const id = asId(item);
		if (!id || seen.has(id)) continue;
		seen.add(id);
		out.push(id);
	}
	return out;
}

function asNodeRef(world, value) {
	if (!world) return null;
	if (value && typeof value === "object") {
		if (value.ctx === world && typeof value.id === "string") return value;
	}
	const key = asId(value);
	if (!key) return null;
	return world.getNode(key);
}

function cloneData(value) {
	if (value == null) return value;
	if (ArrayBuffer.isView(value)) return new value.constructor(value);
	if (Array.isArray(value)) return value.map((item) => cloneData(item));
	if (typeof value === "object") {
		const out = {};
		for (const [key, next] of Object.entries(value)) out[key] = cloneData(next);
		return out;
	}
	return value;
}

function readMat4(value, fallback = null) {
	if (value instanceof Float32Array && value.length >= 16) return new Float32Array(value.subarray(0, 16));
	if (ArrayBuffer.isView(value) && value.length >= 16) return new Float32Array(value.subarray(0, 16));
	if (Array.isArray(value) && value.length >= 16) return new Float32Array(value.slice(0, 16));
	if (fallback) return new Float32Array(fallback);
	return Azm.Mat4.makeIdentity();
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

function hasData(value, minCount = 1) {
	if (ArrayBuffer.isView(value) || Array.isArray(value)) return value.length >= minCount;
	return false;
}

function collectSubmeshFlags(draw, submeshIndex) {
	const submesh = draw?.mesh?.submeshes?.[submeshIndex] ?? null;
	const staticPart = submesh?.static ?? {};
	const rigPart = submesh?.rigged ?? submesh?.rig ?? {};
	const morphPart = submesh?.morph ?? {};

	const hasUV = hasData(staticPart.uvs ?? staticPart.uv, 2);
	const hasNormal = hasData(staticPart.normals, 3);
	const hasColor = hasData(staticPart.colors ?? staticPart.color, 3);
	const hasTangent = hasData(staticPart.tangents, 4);
	const hasBoneIDs = hasData(rigPart.boneIDs ?? rigPart.ids ?? rigPart.bones, 4);
	const hasBoneWeights = hasData(rigPart.boneWeights ?? rigPart.weights, 4);
	const hasBone = hasBoneIDs && hasBoneWeights;
	const morphHasPos = hasData(morphPart.dPositions ?? morphPart.dPos, 3);
	const morphHasNormal = hasData(morphPart.dNormals, 3);
	const morphHasTangent = hasData(morphPart.dTangents, 4);

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

function copyNodeData(source, target) {
	for (const key of Object.keys(source)) {
		if (WR_NODE_STATIC_KEYS.has(key)) continue;
		target[key] = cloneData(source[key]);
	}
}

function copyNodeComponents(source, target) {
	if (!(source?.components instanceof Map)) return;
	if (typeof target?.addComp !== "function") return;
	for (const [Type, comp] of source.components.entries()) {
		if (!comp || typeof comp !== "object") continue;
		const next = target.addComp(Type);
		if (!next) continue;
		for (const key of Object.keys(comp)) {
			if (key === "node") continue;
			next[key] = cloneData(comp[key]);
		}
	}
}

function readSceneComponents(sourceNode) {
	const source = asObject(sourceNode);
	if (source.components && typeof source.components === "object") return source.components;
	if (source.$ && typeof source.$ === "object") return source.$;
	return {};
}

function copySceneNodeData(source, target) {
	for (const key of Object.keys(source)) {
		if (WR_SCENE_SKIP_KEYS.has(key)) continue;
		target[key] = cloneData(source[key]);
	}
}

function canAttachBranch(sourceNode, targetId) {
	for (const [node] of sourceNode.traverse({ mode: "dfs_pre", includeFrom: true })) {
		if (node.id === targetId) return false;
	}
	return true;
}

function normalizeWrap(value) {
	const raw = String(value ?? "").toLowerCase();
	if (raw === "clamp" || raw === "clamp_to_edge" || raw === "clamp-to-edge") return "clamp-to-edge";
	return "repeat";
}

function buildChildrenMap(sourceById) {
	const out = new Map();
	for (const id of sourceById.keys()) out.set(id, []);

	for (const source of sourceById.values()) {
		const sourceId = asId(source?.id);
		if (!sourceId) continue;
		for (const childRef of asList(source.children)) {
			const childId = asId(childRef);
			if (!childId || !sourceById.has(childId)) continue;
			out.get(sourceId).push(childId);
		}
	}

	for (const source of sourceById.values()) {
		const sourceId = asId(source?.id);
		const parentId = asId(source?.parent);
		if (!sourceId || !parentId || !sourceById.has(parentId)) continue;
		const list = out.get(parentId);
		if (!list.includes(sourceId)) list.push(sourceId);
	}

	return out;
}

function buildVisitOrder(sourceById, childrenMap, rootId) {
	const order = [];
	const queue = [rootId];
	const seen = new Set();
	while (queue.length > 0) {
		const sourceId = queue.shift();
		if (!sourceId || seen.has(sourceId) || !sourceById.has(sourceId)) continue;
		seen.add(sourceId);
		order.push(sourceId);
		for (const childId of childrenMap.get(sourceId) ?? []) {
			if (!seen.has(childId)) queue.push(childId);
		}
	}
	return order;
}

function materialFromSubmesh(rawMaterial, materialMap, textureMap) {
	const source = asObject(rawMaterial);
	const materialId = asId(source.materialID);
	const linked = materialId ? asObject(materialMap.get(materialId)) : null;
	const merged = linked ? { ...linked, ...source } : source;
	const albedoTexSource = asId(merged.albedoTex);
	const albedoTex = albedoTexSource ? (textureMap.get(albedoTexSource) ?? null) : null;
	return {
		albedoTex,
		albedoColor: readColor4(merged.albedoColor, [1, 1, 1, 1]),
	};
}

function rewriteLoaderMesh(sourceMesh, materialMap, textureMap) {
	const mesh = WrMesh.from(sourceMesh ?? {});
	mesh.submeshes = asList(mesh.submeshes).map((submesh) => {
		const next = cloneData(submesh);
		next.material = materialFromSubmesh(next.material, materialMap, textureMap);
		return next;
	});
	mesh.rebuildMorphCache();
	mesh.rebuildAABBCache();
	return mesh;
}

function alignTo256(n) {
	return Math.ceil(n / 256) * 256;
}

function alignTo4(n) {
	return Math.ceil(n / 4) * 4;
}

function normalizeSampleCount(value, fallback = 1) {
	const n = Math.max(1, Math.floor(Number(value) || fallback || 1));
	return n > 1 ? 4 : 1;
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
	if (data instanceof ArrayBuffer) {
		const byteLength = data.byteLength;
		if ((byteLength % 4) === 0) return data;
		const padded = new Uint8Array(alignTo4(byteLength));
		padded.set(new Uint8Array(data), 0);
		return padded;
	}
	return data;
}

function viewProj(camera) {
	if (!camera?.projection || !camera?.view) return Azm.Mat4.makeIdentity();
	return Azm.Mat4.mul(camera.projection, camera.view);
}

export class WrWorld extends Ctx {
	constructor(options = {}) {
		super(options.ctx ?? {});
		this.options = options ?? {};
		this.#backend = options.backend ?? null;
		this.#camera = options.camera ?? null;
		this.#roots = new Set();

		this.#meshStore = new WrMeshStore(this, {
			prefix: options.store?.meshPrefix ?? "mesh_",
		});
		this.#textureStore = new WrTextureStore(this, {
			prefix: options.store?.texturePrefix ?? "tex_",
		});
		this.#shaderStore = new WrShaderStore(this, {
			prefix: options.store?.shaderPrefix ?? "shader_",
		});
		this.#skeletonStore = new WrSkeletonStore(this, {
			prefix: options.store?.skeletonPrefix ?? "skel_",
		});

		this.#store = Object.freeze({
			meshes: this.#meshStore,
			textures: this.#textureStore,
			shaders: this.#shaderStore,
			skeletons: this.#skeletonStore,
		});

		this.#gpu = this.#newGpuState();
	}

	get store() { return this.#store; }
	get roots() { return Array.from(this.#roots); }
	get backend() { return this.#backend; }
	get camera() { return this.#camera; }

	createNode(id) {
		return new WrNode(this, id);
	}

	setBackend(backend) {
		if (this.#backend === backend) return this.#backend;
		this.#dropGpuState();
		this.#backend = backend ?? null;
		this.#shaderStore.rebuildBackendVariants();
		return this.#backend;
	}

	setCamera(camera) {
		this.#camera = camera ?? null;
		return this.#camera;
	}

	registerShader(shaderId, shaderDesc = {}, renderCfgInput = undefined) {
		const id = asId(shaderId);
		if (!id) throw new Error("[WrWorld] shaderId is required");
		if (this.#shaderStore.has(id)) this.#shaderStore.remove(id);
		const desc = {
			...(shaderDesc && typeof shaderDesc === "object" ? shaderDesc : {}),
			id,
		};
		if (renderCfgInput !== undefined) desc.renderCfg = renderCfgInput;
		return this.#shaderStore.add(desc);
	}

	getShader(id) {
		return this.#shaderStore.get(id);
	}

	removeShader(id) {
		return this.#shaderStore.remove(id);
	}

	addNode(parent = null, index = -1) {
		const node = super.addNode(parent, index);
		if (!node) return null;
		if (node.parentId == null) this.#roots.add(node.id);
		return node;
	}

	moveNode(id, newParentId = null) {
		const node = super.moveNode(id, newParentId);
		if (!node) return null;
		this.#syncRoot(node.id);
		return node;
	}

	deleteNode(id, branch = false) {
		const key = asId(id);
		if (!key) return null;
		const source = this.getNode(key);
		if (!source) return null;

		const parentBefore = source.parentId;
		const childrenBefore = source.childIds.slice();
		const branchIds = branch
			? Array.from(source.traverse({ mode: "dfs_pre", includeFrom: true }), ([node]) => node.id)
			: [source.id];

		const out = super.deleteNode(key, branch);
		if (!out) return null;

		if (branch) {
			for (const nodeId of branchIds) this.#roots.delete(nodeId);
			return out;
		}

		this.#roots.delete(key);
		if (parentBefore == null) {
			for (const childId of childrenBefore) this.#syncRoot(childId);
		}
		return out;
	}

	swapNodes(idA, idB) {
		const ok = super.swapNodes(idA, idB);
		if (!ok) return false;
		this.#syncRoot(idA);
		this.#syncRoot(idB);
		return true;
	}

	copyBranch(fromId, toId = null) {
		const fromKey = asId(fromId);
		if (!fromKey) return null;
		const source = this.getNode(fromKey);
		if (!source) return null;

		const targetKey = toId == null ? null : asId(toId);
		if (toId != null && !targetKey) return null;
		if (targetKey != null && !this.getNode(targetKey)) return null;
		if (targetKey != null && !canAttachBranch(source, targetKey)) return null;

		const remap = new Map();
		for (const [current] of source.traverse({ mode: "dfs_pre", includeFrom: true })) {
			const nextParentId = current.id === fromKey
				? targetKey
				: (remap.get(current.parentId)?.id ?? null);
			const clone = this.addNode(nextParentId);
			if (!clone) return null;
			copyNodeData(current, clone);
			copyNodeComponents(current, clone);
			remap.set(current.id, clone);
		}

		return remap.get(fromKey) ?? null;
	}

	refreshRoots() {
		this.#roots.clear();
		for (const node of this.nodes.values()) {
			if (node.parentId == null) this.#roots.add(node.id);
		}
		return this.roots;
	}

	render(fromNode, options = {}) {
		const start = asNodeRef(this, fromNode);
		if (!start) {
			return {
				from: null,
				count: 0,
				groups: 0,
				draws: [],
				backend: this.#backend?.kind ?? null,
			};
		}

		const queue = this.#buildRenderQueue(start, options);
		this.#applyShaderPriorities(queue, options.shaderPriorities);
		if (!this.#backend?.ready || options.collectOnly === true) return queue;

		if (this.#backend.kind === "webgpu") this.#renderWgpu(queue, options);
		if (this.#backend.kind === "webgl2") this.#renderWgl2(queue, options);
		return queue;
	}

	async loadModelFromURL(url, options = {}) {
		const targetUrl = String(url ?? "").trim();
		if (!targetUrl) throw new Error("[WrWorld] model URL is required");

		const payload = await wrLoadGLB(targetUrl);
		const sourceTextures = asObject(payload?.textures);
		const sourceMaterials = asObject(payload?.materials);
		const sourceSkeletons = asObject(payload?.skeletons);
		const sourceMeshes = asObject(payload?.meshes);
		const sourceScene = asObject(payload?.scene);
		const sourceNodes = asList(sourceScene.nodes);
		if (sourceNodes.length <= 0) throw new Error("[WrWorld] loader scene has no nodes");

		const textureMap = new Map();
		for (const [sourceId, sourceTexture] of Object.entries(sourceTextures)) {
			const src = asObject(sourceTexture);
			const wrap = normalizeWrap(src.wrap);
			const id = this.#textureStore.add({
				id: sourceId,
				name: String(src.name ?? sourceId),
				source: src.bitmap ?? src.source ?? null,
				bitmap: src.bitmap ?? src.source ?? null,
				width: Number(src.width ?? 1) || 1,
				height: Number(src.height ?? 1) || 1,
				bytesPerPixel: 4,
				sampler: {
					minFilter: "linear",
					magFilter: "linear",
					mipmapFilter: "linear",
					wrapU: wrap,
					wrapV: wrap,
				},
			});
			textureMap.set(sourceId, id);
		}

		const materialMap = new Map();
		for (const [sourceId, sourceMaterial] of Object.entries(sourceMaterials)) {
			materialMap.set(sourceId, asObject(sourceMaterial));
		}

		const skeletonMap = new Map();
		for (const [sourceId, sourceSkeleton] of Object.entries(sourceSkeletons)) {
			const src = asObject(sourceSkeleton);
			const skeletonId = this.#skeletonStore.add({
				id: sourceId,
				name: String(src.name ?? sourceId),
				bones: asList(src.bones).map((bone, index) => {
					const sourceBone = asObject(bone);
					return {
						name: String(sourceBone.name ?? `Bone_${index}`),
						parent: Number(sourceBone.parent ?? -1) | 0,
						localBind: readMat4(sourceBone.localBind),
						inverseBind: readMat4(sourceBone.inverseBind),
					};
				}),
			});
			skeletonMap.set(sourceId, skeletonId);
		}

		const meshMap = new Map();
		for (const [sourceId, sourceMesh] of Object.entries(sourceMeshes)) {
			const mesh = rewriteLoaderMesh(sourceMesh, materialMap, textureMap);
			const meshId = this.#meshStore.add({ ...mesh, id: sourceId });
			meshMap.set(sourceId, meshId);
		}

		const sourceById = new Map();
		for (const sourceNode of sourceNodes) {
			const sourceId = asId(sourceNode?.id);
			if (!sourceId) continue;
			sourceById.set(sourceId, sourceNode);
		}
		if (sourceById.size <= 0) throw new Error("[WrWorld] loader scene has no valid node ids");

		const sourceRootIdRaw = asId(sourceScene.rootId) ?? asId(sourceNodes[0]?.id);
		const sourceRootId = sourceById.has(sourceRootIdRaw)
			? sourceRootIdRaw
			: (sourceById.keys().next().value ?? null);
		if (!sourceRootId) throw new Error("[WrWorld] loader scene root is missing");

		const attachParentRef = options.parent ?? options.parentId ?? null;
		const attachParent = asNodeRef(this, attachParentRef)?.id ?? asId(attachParentRef);
		if (attachParent && !this.getNode(attachParent)) {
			throw new Error(`[WrWorld] parent "${attachParent}" not found`);
		}

		const childrenMap = buildChildrenMap(sourceById);
		const visitOrder = buildVisitOrder(sourceById, childrenMap, sourceRootId);
		if (visitOrder.length <= 0) throw new Error("[WrWorld] loader scene traversal failed");
		const optionShaderIds = Array.isArray(options.shaderIds) ? options.shaderIds : [options.shaderIds];

		const sourceToWorld = new Map();
		for (const sourceId of visitOrder) {
			const sourceNode = sourceById.get(sourceId);
			const sourceParent = asId(sourceNode?.parent);
			const parentId = sourceId === sourceRootId
				? attachParent
				: (sourceToWorld.get(sourceParent) ?? attachParent ?? null);
			const node = this.addNode(parentId);
			if (!node) throw new Error(`[WrWorld] failed to create node from "${sourceId}"`);

			copySceneNodeData(sourceNode, node);
			node.name = String(sourceNode?.name ?? node.name ?? sourceId);

			const comps = readSceneComponents(sourceNode);
			const txSource = comps.Transform ?? comps.transform ?? null;
			if (txSource) {
				node.addComp(Transform).applyRaw(txSource);
			}

			const skeletonSource = comps.Skeleton ?? comps.skeleton ?? null;
			if (skeletonSource) {
				const live = node.addComp(LiveSkeleton);
				live.applyRaw(skeletonSource, {
					resolveSkeletonId: (id) => (skeletonMap.has(id) ? skeletonMap.get(id) : id),
				});
			}

			const meshSource = comps.MeshRenderer ?? comps.meshRenderer ?? null;
			if (meshSource) {
				const mr = node.addComp(MeshRenderer);
				mr.applyRaw(meshSource, {
					resolveMeshId: (id) => (meshMap.has(id) ? meshMap.get(id) : id),
				});
				for (const shaderId of optionShaderIds) mr.useShader(shaderId);
				if (mr.meshId) mr.bindMesh(mr.meshId);
			}

			sourceToWorld.set(sourceId, node.id);
		}

		const rootNode = this.getNode(sourceToWorld.get(sourceRootId));
		if (!rootNode) throw new Error("[WrWorld] failed to resolve copied root");
		rootNode.name = String(sourceScene.name ?? payload?.name ?? rootNode.name ?? rootNode.id);
		return rootNode;
	}

	#buildRenderQueue(start, options = {}) {
		const includeHidden = options.includeHidden === true;
		const mode = String(options.mode ?? "dfs_pre");
		const worldById = new Map();
		const draws = [];
		const groups = new Set();
		const identity = Azm.Mat4.makeIdentity();

		for (const [node] of start.traverse({ mode, includeFrom: true })) {
			const parentWorld = node.parentId ? (worldById.get(node.parentId) ?? null) : null;
			const tx = node.getComp(Transform);
			let nodeWorld = parentWorld ?? identity;
			if (tx) {
				if (parentWorld) Azm.Mat4.mul(parentWorld, tx.local, tx.world);
				else tx.world.set(tx.local);
				nodeWorld = tx.world;
			}
			worldById.set(node.id, nodeWorld);

			const meshRenderer = node.getComp(MeshRenderer);
			if (!meshRenderer) continue;
			if (!meshRenderer.cfg.display && !includeHidden) continue;

			const meshId = asId(meshRenderer.meshId);
			if (!meshId) continue;
			const shaderIds = Array.isArray(meshRenderer.cfg.shaderIds) && meshRenderer.cfg.shaderIds.length > 0
				? meshRenderer.cfg.shaderIds
				: [];
			if (shaderIds.length <= 0) continue;

			const mesh = this.#meshStore.get(meshId);
			if (!mesh) continue;

			const primaryMorph = typeof meshRenderer.getPrimaryMorph === "function"
				? meshRenderer.getPrimaryMorph()
				: { index: 0, weight: 0 };
			const hasRig = meshRenderer.cfg.hasRig === true;
			const liveSkeleton = hasRig ? meshRenderer.resolveLiveSkeleton() : null;
			const skinPalette = hasRig ? (liveSkeleton?.buildPalette(WR_SKIN_BONE_CAP) ?? null) : null;

			for (const shaderIdRaw of shaderIds) {
				const shaderId = asId(shaderIdRaw);
				if (!shaderId) continue;
				const shader = this.#shaderStore.get(shaderId);
				if (!shader) continue;
				const draw = {
					node,
					nodeId: node.id,
					mesh,
					meshId,
					shader,
					shaderId,
					meshRenderer,
					modelMatrix: new Float32Array(nodeWorld),
					primaryMorphIndex: Math.max(0, Number(primaryMorph?.index ?? 0) | 0),
					morphWeight: Number(primaryMorph?.weight ?? 0) || 0,
					skinPalette,
					hasRig,
				};
				draws.push(draw);
				groups.add(`${shaderId}|${meshId}|${draw.primaryMorphIndex}`);
			}
		}

		return {
			from: start.id,
			count: draws.length,
			groups: groups.size,
			draws,
			backend: this.#backend?.kind ?? null,
		};
	}

	#renderWgpu(queue, options = {}) {
		const backend = this.#backend;
		if (!backend || backend.kind !== "webgpu" || !backend.ready) return;

		const firstCfg = queue.draws[0]?.shader?.renderCfg ?? null;
		const clearColor = options.clearColor ?? firstCfg?.clearColor ?? [0.62, 0.72, 0.92, 1];
		const clearDepth = Number(options.clearDepth ?? firstCfg?.clearDepth ?? 1) || 1;
		const beginFrame = options.beginFrame !== false;
		const endFrame = options.endFrame !== false;
		const useDepth = options.useDepth !== false;
		const shouldStartFrame = beginFrame || !this.#gpu.frameActive;
		const clearColorEnabled = options.clearColorEnabled ?? shouldStartFrame;
		const clearDepthEnabled = options.clearDepthEnabled ?? shouldStartFrame;
		const sampleCount = normalizeSampleCount(
			options.sampleCount ?? backend.sampleCount ?? 1,
			backend.sampleCount ?? 1,
		);

		if (shouldStartFrame) {
			backend.beginFrame({
				clearColor,
				clearColorEnabled: false,
				clearDepth,
				clearDepthEnabled: false,
				useDepth,
				sampleCount,
			});
			this.#gpu.frameActive = true;
		}

		const pass = backend.beginRenderPass({
			clearColor,
			clearColorEnabled,
			clearDepth,
			clearDepthEnabled,
			useDepth,
			sampleCount,
		});
		if (!pass) {
			if (endFrame) {
				backend.endFrame();
				this.#gpu.frameActive = false;
			}
			return;
		}

		const now = Number(options.time ?? performance.now() * 0.001) || 0;
		const deltaTime = Number(options.deltaTime ?? 0) || 0;
		this.#updateSceneScratch(this.#camera, now, deltaTime);

		for (const draw of queue.draws) {
			const backendState = this.#ensureWgpuShader(draw.shader, sampleCount);
			if (!backendState?.pipeline) continue;
			const pipeline = backendState.pipeline;
			pass.setPipeline(pipeline);

			const sceneBindGroup = this.#ensureWgpuSceneBindGroup(pipeline);
			if (!sceneBindGroup) continue;
			pass.setBindGroup(0, sceneBindGroup);

			const meshGpu = this.#ensureWgpuMesh(draw.meshId, draw.mesh, draw.primaryMorphIndex);
			if (!meshGpu || meshGpu.submeshes.length <= 0) continue;

			for (let submeshIndex = 0; submeshIndex < meshGpu.submeshes.length; submeshIndex += 1) {
				const submeshGpu = meshGpu.submeshes[submeshIndex];
				const material = draw.mesh.submeshes?.[submeshIndex]?.material ?? { albedoColor: [1, 1, 1, 1], albedoTex: null };
				const objectBindGroup = this.#ensureWgpuObjectBindGroup(
					pipeline,
					draw,
					submeshIndex,
					material,
					now,
					deltaTime,
				);
				if (!objectBindGroup) continue;
				pass.setBindGroup(1, objectBindGroup);
				pass.setVertexBuffer(0, submeshGpu.vertexBuffer);
				pass.setIndexBuffer(submeshGpu.indexBuffer, submeshGpu.indexFormat);
				pass.drawIndexed(submeshGpu.indexCount, 1, 0, 0, 0);
			}
		}

		pass.end();
		if (endFrame) {
			backend.endFrame();
			this.#gpu.frameActive = false;
		}
	}

	#renderWgl2(queue, options = {}) {
		const backend = this.#backend;
		if (!backend || backend.kind !== "webgl2" || !backend.ready || !backend.gl) return;
		const gl = backend.gl;

		const firstCfg = queue.draws[0]?.shader?.renderCfg ?? null;
		const clearColor = options.clearColor ?? firstCfg?.clearColor ?? [0.62, 0.72, 0.92, 1];
		const clearDepth = Number(options.clearDepth ?? firstCfg?.clearDepth ?? 1) || 1;
		const beginFrame = options.beginFrame !== false;
		const endFrame = options.endFrame !== false;
		const useDepth = options.useDepth !== false;
		const shouldStartFrame = beginFrame || !this.#gpu.frameActive;
		const clearColorEnabled = options.clearColorEnabled ?? shouldStartFrame;
		const clearDepthEnabled = options.clearDepthEnabled ?? shouldStartFrame;

		if (shouldStartFrame) {
			backend.beginFrame({
				clearColor,
				clearColorEnabled: false,
				clearDepth,
				clearDepthEnabled: false,
				useDepth,
			});
			this.#gpu.frameActive = true;
		}

		backend.beginRenderPass({
			clearColor,
			clearColorEnabled,
			clearDepth,
			clearDepthEnabled,
			useDepth,
		});

		const view = this.#camera?.view ?? Azm.Mat4.makeIdentity();
		const projection = this.#camera?.projection ?? Azm.Mat4.makeIdentity();
		const vp = viewProj(this.#camera);
		const now = Number(options.time ?? performance.now() * 0.001) || 0;
		const deltaTime = Number(options.deltaTime ?? 0) || 0;

		for (const draw of queue.draws) {
			const backendState = this.#ensureWglShader(draw.shader);
			if (!backendState?.program) continue;
			const program = backendState.program;
			if (backendState.glPipeline?.state) {
				AzWGL2.State.apply(gl, backendState.glPipeline.state);
			}
			gl.useProgram(program);

			const uniform = this.#ensureWglUniforms(program);
			if (uniform.u_view) gl.uniformMatrix4fv(uniform.u_view, false, view);
			if (uniform.u_projection) gl.uniformMatrix4fv(uniform.u_projection, false, projection);
			if (uniform.u_viewProj) gl.uniformMatrix4fv(uniform.u_viewProj, false, vp);
			if (uniform.u_cameraPos && this.#camera?.position) {
				gl.uniform4f(
					uniform.u_cameraPos,
					Number(this.#camera.position[0] ?? 0) || 0,
					Number(this.#camera.position[1] ?? 0) || 0,
					Number(this.#camera.position[2] ?? 0) || 0,
					1,
				);
			}
			if (uniform.u_time) gl.uniform4f(uniform.u_time, now, deltaTime, 0, 0);
			if (uniform.u_model) gl.uniformMatrix4fv(uniform.u_model, false, draw.modelMatrix);

			const meshGpu = this.#ensureWglMesh(draw.meshId, draw.mesh, draw.primaryMorphIndex);
			if (!meshGpu || meshGpu.submeshes.length <= 0) continue;

			for (let submeshIndex = 0; submeshIndex < meshGpu.submeshes.length; submeshIndex += 1) {
				const submeshGpu = meshGpu.submeshes[submeshIndex];
				const material = draw.mesh.submeshes?.[submeshIndex]?.material ?? { albedoColor: [1, 1, 1, 1], albedoTex: null };
				const submeshFlags = collectSubmeshFlags(draw, submeshIndex);
				const inst = draw.meshRenderer?.instData ?? {};
				const inst0 = inst.slot0 ?? [0, 0, 0, 0];
				const inst1 = inst.slot1 ?? [0, 0, 0, 0];
				const inst2 = inst.slot2 ?? [0, 0, 0, 0];
				const inst3 = inst.slot3 ?? [0, 0, 0, 0];
				if (uniform.u_instData0) gl.uniform4f(uniform.u_instData0, inst0[0] ?? 0, inst0[1] ?? 0, inst0[2] ?? 0, inst0[3] ?? 0);
				if (uniform.u_instData1) gl.uniform4f(uniform.u_instData1, inst1[0] ?? 0, inst1[1] ?? 0, inst1[2] ?? 0, inst1[3] ?? 0);
				if (uniform.u_instData2) gl.uniform4f(uniform.u_instData2, inst2[0] ?? 0, inst2[1] ?? 0, inst2[2] ?? 0, inst2[3] ?? 0);
				if (uniform.u_instData3) gl.uniform4f(uniform.u_instData3, inst3[0] ?? 0, inst3[1] ?? 0, inst3[2] ?? 0, inst3[3] ?? 0);
				if (uniform.u_albedoColor) {
					const color = readColor4(material.albedoColor, [1, 1, 1, 1]);
					gl.uniform4f(uniform.u_albedoColor, color[0], color[1], color[2], color[3]);
				}
				if (uniform.u_vtxFlags0) {
					const hasRig = draw.hasRig && submeshFlags.hasBone ? 1 : 0;
					const hasMorph = submeshFlags.morphHasPos ? 1 : 0;
					gl.uniform4f(
						uniform.u_vtxFlags0,
						hasRig,
						hasMorph,
						submeshFlags.hasUV ? 1 : 0,
						submeshFlags.hasNormal ? 1 : 0,
					);
				}
				if (uniform.u_vtxFlags1) {
					gl.uniform4f(
						uniform.u_vtxFlags1,
						submeshFlags.hasColor ? 1 : 0,
						submeshFlags.hasBone ? 1 : 0,
						submeshFlags.hasTangent ? 1 : 0,
						submeshFlags.morphHasPos ? 1 : 0,
					);
				}
				if (uniform.u_extras) {
					gl.uniform4f(
						uniform.u_extras,
						draw.morphWeight,
						submeshFlags.morphHasNormal ? 1 : 0,
						submeshFlags.morphHasTangent ? 1 : 0,
						0,
					);
				}
				if (uniform.u_skinPalette) {
					const palette = draw.skinPalette instanceof Float32Array ? draw.skinPalette : this.#identityPalette();
					gl.uniformMatrix4fv(uniform.u_skinPalette, false, palette);
				}
				if (uniform.u_albedoTex) {
					const texture = this.#ensureWglTexture(material.albedoTex);
					gl.activeTexture(gl.TEXTURE0);
					gl.bindTexture(gl.TEXTURE_2D, texture);
					gl.uniform1i(uniform.u_albedoTex, 0);
				}

				gl.bindVertexArray(submeshGpu.vao);
				gl.drawElements(gl.TRIANGLES, submeshGpu.indexCount, submeshGpu.indexType, 0);
			}
		}

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, null);
		gl.bindVertexArray(null);
		gl.useProgram(null);
		if (endFrame) {
			backend.endFrame();
			this.#gpu.frameActive = false;
		}
	}

	#applyShaderPriorities(queue, shaderPriorities) {
		if (!queue || !Array.isArray(queue.draws) || queue.draws.length <= 1) return;
		const priorities = normalizeShaderPriorities(shaderPriorities);
		if (priorities.length <= 0) return;

		const rank = new Map();
		for (let i = 0; i < priorities.length; i += 1) rank.set(priorities[i], i);
		const ordered = Array.from({ length: priorities.length }, () => []);
		const others = [];

		for (const draw of queue.draws) {
			const id = asId(draw?.shaderId);
			const idx = id != null ? rank.get(id) : undefined;
			if (idx === undefined) {
				others.push(draw);
				continue;
			}
			ordered[idx].push(draw);
		}

		queue.draws = ordered.flat().concat(others);
		queue.count = queue.draws.length;
	}

	#ensureWgpuShader(shader, sampleCount = 1) {
		if (!shader) return null;
		const wantedSampleCount = normalizeSampleCount(sampleCount, 1);
		const cachedCount = this.#gpu.wgpuShaderSampleCount.get(shader) ?? 1;
		if (shader.backend?.kind === "webgpu" && shader.backend.pipeline && cachedCount === wantedSampleCount) {
			return shader.backend;
		}
		try {
			const built = shader.buildBackend(this.#backend, {
				createPipeline: true,
				sampleCount: wantedSampleCount,
			});
			if (built?.pipeline) this.#gpu.wgpuShaderSampleCount.set(shader, wantedSampleCount);
			return built;
		} catch (_error) {
			return null;
		}
	}

	#ensureWglShader(shader) {
		if (!shader) return null;
		if (shader.backend?.kind === "webgl2" && shader.backend.program) return shader.backend;
		try {
			return shader.buildBackend(this.#backend, { createPipeline: true });
		} catch (_error) {
			return null;
		}
	}

	#ensureWgpuMesh(meshId, mesh, morphTargetIndex) {
		const key = `${meshId}|morph:${Math.max(0, Number(morphTargetIndex) | 0)}`;
		const cached = this.#gpu.wgpuMeshCache.get(key);
		if (cached) return cached;

		const packed = WrMesh.pack(mesh, { morphTargetIndex });
		if (packed.length <= 0) return null;
		const submeshes = [];
		for (const item of packed) {
			const vertexBytes = alignTo4(item.vertexData.byteLength);
			const indexBytes = alignTo4(item.indexData.byteLength);
			const vertexBuffer = this.#backend.createBuffer({
				label: `WrVB:${meshId}`,
				size: vertexBytes,
				usage: WR_GPU_BUFFER_USAGE.VERTEX | WR_GPU_BUFFER_USAGE.COPY_DST,
			});
			const indexBuffer = this.#backend.createBuffer({
				label: `WrIB:${meshId}`,
				size: indexBytes,
				usage: WR_GPU_BUFFER_USAGE.INDEX | WR_GPU_BUFFER_USAGE.COPY_DST,
			});
			this.#backend.writeBuffer(vertexBuffer, padTo4Bytes(item.vertexData), 0);
			this.#backend.writeBuffer(indexBuffer, padTo4Bytes(item.indexData), 0);
			submeshes.push({
				vertexBuffer,
				indexBuffer,
				indexFormat: item.indexFormat,
				indexCount: item.indexCount,
			});
		}
		const out = { submeshes };
		this.#gpu.wgpuMeshCache.set(key, out);
		return out;
	}

	#ensureWglMesh(meshId, mesh, morphTargetIndex) {
		const key = `${meshId}|morph:${Math.max(0, Number(morphTargetIndex) | 0)}`;
		const cached = this.#gpu.wglMeshCache.get(key);
		if (cached) return cached;

		const gl = this.#backend.gl;
		const packed = WrMesh.pack(mesh, { morphTargetIndex });
		if (packed.length <= 0) return null;
		const submeshes = [];
		for (const item of packed) {
			const vao = gl.createVertexArray();
			const vbo = gl.createBuffer();
			const ibo = gl.createBuffer();
			if (!vao || !vbo || !ibo) continue;

			gl.bindVertexArray(vao);
			gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
			gl.bufferData(gl.ARRAY_BUFFER, item.vertexData, gl.STATIC_DRAW);
			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
			gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, item.indexData, gl.STATIC_DRAW);

			for (const attr of WR_VERTEX_ATTRS) {
				gl.enableVertexAttribArray(attr.location);
				gl.vertexAttribPointer(attr.location, attr.size, gl.FLOAT, false, WR_VERTEX_STRIDE, attr.offset);
			}

			submeshes.push({
				vao,
				vbo,
				ibo,
				indexCount: item.indexCount,
				indexType: item.indexFormat === "uint32" ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
			});
		}
		gl.bindVertexArray(null);
		gl.bindBuffer(gl.ARRAY_BUFFER, null);
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

		const out = { submeshes };
		this.#gpu.wglMeshCache.set(key, out);
		return out;
	}

	#updateSceneScratch(camera, time, deltaTime = 0) {
		const scene = this.#gpu.sceneScratch;
		scene.fill(0);
		const v = camera?.view ?? Azm.Mat4.makeIdentity();
		const p = camera?.projection ?? Azm.Mat4.makeIdentity();
		const vp = Azm.Mat4.mul(p, v);
		scene.set(v, 0);
		scene.set(p, 16);
		scene.set(vp, 32);
		if (camera?.position) {
			scene[48] = Number(camera.position[0] ?? 0) || 0;
			scene[49] = Number(camera.position[1] ?? 0) || 0;
			scene[50] = Number(camera.position[2] ?? 0) || 0;
			scene[51] = 1;
		}
		scene[52] = Number(time) || 0;
		scene[53] = Number(deltaTime) || 0;
		scene[54] = 0;
		scene[55] = 0;

		const buffer = this.#ensureWgpuSceneBuffer();
		this.#backend.writeBuffer(buffer, scene, 0);
	}

	#ensureWgpuSceneBuffer() {
		if (this.#gpu.sceneBuffer) return this.#gpu.sceneBuffer;
		this.#gpu.sceneBuffer = this.#backend.createBuffer({
			label: "WrSceneUBO",
			size: WR_SCENE_UBO_F32 * 4,
			usage: WR_GPU_BUFFER_USAGE.UNIFORM | WR_GPU_BUFFER_USAGE.COPY_DST,
		});
		return this.#gpu.sceneBuffer;
	}

	#ensureWgpuObjectBuffer(objectKey) {
		const cached = this.#gpu.objectBuffers.get(objectKey);
		if (cached) return cached;
		const buffer = this.#backend.createBuffer({
			label: `WrObjectUBO:${objectKey}`,
			size: WR_OBJECT_UBO_BYTES,
			usage: WR_GPU_BUFFER_USAGE.UNIFORM | WR_GPU_BUFFER_USAGE.COPY_DST,
		});
		this.#gpu.objectBuffers.set(objectKey, buffer);
		return buffer;
	}

	#ensureWgpuSceneBindGroup(pipeline) {
		const cached = this.#gpu.sceneBindGroups.get(pipeline);
		if (cached) return cached;
		const buffer = this.#ensureWgpuSceneBuffer();
		const layout = pipeline.getBindGroupLayout(0);
		const bindGroup = this.#backend.createBindGroup({
			label: "WrSceneBG",
			layout,
			entries: [{ binding: 0, resource: { buffer } }],
		});
		if (!bindGroup) return null;
		this.#gpu.sceneBindGroups.set(pipeline, bindGroup);
		return bindGroup;
	}

	#ensureWgpuObjectBindGroup(pipeline, draw, submeshIndex, material, time, deltaTime = 0) {
		let byPipeline = this.#gpu.objectBindGroups.get(pipeline);
		if (!byPipeline) {
			byPipeline = new Map();
			this.#gpu.objectBindGroups.set(pipeline, byPipeline);
		}

		const texKey = asId(material?.albedoTex) ?? "__fallback__";
		const objectKey = `${draw.nodeId}|${draw.meshId}|sub:${submeshIndex}`;
		const key = `${objectKey}|${texKey}`;
		const cached = byPipeline.get(key);
		if (cached) {
			this.#updateObjectScratch(objectKey, draw, submeshIndex, material, time, deltaTime);
			return cached;
		}

		this.#updateObjectScratch(objectKey, draw, submeshIndex, material, time, deltaTime);
		const objectBuffer = this.#ensureWgpuObjectBuffer(objectKey);
		const texture = this.#ensureWgpuTexture(texKey);
		const layout = pipeline.getBindGroupLayout(1);
		const bindGroup = this.#backend.createBindGroup({
			label: "WrObjectBG",
			layout,
			entries: [
				{ binding: 0, resource: { buffer: objectBuffer } },
				{ binding: 1, resource: texture.sampler },
				{ binding: 2, resource: texture.view },
			],
		});
		if (!bindGroup) return null;
		byPipeline.set(key, bindGroup);
		return bindGroup;
	}

	#updateObjectScratch(objectKey, draw, submeshIndex, material, time, deltaTime = 0) {
		const object = this.#gpu.objectScratch;
		const submeshFlags = collectSubmeshFlags(draw, submeshIndex);
		const inst = draw.meshRenderer?.instData ?? {};
		const inst0 = inst.slot0 ?? [0, 0, 0, 0];
		const inst1 = inst.slot1 ?? [0, 0, 0, 0];
		const inst2 = inst.slot2 ?? [0, 0, 0, 0];
		const inst3 = inst.slot3 ?? [0, 0, 0, 0];
		object.fill(0);
		object.set(draw.modelMatrix, 0);
		object[16] = Number(inst0[0] ?? 0) || 0;
		object[17] = Number(inst0[1] ?? 0) || 0;
		object[18] = Number(inst0[2] ?? 0) || 0;
		object[19] = Number(inst0[3] ?? 0) || 0;
		object[20] = Number(inst1[0] ?? 0) || 0;
		object[21] = Number(inst1[1] ?? 0) || 0;
		object[22] = Number(inst1[2] ?? 0) || 0;
		object[23] = Number(inst1[3] ?? 0) || 0;
		object[24] = Number(inst2[0] ?? 0) || 0;
		object[25] = Number(inst2[1] ?? 0) || 0;
		object[26] = Number(inst2[2] ?? 0) || 0;
		object[27] = Number(inst2[3] ?? 0) || 0;
		object[28] = Number(inst3[0] ?? 0) || 0;
		object[29] = Number(inst3[1] ?? 0) || 0;
		object[30] = Number(inst3[2] ?? 0) || 0;
		object[31] = Number(inst3[3] ?? 0) || 0;
		const color = readColor4(material?.albedoColor, [1, 1, 1, 1]);
		object[32] = color[0];
		object[33] = color[1];
		object[34] = color[2];
		object[35] = color[3];
		object[36] = draw.hasRig && submeshFlags.hasBone ? 1 : 0;
		object[37] = submeshFlags.morphHasPos ? 1 : 0;
		object[38] = submeshFlags.hasUV ? 1 : 0;
		object[39] = submeshFlags.hasNormal ? 1 : 0;
		object[40] = submeshFlags.hasColor ? 1 : 0;
		object[41] = submeshFlags.hasBone ? 1 : 0;
		object[42] = submeshFlags.hasTangent ? 1 : 0;
		object[43] = submeshFlags.morphHasPos ? 1 : 0;
		object[44] = draw.morphWeight;
		object[45] = submeshFlags.morphHasNormal ? 1 : 0;
		object[46] = submeshFlags.morphHasTangent ? 1 : 0;
		object[47] = 0;

		object.set(this.#identityPalette(), WR_SKIN_BASE_F32);
		if (draw.skinPalette && (ArrayBuffer.isView(draw.skinPalette) || Array.isArray(draw.skinPalette))) {
			const max = WR_SKIN_BONE_CAP * 16;
			const count = Math.min(max, draw.skinPalette.length | 0);
			for (let i = 0; i < count; i += 1) {
				object[WR_SKIN_BASE_F32 + i] = Number(draw.skinPalette[i] ?? object[WR_SKIN_BASE_F32 + i]) || object[WR_SKIN_BASE_F32 + i];
			}
		}

		const buffer = this.#ensureWgpuObjectBuffer(objectKey);
		this.#backend.writeBuffer(buffer, object, 0);
	}

	#ensureWgpuTexture(textureId) {
		if (!textureId || textureId === "__fallback__") return this.#ensureWgpuFallbackTexture();
		const cached = this.#gpu.wgpuTextureCache.get(textureId);
		if (cached) return cached;

		const textureAsset = this.#textureStore.get(textureId);
		if (!textureAsset) return this.#ensureWgpuFallbackTexture();
		const width = Math.max(1, Number(textureAsset.width ?? textureAsset.bitmap?.width ?? 1) | 0);
		const height = Math.max(1, Number(textureAsset.height ?? textureAsset.bitmap?.height ?? 1) | 0);
		const texture = this.#backend.createTexture2D({
			label: `WrTex:${textureId}`,
			width,
			height,
			format: textureAsset.format ?? "rgba8unorm",
		});
		if (!texture) return this.#ensureWgpuFallbackTexture();

		const source = textureAsset.source ?? textureAsset.bitmap ?? null;
		if (ArrayBuffer.isView(source)) {
			const bytesPerPixel = Math.max(1, Number(textureAsset.bytesPerPixel ?? 4) | 0);
			const rowBytes = width * bytesPerPixel;
			const bytesPerRow = alignTo256(rowBytes);
			if (bytesPerRow === rowBytes) {
				this.#backend.writeTexture(
					texture,
					source,
					{ offset: 0, bytesPerRow, rowsPerImage: height },
					{ width, height, depthOrArrayLayers: 1 },
				);
			} else {
				const srcBytes = new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
				const padded = new Uint8Array(bytesPerRow * height);
				for (let y = 0; y < height; y += 1) {
					const srcOffset = y * rowBytes;
					const dstOffset = y * bytesPerRow;
					padded.set(srcBytes.subarray(srcOffset, srcOffset + rowBytes), dstOffset);
				}
				this.#backend.writeTexture(
					texture,
					padded,
					{ offset: 0, bytesPerRow, rowsPerImage: height },
					{ width, height, depthOrArrayLayers: 1 },
				);
			}
		} else if (source && this.#backend.device?.queue?.copyExternalImageToTexture) {
			this.#backend.device.queue.copyExternalImageToTexture(
				{ source },
				{ texture },
				{ width, height, depthOrArrayLayers: 1 },
			);
		}

		const view = texture.createView();
		const sampler = this.#backend.createSampler({
			minFilter: textureAsset.sampler?.minFilter ?? "linear",
			magFilter: textureAsset.sampler?.magFilter ?? "linear",
			mipmapFilter: textureAsset.sampler?.mipmapFilter ?? "linear",
			addressModeU: textureAsset.sampler?.wrapU ?? "repeat",
			addressModeV: textureAsset.sampler?.wrapV ?? "repeat",
		});
		const out = { texture, view, sampler };
		this.#gpu.wgpuTextureCache.set(textureId, out);
		return out;
	}

	#ensureWgpuFallbackTexture() {
		if (this.#gpu.wgpuFallbackTexture) return this.#gpu.wgpuFallbackTexture;
		const texture = this.#backend.createTexture2D({
			label: "WrFallbackWhite",
			width: 1,
			height: 1,
			format: "rgba8unorm",
		});
		if (!texture) return null;
		this.#backend.writeTexture(
			texture,
			new Uint8Array([255, 255, 255, 255]),
			{ offset: 0, bytesPerRow: 256, rowsPerImage: 1 },
			{ width: 1, height: 1, depthOrArrayLayers: 1 },
		);
		const view = texture.createView();
		const sampler = this.#backend.createSampler({
			minFilter: "linear",
			magFilter: "linear",
			mipmapFilter: "linear",
			addressModeU: "repeat",
			addressModeV: "repeat",
		});
		this.#gpu.wgpuFallbackTexture = { texture, view, sampler };
		return this.#gpu.wgpuFallbackTexture;
	}

	#ensureWglUniforms(program) {
		const cached = this.#gpu.wglUniformCache.get(program);
		if (cached) return cached;
		const gl = this.#backend.gl;
		const out = {
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
		this.#gpu.wglUniformCache.set(program, out);
		return out;
	}

	#ensureWglTexture(textureId) {
		if (!textureId || textureId === "__fallback__") return this.#ensureWglFallbackTexture();
		const cached = this.#gpu.wglTextureCache.get(textureId);
		if (cached) return cached;
		const textureAsset = this.#textureStore.get(textureId);
		if (!textureAsset) return this.#ensureWglFallbackTexture();

		const gl = this.#backend.gl;
		const width = Math.max(1, Number(textureAsset.width ?? textureAsset.bitmap?.width ?? 1) | 0);
		const height = Math.max(1, Number(textureAsset.height ?? textureAsset.bitmap?.height ?? 1) | 0);
		const source = textureAsset.source ?? textureAsset.bitmap ?? null;
		const wrapU = textureAsset.sampler?.wrapU === "clamp-to-edge" ? gl.CLAMP_TO_EDGE : gl.REPEAT;
		const wrapV = textureAsset.sampler?.wrapV === "clamp-to-edge" ? gl.CLAMP_TO_EDGE : gl.REPEAT;

		const texture = this.#backend.createTexture2D({
			width,
			height,
			wrapS: wrapU,
			wrapT: wrapV,
			minFilter: gl.LINEAR,
			magFilter: gl.LINEAR,
		});
		if (!texture) return this.#ensureWglFallbackTexture();

		if (source) {
			if (ArrayBuffer.isView(source)) {
				this.#backend.writeTexture2D(texture, source, { width, height, format: gl.RGBA, type: gl.UNSIGNED_BYTE });
			} else {
				this.#backend.writeTexture2D(texture, source, { format: gl.RGBA, type: gl.UNSIGNED_BYTE });
			}
		}

		this.#gpu.wglTextureCache.set(textureId, texture);
		return texture;
	}

	#ensureWglFallbackTexture() {
		if (this.#gpu.wglFallbackTexture) return this.#gpu.wglFallbackTexture;
		const gl = this.#backend.gl;
		const texture = this.#backend.createTexture2D({
			width: 1,
			height: 1,
			wrapS: gl.CLAMP_TO_EDGE,
			wrapT: gl.CLAMP_TO_EDGE,
			minFilter: gl.NEAREST,
			magFilter: gl.NEAREST,
		});
		this.#backend.writeTexture2D(texture, new Uint8Array([255, 255, 255, 255]), {
			width: 1,
			height: 1,
			format: gl.RGBA,
			type: gl.UNSIGNED_BYTE,
		});
		this.#gpu.wglFallbackTexture = texture;
		return texture;
	}

	#identityPalette() {
		if (this.#gpu.identityPalette) return this.#gpu.identityPalette;
		const out = new Float32Array(WR_SKIN_BONE_CAP * 16);
		for (let i = 0; i < WR_SKIN_BONE_CAP; i += 1) out.set(Azm.Mat4.IDENTITY, i * 16);
		this.#gpu.identityPalette = out;
		return out;
	}

	#dropGpuState() {
		if (!this.#gpu) return;
		if (this.#gpu.frameActive && this.#backend?.endFrame) {
			try {
				this.#backend.endFrame();
			} catch (_error) {}
		}

		for (const mesh of this.#gpu.wgpuMeshCache.values()) {
			for (const submesh of mesh?.submeshes ?? []) {
				submesh.vertexBuffer?.destroy?.();
				submesh.indexBuffer?.destroy?.();
			}
		}
		for (const tex of this.#gpu.wgpuTextureCache.values()) tex?.texture?.destroy?.();
		if (this.#gpu.wgpuFallbackTexture?.texture) this.#gpu.wgpuFallbackTexture.texture.destroy();
		if (this.#gpu.sceneBuffer) this.#gpu.sceneBuffer.destroy?.();
		for (const buffer of this.#gpu.objectBuffers.values()) buffer?.destroy?.();

		if (this.#backend?.gl) {
			const gl = this.#backend.gl;
			for (const mesh of this.#gpu.wglMeshCache.values()) {
				for (const submesh of mesh?.submeshes ?? []) {
					if (submesh.vao) gl.deleteVertexArray(submesh.vao);
					if (submesh.vbo) gl.deleteBuffer(submesh.vbo);
					if (submesh.ibo) gl.deleteBuffer(submesh.ibo);
				}
			}
			for (const texture of this.#gpu.wglTextureCache.values()) gl.deleteTexture(texture);
			if (this.#gpu.wglFallbackTexture) gl.deleteTexture(this.#gpu.wglFallbackTexture);
		}

		this.#gpu = this.#newGpuState();
	}

	#newGpuState() {
		return {
			frameActive: false,
			sceneScratch: new Float32Array(WR_SCENE_UBO_F32),
			objectScratch: new Float32Array(WR_OBJECT_UBO_F32),
			sceneBuffer: null,
			objectBuffers: new Map(),
			sceneBindGroups: new WeakMap(),
			objectBindGroups: new WeakMap(),
			wgpuMeshCache: new Map(),
			wgpuTextureCache: new Map(),
			wgpuFallbackTexture: null,
			wglMeshCache: new Map(),
			wglTextureCache: new Map(),
			wglFallbackTexture: null,
			wglUniformCache: new WeakMap(),
			wgpuShaderSampleCount: new WeakMap(),
			identityPalette: null,
		};
	}

	#syncRoot(id) {
		const key = asId(id);
		if (!key) return;
		const node = this.getNode(key);
		if (!node) {
			this.#roots.delete(key);
			return;
		}
		if (node.parentId == null) this.#roots.add(key);
		else this.#roots.delete(key);
	}

	#roots;
	#backend;
	#camera;
	#meshStore;
	#textureStore;
	#shaderStore;
	#skeletonStore;
	#store;
	#gpu;
}

if (typeof window !== "undefined") {
	window.WrWorld2 = WrWorld;
	window.WrNode = WrNode;
}

export default WrWorld;

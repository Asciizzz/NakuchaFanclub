import { load as loadGLB } from "../../WeebRender2/WrLoader/GltfLoader.js";
import { Transform } from "../WrWorld/transform.js";
import { MeshRenderer } from "../WrWorld/meshRenderer.js";
import { LiveSkeleton } from "../WrWorld/liveSkeleton.js";
import { Shader as ShaderComp } from "../WrWorld/shader.js";
import { RenderPass as RenderPassComp } from "../WrWorld/renderPass.js";
import { WrMesh } from "../WrAssets/Mesh.js";
import { WrTexture } from "../WrAssets/Texture.js";
import { WrSkeleton } from "../WrAssets/Skeleton.js";

function asId(value) {
	if (value == null) return null;
	const id = String(value).trim();
	return id || null;
}

function asObject(value) {
	return value && typeof value === "object" ? value : {};
}

function asList(value) {
	return Array.isArray(value) ? value : [];
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

function normalizeWrap(value) {
	const raw = String(value ?? "").toLowerCase();
	if (raw === "clamp" || raw === "clamp_to_edge" || raw === "clamp-to-edge") return "clamp-to-edge";
	return "repeat";
}

function materialFromSubmesh(rawMaterial, materialMap, textureMap) {
	const source = asObject(rawMaterial);
	const materialId = asId(source.materialID);
	const linked = materialId ? asObject(materialMap.get(materialId)) : null;
	const merged = linked ? { ...linked, ...source } : source;
	const albedoSource = asId(merged.albedoTex);
	const albedoTex = albedoSource ? (textureMap.get(albedoSource) ?? null) : null;
	return {
		albedoTex,
		albedoColor: readColor4(merged.albedoColor, [1, 1, 1, 1]),
	};
}

function rewriteMesh(sourceMesh, materialMap, textureMap) {
	const mesh = WrMesh.from(sourceMesh ?? {});
	mesh.submeshes = asList(mesh.submeshes).map((submesh) => {
		const next = {
			...submesh,
			material: materialFromSubmesh(submesh?.material, materialMap, textureMap),
		};
		return next;
	});
	mesh.rebuildMorphCache();
	mesh.rebuildAABBCache();
	return mesh;
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

export class WrLoader {
	backend = null;
	world = null;
	stores = null;

	constructor(options = {}) {
		const src = options && typeof options === "object" ? options : {};
		this.backend = src.backend ?? null;
		this.world = src.world ?? null;
		this.stores = src.stores ?? src.assets ?? null;
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

	async registerGLTF(url, options = {}) {
		const targetUrl = String(url ?? "").trim();
		if (!targetUrl) return null;

		const src = options && typeof options === "object" ? options : {};
		const backend = src.backend ?? this.backend ?? null;
		const stores = src.stores ?? src.assets ?? this.stores ?? null;
		const world = src.world ?? this.world ?? null;
		if (!stores || !world) return null;

		const payload = await loadGLB(targetUrl);
		const sourceTextures = asObject(payload?.textures);
		const sourceMaterials = asObject(payload?.materials);
		const sourceSkeletons = asObject(payload?.skeletons);
		const sourceMeshes = asObject(payload?.meshes);
		const sourceScene = asObject(payload?.scene);
		const sourceNodes = asList(sourceScene.nodes);
		if (sourceNodes.length <= 0) return null;

		const textureMap = new Map();
		for (const [sourceId, sourceTexture] of Object.entries(sourceTextures)) {
			const texSrc = asObject(sourceTexture);
			const wrap = normalizeWrap(texSrc.wrap);
			const id = stores.textures.add(new WrTexture({
				id: sourceId,
				name: String(texSrc.name ?? sourceId),
				source: texSrc.bitmap ?? texSrc.source ?? null,
				width: Number(texSrc.width ?? 1) || 1,
				height: Number(texSrc.height ?? 1) || 1,
				bytesPerPixel: 4,
				sampler: {
					minFilter: "linear",
					magFilter: "linear",
					mipmapFilter: "linear",
					wrapU: wrap,
					wrapV: wrap,
				},
			}));
			textureMap.set(sourceId, id);
			if (src.uploadGpu === true && backend) stores.textures.createGpu(backend, id);
		}

		const materialMap = new Map();
		for (const [sourceId, sourceMaterial] of Object.entries(sourceMaterials)) {
			materialMap.set(sourceId, asObject(sourceMaterial));
		}

		const skeletonMap = new Map();
		for (const [sourceId, sourceSkeleton] of Object.entries(sourceSkeletons)) {
			const skelSrc = asObject(sourceSkeleton);
			const id = stores.skeletons.add(new WrSkeleton({
				id: sourceId,
				name: String(skelSrc.name ?? sourceId),
				bones: asList(skelSrc.bones),
			}));
			skeletonMap.set(sourceId, id);
		}

		const meshMap = new Map();
		for (const [sourceId, sourceMesh] of Object.entries(sourceMeshes)) {
			const mesh = rewriteMesh(sourceMesh, materialMap, textureMap);
			mesh.id = sourceId;
			const id = stores.meshes.add(mesh);
			meshMap.set(sourceId, id);
			if (src.uploadGpu === true && backend) {
				const morphCount = Math.max(1, mesh.getMorphTargetCount ? mesh.getMorphTargetCount() : 1);
				for (let i = 0; i < morphCount; i += 1) {
					stores.meshes.createGpu(backend, id, { morphTargetIndex: i });
				}
			}
		}

		const sourceById = new Map();
		for (const sourceNode of sourceNodes) {
			const sourceId = asId(sourceNode?.id);
			if (!sourceId) continue;
			sourceById.set(sourceId, sourceNode);
		}
		if (sourceById.size <= 0) return null;

		const sourceRootIdRaw = asId(sourceScene.rootId) ?? asId(sourceNodes[0]?.id);
		const sourceRootId = sourceById.has(sourceRootIdRaw)
			? sourceRootIdRaw
			: (sourceById.keys().next().value ?? null);
		if (!sourceRootId) return null;

		const attachParentRef = src.parent ?? src.parentId ?? null;
		const attachParentId = attachParentRef && typeof attachParentRef === "object"
			? asId(attachParentRef.id)
			: asId(attachParentRef);
		const attachParent = attachParentId ? world.getNode(attachParentId) : null;
		const attachId = attachParent ? attachParent.id : null;

		const childrenMap = buildChildrenMap(sourceById);
		const visitOrder = buildVisitOrder(sourceById, childrenMap, sourceRootId);
		if (visitOrder.length <= 0) return null;

		const sourceToWorld = new Map();
		for (const sourceId of visitOrder) {
			const sourceNode = sourceById.get(sourceId);
			const sourceParent = asId(sourceNode?.parent);
			const parentId = sourceId === sourceRootId
				? attachId
				: (sourceToWorld.get(sourceParent) ?? attachId ?? null);
			const node = world.addNode(parentId);
			if (!node) return null;
			node.name = String(sourceNode?.name ?? sourceId);

			const comps = asObject(sourceNode?.components ?? sourceNode?.$);
			const txSource = comps.Transform ?? comps.transform ?? null;
			if (txSource) {
				const tx = node.addComp(Transform);
				tx.local = txSource.local ? new Float32Array(txSource.local) : tx.local;
				tx.world = txSource.world ? new Float32Array(txSource.world) : tx.world;
			}

			const skeletonSource = comps.Skeleton ?? comps.skeleton ?? null;
			if (skeletonSource) {
				const live = node.addComp(LiveSkeleton);
				const sourceSkelId = asId(skeletonSource.skeletonID ?? skeletonSource.skeletonId ?? skeletonSource.skeleton);
				live.skeletonId = sourceSkelId ? (skeletonMap.get(sourceSkelId) ?? sourceSkelId) : null;
				live.bones = Array.isArray(skeletonSource.bones) ? skeletonSource.bones.map((m) => new Float32Array(m)) : [];
			}

			const meshSource = comps.MeshRenderer ?? comps.meshRenderer ?? null;
			if (meshSource) {
				const mr = node.addComp(MeshRenderer);
				const sourceMeshId = asId(meshSource.meshID ?? meshSource.meshId ?? meshSource.mesh);
				mr.meshId = sourceMeshId ? (meshMap.get(sourceMeshId) ?? sourceMeshId) : null;
				mr.cfg.hasRig = !!meshSource.hasRig;
				mr.cfg.display = meshSource.active !== false && meshSource.display !== false;
				if (Array.isArray(meshSource.morphWeights) || ArrayBuffer.isView(meshSource.morphWeights)) {
					mr.morphWeights = new Float32Array(meshSource.morphWeights);
				}
			}

			sourceToWorld.set(sourceId, node.id);
		}

		const root = world.getNode(sourceToWorld.get(sourceRootId));
		if (!root) return null;
		root.name = String(sourceScene.name ?? payload?.name ?? root.name ?? root.id);

		if (src.passCfg && typeof src.passCfg === "object") {
			const pass = root.addComp(RenderPassComp);
			pass.set(src.passCfg);
		}
		if (src.shaderIds !== undefined) {
			const shader = root.addComp(ShaderComp);
			shader.setShaderIds(src.shaderIds);
		}

		return root;
	}
}

if (typeof window !== "undefined") {
	window.WrLoader21 = WrLoader;
}

export default WrLoader;

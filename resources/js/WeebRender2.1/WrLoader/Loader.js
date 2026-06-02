import { load as loadGLB } from "../../WeebRender2/WrLoader/GltfLoader.js";
import { Transform } from "../WrWorld/transform.js";
import { MeshRenderer } from "../WrWorld/meshRenderer.js";
import { LiveSkeleton } from "../WrWorld/liveSkeleton.js";
import { ShaderOBJ as ShaderOBJComp } from "../WrWorld/shaderObj.js";
import { RenderPass as RenderPassComp } from "../WrWorld/renderPass.js";
import { WrMesh } from "../WrAssets/Mesh.js";
import { WrTexture } from "../WrAssets/Texture.js";
import { WrSkeleton } from "../WrAssets/Skeleton.js";
import { WrRenderPass } from "../WrAssets/RenderPass.js";

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
		if (!world) return null;

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
			const textureDesc = {
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
			};
			const texture = stores?.textures
				? stores.textures.add(textureDesc)
				: new WrTexture(textureDesc);
			textureMap.set(sourceId, texture);
			if (src.uploadGpu === true && backend && stores?.textures) stores.textures.createGpu(backend, texture);
		}

		const materialMap = new Map();
		for (const [sourceId, sourceMaterial] of Object.entries(sourceMaterials)) {
			materialMap.set(sourceId, asObject(sourceMaterial));
		}

		const skeletonMap = new Map();
		for (const [sourceId, sourceSkeleton] of Object.entries(sourceSkeletons)) {
			const skelSrc = asObject(sourceSkeleton);
			const skeletonDesc = {
				id: sourceId,
				name: String(skelSrc.name ?? sourceId),
				bones: asList(skelSrc.bones),
			};
			const skeleton = stores?.skeletons
				? stores.skeletons.add(skeletonDesc)
				: new WrSkeleton(skeletonDesc);
			skeletonMap.set(sourceId, skeleton);
		}

		const meshMap = new Map();
		for (const [sourceId, sourceMesh] of Object.entries(sourceMeshes)) {
			const mesh = rewriteMesh(sourceMesh, materialMap, textureMap);
			const storedMesh = stores?.meshes ? stores.meshes.add(mesh) : mesh;
			meshMap.set(sourceId, storedMesh);
			if (src.uploadGpu === true && backend && stores?.meshes) {
				const morphCount = Math.max(1, mesh.getMorphTargetCount ? mesh.getMorphTargetCount() : 1);
				for (let i = 0; i < morphCount; i += 1) {
					stores.meshes.createGpu(backend, storedMesh, { morphTargetIndex: i });
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
		const attachParent = attachParentRef ? world.getNode(attachParentRef) : null;
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
				live.skeleton = sourceSkelId ? (skeletonMap.get(sourceSkelId) ?? null) : null;
				live.bones = Array.isArray(skeletonSource.bones) ? skeletonSource.bones.map((m) => new Float32Array(m)) : [];
			}

			const meshSource = comps.MeshRenderer ?? comps.meshRenderer ?? null;
			if (meshSource) {
				const mr = node.addComp(MeshRenderer);
				const sourceMeshId = asId(meshSource.meshID ?? meshSource.meshId ?? meshSource.mesh);
				mr.mesh = sourceMeshId ? (meshMap.get(sourceMeshId) ?? null) : null;
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
			const passAsset = stores?.renderPasses?.add(src.passCfg) ?? WrRenderPass.from(src.passCfg);
			pass.usePass(passAsset);
		}
		if (src.shaders !== undefined) {
			const shader = root.addComp(ShaderOBJComp);
			shader.setShaders(src.shaders);
		}

		return root;
	}
}

if (typeof window !== "undefined") {
	window.WrLoader21 = WrLoader;
}

export default WrLoader;

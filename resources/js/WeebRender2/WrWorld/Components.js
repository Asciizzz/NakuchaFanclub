import * as Azm from "../../AzLib/Azm.js";

function asId(value) {
	if (value == null) return null;
	const id = String(value).trim();
	return id || null;
}

function readMat4(value) {
	if (value instanceof Float32Array && value.length >= 16) return Azm.Mat4.copy(value);
	if (ArrayBuffer.isView(value) && value.length >= 16) return new Float32Array(value.subarray(0, 16));
	if (Array.isArray(value) && value.length >= 16) return new Float32Array(value.slice(0, 16));
	return Azm.Mat4.makeIdentity();
}

function asBool(value, fallback = false) {
	if (value == null) return fallback;
	return !!value;
}

function resolveAncestorComp(node, Type) {
	let cur = node ?? null;
	while (cur) {
		const comp = typeof cur.getComp === "function" ? cur.getComp(Type) : null;
		if (comp) return comp;
		cur = cur.parent;
	}
	return null;
}

export class Component {
	node = null;

	constructor(node = null) {
		this.node = node ?? null;
	}

	get world() {
		return this.node?.ctx ?? null;
	}
}

export class Transform extends Component {
	local = Azm.Mat4.makeIdentity();
	world = Azm.Mat4.makeIdentity();
}

export class MeshRenderer extends Component {
	meshId = null;
	morphWeights = null;
	textures = {
		albedo: null,
	};
	cfg = {
		shaderId: null,
		hasRig: false,
		display: true,
	};

	setCfg(next = {}) {
		const src = next && typeof next === "object" ? next : {};
		if (src.shaderId !== undefined) this.cfg.shaderId = asId(src.shaderId);
		if (src.hasRig !== undefined) this.cfg.hasRig = asBool(src.hasRig, this.cfg.hasRig);
		if (src.display !== undefined) this.cfg.display = asBool(src.display, this.cfg.display);
		return this.cfg;
	}

	get shaderId() {
		return this.cfg.shaderId;
	}

	set shaderId(value) {
		this.cfg.shaderId = asId(value);
	}

	setTexture(slot, textureRef) {
		const key = asId(slot) ?? "albedo";
		const texId = this.#resolveTextureId(textureRef);
		if (!texId) {
			this.textures[key] = null;
			return null;
		}
		this.textures[key] = texId;
		return texId;
	}

	getTextureId(slot = "albedo") {
		const key = asId(slot) ?? "albedo";
		return this.textures[key] ?? null;
	}

	getTexture(slot = "albedo") {
		const id = this.getTextureId(slot);
		if (!id) return null;
		return this.world?.store?.textures?.get(id) ?? null;
	}

	resolveLiveSkeleton() {
		if (!this.cfg.hasRig) return null;
		return resolveAncestorComp(this.node, LiveSkeleton);
	}

	resolveMorphIndex(indexOrName) {
		const mesh = this.meshId ? this.world?.store?.meshes?.get(this.meshId) : null;
		if (!mesh || typeof mesh.resolveMorphIndex !== "function") return -1;
		return mesh.resolveMorphIndex(indexOrName);
	}

	setMorphWeight(indexOrName, weight = 0) {
		const mesh = this.meshId ? this.world?.store?.meshes?.get(this.meshId) : null;
		if (!mesh) return this;
		const count = typeof mesh.getMorphTargetCount === "function"
			? mesh.getMorphTargetCount()
			: Math.max(0, Number(mesh.morphTargetCount ?? 0) | 0);
		if (count <= 0) return this;

		if (!(this.morphWeights instanceof Float32Array) || this.morphWeights.length !== count) {
			const next = new Float32Array(count);
			const defaults = typeof mesh.getDefaultMorphWeights === "function" ? mesh.getDefaultMorphWeights() : null;
			if (defaults) next.set(defaults.subarray ? defaults.subarray(0, count) : defaults.slice(0, count));
			this.morphWeights = next;
		}

		const index = this.resolveMorphIndex(indexOrName);
		if (index < 0 || index >= this.morphWeights.length) return this;
		this.morphWeights[index] = Number(weight) || 0;
		return this;
	}

	getMorphWeight(indexOrName) {
		if (!(this.morphWeights instanceof Float32Array)) return 0;
		const index = this.resolveMorphIndex(indexOrName);
		if (index < 0 || index >= this.morphWeights.length) return 0;
		return Number(this.morphWeights[index]) || 0;
	}

	setMorphExclusive(indexOrName, weight = 1) {
		if (this.morphWeights instanceof Float32Array) this.morphWeights.fill(0);
		return this.setMorphWeight(indexOrName, weight);
	}

	getPrimaryMorph() {
		if (!(this.morphWeights instanceof Float32Array) || this.morphWeights.length <= 0) {
			return { index: 0, weight: 0 };
		}
		let bestIndex = 0;
		let bestAbs = Math.abs(this.morphWeights[0] ?? 0);
		for (let i = 1; i < this.morphWeights.length; i += 1) {
			const abs = Math.abs(this.morphWeights[i] ?? 0);
			if (abs > bestAbs) {
				bestAbs = abs;
				bestIndex = i;
			}
		}
		return {
			index: bestIndex,
			weight: Number(this.morphWeights[bestIndex]) || 0,
		};
	}

	#resolveTextureId(textureRef) {
		if (textureRef == null) return null;
		const direct = asId(textureRef);
		if (direct) return direct;
		if (typeof textureRef !== "object") return null;
		const store = this.world?.store?.textures ?? null;
		if (!store) return null;
		const existing = asId(textureRef.id);
		if (existing && store.has(existing)) return existing;
		return store.add(textureRef);
	}
}

export class LiveSkeleton extends Component {
	skeletonId = null;
	bones = [];

	setSkeleton(skeletonRef) {
		const id = this.#resolveSkeletonId(skeletonRef);
		this.skeletonId = id;
		return id;
	}

	getSkeleton() {
		if (!this.skeletonId) return null;
		return this.world?.store?.skeletons?.get(this.skeletonId) ?? null;
	}

	resolveBoneIndex(indexOrName) {
		const skeleton = this.getSkeleton();
		if (!skeleton || typeof skeleton.resolveBoneIndex !== "function") return -1;
		return skeleton.resolveBoneIndex(indexOrName);
	}

	setBonePose(indexOrName, matrix) {
		const index = this.resolveBoneIndex(indexOrName);
		if (index < 0) return null;
		while (this.bones.length <= index) this.bones.push(Azm.Mat4.makeIdentity());
		this.bones[index] = readMat4(matrix);
		return this.bones[index];
	}

	getBonePose(indexOrName) {
		const index = this.resolveBoneIndex(indexOrName);
		if (index < 0) return null;
		return this.bones[index] ?? null;
	}

	set(indexOrName, matrix) {
		this.setBonePose(indexOrName, matrix);
		return this;
	}

	get(indexOrName) {
		return this.getBonePose(indexOrName);
	}

	buildPalette(maxBones = 128) {
		const skeleton = this.getSkeleton();
		if (!skeleton || typeof skeleton.buildPalette !== "function") return null;
		return skeleton.buildPalette(this.bones, maxBones);
	}

	#resolveSkeletonId(skeletonRef) {
		if (skeletonRef == null) return null;
		const direct = asId(skeletonRef);
		if (direct) return direct;
		if (typeof skeletonRef !== "object") return null;
		const store = this.world?.store?.skeletons ?? null;
		if (!store) return null;
		const existing = asId(skeletonRef.id);
		if (existing && store.has(existing)) return existing;
		return store.add(skeletonRef);
	}
}

if (typeof window !== "undefined") {
	window.WrComponent = Component;
	window.WrTransform = Transform;
	window.WrMeshRenderer = MeshRenderer;
	window.WrLiveSkeleton = LiveSkeleton;
}

export default {
	Component,
	Transform,
	MeshRenderer,
	LiveSkeleton,
};

import * as Azm from "../../AzLib/Azm.js";

const WR_FLOATS_PER_VERTEX = 19;
const WR_VERTEX_LAYOUT_V1 = Object.freeze({
	stride: 76,
	attributes: Object.freeze([
		Object.freeze({ semantic: "position", location: 0, format: "float32x3", offset: 0 }),
		Object.freeze({ semantic: "normal", location: 1, format: "float32x3", offset: 12 }),
		Object.freeze({ semantic: "uv", location: 2, format: "float32x2", offset: 24 }),
		Object.freeze({ semantic: "boneID", location: 3, format: "float32x4", offset: 32 }),
		Object.freeze({ semantic: "boneWeight", location: 4, format: "float32x4", offset: 48 }),
		Object.freeze({ semantic: "morphPos", location: 5, format: "float32x3", offset: 64 }),
	]),
});

function cloneData(value) {
	if (value == null) return value;
	if (ArrayBuffer.isView(value)) return new value.constructor(value);
	if (Array.isArray(value)) return value.map((item) => cloneData(item));
	if (typeof value === "object") {
		const proto = Object.getPrototypeOf(value);
		const isPlain = proto === Object.prototype || proto === null;
		if (!isPlain) return value;
		const out = {};
		for (const [key, next] of Object.entries(value)) out[key] = cloneData(next);
		return out;
	}
	return value;
}

function readIndex(value) {
	if (typeof value === "number" && Number.isFinite(value)) return value | 0;
	if (typeof value === "string" && /^\s*-?\d+\s*$/.test(value)) return Number(value) | 0;
	return -1;
}

function buildNameIndexMap(names) {
	const map = new Map();
	for (let i = 0; i < names.length; i += 1) {
		const name = String(names[i] ?? "");
		if (!name) continue;
		if (!map.has(name)) map.set(name, i);
		const lower = name.toLowerCase();
		if (!map.has(lower)) map.set(lower, i);
	}
	return map;
}

function resolveMorphTargetCount(mesh) {
	if (!mesh || typeof mesh !== "object") return 0;
	let count = Math.max(0, Number(mesh.morphTargetCount ?? 0) | 0);
	if (Array.isArray(mesh.morphTargetNames)) count = Math.max(count, mesh.morphTargetNames.length);
	if (ArrayBuffer.isView(mesh.defaultMorphWeights) || Array.isArray(mesh.defaultMorphWeights)) {
		count = Math.max(count, mesh.defaultMorphWeights.length);
	}
	for (const submesh of Array.isArray(mesh.submeshes) ? mesh.submeshes : []) {
		count = Math.max(count, Math.max(0, Number(submesh?.morph?.targetCount ?? 0) | 0));
	}
	return count;
}

function toF32(value) {
	if (value == null) return null;
	if (value instanceof Float32Array) return value;
	if (ArrayBuffer.isView(value) || Array.isArray(value)) return Float32Array.from(value);
	return null;
}

function toIndexArray(value) {
	if (value == null) return null;
	if (value instanceof Uint16Array || value instanceof Uint32Array) return value;
	if (value instanceof Uint8Array) return Uint16Array.from(value);
	if (ArrayBuffer.isView(value) || Array.isArray(value)) {
		const list = Array.from(value, (item) => Number(item) | 0);
		let max = 0;
		for (const n of list) if (n > max) max = n;
		return max > 65535 ? Uint32Array.from(list) : Uint16Array.from(list);
	}
	return null;
}

function computeAABBFromPositions(positions) {
	const src = toF32(positions);
	if (!src || src.length < 3) return null;
	const min = new Float32Array([src[0], src[1], src[2]]);
	const max = new Float32Array([src[0], src[1], src[2]]);
	for (let i = 3; i + 2 < src.length; i += 3) {
		const x = src[i + 0];
		const y = src[i + 1];
		const z = src[i + 2];
		if (x < min[0]) min[0] = x;
		if (y < min[1]) min[1] = y;
		if (z < min[2]) min[2] = z;
		if (x > max[0]) max[0] = x;
		if (y > max[1]) max[1] = y;
		if (z > max[2]) max[2] = z;
	}
	return { min, max };
}

function cloneAABB(aabb) {
	if (!aabb || !aabb.min || !aabb.max) return null;
	return {
		min: new Float32Array(aabb.min),
		max: new Float32Array(aabb.max),
	};
}

function mergeAABB(base, other) {
	if (!other) return base;
	if (!base) return cloneAABB(other);
	base.min[0] = Math.min(base.min[0], other.min[0]);
	base.min[1] = Math.min(base.min[1], other.min[1]);
	base.min[2] = Math.min(base.min[2], other.min[2]);
	base.max[0] = Math.max(base.max[0], other.max[0]);
	base.max[1] = Math.max(base.max[1], other.max[1]);
	base.max[2] = Math.max(base.max[2], other.max[2]);
	return base;
}

function readMat4(value) {
	if (ArrayBuffer.isView(value) || Array.isArray(value)) {
		if (value.length >= 16) {
			return Float32Array.from(value.slice ? value.slice(0, 16) : value.subarray(0, 16));
		}
	}
	return Azm.Mat4.makeIdentity();
}

export class WrMesh {
	constructor(raw = {}) {
		const source = cloneData(raw ?? {});
		Object.assign(this, source);
		this.id = source.id ?? null;
		this.name = source.name ?? "mesh";
		this.submeshes = Array.isArray(source?.submeshes) ? source.submeshes : [];
		this.morphTargetCount = Math.max(0, Number(source?.morphTargetCount ?? 0) | 0);
		this.morphTargetNames = Array.isArray(source?.morphTargetNames)
			? source.morphTargetNames.slice()
			: [];
		this.morphTargetMap = new Map();
		this.submeshAABB = [];
		this.aabb = null;
		this.#packCache = new Map();
		this.rebuildMorphCache();
		this.rebuildAABBCache();
	}

	static from(raw = {}) {
		if (raw instanceof WrMesh) return new WrMesh(raw.toJSON());
		return new WrMesh(raw);
	}

	static resolveNodeModelMatrix(node) {
		if (!node || typeof node !== "object") return Azm.Mat4.makeIdentity();
		if (node.components instanceof Map) {
			for (const comp of node.components.values()) {
				if (comp?.world && (ArrayBuffer.isView(comp.world) || Array.isArray(comp.world))) return readMat4(comp.world);
				if (comp?.local && (ArrayBuffer.isView(comp.local) || Array.isArray(comp.local))) return readMat4(comp.local);
			}
		}
		if (node.Transform?.world) return readMat4(node.Transform.world);
		if (node.Transform?.local) return readMat4(node.Transform.local);
		return Azm.Mat4.makeIdentity();
	}

	static packSubmesh(submesh, options = {}) {
		const staticPart = submesh?.static ?? {};
		const rigPart = submesh?.rigged ?? submesh?.rig ?? {};
		const morphPart = submesh?.morph ?? {};

		const positions = toF32(staticPart.positions ?? staticPart.position ?? staticPart.pos);
		if (!positions || positions.length < 3 || (positions.length % 3) !== 0) {
			throw new Error("[WrMesh] submesh.static.positions is required");
		}
		const vertexCount = positions.length / 3;

		const normals = toF32(staticPart.normals);
		const uvs = toF32(staticPart.uvs ?? staticPart.uv);
		const boneIDs = toF32(rigPart.boneIDs ?? rigPart.ids ?? rigPart.bones);
		const boneWeights = toF32(rigPart.boneWeights ?? rigPart.weights);

		let morphPos = null;
		if (Number(morphPart.targetCount ?? 0) > 0) {
			const morphTargetIndex = Math.max(0, Number(options.morphTargetIndex ?? 0) | 0);
			const all = toF32(morphPart.dPositions ?? morphPart.dPos);
			const targetStride = vertexCount * 3;
			const targetOffset = morphTargetIndex * targetStride;
			if (all && all.length >= (targetOffset + targetStride)) {
				morphPos = all.subarray(targetOffset, targetOffset + targetStride);
			} else if (all && all.length >= targetStride) {
				morphPos = all.subarray(0, targetStride);
			}
		}

		const out = new Float32Array(vertexCount * WR_FLOATS_PER_VERTEX);
		for (let i = 0; i < vertexCount; i += 1) {
			const base = i * WR_FLOATS_PER_VERTEX;
			out[base + 0] = positions[i * 3 + 0];
			out[base + 1] = positions[i * 3 + 1];
			out[base + 2] = positions[i * 3 + 2];
			out[base + 3] = normals ? (normals[i * 3 + 0] ?? 0) : 0;
			out[base + 4] = normals ? (normals[i * 3 + 1] ?? 1) : 1;
			out[base + 5] = normals ? (normals[i * 3 + 2] ?? 0) : 0;
			out[base + 6] = uvs ? (uvs[i * 2 + 0] ?? 0) : 0;
			out[base + 7] = uvs ? (uvs[i * 2 + 1] ?? 0) : 0;
			out[base + 8] = boneIDs ? (boneIDs[i * 4 + 0] ?? 0) : 0;
			out[base + 9] = boneIDs ? (boneIDs[i * 4 + 1] ?? 0) : 0;
			out[base + 10] = boneIDs ? (boneIDs[i * 4 + 2] ?? 0) : 0;
			out[base + 11] = boneIDs ? (boneIDs[i * 4 + 3] ?? 0) : 0;
			out[base + 12] = boneWeights ? (boneWeights[i * 4 + 0] ?? 0) : 0;
			out[base + 13] = boneWeights ? (boneWeights[i * 4 + 1] ?? 0) : 0;
			out[base + 14] = boneWeights ? (boneWeights[i * 4 + 2] ?? 0) : 0;
			out[base + 15] = boneWeights ? (boneWeights[i * 4 + 3] ?? 0) : 0;
			out[base + 16] = morphPos ? (morphPos[i * 3 + 0] ?? 0) : 0;
			out[base + 17] = morphPos ? (morphPos[i * 3 + 1] ?? 0) : 0;
			out[base + 18] = morphPos ? (morphPos[i * 3 + 2] ?? 0) : 0;
		}

		let indices = toIndexArray(submesh?.indices);
		if (!indices) {
			const seq = new Array(vertexCount);
			for (let i = 0; i < vertexCount; i += 1) seq[i] = i;
			indices = vertexCount > 65535 ? Uint32Array.from(seq) : Uint16Array.from(seq);
		}

		return {
			vertexData: out,
			indexData: indices,
			indexFormat: indices instanceof Uint32Array ? "uint32" : "uint16",
			indexCount: indices.length,
			vertexCount,
			layout: WR_VERTEX_LAYOUT_V1,
		};
	}

	static pack(mesh, options = {}) {
		if (!mesh || typeof mesh !== "object") return [];
		if (typeof mesh.packSubmeshes === "function") {
			return mesh.packSubmeshes(options);
		}
		const source = Array.isArray(mesh.submeshes) ? mesh.submeshes : [];
		return source.map((submesh) => WrMesh.packSubmesh(submesh, options));
	}

	toJSON() {
		const out = {};
		for (const key of Object.keys(this)) {
			if (key === "morphTargetMap") continue;
			if (key === "submeshAABB") continue;
			if (key === "aabb") continue;
			out[key] = cloneData(this[key]);
		}
		return out;
	}

	rebuildMorphCache() {
		const count = resolveMorphTargetCount(this);
		const sourceNames = Array.isArray(this.morphTargetNames) ? this.morphTargetNames : [];
		const names = new Array(count);
		for (let i = 0; i < count; i += 1) {
			const raw = String(sourceNames[i] ?? "").trim();
			names[i] = raw || `Target_${i}`;
		}
		this.morphTargetCount = count;
		this.morphTargetNames = names;
		this.morphTargetMap = buildNameIndexMap(names);
		this.#packCache.clear();
		return this;
	}

	getMorphTargetCount() {
		return Math.max(0, Number(this.morphTargetCount ?? 0) | 0);
	}

	resolveMorphIndex(indexOrName) {
		const idx = readIndex(indexOrName);
		if (idx >= 0) return idx < this.getMorphTargetCount() ? idx : -1;
		if (typeof indexOrName !== "string") return -1;
		const name = indexOrName.trim();
		if (!name) return -1;
		const exact = this.morphTargetMap.get(name);
		if (exact != null) return Number(exact) | 0;
		const lower = this.morphTargetMap.get(name.toLowerCase());
		return lower == null ? -1 : (Number(lower) | 0);
	}

	getDefaultMorphWeights() {
		if (this.defaultMorphWeights instanceof Float32Array) return this.defaultMorphWeights;
		if (ArrayBuffer.isView(this.defaultMorphWeights) || Array.isArray(this.defaultMorphWeights)) {
			return Float32Array.from(this.defaultMorphWeights);
		}
		return null;
	}

	rebuildAABBCache() {
		const source = Array.isArray(this.submeshes) ? this.submeshes : [];
		this.submeshAABB = source.map((submesh) => {
			const staticPart = submesh?.static ?? {};
			return computeAABBFromPositions(staticPart.positions ?? staticPart.position ?? staticPart.pos);
		});
		let merged = null;
		for (const submeshBounds of this.submeshAABB) merged = mergeAABB(merged, submeshBounds);
		this.aabb = merged;
		return this;
	}

	getAABB() {
		return cloneAABB(this.aabb);
	}

	getSubmeshAABB(index) {
		const i = Math.max(0, Number(index) | 0);
		return cloneAABB(this.submeshAABB[i] ?? null);
	}

	packSubmeshes(options = {}) {
		const morphTargetIndex = Math.max(0, Number(options?.morphTargetIndex ?? 0) | 0);
		const key = `morph:${morphTargetIndex}`;
		const cached = this.#packCache.get(key);
		if (cached) return cached;
		const source = Array.isArray(this.submeshes) ? this.submeshes : [];
		const packed = source.map((submesh) => WrMesh.packSubmesh(submesh, { morphTargetIndex }));
		this.#packCache.set(key, packed);
		return packed;
	}

	invalidatePackedSubmeshes() {
		this.#packCache.clear();
		return this;
	}

	#packCache;
}

if (typeof window !== "undefined") {
	window.WrMesh = WrMesh;
}

export default WrMesh;

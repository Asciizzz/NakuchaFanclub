import * as mAth from "../../Alib/mAth.js";
import { wrHashText, wrHashValue } from "./hash.js";

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

function readIndex(value) {
	if (typeof value === "number" && Number.isFinite(value)) return value | 0;
	if (typeof value === "string" && /^\s*-?\d+\s*$/.test(value)) return Number(value) | 0;
	return -1;
}

function readMat4(value) {
	if (ArrayBuffer.isView(value) || Array.isArray(value)) {
		if (value.length >= 16) {
			const copy = value.slice ? value.slice(0, 16) : value.subarray(0, 16);
			return Float32Array.from(copy);
		}
	}
	return mAth.Mat4.makeIdentity();
}

function buildNameMap(bones) {
	const map = new Map();
	for (let i = 0; i < bones.length; i += 1) {
		const name = String(bones[i]?.name ?? "").trim();
		if (!name) continue;
		if (!map.has(name)) map.set(name, i);
		const lower = name.toLowerCase();
		if (!map.has(lower)) map.set(lower, i);
	}
	return map;
}

export class WrSkeleton {
	name = "skeleton";
	hash = "";
	bones = [];
	map = new Map();

	constructor(raw = {}) {
		const src = cloneData(raw ?? {});
		this.name = src.name ?? "skeleton";
		this.bones = Array.isArray(src.bones) ? src.bones : [];
		this.rebuildMap();
		this.updateHash();
	}

	static from(raw = {}) {
		if (raw instanceof WrSkeleton) return new WrSkeleton(raw.toJSON());
		return new WrSkeleton(raw);
	}

	toJSON() {
		const out = {};
		for (const key of Object.keys(this)) {
			if (key === "map") continue;
			if (key === "ref") continue;
			out[key] = cloneData(this[key]);
		}
		return out;
	}

	updateHash() {
		this.hash = `skel_${wrHashText([
			this.name,
			this.bones.length,
			wrHashValue(this.bones),
		].join("|"))}`;
		return this.hash;
	}

	rebuildMap() {
		this.map = buildNameMap(this.bones);
		this.updateHash();
		return this;
	}

	getBoneCount() {
		return this.bones.length;
	}

	resolveBoneIndex(indexOrName) {
		const idx = readIndex(indexOrName);
		if (idx >= 0) return idx;
		const key = String(indexOrName ?? "").trim();
		if (!key) return -1;
		const exact = this.map.get(key);
		if (exact != null) return Number(exact) | 0;
		const lower = this.map.get(key.toLowerCase());
		return lower == null ? -1 : (Number(lower) | 0);
	}

	ensurePoseCapacity(poseList, count = this.getBoneCount()) {
		const out = Array.isArray(poseList) ? poseList : [];
		while (out.length < count) out.push(mAth.Mat4.makeIdentity());
		for (let i = 0; i < out.length; i += 1) {
			const pose = out[i];
			if (pose instanceof Float32Array && pose.length >= 16) continue;
			out[i] = readMat4(pose);
		}
		return out;
	}

	buildPalette(localPoses = [], maxBones = 128) {
		if (this.bones.length <= 0) return null;

		const cap = Math.max(1, Number(maxBones) | 0);
		const out = new Float32Array(cap * 16);
		for (let i = 0; i < cap; i += 1) out.set(mAth.Mat4.IDENTITY, i * 16);

		const poses = this.ensurePoseCapacity(localPoses, this.bones.length);
		const global = new Array(this.bones.length);
		const count = Math.min(this.bones.length, cap);

		for (let i = 0; i < count; i += 1) {
			const bone = this.bones[i] ?? {};
			const localBind = readMat4(bone.localBind);
			const pose = readMat4(poses[i]);
			const local = mAth.Mat4.mul(localBind, pose);

			const parent = Number(bone.parent ?? -1) | 0;
			if (parent < 0 || !global[parent]) global[i] = local;
			else global[i] = mAth.Mat4.mul(global[parent], local);

			const inverseBind = readMat4(bone.inverseBind);
			const skinned = mAth.Mat4.mul(global[i], inverseBind);
			out.set(skinned, i * 16);
		}

		return out;
	}
}

if (typeof window !== "undefined") {
	window.WrSkeleton21 = WrSkeleton;
}

export default WrSkeleton;

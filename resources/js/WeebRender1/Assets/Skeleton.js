import * as Azm from "../../AzLib/Azm.js";

function cloneData(value) {
    if (value == null) return value;
    if (ArrayBuffer.isView(value)) return new value.constructor(value);
    if (Array.isArray(value)) return value.map((it) => cloneData(it));
    if (typeof value === "object") {
        const proto = Object.getPrototypeOf(value);
        const isPlainObject = proto === Object.prototype || proto === null;
        if (!isPlainObject) return value;
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
    for (let i = 0; i < names.length; i++) {
        const name = String(names[i] ?? "");
        if (!name) continue;
        if (!map.has(name)) map.set(name, i);
        const lower = name.toLowerCase();
        if (!map.has(lower)) map.set(lower, i);
    }
    return map;
}

function readMat4(value) {
    if (ArrayBuffer.isView(value) || Array.isArray(value)) {
        if (value.length >= 16) {
            const copy = value.slice ? value.slice(0, 16) : value.subarray(0, 16);
            return Float32Array.from(copy);
        }
    }
    return Azm.Mat4.IDENTITY;
}

export class WrSkeleton {
    constructor(raw = {}) {
        const source = cloneData(raw ?? {});
        Object.assign(this, source);
        this.bones = Array.isArray(source?.bones) ? source.bones : [];
        this.map = new Map();
        this.rebuildBoneCache();
    }

    static from(raw = {}) {
        if (raw instanceof WrSkeleton) return new WrSkeleton(raw.toJSON());
        return new WrSkeleton(raw);
    }

    toJSON() {
        const out = {};
        for (const key of Object.keys(this)) {
            if (key === "map") continue;
            out[key] = cloneData(this[key]);
        }
        return out;
    }

    rebuildBoneCache() {
        const bones = Array.isArray(this.bones) ? this.bones : [];
        const names = new Array(bones.length);
        for (let i = 0; i < bones.length; i++) {
            const bone = bones[i];
            const raw = String(bone?.name ?? "").trim();
            const name = raw || `Bone_${i}`;
            names[i] = name;
            if (bone && typeof bone === "object" && !raw) bone.name = name;
        }
        this.map = buildNameIndexMap(names);
        return this;
    }

    getBoneCount() {
        return Array.isArray(this.bones) ? this.bones.length : 0;
    }

    resolveBoneIndex(indexOrName) {
        const idx = readIndex(indexOrName);
        if (idx >= 0) return idx;
        if (typeof indexOrName !== "string") return -1;
        const name = indexOrName.trim();
        if (!name) return -1;
        const exact = this.map.get(name);
        if (exact != null) return Number(exact) | 0;
        const lower = this.map.get(name.toLowerCase());
        return lower == null ? -1 : (Number(lower) | 0);
    }

    ensurePoseCapacity(poseList, count = this.getBoneCount()) {
        const out = Array.isArray(poseList) ? poseList : [];
        while (out.length < count) out.push(Azm.Mat4.makeIdentity());
        for (let i = 0; i < out.length; i++) {
            const pose = out[i];
            if (pose instanceof Float32Array && pose.length >= 16) continue;
            out[i] = readMat4(pose);
        }
        return out;
    }

    buildPalette(localPoses = [], maxBones = 128) {
        const sourceBones = Array.isArray(this.bones) ? this.bones : [];
        if (sourceBones.length <= 0) return null;

        const cap = Math.max(1, Number(maxBones) | 0);
        const out = new Float32Array(cap * 16);
        for (let i = 0; i < cap; i++) out.set(Azm.Mat4.IDENTITY, i * 16);

        const poses = this.ensurePoseCapacity(localPoses, sourceBones.length);
        const global = new Array(sourceBones.length);
        const count = Math.min(sourceBones.length, cap);
        for (let i = 0; i < count; i++) {
            const bone = sourceBones[i] ?? {};
            const localBind = readMat4(bone.localBind);
            const pose = readMat4(poses[i]);
            const local = Azm.Mat4.mul(localBind, pose);

            const parent = Number(bone.parent ?? -1) | 0;
            if (parent < 0 || !global[parent]) global[i] = local;
            else global[i] = Azm.Mat4.mul(global[parent], local);

            const inverseBind = readMat4(bone.inverseBind);
            const skinned = Azm.Mat4.mul(global[i], inverseBind);
            out.set(skinned, i * 16);
        }

        return out;
    }
}

export default WrSkeleton;

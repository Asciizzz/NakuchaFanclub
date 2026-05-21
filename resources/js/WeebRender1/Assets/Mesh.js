import * as Azm from "../../AzLib/Azm.js";
import { WR_VERTEX_LAYOUT_V1 } from "../Core/ShaderAbi.js";

const FLOATS_PER_VERTEX = 19;

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
        const asArray = Array.from(value, (v) => Number(v) | 0);
        let max = 0;
        for (const next of asArray) if (next > max) max = next;
        return max > 65535 ? Uint32Array.from(asArray) : Uint16Array.from(asArray);
    }
    return null;
}

function readMat4(value) {
    if (ArrayBuffer.isView(value) || Array.isArray(value)) {
        if (value.length >= 16) {
            return Float32Array.from(value.slice ? value.slice(0, 16) : value.subarray(0, 16));
        }
    }
    return Azm.Mat4.IDENTITY;
}

export class WrMesh {
    constructor(raw = {}) {
        const source = cloneData(raw ?? {});
        Object.assign(this, source);
        this.submeshes = Array.isArray(source?.submeshes) ? source.submeshes : [];
        this.morphTargetCount = Math.max(0, Number(source?.morphTargetCount ?? 0) | 0);
        this.morphTargetNames = Array.isArray(source?.morphTargetNames)
            ? source.morphTargetNames.slice()
            : [];
        this.morphTargetMap = new Map();
        this.#packCache = new Map();
        this.rebuildMorphCache();
    }

    static from(raw = {}) {
        if (raw instanceof WrMesh) return new WrMesh(raw.toJSON());
        return new WrMesh(raw);
    }

    static resolveNodeModelMatrix(node) {
        if (!node || typeof node !== "object") return Azm.Mat4.IDENTITY;
        const comps = node.components ?? node.$ ?? {};
        const tx = comps.Transform ?? comps.transform ?? {};
        const direct = tx.world ?? tx.local ?? null;
        if (direct) return readMat4(direct);
        return readMat4(node.__wrWorldFallback ?? null);
    }

    static packSubmesh(submesh, options = {}) {
        const staticPart = submesh?.static ?? {};
        const rigPart = submesh?.rigged ?? submesh?.rig ?? {};
        const morphPart = submesh?.morph ?? {};

        const positions = toF32(staticPart.positions ?? staticPart.position ?? staticPart.pos);
        if (!positions || positions.length < 3 || (positions.length % 3) !== 0) {
            throw new Error("[WrMesh] submesh.static.positions is required and must be vec3 packed");
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

        const out = new Float32Array(vertexCount * FLOATS_PER_VERTEX);
        for (let i = 0; i < vertexCount; i++) {
            const outBase = i * FLOATS_PER_VERTEX;
            out[outBase + 0] = positions[i * 3 + 0];
            out[outBase + 1] = positions[i * 3 + 1];
            out[outBase + 2] = positions[i * 3 + 2];
            out[outBase + 3] = normals ? (normals[i * 3 + 0] ?? 0) : 0;
            out[outBase + 4] = normals ? (normals[i * 3 + 1] ?? 1) : 1;
            out[outBase + 5] = normals ? (normals[i * 3 + 2] ?? 0) : 0;
            out[outBase + 6] = uvs ? (uvs[i * 2 + 0] ?? 0) : 0;
            out[outBase + 7] = uvs ? (uvs[i * 2 + 1] ?? 0) : 0;
            out[outBase + 8] = boneIDs ? (boneIDs[i * 4 + 0] ?? 0) : 0;
            out[outBase + 9] = boneIDs ? (boneIDs[i * 4 + 1] ?? 0) : 0;
            out[outBase + 10] = boneIDs ? (boneIDs[i * 4 + 2] ?? 0) : 0;
            out[outBase + 11] = boneIDs ? (boneIDs[i * 4 + 3] ?? 0) : 0;
            out[outBase + 12] = boneWeights ? (boneWeights[i * 4 + 0] ?? 0) : 0;
            out[outBase + 13] = boneWeights ? (boneWeights[i * 4 + 1] ?? 0) : 0;
            out[outBase + 14] = boneWeights ? (boneWeights[i * 4 + 2] ?? 0) : 0;
            out[outBase + 15] = boneWeights ? (boneWeights[i * 4 + 3] ?? 0) : 0;
            out[outBase + 16] = morphPos ? (morphPos[i * 3 + 0] ?? 0) : 0;
            out[outBase + 17] = morphPos ? (morphPos[i * 3 + 1] ?? 0) : 0;
            out[outBase + 18] = morphPos ? (morphPos[i * 3 + 2] ?? 0) : 0;
        }

        let indices = toIndexArray(submesh?.indices);
        if (!indices) {
            const seq = new Array(vertexCount);
            for (let i = 0; i < vertexCount; i++) seq[i] = i;
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
        const submeshes = Array.isArray(mesh.submeshes) ? mesh.submeshes : [];
        return submeshes.map((submesh) => WrMesh.packSubmesh(submesh, options));
    }

    toJSON() {
        const out = {};
        for (const key of Object.keys(this)) {
            if (key === "morphTargetMap") continue;
            out[key] = cloneData(this[key]);
        }
        return out;
    }

    rebuildMorphCache() {
        const count = resolveMorphTargetCount(this);
        const sourceNames = Array.isArray(this.morphTargetNames) ? this.morphTargetNames : [];
        const names = new Array(count);
        for (let i = 0; i < count; i++) {
            const raw = sourceNames[i];
            const next = String(raw ?? "").trim();
            names[i] = next || `Target_${i}`;
        }
        this.morphTargetCount = count;
        this.morphTargetNames = names;
        this.morphTargetMap = buildNameIndexMap(names);
        return this;
    }

    getMorphTargetCount() {
        return Math.max(0, Number(this.morphTargetCount ?? 0) | 0);
    }

    resolveMorphIndex(indexOrName) {
        const idx = readIndex(indexOrName);
        if (idx >= 0) {
            return idx < this.getMorphTargetCount() ? idx : -1;
        }
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

export default WrMesh;

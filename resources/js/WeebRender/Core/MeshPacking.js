import * as Azm from "../../AzLib/Azm.js";
import { WR_VERTEX_LAYOUT_V1 } from "./ShaderAbi.js";

const WR_FLOATS_PER_VERTEX = 19; // 76 bytes / 4

/**
 * Convert numeric source to Float32Array when possible.
 * @param {any} value source value
 * @returns {Float32Array|null}
 */
function wrArrayLikeToF32(value) {
    if (value == null) return null;
    if (value instanceof Float32Array) return value;
    if (ArrayBuffer.isView(value) || Array.isArray(value)) return Float32Array.from(value);
    return null;
}

/**
 * Convert index source to Uint16Array or Uint32Array.
 * @param {any} value source value
 * @returns {Uint16Array|Uint32Array|null}
 */
function wrArrayLikeToIndex(value) {
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

/**
 * Convert matrix input to Float32Array[16], fallback identity.
 * @param {ArrayLike<number>|null|undefined} value matrix input
 * @returns {Float32Array}
 */
function wrReadMat4(value) {
    if (ArrayBuffer.isView(value) || Array.isArray(value)) {
        if (value.length >= 16) {
            return Float32Array.from(value.slice ? value.slice(0, 16) : value.subarray(0, 16));
        }
    }
    return Azm.Mat4.makeIdentity();
}

/**
 * Resolve node model matrix from Transform.world or Transform.local.
 * @param {object} node scene node
 * @returns {Float32Array}
 */
export function wrResolveNodeModelMatrix(node) {
    if (!node || typeof node !== "object") return Azm.Mat4.makeIdentity();
    const comps = node.components ?? node.$ ?? {};
    const tx = comps.Transform ?? comps.transform ?? {};
    return wrReadMat4(tx.world ?? tx.local ?? null);
}

/**
 * Pack one submesh into interleaved vertex and index buffers.
 * @param {object} submesh submesh payload
 * @param {object} [options={}] packing options
 * @param {number} [options.morphTargetIndex=0] selected morph target index
 * @returns {object}
 */
export function wrPackSubmesh(submesh, options = {}) {
    const staticPart = submesh?.static ?? {};
    const rigPart = submesh?.rigged ?? submesh?.rig ?? {};
    const morphPart = submesh?.morph ?? {};

    const positions = wrArrayLikeToF32(staticPart.positions ?? staticPart.position ?? staticPart.pos);
    if (!positions || positions.length < 3 || (positions.length % 3) !== 0) {
        throw new Error("[WrMeshPacking] submesh.static.positions is required and must be vec3 packed");
    }
    const vertexCount = positions.length / 3;

    const normals = wrArrayLikeToF32(staticPart.normals);
    const uvs = wrArrayLikeToF32(staticPart.uvs ?? staticPart.uv);
    const boneIDs = wrArrayLikeToF32(rigPart.boneIDs ?? rigPart.ids ?? rigPart.bones);
    const boneWeights = wrArrayLikeToF32(rigPart.boneWeights ?? rigPart.weights);

    let morphPos = null;
    if (Number(morphPart.targetCount ?? 0) > 0) {
        const morphTargetIndex = Math.max(0, Number(options.morphTargetIndex ?? 0) | 0);
        const all = wrArrayLikeToF32(morphPart.dPositions ?? morphPart.dPos);
        const targetStride = vertexCount * 3;
        const targetOffset = morphTargetIndex * targetStride;
        if (all && all.length >= (targetOffset + targetStride)) {
            morphPos = all.subarray(targetOffset, targetOffset + targetStride);
        } else if (all && all.length >= targetStride) {
            morphPos = all.subarray(0, targetStride);
        }
    }

    const out = new Float32Array(vertexCount * WR_FLOATS_PER_VERTEX);
    for (let i = 0; i < vertexCount; i++) {
        const outBase = i * WR_FLOATS_PER_VERTEX;

        // position
        out[outBase + 0] = positions[i * 3 + 0];
        out[outBase + 1] = positions[i * 3 + 1];
        out[outBase + 2] = positions[i * 3 + 2];

        // normal
        out[outBase + 3] = normals ? (normals[i * 3 + 0] ?? 0) : 0;
        out[outBase + 4] = normals ? (normals[i * 3 + 1] ?? 1) : 1;
        out[outBase + 5] = normals ? (normals[i * 3 + 2] ?? 0) : 0;

        // uv
        out[outBase + 6] = uvs ? (uvs[i * 2 + 0] ?? 0) : 0;
        out[outBase + 7] = uvs ? (uvs[i * 2 + 1] ?? 0) : 0;

        // bone id
        out[outBase + 8] = boneIDs ? (boneIDs[i * 4 + 0] ?? 0) : 0;
        out[outBase + 9] = boneIDs ? (boneIDs[i * 4 + 1] ?? 0) : 0;
        out[outBase + 10] = boneIDs ? (boneIDs[i * 4 + 2] ?? 0) : 0;
        out[outBase + 11] = boneIDs ? (boneIDs[i * 4 + 3] ?? 0) : 0;

        // bone weight
        out[outBase + 12] = boneWeights ? (boneWeights[i * 4 + 0] ?? 0) : 0;
        out[outBase + 13] = boneWeights ? (boneWeights[i * 4 + 1] ?? 0) : 0;
        out[outBase + 14] = boneWeights ? (boneWeights[i * 4 + 2] ?? 0) : 0;
        out[outBase + 15] = boneWeights ? (boneWeights[i * 4 + 3] ?? 0) : 0;

        // morph pos
        out[outBase + 16] = morphPos ? (morphPos[i * 3 + 0] ?? 0) : 0;
        out[outBase + 17] = morphPos ? (morphPos[i * 3 + 1] ?? 0) : 0;
        out[outBase + 18] = morphPos ? (morphPos[i * 3 + 2] ?? 0) : 0;
    }

    let indices = wrArrayLikeToIndex(submesh?.indices);
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

/**
 * Pack all submeshes in a mesh payload.
 * @param {object} mesh mesh payload
 * @param {object} [options={}] packing options
 * @param {number} [options.morphTargetIndex=0] selected morph target index
 * @returns {object[]}
 */
export function wrPackMesh(mesh, options = {}) {
    const submeshes = Array.isArray(mesh?.submeshes) ? mesh.submeshes : [];
    return submeshes.map((submesh) => wrPackSubmesh(submesh, options));
}

export default wrPackMesh;

/**
 * EzLoaderBeta.js - GLB/GLTF loader for EzCanvas3D
 * 
 * Returns processed mesh data without registering to EzCanvas3D.
 * User handles the models.add() call themselves.
 * 
 * Dependencies: EzCanvas3D.js (for EzMat4, EzQuat)
 */

(function () {
    "use strict";

    const TYPE_SIZES = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

    async function loadGLB(url) {
        const buf = await fetch(url).then(r => r.arrayBuffer());
        const dv = new DataView(buf);
        if (dv.getUint32(0, true) !== 0x46546C67) throw new Error("Not a GLB file");
        const jsonLen = dv.getUint32(12, true);
        const jsonText = new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen));
        const gltf = JSON.parse(jsonText);
        let binBuf = null;
        const binOffset = 20 + jsonLen;
        if (binOffset + 8 <= buf.byteLength)
            binBuf = buf.slice(binOffset + 8, binOffset + 8 + dv.getUint32(binOffset, true));

        function readAccessor(idx) {
            if (idx == null) return null;
            const acc = gltf.accessors[idx];
            const count = acc.count, compCount = TYPE_SIZES[acc.type];
            const out = new Float32Array(count * compCount);
            if (acc.bufferView != null) {
                const bv = gltf.bufferViews[acc.bufferView];
                const byteOffset = (bv.byteOffset || 0) + (acc.byteOffset || 0);
                const isU8 = acc.componentType === 5121, isU16 = acc.componentType === 5123;
                const elemBytes = isU8 ? 1 : isU16 ? 2 : 4;
                const srcStride = bv.byteStride ? bv.byteStride / elemBytes : compCount;
                const srcLen = (count - 1) * srcStride + compCount;
                const srcView = isU8 ? new Uint8Array(binBuf, byteOffset, srcLen)
                    : isU16 ? new Uint16Array(binBuf, byteOffset, srcLen)
                        : new Float32Array(binBuf, byteOffset, srcLen);
                for (let i = 0; i < count; i++) {
                    const dst = i * compCount, src = i * srcStride;
                    for (let c = 0; c < compCount; c++) out[dst + c] = srcView[src + c];
                }
            }
            if (acc.sparse) {
                const sp = acc.sparse;
                const idxBV = gltf.bufferViews[sp.indices.bufferView];
                const idxOff = (idxBV.byteOffset || 0) + (sp.indices.byteOffset || 0);
                const sIdx = sp.indices.componentType === 5125 ? new Uint32Array(binBuf, idxOff, sp.count)
                    : sp.indices.componentType === 5123 ? new Uint16Array(binBuf, idxOff, sp.count)
                        : new Uint8Array(binBuf, idxOff, sp.count);
                const valBV = gltf.bufferViews[sp.values.bufferView];
                const valOff = (valBV.byteOffset || 0) + (sp.values.byteOffset || 0);
                const sVal = new Float32Array(binBuf, valOff, sp.count * compCount);
                for (let i = 0; i < sp.count; i++) {
                    const ti = sIdx[i], dst = ti * compCount, src = i * compCount;
                    for (let c = 0; c < compCount; c++) out[dst + c] = sVal[src + c];
                }
            }
            return out;
        }

        function readIndices(idx) {
            if (idx == null) return null;
            const acc = gltf.accessors[idx];
            const bv = gltf.bufferViews[acc.bufferView];
            const off = (bv.byteOffset || 0) + (acc.byteOffset || 0);
            if (acc.componentType === 5125) return new Uint32Array(binBuf, off, acc.count);
            if (acc.componentType === 5123) return new Uint16Array(binBuf, off, acc.count);
            return new Uint8Array(binBuf, off, acc.count);
        }

        function nodeLocalMat(node) {
            if (node.matrix) return new Float32Array(node.matrix);
            return EzMat4.compose(node.translation || [0, 0, 0], node.rotation || [0, 0, 0, 1], node.scale || [1, 1, 1]);
        }

        return { gltf, binBuf, readAccessor, readIndices, nodeLocalMat };
    }

    async function load(url) {
        const { gltf, readAccessor, readIndices, nodeLocalMat } = await loadGLB(url);

        // Skin processing
        const skin = gltf.skins?.length ? gltf.skins[0] : null;
        const nodeToJoint = {};
        if (skin) {
            skin.joints.forEach((ni, ji) => nodeToJoint[ni] = ji);
        }

        let skeleton = null, jointRemap = null;
        if (skin) {
            const joints = skin.joints, n = joints.length;
            const jointParentIdx = new Array(n).fill(-1);
            for (let i = 0; i < n; i++) {
                const node = gltf.nodes[joints[i]];
                if (node.children) for (const c of node.children) {
                    const ji = nodeToJoint[c];
                    if (ji != null) jointParentIdx[ji] = i;
                }
            }
            const visited = new Uint8Array(n), topoOrder = [];
            for (let i = 0; i < n; i++) if (jointParentIdx[i] === -1) { topoOrder.push(i); visited[i] = 1; }
            for (let qi = 0; qi < topoOrder.length; qi++) {
                const node = gltf.nodes[joints[topoOrder[qi]]];
                if (node.children) for (const c of node.children) {
                    const ji = nodeToJoint[c];
                    if (ji != null && !visited[ji]) { visited[ji] = 1; topoOrder.push(ji); }
                }
            }
            for (let i = 0; i < n; i++) if (!visited[i]) topoOrder.push(i);

            jointRemap = new Int32Array(n);
            for (let ni = 0; ni < n; ni++) jointRemap[topoOrder[ni]] = ni;

            const ibmData = skin.inverseBindMatrices != null ? readAccessor(skin.inverseBindMatrices) : null;
            const bones = [];
            for (let ni = 0; ni < n; ni++) {
                const oldIdx = topoOrder[ni], node = gltf.nodes[joints[oldIdx]], oldParent = jointParentIdx[oldIdx];
                const bone = { parent: oldParent === -1 ? -1 : jointRemap[oldParent], localBind: nodeLocalMat(node) };
                if (ibmData) bone.inverseBind = ibmData.slice(oldIdx * 16, oldIdx * 16 + 16);
                bones.push(bone);
            }
            skeleton = { bones };
        }

        // Vertices
        const STRIDE = 16;
        const allVerts = [], allIdx = [], primitiveDescs = [];
        let vertexBase = 0;

        const scene = gltf.scenes[gltf.scene ?? 0];
        const meshNodes = []; // { meshIdx, transform }
        function walkNodes(list, parentMat) {
            for (const ni of (list || [])) {
                const node = gltf.nodes[ni];
                const localMat = nodeLocalMat(node);
                const worldMat = parentMat ? EzMat4.multiply(parentMat, localMat) : localMat;
                if (node.mesh != null) meshNodes.push({ meshIdx: node.mesh, transform: worldMat });
                walkNodes(node.children, worldMat);
            }
        }
        walkNodes(scene.nodes, null);

        for (const { meshIdx, transform } of meshNodes) {
            const mesh = gltf.meshes[meshIdx];

            for (const prim of mesh.primitives) {
                const attrs = prim.attributes || {};
                const pos = readAccessor(attrs.POSITION), nor = readAccessor(attrs.NORMAL);
                const uv = readAccessor(attrs.TEXCOORD_0);
                const joints0 = readAccessor(attrs.JOINTS_0), weights0 = readAccessor(attrs.WEIGHTS_0);
                const vcount = gltf.accessors[attrs.POSITION].count;
                const chunk = new Float32Array(vcount * STRIDE);

                // Bake node transform into vertices
                const normalMat = transform ? EzMat4.normalMat3(transform) : null;
                for (let v = 0; v < vcount; v++) {
                    const o = v * STRIDE;
                    // Position: transform by node matrix
                    if (transform) {
                        const p = EzMat4.transformVec3(transform, [pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2]]);
                        chunk[o] = p[0]; chunk[o + 1] = p[1]; chunk[o + 2] = p[2];
                    } else {
                        chunk[o] = pos[v * 3]; chunk[o + 1] = pos[v * 3 + 1]; chunk[o + 2] = pos[v * 3 + 2];
                    }
                    // Normal: transform by inverse-transpose of upper 3x3
                    if (nor) {
                        if (normalMat) {
                            const n = EzMat4.transformVec3Normal(normalMat, [nor[v * 3], nor[v * 3 + 1], nor[v * 3 + 2]]);
                            chunk[o + 3] = n[0]; chunk[o + 4] = n[1]; chunk[o + 5] = n[2];
                        } else {
                            chunk[o + 3] = nor[v * 3]; chunk[o + 4] = nor[v * 3 + 1]; chunk[o + 5] = nor[v * 3 + 2];
                        }
                    } else {
                        chunk[o + 3] = 0; chunk[o + 4] = 1; chunk[o + 5] = 0;
                    }
                    if (uv) { chunk[o + 6] = uv[v * 2]; chunk[o + 7] = uv[v * 2 + 1]; }
                    if (joints0 && jointRemap) {
                        chunk[o + 8] = jointRemap[joints0[v * 4]]; chunk[o + 9] = jointRemap[joints0[v * 4 + 1]];
                        chunk[o + 10] = jointRemap[joints0[v * 4 + 2]]; chunk[o + 11] = jointRemap[joints0[v * 4 + 3]];
                    } else if (joints0) {
                        chunk[o + 8] = joints0[v * 4]; chunk[o + 9] = joints0[v * 4 + 1]; chunk[o + 10] = joints0[v * 4 + 2]; chunk[o + 11] = joints0[v * 4 + 3];
                    }
                    if (weights0) {
                        chunk[o + 12] = weights0[v * 4]; chunk[o + 13] = weights0[v * 4 + 1];
                        chunk[o + 14] = weights0[v * 4 + 2]; chunk[o + 15] = weights0[v * 4 + 3];
                    }
                }
                allVerts.push(chunk);

                const rawIdx = readIndices(prim.indices);
                const idxOff = allIdx.length;
                const idxCount = rawIdx ? rawIdx.length : vcount;
                for (let i = 0; i < idxCount; i++) allIdx.push((rawIdx ? rawIdx[i] : i) + vertexBase);

                primitiveDescs.push({
                    indexOffset: idxOff,
                    indexCount: idxCount,
                });
                vertexBase += vcount;
            }
        }

        // Merge all vertex chunks
        const totalV = allVerts.reduce((s, a) => s + a.length, 0);
        const merged = new Float32Array(totalV);
        let vOff = 0;
        for (const a of allVerts) { merged.set(a, vOff); vOff += a.length; }

        const needU32 = allIdx.some(i => i > 65535);
        const mergedIdx = needU32 ? new Uint32Array(allIdx) : new Uint16Array(allIdx);

        return {
            vertices: merged,
            indices: mergedIdx,
            attributes: [
                { name: "a_position", size: 3 },
                { name: "a_normal", size: 3 },
                { name: "a_uv", size: 2 },
                { name: "a_boneID", size: 4 },
                { name: "a_boneWeight", size: 4 },
            ],
            primitives: primitiveDescs,
            skeleton,
        };
    }

    window.EzLoaderBeta = { load };
})();

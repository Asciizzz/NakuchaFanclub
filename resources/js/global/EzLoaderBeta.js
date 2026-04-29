/**
 * EzLoaderBeta.js — GLB/GLTF loader for EzCanvas3D
 *
 * Single canonical loader. Pulls geometry, skeleton, materials, textures,
 * and morph targets out of a .glb. Bakes node world transforms into vertices
 * so multi-mesh scenes line up correctly.
 *
 * Usage:
 *
 *   // Pure data (no engine touching):
 *   const data = await EzLoaderBeta.load(url);
 *
 *   // Auto-register textures + model on an EzCanvas3D instance:
 *   const data = await EzLoaderBeta.load(url, {
 *       ez,                       // EzCanvas3D instance
 *       modelKey:    "Agnes",     // also used as texture key prefix: "Agnes_t0"...
 *       shaderKey:   "rig_lit",   // becomes the model's defaultShader
 *       morphChannel:"u_morphPosTex",   // shader morphChannels[0] name
 *       autoAdd:     true,        // default true when ez+modelKey+shaderKey given
 *   });
 *
 * Returns:
 *   {
 *       vertices, indices, attributes, primitives, skeleton,
 *       boneNames:           string[],            // empty if no skin
 *       morphTargetNames:    string[] | null,
 *       logicalMorphCount:   number,
 *       primMorphInfo:       ({offset,count}|null)[],
 *       meshDefaultWeights:  (Float32Array|null)[],
 *       textureKeys:         { [gltfTexIdx]: ezKey },   // {} if no ez
 *       added:               boolean,             // true if ez.models.add succeeded
 *   }
 *
 * Dependencies: EzCanvas3D.js (for EzMath.Mat4, EzMath.Quat).
 */

(function () {
    "use strict";

    const TYPE_SIZES = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

    const DEFAULT_ATTRIBUTES = [
        { name: "a_position",   size: 3 },
        { name: "a_normal",     size: 3 },
        { name: "a_uv",         size: 2 },
        { name: "a_boneID",     size: 4 },
        { name: "a_boneWeight", size: 4 },
    ];
    const DEFAULT_STRIDE = DEFAULT_ATTRIBUTES.reduce((s, a) => s + a.size, 0); // 16 floats

    async function parseGLB(url) {
        const buf = await fetch(url).then(r => r.arrayBuffer());
        const dv  = new DataView(buf);
        if (dv.getUint32(0, true) !== 0x46546C67) throw new Error(`[EzLoaderBeta] not a GLB: ${url}`);
        const jsonLen = dv.getUint32(12, true);
        const gltf    = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)));
        let binBuf = null;
        const binOffset = 20 + jsonLen;
        if (binOffset + 8 <= buf.byteLength)
            binBuf = buf.slice(binOffset + 8, binOffset + 8 + dv.getUint32(binOffset, true));

        function readAccessor(idx) {
            if (idx == null) return null;
            const acc = gltf.accessors[idx];
            const count = acc.count, comp = TYPE_SIZES[acc.type];
            const out = new Float32Array(count * comp);
            if (acc.bufferView != null) {
                const bv = gltf.bufferViews[acc.bufferView];
                const off = (bv.byteOffset || 0) + (acc.byteOffset || 0);
                const isU8 = acc.componentType === 5121, isU16 = acc.componentType === 5123;
                const elem = isU8 ? 1 : isU16 ? 2 : 4;
                const stride = bv.byteStride ? bv.byteStride / elem : comp;
                const len = (count - 1) * stride + comp;
                const src = isU8  ? new Uint8Array (binBuf, off, len)
                          : isU16 ? new Uint16Array(binBuf, off, len)
                                  : new Float32Array(binBuf, off, len);
                for (let i = 0; i < count; i++) {
                    const dst = i * comp, srcI = i * stride;
                    for (let c = 0; c < comp; c++) out[dst + c] = src[srcI + c];
                }
            }
            if (acc.sparse) {
                const sp = acc.sparse;
                const idxBV = gltf.bufferViews[sp.indices.bufferView];
                const idxOff = (idxBV.byteOffset || 0) + (sp.indices.byteOffset || 0);
                const sIdx = sp.indices.componentType === 5125 ? new Uint32Array(binBuf, idxOff, sp.count)
                          :  sp.indices.componentType === 5123 ? new Uint16Array(binBuf, idxOff, sp.count)
                          :                                      new Uint8Array (binBuf, idxOff, sp.count);
                const valBV = gltf.bufferViews[sp.values.bufferView];
                const valOff = (valBV.byteOffset || 0) + (sp.values.byteOffset || 0);
                const sVal = new Float32Array(binBuf, valOff, sp.count * comp);
                for (let i = 0; i < sp.count; i++) {
                    const ti = sIdx[i], dst = ti * comp, src = i * comp;
                    for (let c = 0; c < comp; c++) out[dst + c] = sVal[src + c];
                }
            }
            return out;
        }

        function readIndices(idx) {
            if (idx == null) return null;
            const acc = gltf.accessors[idx];
            const bv  = gltf.bufferViews[acc.bufferView];
            const off = (bv.byteOffset || 0) + (acc.byteOffset || 0);
            if (acc.componentType === 5125) return new Uint32Array(binBuf, off, acc.count);
            if (acc.componentType === 5123) return new Uint16Array(binBuf, off, acc.count);
            return new Uint8Array(binBuf, off, acc.count);
        }

        const texCache = new Map();
        async function loadTextureBitmap(texIdx) {
            if (texCache.has(texIdx)) return texCache.get(texIdx);
            const imgDef = gltf.images[gltf.textures[texIdx].source];
            let blob;
            if (imgDef.bufferView != null) {
                const bv = gltf.bufferViews[imgDef.bufferView];
                blob = new Blob(
                    [binBuf.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength)],
                    { type: imgDef.mimeType || "image/png" }
                );
            } else {
                blob = await fetch(imgDef.uri).then(r => r.blob());
            }
            const bitmap = await createImageBitmap(blob);
            const out = { bitmap, width: bitmap.width, height: bitmap.height };
            texCache.set(texIdx, out);
            return out;
        }

        function nodeLocalMat(node) {
            if (node.matrix) return new Float32Array(node.matrix);
            return EzMath.Mat4.compose(
                node.translation || [0, 0, 0],
                node.rotation    || [0, 0, 0, 1],
                node.scale       || [1, 1, 1],
            );
        }

        return { gltf, binBuf, readAccessor, readIndices, loadTextureBitmap, nodeLocalMat };
    }

    function buildSkeleton(gltf, readAccessor, nodeLocalMat) {
        const skin = gltf.skins?.length ? gltf.skins[0] : null;
        if (!skin) return { skeleton: null, jointRemap: null, boneNames: [] };

        const joints = skin.joints, n = joints.length;
        const nodeToJoint = {};
        const rawNames = new Array(n);
        for (let ji = 0; ji < n; ji++) {
            const ni = joints[ji];
            nodeToJoint[ni] = ji;
            rawNames[ji] = gltf.nodes[ni].name || `Bone_${ji}`;
        }

        const parents = new Array(n).fill(-1);
        for (let i = 0; i < n; i++) {
            const node = gltf.nodes[joints[i]];
            if (!node.children) continue;
            for (const c of node.children) {
                const ji = nodeToJoint[c];
                if (ji != null) parents[ji] = i;
            }
        }

        const visited = new Uint8Array(n), topo = [];
        for (let i = 0; i < n; i++) if (parents[i] === -1) { topo.push(i); visited[i] = 1; }
        for (let qi = 0; qi < topo.length; qi++) {
            const node = gltf.nodes[joints[topo[qi]]];
            if (!node.children) continue;
            for (const c of node.children) {
                const ji = nodeToJoint[c];
                if (ji != null && !visited[ji]) { visited[ji] = 1; topo.push(ji); }
            }
        }
        for (let i = 0; i < n; i++) if (!visited[i]) topo.push(i);

        const jointRemap = new Int32Array(n);
        for (let ni = 0; ni < n; ni++) jointRemap[topo[ni]] = ni;

        const ibmData = skin.inverseBindMatrices != null ? readAccessor(skin.inverseBindMatrices) : null;
        const bones = new Array(n);
        for (let ni = 0; ni < n; ni++) {
            const oldIdx = topo[ni];
            const node   = gltf.nodes[joints[oldIdx]];
            const oldP   = parents[oldIdx];
            const bone = {
                parent:    oldP === -1 ? -1 : jointRemap[oldP],
                localBind: nodeLocalMat(node),
            };
            if (ibmData) bone.inverseBind = ibmData.slice(oldIdx * 16, oldIdx * 16 + 16);
            bones[ni] = bone;
        }

        const boneNames = new Array(n);
        for (let oi = 0; oi < n; oi++) boneNames[jointRemap[oi]] = rawNames[oi];

        return { skeleton: { bones }, jointRemap, boneNames };
    }

    function collectMeshNodes(gltf) {
        const scene = gltf.scenes[gltf.scene ?? 0];
        const out = [];
        function walk(list, parentMat) {
            for (const ni of (list || [])) {
                const node = gltf.nodes[ni];
                const local = node.matrix
                    ? new Float32Array(node.matrix)
                    : EzMath.Mat4.compose(
                          node.translation || [0, 0, 0],
                          node.rotation    || [0, 0, 0, 1],
                          node.scale       || [1, 1, 1],
                      );
                const world = parentMat ? EzMath.Mat4.multiply(parentMat, local) : local;
                if (node.mesh != null) out.push({ meshIdx: node.mesh, transform: world });
                walk(node.children, world);
            }
        }
        walk(scene.nodes, null);
        return out;
    }

    async function registerTextures(gltf, ez, modelKey, loadTextureBitmap) {
        const out = {};
        if (!gltf.textures || !ez || !modelKey) return out;
        const prefix = String(modelKey).replace(/[^a-z0-9]/gi, "_");
        await Promise.all(gltf.textures.map(async (_, ti) => {
            const { bitmap, width, height } = await loadTextureBitmap(ti);
            const key = `${prefix}_t${ti}`;
            ez.textures.add(key, { data: bitmap, width, height, channels: 4 });
            out[ti] = key;
        }));
        return out;
    }

    function makeMatProps(gltf, textureKeys) {
        return function matProps(matIdx) {
            if (matIdx == null || !gltf.materials) return { albedo: null, fill: [1, 1, 1, 1] };
            const pbr = (gltf.materials[matIdx].pbrMetallicRoughness || {});
            return {
                fill:   pbr.baseColorFactor || [1, 1, 1, 1],
                albedo: pbr.baseColorTexture != null ? (textureKeys[pbr.baseColorTexture.index] || null) : null,
            };
        };
    }

    async function load(url, opts = {}) {
        const {
            ez            = null,
            modelKey      = null,
            shaderKey     = null,
            morphChannel  = "u_morphPosTex",
            attributes    = DEFAULT_ATTRIBUTES,
            autoAdd,
        } = opts;

        const { gltf, readAccessor, readIndices, loadTextureBitmap, nodeLocalMat } = await parseGLB(url);

        // Skeleton
        const { skeleton, jointRemap, boneNames } = buildSkeleton(gltf, readAccessor, nodeLocalMat);

        // Textures (only if we have an ez to register them on)
        const textureKeys = await registerTextures(gltf, ez, modelKey, loadTextureBitmap);
        const matProps    = makeMatProps(gltf, textureKeys);

        // Geometry — bake node world transforms
        const STRIDE = DEFAULT_STRIDE;
        const allVerts = [], allIdx = [], primitiveDescs = [];
        const primMorphInfo = [], meshDefaultWeights = [];
        let morphRunOffset = 0, logicalMorphCount = 0, morphTargetNames = null;
        let vertexBase = 0;

        for (const { meshIdx, transform } of collectMeshNodes(gltf)) {
            const mesh = gltf.meshes[meshIdx];
            const meshTargetNames = mesh.extras?.targetNames || null;
            const meshWeights     = mesh.weights || null;
            const normalMat       = transform ? EzMath.Mat4.normalMat3(transform) : null;

            for (const prim of mesh.primitives) {
                const a = prim.attributes || {};
                const pos     = readAccessor(a.POSITION);
                const nor     = readAccessor(a.NORMAL);
                const uv      = readAccessor(a.TEXCOORD_0);
                const joints0 = readAccessor(a.JOINTS_0);
                const weights0= readAccessor(a.WEIGHTS_0);
                const vcount  = gltf.accessors[a.POSITION].count;
                const chunk   = new Float32Array(vcount * STRIDE);

                for (let v = 0; v < vcount; v++) {
                    const o = v * STRIDE;
                    if (transform) {
                        const p = EzMath.Mat4.transformVec3(transform, [pos[v*3], pos[v*3+1], pos[v*3+2]]);
                        chunk[o] = p[0]; chunk[o+1] = p[1]; chunk[o+2] = p[2];
                    } else {
                        chunk[o] = pos[v*3]; chunk[o+1] = pos[v*3+1]; chunk[o+2] = pos[v*3+2];
                    }
                    if (nor) {
                        if (normalMat) {
                            const n = EzMath.Mat4.transformVec3Normal(normalMat, [nor[v*3], nor[v*3+1], nor[v*3+2]]);
                            chunk[o+3] = n[0]; chunk[o+4] = n[1]; chunk[o+5] = n[2];
                        } else {
                            chunk[o+3] = nor[v*3]; chunk[o+4] = nor[v*3+1]; chunk[o+5] = nor[v*3+2];
                        }
                    } else {
                        chunk[o+3] = 0; chunk[o+4] = 1; chunk[o+5] = 0;
                    }
                    if (uv) { chunk[o+6] = uv[v*2]; chunk[o+7] = uv[v*2+1]; }
                    if (joints0 && jointRemap) {
                        chunk[o+8]  = jointRemap[joints0[v*4]];
                        chunk[o+9]  = jointRemap[joints0[v*4+1]];
                        chunk[o+10] = jointRemap[joints0[v*4+2]];
                        chunk[o+11] = jointRemap[joints0[v*4+3]];
                    } else if (joints0) {
                        chunk[o+8]  = joints0[v*4];
                        chunk[o+9]  = joints0[v*4+1];
                        chunk[o+10] = joints0[v*4+2];
                        chunk[o+11] = joints0[v*4+3];
                    }
                    if (weights0) {
                        chunk[o+12] = weights0[v*4];
                        chunk[o+13] = weights0[v*4+1];
                        chunk[o+14] = weights0[v*4+2];
                        chunk[o+15] = weights0[v*4+3];
                    }
                }
                allVerts.push(chunk);

                const rawIdx   = readIndices(prim.indices);
                const idxOff   = allIdx.length;
                const idxCount = rawIdx ? rawIdx.length : vcount;
                for (let i = 0; i < idxCount; i++) allIdx.push((rawIdx ? rawIdx[i] : i) + vertexBase);

                let morphTargets = null;
                if (Array.isArray(prim.targets) && prim.targets.length > 0) {
                    morphTargets = prim.targets.map(tgt =>
                        tgt.POSITION != null ? readAccessor(tgt.POSITION) : new Float32Array(vcount * 3)
                    );
                    if (morphTargets.length > logicalMorphCount) logicalMorphCount = morphTargets.length;
                    if (!morphTargetNames && meshTargetNames) morphTargetNames = meshTargetNames.slice();
                    primMorphInfo.push({ offset: morphRunOffset, count: morphTargets.length });
                    morphRunOffset += morphTargets.length;
                    meshDefaultWeights.push(meshWeights ? Float32Array.from(meshWeights) : null);
                } else {
                    primMorphInfo.push(null);
                    meshDefaultWeights.push(null);
                }

                const mp = matProps(prim.material);
                primitiveDescs.push({
                    indexOffset: idxOff,
                    indexCount:  idxCount,
                    material:    { albedo: mp.albedo, fill: mp.fill },
                    morphTargets: morphTargets && morphChannel ? { [morphChannel]: morphTargets } : null,
                });
                vertexBase += vcount;
            }
        }

        // Pad target names to logicalMorphCount
        if (logicalMorphCount > 0 && !morphTargetNames) {
            morphTargetNames = Array.from({ length: logicalMorphCount }, (_, i) => `Target ${i}`);
        } else if (morphTargetNames) {
            while (morphTargetNames.length < logicalMorphCount) morphTargetNames.push(`Target ${morphTargetNames.length}`);
            morphTargetNames.length = logicalMorphCount;
        }

        // Merge buffers
        const totalV  = allVerts.reduce((s, a) => s + a.length, 0);
        const merged  = new Float32Array(totalV);
        let vOff = 0;
        for (const a of allVerts) { merged.set(a, vOff); vOff += a.length; }
        const needU32   = allIdx.some(i => i > 65535);
        const mergedIdx = needU32 ? new Uint32Array(allIdx) : new Uint16Array(allIdx);

        // Auto-register on the engine (default: yes if we have everything)
        const wantAdd = autoAdd ?? !!(ez && modelKey && shaderKey);
        let added = false;
        if (wantAdd) {
            if (!ez || !modelKey || !shaderKey) {
                console.warn("[EzLoaderBeta] autoAdd=true but missing ez/modelKey/shaderKey; skipping models.add");
            } else {
                added = !!ez.models.add(modelKey, {
                    defaultShader: shaderKey,
                    vertices:      merged,
                    indices:       mergedIdx,
                    attributes,
                    primitives:    primitiveDescs,
                    skeleton,
                });
                if (!added) console.warn(`[EzLoaderBeta] ez.models.add("${modelKey}") failed`);
            }
        }

        return {
            vertices:           merged,
            indices:            mergedIdx,
            attributes,
            primitives:         primitiveDescs,
            skeleton,
            boneNames,
            morphTargetNames,
            logicalMorphCount,
            primMorphInfo,
            meshDefaultWeights,
            textureKeys,
            added,
        };
    }

    window.EzLoaderBeta = { load };
})();

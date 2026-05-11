(function () {
    "use strict";

    const VERT_STRIDE_FLOATS = 16;        // pos3 + nrm3 + uv2 + bone4 + weight4
    const ATTR_OFF = { pos: 0, nrm: 3, uv: 6, boneID: 8, boneW: 12 };

    const VERT_ATTRIBUTES = Object.freeze([
        Object.freeze({ name: "a_position",   size: 3 }),
        Object.freeze({ name: "a_normal",     size: 3 }),
        Object.freeze({ name: "a_uv",         size: 2 }),
        Object.freeze({ name: "a_boneID",     size: 4 }),
        Object.freeze({ name: "a_boneWeight", size: 4 }),
    ]);

    const TYPE_COMPS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

    function mat4Compose(t, r, s) {
        const out = new Float32Array(16);
        const tx = t[0]||0, ty = t[1]||0, tz = t[2]||0;
        const qx = r[0]||0, qy = r[1]||0, qz = r[2]||0, qw = r[3] != null ? r[3] : 1;
        const sx = s[0]||1, sy = s[1]||1, sz = s[2]||1;
        const x2=qx+qx, y2=qy+qy, z2=qz+qz;
        const xx=qx*x2, xy=qx*y2, xz=qx*z2;
        const yy=qy*y2, yz=qy*z2, zz=qz*z2;
        const wx=qw*x2, wy=qw*y2, wz=qw*z2;
        out[0]=(1-(yy+zz))*sx; out[1]=(xy+wz)*sx;    out[2]=(xz-wy)*sx;    out[3]=0;
        out[4]=(xy-wz)*sy;    out[5]=(1-(xx+zz))*sy; out[6]=(yz+wx)*sy;    out[7]=0;
        out[8]=(xz+wy)*sz;    out[9]=(yz-wx)*sz;    out[10]=(1-(xx+yy))*sz; out[11]=0;
        out[12]=tx; out[13]=ty; out[14]=tz; out[15]=1;
        return out;
    }

    function nodeLocalMat(node) {
        if (node.matrix) return new Float32Array(node.matrix);
        return mat4Compose(
            node.translation || [0, 0, 0],
            node.rotation    || [0, 0, 0, 1],
            node.scale       || [1, 1, 1],
        );
    }

    async function parseGLB(url) {
        const buf = await fetch(url).then(r => r.arrayBuffer());
        const dv  = new DataView(buf);
        if (dv.getUint32(0, true) !== 0x46546C67) throw new Error(`[EzLoader] not a GLB: ${url}`);

        const jsonLen = dv.getUint32(12, true);
        const gltf    = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)));

        let binBuf = null;
        const binOffset = 20 + jsonLen;
        if (binOffset + 8 <= buf.byteLength)
            binBuf = buf.slice(binOffset + 8, binOffset + 8 + dv.getUint32(binOffset, true));

        function readAccessor(idx) {
            if (idx == null) return null;
            const acc = gltf.accessors[idx];
            const count = acc.count, comp = TYPE_COMPS[acc.type];
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

            // Sparse override (common for morph deltas)
            if (acc.sparse) {
                const sp = acc.sparse;
                const idxBV  = gltf.bufferViews[sp.indices.bufferView];
                const idxOff = (idxBV.byteOffset || 0) + (sp.indices.byteOffset || 0);
                const sIdx = sp.indices.componentType === 5125 ? new Uint32Array(binBuf, idxOff, sp.count)
                          :  sp.indices.componentType === 5123 ? new Uint16Array(binBuf, idxOff, sp.count)
                          :                                      new Uint8Array (binBuf, idxOff, sp.count);
                const valBV  = gltf.bufferViews[sp.values.bufferView];
                const valOff = (valBV.byteOffset || 0) + (sp.values.byteOffset || 0);
                const sVal = new Float32Array(binBuf, valOff, sp.count * comp);
                for (let i = 0; i < sp.count; i++) {
                    const dst = sIdx[i] * comp, src = i * comp;
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

        async function loadTextureBitmap(texIdx) {
            const imgDef = gltf.images[gltf.textures[texIdx].source];
            let blob;
            if (imgDef.bufferView != null) {
                const bv = gltf.bufferViews[imgDef.bufferView];
                blob = new Blob(
                    [binBuf.slice(bv.byteOffset || 0, (bv.byteOffset || 0) + bv.byteLength)],
                    { type: imgDef.mimeType || "image/png" },
                );
            } else {
                blob = await fetch(imgDef.uri).then(r => r.blob());
            }
            return await createImageBitmap(blob);
        }

        return { gltf, binBuf, readAccessor, readIndices, loadTextureBitmap };
    }

    function nameOr(s, fallbackKey, idx) {
        return (s && s.length > 0) ? s : `${fallbackKey}_${idx}`;
    }

    async function loadTextures(gltf, loadTextureBitmap) {
        const out = [];
        if (!gltf.textures) return out;
        for (let ti = 0; ti < gltf.textures.length; ti++) {
            const t = gltf.textures[ti];
            const bitmap = await loadTextureBitmap(ti);
            const wrap = (t.sampler != null && gltf.samplers?.[t.sampler]?.wrapS === 33071) ? "clamp" : "repeat";
            out.push({
                name: nameOr(t.name, "texture", ti),
                bitmap, width: bitmap.width, height: bitmap.height, channels: 4, wrap,
            });
        }
        return out;
    }

    function loadMaterials(gltf) {
        const out = [];
        if (!gltf.materials) return out;
        for (let mi = 0; mi < gltf.materials.length; mi++) {
            const m = gltf.materials[mi];
            const pbr = m.pbrMetallicRoughness || {};
            out.push({
                name: nameOr(m.name, "material", mi),
                baseColor:     pbr.baseColorFactor ? Float32Array.from(pbr.baseColorFactor) : new Float32Array([1,1,1,1]),
                albedoIdx:     pbr.baseColorTexture?.index ?? -1,
                metalRoughIdx: pbr.metallicRoughnessTexture?.index ?? -1,
                normalIdx:     m.normalTexture?.index ?? -1,
                emissiveIdx:   m.emissiveTexture?.index ?? -1,
            });
        }
        return out;
    }

    function loadSkeleton(skin, gltf, readAccessor) {
        const joints = skin.joints, n = joints.length;
        const nodeToJoint = {};
        for (let ji = 0; ji < n; ji++) nodeToJoint[joints[ji]] = ji;

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

        const remap = new Int32Array(n);
        for (let ni = 0; ni < n; ni++) remap[topo[ni]] = ni;

        const ibm = skin.inverseBindMatrices != null ? readAccessor(skin.inverseBindMatrices) : null;
        const bones = new Array(n);
        for (let ni = 0; ni < n; ni++) {
            const oldIdx = topo[ni];
            const node   = gltf.nodes[joints[oldIdx]];
            const oldP   = parents[oldIdx];
            const bone = {
                parent:      oldP === -1 ? -1 : remap[oldP],
                name:        node.name || `Bone_${ni}`,
                localBind:   nodeLocalMat(node),
                inverseBind: ibm ? ibm.slice(oldIdx * 16, oldIdx * 16 + 16) : null,
                children:    [],
            };
            bones[ni] = bone;
        }
        for (let i = 0; i < n; i++) {
            const p = bones[i].parent;
            if (p >= 0) bones[p].children.push(i);
        }
        return { bones, jointRemap: remap };
    }

    function loadSkeletons(gltf, readAccessor) {
        const out = [];
        const skinJointRemaps = [];        // parallel array, used during mesh load
        if (!gltf.skins) return { skeletons: out, skinJointRemaps };
        for (let si = 0; si < gltf.skins.length; si++) {
            const skin = gltf.skins[si];
            const { bones, jointRemap } = loadSkeleton(skin, gltf, readAccessor);
            out.push({ name: nameOr(skin.name, "skeleton", si), bones });
            skinJointRemaps.push(jointRemap);
        }
        return { skeletons: out, skinJointRemaps };
    }

    function loadMesh(meshIdx, gltf, readAccessor, readIndices, skinJointRemap) {
        const mesh = gltf.meshes[meshIdx];
        const meshTargetNames = mesh.extras?.targetNames || null;
        const meshWeights     = mesh.weights || null;

        const allVerts = [], allIdx = [], primitives = [];
        let vertexBase = 0, idxBase = 0, meshTargetCount = 0;

        for (const prim of mesh.primitives) {
            const a = prim.attributes || {};
            const pos     = readAccessor(a.POSITION);
            const nor     = readAccessor(a.NORMAL);
            const uv      = readAccessor(a.TEXCOORD_0);
            const joints0 = readAccessor(a.JOINTS_0);
            const weights = readAccessor(a.WEIGHTS_0);
            const vcount  = gltf.accessors[a.POSITION].count;

            // Pack into the canonical interleaved layout
            const chunk = new Float32Array(vcount * VERT_STRIDE_FLOATS);
            for (let v = 0; v < vcount; v++) {
                const o = v * VERT_STRIDE_FLOATS;
                chunk[o + ATTR_OFF.pos]     = pos[v*3];
                chunk[o + ATTR_OFF.pos + 1] = pos[v*3 + 1];
                chunk[o + ATTR_OFF.pos + 2] = pos[v*3 + 2];
                if (nor) {
                    chunk[o + ATTR_OFF.nrm]     = nor[v*3];
                    chunk[o + ATTR_OFF.nrm + 1] = nor[v*3 + 1];
                    chunk[o + ATTR_OFF.nrm + 2] = nor[v*3 + 2];
                } else {
                    chunk[o + ATTR_OFF.nrm + 1] = 1; // default Y-up normal
                }
                if (uv) {
                    chunk[o + ATTR_OFF.uv]     = uv[v*2];
                    chunk[o + ATTR_OFF.uv + 1] = uv[v*2 + 1];
                }
                if (joints0) {
                    for (let k = 0; k < 4; k++) {
                        const j = joints0[v*4 + k] | 0;
                        chunk[o + ATTR_OFF.boneID + k] = skinJointRemap ? skinJointRemap[j] : j;
                    }
                }
                if (weights) {
                    for (let k = 0; k < 4; k++) chunk[o + ATTR_OFF.boneW + k] = weights[v*4 + k];
                }
            }
            allVerts.push(chunk);

            // Indices (generate sequential if absent)
            const rawIdx   = readIndices(prim.indices);
            const idxCount = rawIdx ? rawIdx.length : vcount;
            for (let i = 0; i < idxCount; i++) allIdx.push((rawIdx ? rawIdx[i] : i) + vertexBase);

            // Morph deltas (POSITION / NORMAL / TANGENT)
            let morphDeltas = null, morphTargetCount = 0;
            if (Array.isArray(prim.targets) && prim.targets.length > 0) {
                morphTargetCount = prim.targets.length;
                if (morphTargetCount > meshTargetCount) meshTargetCount = morphTargetCount;
                morphDeltas = {};
                for (const attr of ["POSITION", "NORMAL", "TANGENT"]) {
                    if (!prim.targets.some(t => t[attr] != null)) continue;
                    const packed = new Float32Array(morphTargetCount * vcount * 3);
                    for (let ti = 0; ti < morphTargetCount; ti++) {
                        const acc = prim.targets[ti][attr];
                        if (acc == null) continue;
                        const data = readAccessor(acc);                        // vec3
                        packed.set(data, ti * vcount * 3);
                    }
                    morphDeltas[attr] = packed;
                }
                if (Object.keys(morphDeltas).length === 0) morphDeltas = null;
            }

            primitives.push({
                indexOffset:  idxBase,
                indexCount:   idxCount,
                vertexOffset: vertexBase,
                vertexCount:  vcount,
                materialIdx:  prim.material ?? -1,
                morphDeltas,
                morphTargetCount,
            });

            vertexBase += vcount;
            idxBase    += idxCount;
        }

        // Merge buffers
        const totalV  = allVerts.reduce((s, a) => s + a.length, 0);
        const merged  = new Float32Array(totalV);
        let vOff = 0;
        for (const a of allVerts) { merged.set(a, vOff); vOff += a.length; }
        const needU32   = vertexBase > 65535;
        const mergedIdx = needU32 ? new Uint32Array(allIdx) : new Uint16Array(allIdx);

        // Mesh-level morph metadata (max target count across primitives)
        let morphTargetNames = null;
        if (meshTargetCount > 0) {
            morphTargetNames = (meshTargetNames || []).slice(0, meshTargetCount);
            while (morphTargetNames.length < meshTargetCount)
                morphTargetNames.push(`Target_${morphTargetNames.length}`);
        }
        const defaultWeights = (meshWeights && meshTargetCount > 0)
            ? Float32Array.from(meshWeights.slice(0, meshTargetCount))
            : null;

        return {
            name:             nameOr(mesh.name, "mesh", meshIdx),
            vertices:         merged,
            attributes:       VERT_ATTRIBUTES,
            indices:          mergedIdx,
            primitives,
            morphTargetCount: meshTargetCount,
            morphTargetNames,
            defaultWeights,
        };
    }

    function buildNodes(gltf, modelName) {
        const nodes = [];
        const newOf = (name) => {
            const i = nodes.length;
            nodes.push({
                name, parent: -1, children: [],
                local: new Float32Array(16),
                meshIdx: -1, skeletonIdx: -1, skinSkeletonNodeIdx: -1,
            });
            nodes[i].local[0] = nodes[i].local[5] = nodes[i].local[10] = nodes[i].local[15] = 1;
            return i;
        };

        const root = newOf(modelName || "Model_Root");

        // Synthetic skeleton container (and per-skin holders)
        const skinToHolderNode = {};                       // skinIdx -> nodes[] index
        if (gltf.skins?.length) {
            const skelRoot = newOf("Skeletons");
            nodes[skelRoot].parent = root;
            nodes[root].children.push(skelRoot);
            for (let si = 0; si < gltf.skins.length; si++) {
                const sName = gltf.skins[si].name || `Skeleton_${si}`;
                const idx = newOf(sName);
                nodes[idx].parent      = skelRoot;
                nodes[idx].skeletonIdx = si;
                nodes[skelRoot].children.push(idx);
                skinToHolderNode[si] = idx;
            }
        }

        // Map glTF nodes that carry meshes (joints are skipped - they live in
        // the skeleton struct, not the scene graph).
        const isJoint = new Uint8Array(gltf.nodes?.length || 0);
        for (const skin of gltf.skins || []) for (const j of skin.joints) isJoint[j] = 1;

        const gltfToNode = new Int32Array(gltf.nodes?.length || 0).fill(-1);
        for (let gi = 0; gi < (gltf.nodes?.length || 0); gi++) {
            if (isJoint[gi]) continue;
            const g = gltf.nodes[gi];
            const idx = newOf(g.name || `Node_${gi}`);
            nodes[idx].local = nodeLocalMat(g);
            if (g.mesh != null) nodes[idx].meshIdx = g.mesh;
            if (g.skin != null && skinToHolderNode[g.skin] != null) {
                nodes[idx].skinSkeletonNodeIdx = skinToHolderNode[g.skin];
            }
            gltfToNode[gi] = idx;
        }

        // Wire parent/children using glTF's children lists. Anything without
        // an explicit parent falls under the model root.
        const hasParent = new Uint8Array(nodes.length);
        for (let gi = 0; gi < (gltf.nodes?.length || 0); gi++) {
            const ni = gltfToNode[gi];
            if (ni < 0) continue;
            const g = gltf.nodes[gi];
            if (!g.children) continue;
            for (const cgi of g.children) {
                const ci = gltfToNode[cgi];
                if (ci < 0) continue;
                nodes[ci].parent = ni;
                nodes[ni].children.push(ci);
                hasParent[ci] = 1;
            }
        }
        for (let ni = 0; ni < nodes.length; ni++) {
            if (ni === root || hasParent[ni] || nodes[ni].parent !== -1) continue;
            nodes[ni].parent = root;
            nodes[root].children.push(ni);
        }

        return nodes;
    }

    async function load(url) {
        const { gltf, readAccessor, readIndices, loadTextureBitmap } = await parseGLB(url);

        // Derive a default model name from the URL
        let name = url;
        const slash = name.lastIndexOf("/"); if (slash >= 0) name = name.slice(slash + 1);
        const dot   = name.lastIndexOf("."); if (dot >= 0)   name = name.slice(0, dot);

        const textures  = await loadTextures(gltf, loadTextureBitmap);
        const materials = loadMaterials(gltf);

        const { skeletons, skinJointRemaps } = loadSkeletons(gltf, readAccessor);

        // Find the joint remap for each mesh (a mesh may be reused across
        // skins, but glTF tightly couples skin↔node↔mesh, so this works).
        const meshToSkin = new Int32Array(gltf.meshes?.length || 0).fill(-1);
        for (const node of (gltf.nodes || [])) {
            if (node.mesh != null && node.skin != null) meshToSkin[node.mesh] = node.skin;
        }

        const meshes = [];
        for (let mi = 0; mi < (gltf.meshes?.length || 0); mi++) {
            const skinIdx = meshToSkin[mi];
            const remap   = skinIdx >= 0 ? skinJointRemaps[skinIdx] : null;
            meshes.push(loadMesh(mi, gltf, readAccessor, readIndices, remap));
        }

        const nodes = buildNodes(gltf, name);

        return { name, textures, materials, meshes, skeletons, nodes };
    }

    window.EzLoader = { load };
})();

(function () {
    "use strict";

    const TYPE_COMPS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

    function hashParts(parts) {
        let h = 0x811c9dc5;
        const prime = 0x01000193;

        const addByte = (b) => {
            h ^= (b & 0xff);
            h = Math.imul(h, prime);
        };

        const addString = (s) => {
            for (let i = 0; i < s.length; i++) {
                const c = s.charCodeAt(i);
                addByte(c & 0xff);
                addByte((c >>> 8) & 0xff);
            }
        };

        const visit = (value) => {
            if (value == null) {
                addString("null;");
                return;
            }

            const t = typeof value;
            if (t === "string") {
                addString("str:");
                addString(value);
                addString(";");
                return;
            }
            if (t === "number") {
                addString("num:");
                addString(Number.isFinite(value) ? String(value) : "nan");
                addString(";");
                return;
            }
            if (t === "boolean") {
                addString(value ? "true;" : "false;");
                return;
            }

            if (value instanceof ArrayBuffer) {
                addString("ab:");
                const bytes = new Uint8Array(value);
                for (let i = 0; i < bytes.length; i++) addByte(bytes[i]);
                addString(";");
                return;
            }
            if (ArrayBuffer.isView(value)) {
                addString(`ta:${value.constructor.name}:${value.byteLength}:`);
                const bytes = new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
                for (let i = 0; i < bytes.length; i++) addByte(bytes[i]);
                addString(";");
                return;
            }
            if (Array.isArray(value)) {
                addString("[");
                for (const item of value) visit(item);
                addString("]");
                return;
            }
            if (t === "object") {
                addString("{");
                const keys = Object.keys(value).sort();
                for (const key of keys) {
                    addString(key);
                    addString(":");
                    visit(value[key]);
                    addString(";");
                }
                addString("}");
            }
        };

        for (const part of parts) visit(part);
        return (h >>> 0).toString(16).padStart(8, "0");
    }

    function createID(prefix, ...parts) {
        return `${prefix}_${hashParts(parts)}`;
    }

    function upsertById(store, baseId, value) {
        let id = String(baseId || "asset");
        if (!store[id]) {
            value.id = id;
            store[id] = value;
            return id;
        }

        let i = 1;
        while (store[`${id}_${i}`]) i++;
        id = `${id}_${i}`;
        value.id = id;
        store[id] = value;
        return id;
    }

    function mat4Compose(t, r, s) {
        const out = new Float32Array(16);
        const tx = t[0] || 0, ty = t[1] || 0, tz = t[2] || 0;
        const qx = r[0] || 0, qy = r[1] || 0, qz = r[2] || 0, qw = r[3] != null ? r[3] : 1;
        const sx = s[0] || 1, sy = s[1] || 1, sz = s[2] || 1;
        const x2 = qx + qx, y2 = qy + qy, z2 = qz + qz;
        const xx = qx * x2, xy = qx * y2, xz = qx * z2;
        const yy = qy * y2, yz = qy * z2, zz = qz * z2;
        const wx = qw * x2, wy = qw * y2, wz = qw * z2;
        out[0] = (1 - (yy + zz)) * sx; out[1] = (xy + wz) * sx; out[2] = (xz - wy) * sx; out[3] = 0;
        out[4] = (xy - wz) * sy; out[5] = (1 - (xx + zz)) * sy; out[6] = (yz + wx) * sy; out[7] = 0;
        out[8] = (xz + wy) * sz; out[9] = (yz - wx) * sz; out[10] = (1 - (xx + yy)) * sz; out[11] = 0;
        out[12] = tx; out[13] = ty; out[14] = tz; out[15] = 1;
        return out;
    }

    function nodeLocalMat(node) {
        if (node.matrix) return new Float32Array(node.matrix);
        return mat4Compose(
            node.translation || [0, 0, 0],
            node.rotation || [0, 0, 0, 1],
            node.scale || [1, 1, 1],
        );
    }

    async function parseGLB(url) {
        const buf = await fetch(url).then(r => r.arrayBuffer());
        const dv = new DataView(buf);
        if (dv.getUint32(0, true) !== 0x46546c67) throw new Error(`[ZLoader] not a GLB: ${url}`);

        const jsonLen = dv.getUint32(12, true);
        const gltf = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)));

        let binBuf = null;
        const binOffset = 20 + jsonLen;
        if (binOffset + 8 <= buf.byteLength) {
            const binLen = dv.getUint32(binOffset, true);
            binBuf = buf.slice(binOffset + 8, binOffset + 8 + binLen);
        }

        function readAccessor(idx) {
            if (idx == null) return null;
            const acc = gltf.accessors[idx];
            const count = acc.count, comp = TYPE_COMPS[acc.type];
            const out = new Float32Array(count * comp);

            if (acc.bufferView != null) {
                const bv = gltf.bufferViews[acc.bufferView];
                const off = (bv.byteOffset || 0) + (acc.byteOffset || 0);
                const isU8 = acc.componentType === 5121;
                const isU16 = acc.componentType === 5123;
                const elem = isU8 ? 1 : isU16 ? 2 : 4;
                const stride = bv.byteStride ? bv.byteStride / elem : comp;
                const len = (count - 1) * stride + comp;
                const src = isU8 ? new Uint8Array(binBuf, off, len)
                    : isU16 ? new Uint16Array(binBuf, off, len)
                        : new Float32Array(binBuf, off, len);

                for (let i = 0; i < count; i++) {
                    const dst = i * comp;
                    const srcI = i * stride;
                    for (let c = 0; c < comp; c++) out[dst + c] = src[srcI + c];
                }
            }

            if (acc.sparse) {
                const sp = acc.sparse;
                const idxBV = gltf.bufferViews[sp.indices.bufferView];
                const idxOff = (idxBV.byteOffset || 0) + (sp.indices.byteOffset || 0);
                const sIdx = sp.indices.componentType === 5125
                    ? new Uint32Array(binBuf, idxOff, sp.count)
                    : sp.indices.componentType === 5123
                        ? new Uint16Array(binBuf, idxOff, sp.count)
                        : new Uint8Array(binBuf, idxOff, sp.count);

                const valBV = gltf.bufferViews[sp.values.bufferView];
                const valOff = (valBV.byteOffset || 0) + (sp.values.byteOffset || 0);
                const sVal = new Float32Array(binBuf, valOff, sp.count * comp);
                for (let i = 0; i < sp.count; i++) {
                    const dst = sIdx[i] * comp;
                    const src = i * comp;
                    for (let c = 0; c < comp; c++) out[dst + c] = sVal[src + c];
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

        async function loadTextureBitmap(texIdx) {
            const imgDef = gltf.images[gltf.textures[texIdx].source];
            let blob;
            if (imgDef.bufferView != null) {
                const bv = gltf.bufferViews[imgDef.bufferView];
                const start = bv.byteOffset || 0;
                const end = start + bv.byteLength;
                blob = new Blob([binBuf.slice(start, end)], { type: imgDef.mimeType || "image/png" });
            } else {
                blob = await fetch(imgDef.uri).then(r => r.blob());
            }
            return await createImageBitmap(blob);
        }

        return { gltf, binBuf, readAccessor, readIndices, loadTextureBitmap };
    }

    function nameOr(s, fallbackKey, idx) {
        return (typeof s === "string" && s.length > 0) ? s : `${fallbackKey}_${idx}`;
    }

    async function loadTextures(gltf, binBuf, loadTextureBitmap) {
        const textures = {};
        const texIndexToId = [];

        for (let ti = 0; ti < (gltf.textures?.length || 0); ti++) {
            const t = gltf.textures[ti];
            const imgDef = gltf.images[t.source];
            const sampler = t.sampler != null ? gltf.samplers?.[t.sampler] : null;
            const wrap = sampler?.wrapS === 33071 ? "clamp" : "repeat";
            const name = nameOr(t.name, "texture", ti);

            const fingerprint = imgDef.bufferView != null
                ? (() => {
                    const bv = gltf.bufferViews[imgDef.bufferView];
                    const start = bv.byteOffset || 0;
                    const end = start + bv.byteLength;
                    return new Uint8Array(binBuf, start, end - start);
                })()
                : String(imgDef.uri || "");

            const bitmap = await loadTextureBitmap(ti);
            const raw = {
                name,
                bitmap,
                width: bitmap.width,
                height: bitmap.height,
                channels: 4,
                wrap,
            };
            const baseId = createID("tex", name, wrap, bitmap.width, bitmap.height, fingerprint);
            const id = upsertById(textures, baseId, { id: baseId, ...raw });
            texIndexToId[ti] = id;
        }

        return { textures, texIndexToId };
    }

    function loadMaterials(gltf, texIndexToId) {
        const materials = {};
        const matIndexToId = [];

        for (let mi = 0; mi < (gltf.materials?.length || 0); mi++) {
            const m = gltf.materials[mi];
            const pbr = m.pbrMetallicRoughness || {};

            const albedoTex = pbr.baseColorTexture?.index != null ? texIndexToId[pbr.baseColorTexture.index] ?? null : null;
            const metalRoughTex = pbr.metallicRoughnessTexture?.index != null ? texIndexToId[pbr.metallicRoughnessTexture.index] ?? null : null;
            const normalTex = m.normalTexture?.index != null ? texIndexToId[m.normalTexture.index] ?? null : null;
            const emissiveTex = m.emissiveTexture?.index != null ? texIndexToId[m.emissiveTexture.index] ?? null : null;
            const name = nameOr(m.name, "material", mi);

            const raw = {
                name,
                albedoTex,
                metalRoughTex,
                normalTex,
                emissiveTex,
            };
            const baseId = createID("mat", name, albedoTex, metalRoughTex, normalTex, emissiveTex);
            const id = upsertById(materials, baseId, { id: baseId, ...raw });
            matIndexToId[mi] = id;
        }

        return { materials, matIndexToId };
    }

    function loadSkeleton(skin, gltf, readAccessor) {
        const joints = skin.joints;
        const n = joints.length;
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

        const visited = new Uint8Array(n);
        const topo = [];
        for (let i = 0; i < n; i++) if (parents[i] === -1) { topo.push(i); visited[i] = 1; }
        for (let qi = 0; qi < topo.length; qi++) {
            const node = gltf.nodes[joints[topo[qi]]];
            if (!node.children) continue;
            for (const c of node.children) {
                const ji = nodeToJoint[c];
                if (ji != null && !visited[ji]) {
                    visited[ji] = 1;
                    topo.push(ji);
                }
            }
        }
        for (let i = 0; i < n; i++) if (!visited[i]) topo.push(i);

        const remap = new Int32Array(n);
        for (let ni = 0; ni < n; ni++) remap[topo[ni]] = ni;

        const ibm = skin.inverseBindMatrices != null ? readAccessor(skin.inverseBindMatrices) : null;
        const bones = new Array(n);

        for (let ni = 0; ni < n; ni++) {
            const oldIdx = topo[ni];
            const node = gltf.nodes[joints[oldIdx]];
            const oldP = parents[oldIdx];
            const bone = {
                parent: oldP === -1 ? -1 : remap[oldP],
                name: node.name || `Bone_${ni}`,
                localBind: nodeLocalMat(node),
                inverseBind: ibm ? ibm.slice(oldIdx * 16, oldIdx * 16 + 16) : null,
                children: [],
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
        const skeletons = {};
        const skinJointRemaps = [];
        const skinToSkeletonId = [];

        for (let si = 0; si < (gltf.skins?.length || 0); si++) {
            const skin = gltf.skins[si];
            const { bones, jointRemap } = loadSkeleton(skin, gltf, readAccessor);
            const name = nameOr(skin.name, "skeleton", si);
            const raw = { name, bones };
            const baseId = createID("skel", name, bones.map((b) => [b.parent, b.name, b.localBind, b.inverseBind]));
            const id = upsertById(skeletons, baseId, { id: baseId, ...raw });
            skinJointRemaps[si] = jointRemap;
            skinToSkeletonId[si] = id;
        }

        return { skeletons, skinJointRemaps, skinToSkeletonId };
    }

    function readMorphAttribute(prim, attrName, readAccessor, targetCount, vertexCount, width) {
        const out = new Float32Array(targetCount * vertexCount * width);
        for (let ti = 0; ti < targetCount; ti++) {
            const acc = prim.targets[ti][attrName];
            if (acc == null) continue;
            const src = readAccessor(acc);
            out.set(src, ti * vertexCount * width);
        }
        return out;
    }

    function buildMeshAsset(meshIdx, gltf, readAccessor, readIndices, skinJointRemap, matIndexToId) {
        const mesh = gltf.meshes[meshIdx];
        const submeshes = [];

        for (let pi = 0; pi < mesh.primitives.length; pi++) {
            const prim = mesh.primitives[pi];
            const attr = prim.attributes || {};

            const pos = readAccessor(attr.POSITION);
            const nor = readAccessor(attr.NORMAL);
            const uv = readAccessor(attr.TEXCOORD_0);
            const tang = readAccessor(attr.TANGENT);
            const joints0 = readAccessor(attr.JOINTS_0);
            const weights0 = readAccessor(attr.WEIGHTS_0);
            const vertexCount = pos.length / 3;

            const indicesRaw = readIndices(prim.indices);
            const indices = indicesRaw ? new (indicesRaw.constructor)(indicesRaw) : Uint32Array.from({ length: vertexCount }, (_, i) => i);

            let rigged = null;
            if (joints0 && weights0) {
                const boneIDs = new Float32Array(vertexCount * 4);
                const boneWeights = new Float32Array(vertexCount * 4);
                for (let i = 0; i < vertexCount; i++) {
                    for (let k = 0; k < 4; k++) {
                        const j = joints0[i * 4 + k] | 0;
                        boneIDs[i * 4 + k] = skinJointRemap ? (skinJointRemap[j] ?? j) : j;
                        boneWeights[i * 4 + k] = weights0[i * 4 + k];
                    }
                }
                rigged = { boneIDs, boneWeights };
            }

            let morph = null;
            const morphTargetCount = Array.isArray(prim.targets) ? prim.targets.length : 0;
            if (morphTargetCount > 0) {
                morph = {
                    targetCount: morphTargetCount,
                    dPositions: readMorphAttribute(prim, "POSITION", readAccessor, morphTargetCount, vertexCount, 3),
                };
                const hasN = prim.targets.some((t) => t.NORMAL != null);
                const hasT = prim.targets.some((t) => t.TANGENT != null);
                if (hasN) morph.dNormals = readMorphAttribute(prim, "NORMAL", readAccessor, morphTargetCount, vertexCount, 3);
                if (hasT) morph.dTangents = readMorphAttribute(prim, "TANGENT", readAccessor, morphTargetCount, vertexCount, 4);
            }

            const materialID = prim.material != null ? (matIndexToId[prim.material] ?? null) : null;
            const name = `${nameOr(mesh.name, "mesh", meshIdx)}_prim_${pi}`;

            const material = materialID
                ? { materialID }
                : { albedoTex: null };

            const submeshRaw = {
                name,
                static: {
                    positions: pos,
                    normals: nor,
                    uvs: uv,
                    tangents: tang,
                },
                rigged,
                morph,
                indices,
                material,
            };
            const baseId = createID("sub", name, pos, indices, materialID, morphTargetCount);
            submeshes.push({ id: baseId, ...submeshRaw });
        }

        const morphTargetNames = mesh.extras?.targetNames
            ? mesh.extras.targetNames.slice()
            : (mesh.weights ? mesh.weights.map((_, i) => `Target_${i}`) : []);
        const defaultMorphWeights = mesh.weights ? Float32Array.from(mesh.weights) : null;

        const meshRaw = {
            name: nameOr(mesh.name, "mesh", meshIdx),
            submeshes,
            morphTargetNames,
            defaultMorphWeights,
        };
        const baseId = createID("mesh", meshRaw.name, submeshes.map((s) => s.id), morphTargetNames);
        return { id: baseId, ...meshRaw };
    }

    function loadMeshes(gltf, readAccessor, readIndices, skinJointRemaps, matIndexToId) {
        const meshes = {};
        const meshIndexToId = [];

        const meshToSkin = new Int32Array(gltf.meshes?.length || 0).fill(-1);
        for (const node of (gltf.nodes || [])) {
            if (node.mesh != null && node.skin != null) meshToSkin[node.mesh] = node.skin;
        }

        for (let mi = 0; mi < (gltf.meshes?.length || 0); mi++) {
            const skinIdx = meshToSkin[mi];
            const remap = skinIdx >= 0 ? skinJointRemaps[skinIdx] : null;
            const mesh = buildMeshAsset(mi, gltf, readAccessor, readIndices, remap, matIndexToId);
            const id = upsertById(meshes, mesh.id, mesh);
            meshIndexToId[mi] = id;
        }

        return { meshes, meshIndexToId };
    }

    function buildSceneData(gltf, modelName, meshIndexToId, skinToSkeletonId) {
        const nodes = [];
        let idCounter = 0;
        const nextNodeId = (name) => createID("node", name || "node", idCounter++);

        const pushNode = (name, parent, components = {}) => {
            const id = nextNodeId(name);
            nodes.push({ id, name, parent, children: [], components });
            return id;
        };

        const rootId = pushNode(modelName || "Model_Root", null, {
            Transform: { local: new Float32Array(16), world: new Float32Array(16) },
        });
        nodes[0].components.Transform.local[0] = 1;
        nodes[0].components.Transform.local[5] = 1;
        nodes[0].components.Transform.local[10] = 1;
        nodes[0].components.Transform.local[15] = 1;
        nodes[0].components.Transform.world.set(nodes[0].components.Transform.local);

        const skinToHolderNodeId = {};
        if ((gltf.skins?.length || 0) > 0) {
            const skeletonRootId = pushNode("Skeletons", rootId, {
                Transform: { local: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), world: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) },
            });
            for (let si = 0; si < gltf.skins.length; si++) {
                const skelId = skinToSkeletonId[si] ?? null;
                const holderId = pushNode(nameOr(gltf.skins[si].name, "Skeleton", si), skeletonRootId, {
                    Transform: { local: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]), world: new Float32Array([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) },
                    Skeleton: { skeletonID: skelId, bones: null },
                });
                skinToHolderNodeId[si] = holderId;
            }
        }

        const isJoint = new Uint8Array(gltf.nodes?.length || 0);
        for (const skin of gltf.skins || []) {
            for (const j of skin.joints) isJoint[j] = 1;
        }

        const gltfNodeToSceneNodeId = new Array(gltf.nodes?.length || 0).fill(null);
        const hasParent = new Uint8Array(gltf.nodes?.length || 0);

        for (let gi = 0; gi < (gltf.nodes?.length || 0); gi++) {
            if (isJoint[gi]) continue;

            const gn = gltf.nodes[gi];
            const local = nodeLocalMat(gn);
            const components = {
                Transform: { local, world: new Float32Array(local) },
            };

            if (gn.mesh != null) {
                components.MeshRenderer = {
                    active: true,
                    meshID: meshIndexToId[gn.mesh] ?? null,
                    shaderID: null,
                    skeletonNode: gn.skin != null ? (skinToHolderNodeId[gn.skin] ?? null) : null,
                    morphWeights: null,
                };
            }

            const sceneNodeId = pushNode(gn.name || `Node_${gi}`, null, components);
            gltfNodeToSceneNodeId[gi] = sceneNodeId;
        }

        const indexById = new Map(nodes.map((n, i) => [n.id, i]));
        const setParent = (childId, parentId) => {
            const ci = indexById.get(childId);
            const pi = indexById.get(parentId);
            if (ci == null || pi == null) return;
            nodes[ci].parent = parentId;
            if (!nodes[pi].children.includes(childId)) nodes[pi].children.push(childId);
        };

        // Existing helper nodes.
        for (const n of nodes) {
            if (n.parent != null) setParent(n.id, n.parent);
        }

        // glTF hierarchy.
        for (let gi = 0; gi < (gltf.nodes?.length || 0); gi++) {
            const parentId = gltfNodeToSceneNodeId[gi];
            if (!parentId) continue;

            const gn = gltf.nodes[gi];
            if (!gn.children) continue;
            for (const cgi of gn.children) {
                const childId = gltfNodeToSceneNodeId[cgi];
                if (!childId) continue;
                setParent(childId, parentId);
                hasParent[cgi] = 1;
            }
        }

        // Unparented glTF render nodes attach under scene root.
        for (let gi = 0; gi < (gltf.nodes?.length || 0); gi++) {
            const nodeId = gltfNodeToSceneNodeId[gi];
            if (!nodeId) continue;
            if (hasParent[gi]) continue;

            const ni = indexById.get(nodeId);
            if (ni == null) continue;
            if (nodes[ni].parent != null) continue;
            setParent(nodeId, rootId);
        }

        const sceneID = createID("scene", modelName, nodes.map((n) => n.id));
        return { id: sceneID, name: modelName, rootId, nodes };
    }

    async function load(url) {
        const { gltf, binBuf, readAccessor, readIndices, loadTextureBitmap } = await parseGLB(url);

        let name = String(url || "Scene");
        const slash = name.lastIndexOf("/");
        if (slash >= 0) name = name.slice(slash + 1);
        const dot = name.lastIndexOf(".");
        if (dot >= 0) name = name.slice(0, dot);

        const { textures, texIndexToId } = await loadTextures(gltf, binBuf, loadTextureBitmap);
        const { materials, matIndexToId } = loadMaterials(gltf, texIndexToId);
        const { skeletons, skinJointRemaps, skinToSkeletonId } = loadSkeletons(gltf, readAccessor);
        const { meshes, meshIndexToId } = loadMeshes(gltf, readAccessor, readIndices, skinJointRemaps, matIndexToId);
        const scene = buildSceneData(gltf, name, meshIndexToId, skinToSkeletonId);

        return {
            id: createID("payload", url, Object.keys(meshes), Object.keys(textures), Object.keys(materials), Object.keys(skeletons), scene.id),
            name,
            meshes,
            textures,
            materials,
            skeletons,
            scene,
        };
    }

    window.ZLoader = { load };
    window.EzLoader = window.ZLoader;
})();

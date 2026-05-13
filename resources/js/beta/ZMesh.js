/* ZMesh
By Asciiz

GPU mesh + skeleton helpers moved out of ZCanvas to keep canvas core agnostic.
*/

(function () {
    if (typeof window.ZBuffer !== "function") throw new Error("[ZMesh] ZBuffer is required");
    if (!window.ZMath?.M4) throw new Error("[ZMesh] ZMath is required");
    const ZBuffer = window.ZBuffer;
    const ZMath = window.ZMath;

    class _c {
        static warn(TAG, ...a) { console.warn(TAG, ...a); return false; }
        static err(TAG, ...a) { console.error(TAG, ...a); }
    }

    class _is {
        static str = v => typeof v === "string" && v.trim() !== "";
        static obj = v => typeof v === "object" && v !== null;
    }

    function resolveTransform(out, spec) {
        if (!spec) {
            ZMath.M4.identity(out);
            return out;
        }

        if ((ArrayBuffer.isView(spec) || Array.isArray(spec)) && spec.length >= 16) {
            out.set(spec);
            return out;
        }

        const pos = spec.position ?? spec.pos ?? [0, 0, 0];
        const rotQ = spec.rotation ?? spec.rotQ ?? spec.quaternion ?? [0, 0, 0, 1];
        const scale = spec.scale ?? [1, 1, 1];
        const euler = spec.euler ?? null;

        if (euler) {
            const qx = ZMath.Q.fromAxisAngle(ZMath.V3.RIGHT, euler[0] ?? 0);
            const qy = ZMath.Q.fromAxisAngle(ZMath.V3.UP, euler[1] ?? 0);
            const qz = ZMath.Q.fromAxisAngle(ZMath.V3.FORWARD, euler[2] ?? 0);
            const qxy = ZMath.Q.mul(qy, qx);
            const q = ZMath.Q.mul(qz, qxy);
            ZMath.M4.fromTRS(pos, q, scale, out);
            return out;
        }

        ZMath.M4.fromTRS(pos, rotQ, scale, out);
        return out;
    }

    class ZMesh {
        static #NEXT_ID = 1;

        static VertexType = Object.freeze({
            Static: 0,
            Rig: 1 << 0,
            Morph: 1 << 1,
            Color: 1 << 2,
        });

        static STATIC_STRIDE_FLOATS = 12; // pos3 nrm3 uv2 tang4
        static RIGGED_STRIDE_FLOATS = 8;  // boneID4 boneW4
        static COLOR_STRIDE_FLOATS = 4;   // rgba
        static MORPH_STRIDE_FLOATS = 12;  // dPos4 dNrml4 dTang4

        #gl;
        #id;
        #submeshes = [];
        #morphTargetInfos = [];
        #morphNameMap = new Map();
        #vaoCache = new Map();

        #buffers = {
            vstatic: null,
            vrigged: null,
            vcolor: null,
            vmorph: null,
            index: null,
            instModel0: null,
            instModel1: null,
            instModel2: null,
            instModel3: null,
            instData0: null,
            instData1: null,
            instData2: null,
            instData3: null,
            instOffset: null,
            instMorphWeight: null,
            instTint: null,
            instBoneBase: null,
        };

        #instanceCount = 0;
        #instanceData = {
            model0: null,
            model1: null,
            model2: null,
            model3: null,
            data0: null,
            data1: null,
            data2: null,
            data3: null,
            offset: null,
            morphWeight: null,
            tint: null,
            boneBase: null,
        };

        #indexType = null;
        #indexCount = 0;

        #abMin = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
        #abMax = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];

        static create(gl, desc = {}) {
            return new ZMesh(gl, desc);
        }

        constructor(gl, desc = {}) {
            if (!gl) throw new Error("[ZMesh] WebGL context is required");
            this.#gl = gl;
            this.#id = ZMesh.#NEXT_ID++;
            this.#buildFromDesc(desc);
        }

        get id() { return this.#id; }
        get gl() { return this.#gl; }
        get submeshes() { return this.#submeshes.slice(); }
        get morphTargetInfos() { return this.#morphTargetInfos.slice(); }
        get morphTargetCount() { return this.#morphTargetInfos.length; }
        get morphTargetNames() { return this.#morphTargetInfos.map((it, i) => String(it?.name ?? `Target_${i}`)); }
        get instanceCount() { return this.#instanceCount; }
        get ABmin() { return this.#abMin.slice(); }
        get ABmax() { return this.#abMax.slice(); }

        #buildFromDesc(desc) {
            const subInput = Array.isArray(desc.submeshes) ? desc.submeshes : [];
            if (subInput.length === 0) throw new Error("[ZMesh] submeshes are required");

            this.#morphTargetInfos = this.#normalizeMorphInfos(desc.morphTargets ?? desc.morphTargetInfos ?? []);

            const parsed = subInput.map((s, i) => this.#parseSubmeshDesc(s, i));
            let maxMorphTargetCount = 0;
            for (const p of parsed) if (p.morphTargetCount > maxMorphTargetCount) maxMorphTargetCount = p.morphTargetCount;

            if (this.#morphTargetInfos.length === 0 && maxMorphTargetCount > 0) {
                for (let i = 0; i < maxMorphTargetCount; i++) {
                    this.#morphTargetInfos.push({ name: `Target_${i}` });
                }
            }
            this.#rebuildMorphNameMap();

            let totalStatic = 0;
            let totalRig = 0;
            let totalColor = 0;
            let totalMorph = 0;
            let totalIndex = 0;
            let maxIndexValue = 0;

            for (const p of parsed) {
                p.vstaticOffset = totalStatic; totalStatic += p.vertexCount;
                if (p.hasRig) { p.vriggedOffset = totalRig; totalRig += p.vertexCount; }
                if (p.hasColor) { p.vcolorOffset = totalColor; totalColor += p.vertexCount; }
                if (p.hasMorph) { p.vmorphOffset = totalMorph; totalMorph += p.vertexCount * p.morphTargetCount; }
                p.indexOffset = totalIndex; totalIndex += p.indexCount;
                if (p.maxIndex > maxIndexValue) maxIndexValue = p.maxIndex;
            }

            const idxNeed32 = maxIndexValue > 65535;
            this.#indexType = idxNeed32 ? this.#gl.UNSIGNED_INT : this.#gl.UNSIGNED_SHORT;

            const staticRaw = new Float32Array(totalStatic * ZMesh.STATIC_STRIDE_FLOATS);
            const rigRaw = totalRig > 0 ? new Float32Array(totalRig * ZMesh.RIGGED_STRIDE_FLOATS) : null;
            const colorRaw = totalColor > 0 ? new Float32Array(totalColor * ZMesh.COLOR_STRIDE_FLOATS) : null;
            const morphRaw = totalMorph > 0 ? new Float32Array(totalMorph * ZMesh.MORPH_STRIDE_FLOATS) : null;
            const indexRaw = idxNeed32 ? new Uint32Array(totalIndex) : new Uint16Array(totalIndex);

            this.#submeshes.length = 0;
            this.#abMin = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
            this.#abMax = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];

            for (const p of parsed) {
                staticRaw.set(p.staticData, p.vstaticOffset * ZMesh.STATIC_STRIDE_FLOATS);
                if (p.hasRig) rigRaw.set(p.rigData, p.vriggedOffset * ZMesh.RIGGED_STRIDE_FLOATS);
                if (p.hasColor) colorRaw.set(p.colorData, p.vcolorOffset * ZMesh.COLOR_STRIDE_FLOATS);
                if (p.hasMorph) morphRaw.set(p.morphData, p.vmorphOffset * ZMesh.MORPH_STRIDE_FLOATS);
                indexRaw.set(p.indexData, p.indexOffset);

                this.#abMin[0] = Math.min(this.#abMin[0], p.abMin[0]);
                this.#abMin[1] = Math.min(this.#abMin[1], p.abMin[1]);
                this.#abMin[2] = Math.min(this.#abMin[2], p.abMin[2]);
                this.#abMax[0] = Math.max(this.#abMax[0], p.abMax[0]);
                this.#abMax[1] = Math.max(this.#abMax[1], p.abMax[1]);
                this.#abMax[2] = Math.max(this.#abMax[2], p.abMax[2]);

                this.#submeshes.push({
                    name: p.name,
                    material: p.material,
                    mode: p.mode,
                    vrtxFlags: p.vrtxFlags,
                    vertexCount: p.vertexCount,
                    indexCount: p.indexCount,
                    mrphTargetCount: p.morphTargetCount,
                    morphTargetIndices: p.morphTargetIndices,
                    vstaticOffset: p.vstaticOffset,
                    vriggedOffset: p.vriggedOffset,
                    vcolorOffset: p.vcolorOffset,
                    vmorphOffset: p.vmorphOffset,
                    indexOffset: p.indexOffset,
                    ABmin: p.abMin,
                    ABmax: p.abMax,
                });
            }

            this.#indexCount = totalIndex;
            this.#createBuffers(staticRaw, rigRaw, colorRaw, morphRaw, indexRaw);
            this.#setupInstances(desc.instances ?? {});
        }

        #normalizeMorphInfos(list) {
            if (!Array.isArray(list)) return [];
            const out = [];
            for (let i = 0; i < list.length; i++) {
                const it = list[i];
                if (_is.str(it)) out.push({ name: it });
                else if (_is.obj(it)) out.push({ name: _is.str(it.name) ? it.name : `Target_${i}` });
            }
            return out;
        }

        #parseSubmeshDesc(desc, index) {
            const s = _is.obj(desc) ? desc : {};
            const name = _is.str(s.name) ? s.name : `submesh_${index}`;
            const mode = s.mode ?? this.#gl.TRIANGLES;
            const material = _is.obj(s.material) ? { ...s.material } : {};

            const staticData = this.#packStaticData(s.static ?? s.vstatic ?? s.staticData);
            const vertexCount = Math.floor(staticData.length / ZMesh.STATIC_STRIDE_FLOATS);
            if (vertexCount <= 0) throw new Error(`[ZMesh] ${name}: static vertex data is required`);

            const rigData = this.#packRiggedData(s.rig ?? s.rigged ?? s.vrigged ?? s.riggedData, vertexCount);
            const colorData = this.#packColorData(s.color ?? s.vcolor ?? s.colorData, vertexCount);
            const morph = this.#packMorphData(s.morph ?? s.mrph ?? s.morphData, vertexCount);
            const indexData = this.#packIndexData(s.indices ?? s.indx ?? s.indxData);
            const indexCount = indexData.length;
            if (indexCount <= 0) throw new Error(`[ZMesh] ${name}: index data is required`);

            let maxIndex = 0;
            for (let i = 0; i < indexData.length; i++) if (indexData[i] > maxIndex) maxIndex = indexData[i];
            if (maxIndex >= vertexCount) throw new Error(`[ZMesh] ${name}: index out of range for vertex count`);

            const targetRefs = Array.isArray(s.morphTargets)
                ? s.morphTargets.slice()
                : Array.from({ length: morph.targetCount }, (_, i) => i);
            const morphTargetIndices = this.#resolveMorphTargetRefs(targetRefs, morph.targetCount, name);

            const abMin = [Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY, Number.POSITIVE_INFINITY];
            const abMax = [Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY, Number.NEGATIVE_INFINITY];
            for (let i = 0; i < vertexCount; i++) {
                const o = i * ZMesh.STATIC_STRIDE_FLOATS;
                const x = staticData[o + 0], y = staticData[o + 1], z = staticData[o + 2];
                if (x < abMin[0]) abMin[0] = x; if (y < abMin[1]) abMin[1] = y; if (z < abMin[2]) abMin[2] = z;
                if (x > abMax[0]) abMax[0] = x; if (y > abMax[1]) abMax[1] = y; if (z > abMax[2]) abMax[2] = z;
            }

            let vrtxFlags = ZMesh.VertexType.Static;
            if (rigData) vrtxFlags |= ZMesh.VertexType.Rig;
            if (colorData) vrtxFlags |= ZMesh.VertexType.Color;
            if (morph.targetCount > 0) vrtxFlags |= ZMesh.VertexType.Morph;

            return {
                name,
                mode,
                material,
                vertexCount,
                indexCount,
                maxIndex,
                staticData,
                rigData,
                colorData,
                morphData: morph.data,
                morphTargetCount: morph.targetCount,
                morphTargetIndices,
                hasRig: !!rigData,
                hasColor: !!colorData,
                hasMorph: morph.targetCount > 0,
                vrtxFlags,
                vstaticOffset: 0,
                vriggedOffset: 0,
                vcolorOffset: 0,
                vmorphOffset: 0,
                indexOffset: 0,
                indexData,
                abMin,
                abMax,
            };
        }

        #resolveMorphTargetRefs(refs, targetCount, submeshName) {
            if (targetCount === 0) return [];
            const out = [];
            for (let i = 0; i < targetCount; i++) {
                const ref = refs[i];
                if (typeof ref === "number" && Number.isFinite(ref)) out.push(ref | 0);
                else if (_is.str(ref)) out.push(this.#resolveMorphTargetName(ref));
                else out.push(i);
            }
            return out;
        }

        #resolveMorphTargetName(name) {
            const idx = this.#morphTargetInfos.findIndex(it => it.name === name);
            if (idx >= 0) return idx;
            this.#morphTargetInfos.push({ name });
            this.#morphNameMap.set(name, this.#morphTargetInfos.length - 1);
            this.#morphNameMap.set(name.toLowerCase(), this.#morphTargetInfos.length - 1);
            return this.#morphTargetInfos.length - 1;
        }

        #rebuildMorphNameMap() {
            this.#morphNameMap = new Map();
            for (let i = 0; i < this.#morphTargetInfos.length; i++) {
                const name = String(this.#morphTargetInfos[i]?.name ?? `Target_${i}`);
                this.#morphNameMap.set(name, i);
                this.#morphNameMap.set(name.toLowerCase(), i);
            }
        }

        resolveMorphTargetRef(indexOrName) {
            if (typeof indexOrName === "number" && Number.isFinite(indexOrName)) {
                const idx = indexOrName | 0;
                if (idx < 0 || idx >= this.#morphTargetInfos.length) return -1;
                return idx;
            }
            if (typeof indexOrName === "string") {
                const exact = this.#morphNameMap.get(indexOrName);
                if (exact != null) return exact;
                const lower = this.#morphNameMap.get(indexOrName.toLowerCase());
                if (lower != null) return lower;
            }
            return -1;
        }

        #packStaticData(spec) {
            if (spec == null) return new Float32Array(0);
            if (ArrayBuffer.isView(spec) || Array.isArray(spec)) {
                const out = Float32Array.from(spec);
                if (out.length % ZMesh.STATIC_STRIDE_FLOATS !== 0) throw new Error("[ZMesh] static packed data must be stride-12");
                return out;
            }
            if (!_is.obj(spec)) throw new Error("[ZMesh] static data must be packed array or object");

            const pos = spec.positions ?? spec.position ?? spec.pos;
            if (!(ArrayBuffer.isView(pos) || Array.isArray(pos))) throw new Error("[ZMesh] static.positions is required");
            const p = Float32Array.from(pos);
            if (p.length % 3 !== 0) throw new Error("[ZMesh] static.positions must be vec3 list");
            const count = p.length / 3;

            const n = (ArrayBuffer.isView(spec.normals) || Array.isArray(spec.normals)) ? Float32Array.from(spec.normals) : null;
            const uv = (ArrayBuffer.isView(spec.uvs) || Array.isArray(spec.uvs)) ? Float32Array.from(spec.uvs) : null;
            const t = (ArrayBuffer.isView(spec.tangents) || Array.isArray(spec.tangents)) ? Float32Array.from(spec.tangents) : null;

            if (n && n.length !== count * 3) throw new Error("[ZMesh] static.normals size mismatch");
            if (uv && uv.length !== count * 2) throw new Error("[ZMesh] static.uvs size mismatch");
            if (t && t.length !== count * 4) throw new Error("[ZMesh] static.tangents size mismatch");

            const out = new Float32Array(count * ZMesh.STATIC_STRIDE_FLOATS);
            for (let i = 0; i < count; i++) {
                const o = i * ZMesh.STATIC_STRIDE_FLOATS;
                out[o + 0] = p[i * 3 + 0];
                out[o + 1] = p[i * 3 + 1];
                out[o + 2] = p[i * 3 + 2];

                out[o + 3] = n ? n[i * 3 + 0] : 0;
                out[o + 4] = n ? n[i * 3 + 1] : 1;
                out[o + 5] = n ? n[i * 3 + 2] : 0;

                out[o + 6] = uv ? uv[i * 2 + 0] : 0;
                out[o + 7] = uv ? uv[i * 2 + 1] : 0;

                out[o + 8] = t ? t[i * 4 + 0] : 1;
                out[o + 9] = t ? t[i * 4 + 1] : 0;
                out[o + 10] = t ? t[i * 4 + 2] : 0;
                out[o + 11] = t ? t[i * 4 + 3] : 1;
            }
            return out;
        }

        #packRiggedData(spec, vertexCount) {
            if (spec == null) return null;
            if (ArrayBuffer.isView(spec) || Array.isArray(spec)) {
                const out = Float32Array.from(spec);
                if (out.length !== vertexCount * ZMesh.RIGGED_STRIDE_FLOATS) throw new Error("[ZMesh] rigged packed data size mismatch");
                return out;
            }
            if (!_is.obj(spec)) throw new Error("[ZMesh] rigged data must be packed array or object");

            const ids = spec.boneIDs ?? spec.ids ?? spec.bones;
            const ws = spec.boneWeights ?? spec.weights;
            if (!(ArrayBuffer.isView(ids) || Array.isArray(ids))) throw new Error("[ZMesh] rigged.boneIDs is required");
            if (!(ArrayBuffer.isView(ws) || Array.isArray(ws))) throw new Error("[ZMesh] rigged.boneWeights is required");

            const id = Float32Array.from(ids);
            const w = Float32Array.from(ws);
            if (id.length !== vertexCount * 4 || w.length !== vertexCount * 4) throw new Error("[ZMesh] rigged data size mismatch");

            const out = new Float32Array(vertexCount * ZMesh.RIGGED_STRIDE_FLOATS);
            for (let i = 0; i < vertexCount; i++) {
                const o = i * ZMesh.RIGGED_STRIDE_FLOATS;
                out[o + 0] = id[i * 4 + 0];
                out[o + 1] = id[i * 4 + 1];
                out[o + 2] = id[i * 4 + 2];
                out[o + 3] = id[i * 4 + 3];
                out[o + 4] = w[i * 4 + 0];
                out[o + 5] = w[i * 4 + 1];
                out[o + 6] = w[i * 4 + 2];
                out[o + 7] = w[i * 4 + 3];
            }
            return out;
        }

        #packColorData(spec, vertexCount) {
            if (spec == null) return null;
            const src = Float32Array.from(spec);
            if (src.length !== vertexCount * 4) throw new Error("[ZMesh] color data must be rgba per vertex");
            return src;
        }

        #packMorphData(spec, vertexCount) {
            if (spec == null) return { targetCount: 0, data: null };
            if (!_is.obj(spec) && !(ArrayBuffer.isView(spec) || Array.isArray(spec))) {
                throw new Error("[ZMesh] morph data must be object or packed array");
            }

            if (ArrayBuffer.isView(spec) || Array.isArray(spec)) {
                const packed = Float32Array.from(spec);
                if (packed.length % (vertexCount * ZMesh.MORPH_STRIDE_FLOATS) !== 0)
                    throw new Error("[ZMesh] morph packed data size mismatch");
                return { targetCount: packed.length / (vertexCount * ZMesh.MORPH_STRIDE_FLOATS), data: packed };
            }

            const targetCount = Number(spec.targetCount ?? 0) || 0;
            if (targetCount <= 0) return { targetCount: 0, data: null };

            const packed = spec.deltas ?? spec.packed ?? null;
            if (packed != null) {
                const out = Float32Array.from(packed);
                if (out.length !== targetCount * vertexCount * ZMesh.MORPH_STRIDE_FLOATS)
                    throw new Error("[ZMesh] morph.deltas size mismatch");
                return { targetCount, data: out };
            }

            const dPos = spec.dPositions ?? spec.dPos ?? null;
            const dNrml = spec.dNormals ?? spec.dNrml ?? null;
            const dTang = spec.dTangents ?? spec.dTang ?? null;
            if (!dPos) throw new Error("[ZMesh] morph requires dPositions or packed deltas");

            const p = Float32Array.from(dPos);
            const n = dNrml ? Float32Array.from(dNrml) : null;
            const t = dTang ? Float32Array.from(dTang) : null;
            if (p.length !== targetCount * vertexCount * 3) throw new Error("[ZMesh] morph dPositions size mismatch");
            if (n && n.length !== targetCount * vertexCount * 3) throw new Error("[ZMesh] morph dNormals size mismatch");
            if (t && t.length !== targetCount * vertexCount * 4) throw new Error("[ZMesh] morph dTangents size mismatch");

            const out = new Float32Array(targetCount * vertexCount * ZMesh.MORPH_STRIDE_FLOATS);
            for (let ti = 0; ti < targetCount; ti++) {
                for (let vi = 0; vi < vertexCount; vi++) {
                    const o = (ti * vertexCount + vi) * ZMesh.MORPH_STRIDE_FLOATS;
                    const pi = (ti * vertexCount + vi) * 3;
                    const ni = (ti * vertexCount + vi) * 3;
                    const ti4 = (ti * vertexCount + vi) * 4;
                    out[o + 0] = p[pi + 0];
                    out[o + 1] = p[pi + 1];
                    out[o + 2] = p[pi + 2];
                    out[o + 3] = 0;
                    out[o + 4] = n ? n[ni + 0] : 0;
                    out[o + 5] = n ? n[ni + 1] : 0;
                    out[o + 6] = n ? n[ni + 2] : 0;
                    out[o + 7] = 0;
                    out[o + 8] = t ? t[ti4 + 0] : 0;
                    out[o + 9] = t ? t[ti4 + 1] : 0;
                    out[o + 10] = t ? t[ti4 + 2] : 0;
                    out[o + 11] = t ? t[ti4 + 3] : 0;
                }
            }
            return { targetCount, data: out };
        }

        #packIndexData(spec) {
            if (spec == null) return new Uint16Array(0);
            if (spec instanceof Uint32Array) return new Uint32Array(spec);
            if (spec instanceof Uint16Array) return new Uint16Array(spec);
            if (spec instanceof Uint8Array) return new Uint16Array(spec);
            if (Array.isArray(spec)) return Uint32Array.from(spec);
            throw new Error("[ZMesh] indices must be an array or typed array");
        }

        #createBuffers(staticRaw, rigRaw, colorRaw, morphRaw, indexRaw) {
            const gl = this.#gl;
            this.#buffers.vstatic = new ZBuffer(gl, gl.ARRAY_BUFFER, gl.STATIC_DRAW).upload(staticRaw);
            this.#buffers.index = new ZBuffer(gl, gl.ELEMENT_ARRAY_BUFFER, gl.STATIC_DRAW).upload(indexRaw);

            this.#buffers.vrigged = rigRaw ? new ZBuffer(gl, gl.ARRAY_BUFFER, gl.STATIC_DRAW).upload(rigRaw) : null;
            this.#buffers.vcolor = colorRaw ? new ZBuffer(gl, gl.ARRAY_BUFFER, gl.STATIC_DRAW).upload(colorRaw) : null;
            this.#buffers.vmorph = morphRaw ? new ZBuffer(gl, gl.ARRAY_BUFFER, gl.STATIC_DRAW).upload(morphRaw) : null;
        }

        #setupInstances(inst) {
            const spec = _is.obj(inst) ? inst : {};
            const count = Number(spec.count ?? 1) || 1;
            this.#instanceCount = Math.max(1, count);

            const m0 = this.#buildInstanceArray(spec.model0 ?? spec.instModel0, this.#instanceCount, 4, [1, 0, 0, 0]);
            const m1 = this.#buildInstanceArray(spec.model1 ?? spec.instModel1, this.#instanceCount, 4, [0, 1, 0, 0]);
            const m2 = this.#buildInstanceArray(spec.model2 ?? spec.instModel2, this.#instanceCount, 4, [0, 0, 1, 0]);
            const m3 = this.#buildInstanceArray(spec.model3 ?? spec.instModel3, this.#instanceCount, 4, [0, 0, 0, 1]);
            const d0 = this.#buildInstanceArray(spec.data0 ?? spec.instData0, this.#instanceCount, 4, [0, 0, 0, 0]);
            const d1 = this.#buildInstanceArray(spec.data1 ?? spec.instData1, this.#instanceCount, 4, [0, 0, 0, 0]);
            const d2 = this.#buildInstanceArray(spec.data2 ?? spec.instData2, this.#instanceCount, 4, [0, 0, 0, 0]);
            const d3 = this.#buildInstanceArray(spec.data3 ?? spec.instData3, this.#instanceCount, 4, [0, 0, 0, 0]);

            const off = this.#buildInstanceArray(spec.offset ?? spec.offsets, this.#instanceCount, 3, [0, 0, 0]);
            const morph = this.#buildInstanceArray(spec.morphWeight ?? spec.morphWeights, this.#instanceCount, 1, [0]);
            const tint = this.#buildInstanceArray(spec.tint ?? spec.tints, this.#instanceCount, 4, [1, 1, 1, 1]);
            const boneBase = this.#buildInstanceArray(spec.boneBase ?? spec.boneBases, this.#instanceCount, 1, [0]);

            this.#instanceData.model0 = m0;
            this.#instanceData.model1 = m1;
            this.#instanceData.model2 = m2;
            this.#instanceData.model3 = m3;
            this.#instanceData.data0 = d0;
            this.#instanceData.data1 = d1;
            this.#instanceData.data2 = d2;
            this.#instanceData.data3 = d3;
            this.#instanceData.offset = off;
            this.#instanceData.morphWeight = morph;
            this.#instanceData.tint = tint;
            this.#instanceData.boneBase = boneBase;

            const usage = spec.usage ?? this.#gl.DYNAMIC_DRAW;
            this.#buffers.instModel0 = new ZBuffer(this.#gl, this.#gl.ARRAY_BUFFER, usage).upload(m0);
            this.#buffers.instModel1 = new ZBuffer(this.#gl, this.#gl.ARRAY_BUFFER, usage).upload(m1);
            this.#buffers.instModel2 = new ZBuffer(this.#gl, this.#gl.ARRAY_BUFFER, usage).upload(m2);
            this.#buffers.instModel3 = new ZBuffer(this.#gl, this.#gl.ARRAY_BUFFER, usage).upload(m3);
            this.#buffers.instData0 = new ZBuffer(this.#gl, this.#gl.ARRAY_BUFFER, usage).upload(d0);
            this.#buffers.instData1 = new ZBuffer(this.#gl, this.#gl.ARRAY_BUFFER, usage).upload(d1);
            this.#buffers.instData2 = new ZBuffer(this.#gl, this.#gl.ARRAY_BUFFER, usage).upload(d2);
            this.#buffers.instData3 = new ZBuffer(this.#gl, this.#gl.ARRAY_BUFFER, usage).upload(d3);

            // Backward compatibility channels.
            this.#buffers.instOffset = new ZBuffer(this.#gl, this.#gl.ARRAY_BUFFER, usage).upload(off);
            this.#buffers.instMorphWeight = new ZBuffer(this.#gl, this.#gl.ARRAY_BUFFER, usage).upload(morph);
            this.#buffers.instTint = new ZBuffer(this.#gl, this.#gl.ARRAY_BUFFER, usage).upload(tint);
            this.#buffers.instBoneBase = new ZBuffer(this.#gl, this.#gl.ARRAY_BUFFER, usage).upload(boneBase);
        }

        #buildInstanceArray(src, count, width, fallback) {
            const out = new Float32Array(count * width);
            for (let i = 0; i < count; i++) {
                for (let c = 0; c < width; c++) out[i * width + c] = fallback[c] ?? 0;
            }
            if (src == null) return out;
            const input = Float32Array.from(src);
            const n = Math.min(out.length, input.length);
            for (let i = 0; i < n; i++) out[i] = input[i];
            return out;
        }

        updateInstanceChannel(key, data, byteOffset = 0) {
            const k = String(key ?? "");
            const map = {
                instModel0: "instModel0",
                model0: "instModel0",
                instModel1: "instModel1",
                model1: "instModel1",
                instModel2: "instModel2",
                model2: "instModel2",
                instModel3: "instModel3",
                model3: "instModel3",
                instData0: "instData0",
                data0: "instData0",
                instData1: "instData1",
                data1: "instData1",
                instData2: "instData2",
                data2: "instData2",
                instData3: "instData3",
                data3: "instData3",
                instOffset: "instOffset",
                offset: "instOffset",
                instMorphWeight: "instMorphWeight",
                morphWeight: "instMorphWeight",
                instTint: "instTint",
                tint: "instTint",
                instBoneBase: "instBoneBase",
                boneBase: "instBoneBase",
            };
            const id = map[k];
            if (!id) throw new Error(`[ZMesh] unknown instance channel "${key}"`);
            const b = this.#buffers[id];
            if (!b) throw new Error(`[ZMesh] instance buffer "${id}" not allocated`);
            b.uploadSub(data, byteOffset);
            return this;
        }

        setSubmeshMaterial(submeshIndex, material) {
            const sub = this.#submeshes[submeshIndex];
            if (!sub) throw new Error(`[ZMesh] submesh ${submeshIndex} does not exist`);
            sub.material = _is.obj(material) ? { ...material } : {};
            return this;
        }

        getDrawCfg(submeshIndex = 0) {
            const sub = this.#submeshes[submeshIndex];
            if (!sub) throw new Error(`[ZMesh] submesh ${submeshIndex} does not exist`);
            const ibytes = this.#indexType === this.#gl.UNSIGNED_INT ? 4 : 2;
            return {
                indexed: true,
                mode: sub.mode ?? this.#gl.TRIANGLES,
                indexType: this.#indexType,
                indexOffset: sub.indexOffset * ibytes,
                indexCount: sub.indexCount,
            };
        }

        createVAO(shader, options = {}) {
            const gl = this.#gl;
            if (!shader || !Array.isArray(shader.vertexInputs)) throw new Error("[ZMesh] createVAO() requires compiled ZShader");
            const submeshIndex = Number(options.submeshIndex ?? 0) | 0;
            const sub = this.#submeshes[submeshIndex];
            if (!sub) throw new Error(`[ZMesh] submesh ${submeshIndex} does not exist`);

            const cacheEnabled = options.cache !== false;
            const cacheKey = `${this.#id}|${shader.id ?? "shader"}|sub:${submeshIndex}|m:${options.morphTarget ?? 0}`;
            if (cacheEnabled) {
                const cached = this.#vaoCache.get(cacheKey);
                if (cached) return cached;
            }

            const vao = gl.createVertexArray();
            if (!vao) throw new Error("[ZMesh] createVertexArray failed");
            gl.bindVertexArray(vao);
            try {
                this.#buffers.index.bind();
                for (const decl of shader.vertexInputs) {
                    if (!decl || decl.loc == null || decl.loc < 0) continue;
                    const bound = this.#wireDefaultFixedAttr(decl, sub, options.morphTarget ?? 0);
                    if (!bound) this.#wireConstantAttribute(decl.loc, decl.default);
                }
            } finally {
                gl.bindVertexArray(null);
            }

            if (cacheEnabled) this.#vaoCache.set(cacheKey, vao);
            return vao;
        }

        #wireDefaultFixedAttr(decl, sub, morphRef) {
            const gl = this.#gl;
            const name = decl.name;

            const S = ZMesh.STATIC_STRIDE_FLOATS * 4;
            const R = ZMesh.RIGGED_STRIDE_FLOATS * 4;
            const C = ZMesh.COLOR_STRIDE_FLOATS * 4;
            const M = ZMesh.MORPH_STRIDE_FLOATS * 4;

            if (name === "a_position") return this.#wireBuffer(this.#buffers.vstatic, decl.loc, 3, gl.FLOAT, S, sub.vstaticOffset * S + 0, 0);
            if (name === "a_normal") return this.#wireBuffer(this.#buffers.vstatic, decl.loc, 3, gl.FLOAT, S, sub.vstaticOffset * S + 12, 0);
            if (name === "a_uv") return this.#wireBuffer(this.#buffers.vstatic, decl.loc, 2, gl.FLOAT, S, sub.vstaticOffset * S + 24, 0);
            if (name === "a_tangent") return this.#wireBuffer(this.#buffers.vstatic, decl.loc, 4, gl.FLOAT, S, sub.vstaticOffset * S + 32, 0);

            if (name === "a_boneID") {
                if (!this.#buffers.vrigged || !(sub.vrtxFlags & ZMesh.VertexType.Rig)) return false;
                return this.#wireBuffer(this.#buffers.vrigged, decl.loc, 4, gl.FLOAT, R, sub.vriggedOffset * R + 0, 0);
            }
            if (name === "a_boneWeight") {
                if (!this.#buffers.vrigged || !(sub.vrtxFlags & ZMesh.VertexType.Rig)) return false;
                return this.#wireBuffer(this.#buffers.vrigged, decl.loc, 4, gl.FLOAT, R, sub.vriggedOffset * R + 16, 0);
            }
            if (name === "a_color") {
                if (!this.#buffers.vcolor || !(sub.vrtxFlags & ZMesh.VertexType.Color)) return false;
                return this.#wireBuffer(this.#buffers.vcolor, decl.loc, 4, gl.FLOAT, C, sub.vcolorOffset * C + 0, 0);
            }

            if (name === "a_morphPos" || name === "a_morphNrml" || name === "a_morphTang") {
                if (!this.#buffers.vmorph || !(sub.vrtxFlags & ZMesh.VertexType.Morph) || sub.mrphTargetCount <= 0) return false;
                const targetSlot = this.#resolveSubmeshMorphSlot(sub, morphRef);
                const base = (sub.vmorphOffset + targetSlot * sub.vertexCount) * M;
                if (name === "a_morphPos") return this.#wireBuffer(this.#buffers.vmorph, decl.loc, 3, gl.FLOAT, M, base + 0, 0);
                if (name === "a_morphNrml") return this.#wireBuffer(this.#buffers.vmorph, decl.loc, 3, gl.FLOAT, M, base + 16, 0);
                return this.#wireBuffer(this.#buffers.vmorph, decl.loc, 4, gl.FLOAT, M, base + 32, 0);
            }

            if (name === "a_instOffset") return this.#wireBuffer(this.#buffers.instOffset, decl.loc, 3, gl.FLOAT, 12, 0, 1);
            if (name === "a_instMorphWeight") return this.#wireBuffer(this.#buffers.instMorphWeight, decl.loc, 1, gl.FLOAT, 4, 0, 1);
            if (name === "a_instTint") return this.#wireBuffer(this.#buffers.instTint, decl.loc, 4, gl.FLOAT, 16, 0, 1);
            if (name === "a_instBoneBase") return this.#wireBuffer(this.#buffers.instBoneBase, decl.loc, 1, gl.FLOAT, 4, 0, 1);
            if (name === "a_instModel0") return this.#wireBuffer(this.#buffers.instModel0, decl.loc, 4, gl.FLOAT, 16, 0, 1);
            if (name === "a_instModel1") return this.#wireBuffer(this.#buffers.instModel1, decl.loc, 4, gl.FLOAT, 16, 0, 1);
            if (name === "a_instModel2") return this.#wireBuffer(this.#buffers.instModel2, decl.loc, 4, gl.FLOAT, 16, 0, 1);
            if (name === "a_instModel3") return this.#wireBuffer(this.#buffers.instModel3, decl.loc, 4, gl.FLOAT, 16, 0, 1);
            if (name === "a_instData0") return this.#wireBuffer(this.#buffers.instData0, decl.loc, 4, gl.FLOAT, 16, 0, 1);
            if (name === "a_instData1") return this.#wireBuffer(this.#buffers.instData1, decl.loc, 4, gl.FLOAT, 16, 0, 1);
            if (name === "a_instData2") return this.#wireBuffer(this.#buffers.instData2, decl.loc, 4, gl.FLOAT, 16, 0, 1);
            if (name === "a_instData3") return this.#wireBuffer(this.#buffers.instData3, decl.loc, 4, gl.FLOAT, 16, 0, 1);

            return false;
        }

        #resolveSubmeshMorphSlot(sub, ref) {
            if (sub.mrphTargetCount <= 0) return 0;
            if (typeof ref === "number" && Number.isFinite(ref)) {
                const n = ref | 0;
                if (n >= 0 && n < sub.mrphTargetCount) return n;
                const slot = sub.morphTargetIndices.indexOf(n);
                if (slot >= 0) return slot;
                throw new Error(`[ZMesh] morph target ${ref} not linked on submesh ${sub.name}`);
            }
            if (_is.str(ref)) {
                const global = this.#morphTargetInfos.findIndex(it => it.name === ref);
                if (global < 0) throw new Error(`[ZMesh] morph target "${ref}" does not exist`);
                const slot = sub.morphTargetIndices.indexOf(global);
                if (slot >= 0) return slot;
                throw new Error(`[ZMesh] morph target "${ref}" not linked on submesh ${sub.name}`);
            }
            return 0;
        }

        #wireBuffer(buffer, loc, size, type, stride, offset, divisor) {
            if (!buffer || loc == null || loc < 0) return false;
            const gl = this.#gl;
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer.handle);
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, size, type, false, stride, offset);
            if (gl.vertexAttribDivisor) gl.vertexAttribDivisor(loc, divisor ?? 0);
            return true;
        }

        #wireConstantAttribute(loc, value) {
            const gl = this.#gl;
            gl.disableVertexAttribArray(loc);
            const v = Array.isArray(value) || ArrayBuffer.isView(value) ? value : [0, 0, 0, 1];
            gl.vertexAttrib4f(loc, v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 1);
        }

        clearVAOCache() {
            const gl = this.#gl;
            for (const vao of this.#vaoCache.values()) gl.deleteVertexArray(vao);
            this.#vaoCache.clear();
            return this;
        }

        rebuild(nextDesc) {
            return new ZMesh(this.#gl, nextDesc);
        }

        delete() {
            this.clearVAOCache();
            for (const k of Object.keys(this.#buffers)) {
                const b = this.#buffers[k];
                if (b) b.delete();
                this.#buffers[k] = null;
            }
            this.#submeshes.length = 0;
            this.#morphTargetInfos.length = 0;
            this.#morphNameMap.clear();
            this.#instanceCount = 0;
            this.#indexCount = 0;
            this.#indexType = null;
        }
    }

    class ZSkeleton {
        id = null;
        name = null;
        bones = [];
        map = new Map();

        constructor(desc = {}) {
            this.id = desc.id ?? null;
            this.name = desc.name ?? null;
            const srcBones = Array.isArray(desc.bones) ? desc.bones : [];
            const globalBind = [];
            this.bones = srcBones.map((b, i) => {
                const parent = Number(b?.parent ?? -1) | 0;

                const localBind = ZMath.M4();
                resolveTransform(localBind, b?.localBind ?? null);
                const gb = ZMath.M4();
                if (parent < 0 || !globalBind[parent]) gb.set(localBind);
                else ZMath.M4.mul(globalBind[parent], localBind, gb);
                globalBind[i] = gb;

                let inverseBind = ZMath.M4();
                if ((ArrayBuffer.isView(b?.inverseBind) || Array.isArray(b?.inverseBind)) && b.inverseBind.length >= 16) {
                    inverseBind.set(b.inverseBind);
                } else {
                    if (!ZMath.M4.invert(gb, inverseBind)) ZMath.M4.identity(inverseBind);
                }

                return {
                    parent,
                    name: typeof b?.name === "string" ? b.name : `Bone_${i}`,
                    localBind,
                    inverseBind,
                };
            });

            this.map = new Map();
            for (let i = 0; i < this.bones.length; i++) {
                const name = this.bones[i].name;
                this.map.set(name, i);
                this.map.set(name.toLowerCase(), i);
            }
        }
    }


    window.ZMesh = ZMesh;
    window.ZSkeleton = ZSkeleton;
    window.EzSkeleton3D = ZSkeleton;
})();

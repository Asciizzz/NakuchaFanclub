/* EzMesh
By Asciiz

WebGPU mesh resource wrapper.
*/

(function () {
    class EzMesh {
        static VertexType = Object.freeze({
            Static: 0,
            Rig: 1 << 0,
            Morph: 1 << 1,
            Color: 1 << 2,
        });

        static STRIDE_FLOATS = 19; // pos3, nrm3, uv2, boneID4, boneWeight4, morphPos3
        static STRIDE_BYTES = EzMesh.STRIDE_FLOATS * 4;

        id = null;
        name = null;
        submeshes = [];
        morphTargetNames = [];
        defaultMorphWeights = null;

        #device = null;
        #buffers = [];

        static create(device, meshData = {}) {
            return new EzMesh(device, meshData);
        }

        constructor(device, meshData = {}) {
            if (!device) throw new Error("[EzMesh] GPUDevice is required");
            if (!meshData?.id) throw new Error("[EzMesh] meshData.id is required");

            this.#device = device;
            this.id = String(meshData.id);
            this.name = String(meshData.name ?? meshData.id);
            this.morphTargetNames = Array.isArray(meshData.morphTargetNames) ? meshData.morphTargetNames.slice() : [];
            this.defaultMorphWeights = meshData.defaultMorphWeights
                ? Float32Array.from(meshData.defaultMorphWeights)
                : null;
            this.#build(meshData);
        }

        get morphTargetCount() {
            return this.morphTargetNames.length;
        }

        resolveMorphTargetRef(indexOrName) {
            if (typeof indexOrName === "number" && Number.isFinite(indexOrName)) {
                const idx = indexOrName | 0;
                if (idx < 0 || idx >= this.morphTargetCount) return -1;
                return idx;
            }
            if (typeof indexOrName === "string") {
                const idx = this.morphTargetNames.indexOf(indexOrName);
                return idx >= 0 ? idx : -1;
            }
            return -1;
        }

        destroy() {
            for (const b of this.#buffers) {
                try { b.destroy?.(); }
                catch (_error) {}
            }
            this.#buffers.length = 0;
            this.submeshes.length = 0;
            return this;
        }

        #pushBuffer(buffer) {
            this.#buffers.push(buffer);
            return buffer;
        }

        #build(meshData = {}) {
            const submeshes = Array.isArray(meshData.submeshes) ? meshData.submeshes : [];
            this.submeshes = submeshes.map((sub, i) => this.#buildSubmesh(sub, i));
        }

        #buildSubmesh(submesh = {}, index = 0) {
            const name = String(submesh.name ?? `${this.name}_sub_${index}`);
            const staticData = submesh.static ?? {};

            const positions = Float32Array.from(staticData.positions ?? []);
            const normals = Float32Array.from(staticData.normals ?? []);
            const uvs = Float32Array.from(staticData.uvs ?? []);
            if (positions.length % 3 !== 0) throw new Error(`[EzMesh] ${name}: positions must be vec3 packed`);
            const vertexCount = positions.length / 3;

            const boneIDs = Float32Array.from(submesh.rigged?.boneIDs ?? new Float32Array(vertexCount * 4));
            const boneWeights = Float32Array.from(submesh.rigged?.boneWeights ?? new Float32Array(vertexCount * 4));
            const hasRig = !!submesh.rigged && boneIDs.length === vertexCount * 4 && boneWeights.length === vertexCount * 4;

            const morph = submesh.morph ?? null;
            const morphTargetCount = Number(morph?.targetCount ?? 0) | 0;
            const hasMorph = morphTargetCount > 0;
            const morphPos = hasMorph
                ? Float32Array.from((morph?.dPositions ?? []).slice(0, vertexCount * 3))
                : new Float32Array(vertexCount * 3);

            const packed = new Float32Array(vertexCount * EzMesh.STRIDE_FLOATS);
            for (let vi = 0; vi < vertexCount; vi++) {
                const o = vi * EzMesh.STRIDE_FLOATS;
                const p3 = vi * 3;
                const n3 = vi * 3;
                const uv2 = vi * 2;
                const b4 = vi * 4;

                packed[o + 0] = positions[p3 + 0] ?? 0;
                packed[o + 1] = positions[p3 + 1] ?? 0;
                packed[o + 2] = positions[p3 + 2] ?? 0;

                packed[o + 3] = normals.length >= vertexCount * 3 ? normals[n3 + 0] : 0;
                packed[o + 4] = normals.length >= vertexCount * 3 ? normals[n3 + 1] : 1;
                packed[o + 5] = normals.length >= vertexCount * 3 ? normals[n3 + 2] : 0;

                packed[o + 6] = uvs.length >= vertexCount * 2 ? uvs[uv2 + 0] : 0;
                packed[o + 7] = uvs.length >= vertexCount * 2 ? uvs[uv2 + 1] : 0;

                packed[o + 8] = hasRig ? boneIDs[b4 + 0] : 0;
                packed[o + 9] = hasRig ? boneIDs[b4 + 1] : 0;
                packed[o + 10] = hasRig ? boneIDs[b4 + 2] : 0;
                packed[o + 11] = hasRig ? boneIDs[b4 + 3] : 0;

                packed[o + 12] = hasRig ? boneWeights[b4 + 0] : 0;
                packed[o + 13] = hasRig ? boneWeights[b4 + 1] : 0;
                packed[o + 14] = hasRig ? boneWeights[b4 + 2] : 0;
                packed[o + 15] = hasRig ? boneWeights[b4 + 3] : 0;

                packed[o + 16] = morphPos[p3 + 0] ?? 0;
                packed[o + 17] = morphPos[p3 + 1] ?? 0;
                packed[o + 18] = morphPos[p3 + 2] ?? 0;
            }

            const vertexBuffer = this.#pushBuffer(this.#device.createBuffer({
                label: `${this.id}:${name}:VB`,
                size: packed.byteLength,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            }));
            this.#device.queue.writeBuffer(vertexBuffer, 0, packed.buffer, packed.byteOffset, packed.byteLength);

            const indicesInput = submesh.indices ?? [];
            let maxIndex = 0;
            for (const v of indicesInput) if ((v | 0) > maxIndex) maxIndex = v | 0;
            const use32 = maxIndex > 65535;
            const indices = use32 ? Uint32Array.from(indicesInput) : Uint16Array.from(indicesInput);
            const indexBuffer = this.#pushBuffer(this.#device.createBuffer({
                label: `${this.id}:${name}:IB`,
                size: indices.byteLength,
                usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
            }));
            this.#device.queue.writeBuffer(indexBuffer, 0, indices.buffer, indices.byteOffset, indices.byteLength);

            let vrtxFlags = EzMesh.VertexType.Static;
            if (hasRig) vrtxFlags |= EzMesh.VertexType.Rig;
            if (hasMorph) vrtxFlags |= EzMesh.VertexType.Morph;

            return {
                name,
                material: { ...(submesh.material ?? {}) },
                vertexCount,
                indexCount: indices.length,
                indexFormat: use32 ? "uint32" : "uint16",
                vertexBuffer,
                indexBuffer,
                vrtxFlags,
                morphTargetCount,
            };
        }
    }

    window.EzMesh = EzMesh;
})();


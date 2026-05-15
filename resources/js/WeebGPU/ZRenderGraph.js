/* ZRenderGraph
By Asciiz

WebGPU scene draw coordinator for EzScene + EzAssets.
*/

(function () {
    if (!window.AzWGPU?.AzFrame) throw new Error("[ZRenderGraph] AzWGPU is required");
    if (!window.Azm?.M4) throw new Error("[ZRenderGraph] Azm.M4 is required");
    if (typeof window.Skeleton !== "function") throw new Error("[ZRenderGraph] Skeleton is required");

    const {
        AzFrame,
        AzPass,
    } = window.AzWGPU;

    const MAX_BONES = 128;
    const OBJECT_UBO_SIZE = 128 + (MAX_BONES * 64);
    const SCENE_UBO_SIZE = 80;

    class ZRenderGraph {
        device = null;
        context = null;
        assets = null;
        camera = null;

        #sceneBuffer = null;
        #objectBuffer = null;
        #sceneBindGroupCache = new WeakMap(); // pipeline -> bindGroup
        #materialBindGroupCache = new WeakMap(); // pipeline -> Map(textureView, bindGroup)
        #linearSampler = null;
        #whiteTexture = null;
        #whiteView = null;
        #sceneScratch = new Float32Array(SCENE_UBO_SIZE / 4);
        #objectScratch = new Float32Array(OBJECT_UBO_SIZE / 4);

        constructor(opts = {}) {
            this.setRuntime(opts);
        }

        setRuntime(runtime = {}) {
            if (Object.prototype.hasOwnProperty.call(runtime, "device")) this.device = runtime.device ?? null;
            if (Object.prototype.hasOwnProperty.call(runtime, "context")) this.context = runtime.context ?? null;
            if (Object.prototype.hasOwnProperty.call(runtime, "assets")) this.assets = runtime.assets ?? null;
            if (Object.prototype.hasOwnProperty.call(runtime, "camera")) this.camera = runtime.camera ?? null;
            this.#ensureGPUObjects();
            return this;
        }

        async render(scene, opts = {}) {
            if (!scene || !this.device || !this.context || !this.assets) return;

            const camera = opts.camera ?? this.camera ?? scene.camera ?? null;
            if (!camera) return;

            this.#ensureGPUObjects();
            this.#writeSceneUniform(camera);

            const draws = this.#collectDraws(scene);
            if (draws.length <= 0) return;

            await AzFrame.with(this.device, (encoder) => {
                const renderPass = opts.renderPassDescriptor ?? {
                    colorAttachments: [{
                        view: this.context.getCurrentTexture().createView(),
                        clearValue: opts.clearColor ?? { r: 0, g: 0, b: 0, a: 0 },
                        loadOp: opts.colorLoadOp ?? "clear",
                        storeOp: opts.colorStoreOp ?? "store",
                    }],
                    depthStencilAttachment: {
                        view: opts.depthView ?? scene?.assets?.context?.depthView ?? this.#safeDepthView(),
                        depthClearValue: 1,
                        depthLoadOp: "clear",
                        depthStoreOp: "store",
                    },
                };
                if (!renderPass.depthStencilAttachment?.view) delete renderPass.depthStencilAttachment;

                AzPass.withRender(encoder, renderPass, (pass) => {
                    for (const draw of draws) this.#drawOne(pass, draw, camera, scene, opts);
                });
            }, {
                label: opts.label ?? "ZRenderGraph.Frame",
                wait: opts.wait ?? false,
            });
        }

        #safeDepthView() {
            if (this.assets?.context?.depthView) return this.assets.context.depthView;
            return null;
        }

        #ensureGPUObjects() {
            if (!this.device) return;

            if (!this.#sceneBuffer) {
                this.#sceneBuffer = this.device.createBuffer({
                    label: "ZRenderGraph.SceneUBO",
                    size: SCENE_UBO_SIZE,
                    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                });
            }
            if (!this.#objectBuffer) {
                this.#objectBuffer = this.device.createBuffer({
                    label: "ZRenderGraph.ObjectUBO",
                    size: OBJECT_UBO_SIZE,
                    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
                });
            }
            if (!this.#linearSampler) {
                this.#linearSampler = this.device.createSampler({
                    magFilter: "linear",
                    minFilter: "linear",
                    mipmapFilter: "linear",
                    addressModeU: "repeat",
                    addressModeV: "repeat",
                });
            }
            if (!this.#whiteTexture) {
                const tex = this.device.createTexture({
                    label: "ZRenderGraph.WhiteFallback",
                    size: [1, 1, 1],
                    format: "rgba8unorm",
                    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
                });
                this.device.queue.writeTexture(
                    { texture: tex },
                    new Uint8Array([255, 255, 255, 255]),
                    { bytesPerRow: 4 },
                    { width: 1, height: 1, depthOrArrayLayers: 1 },
                );
                this.#whiteTexture = tex;
                this.#whiteView = tex.createView();
            }
        }

        #writeSceneUniform(camera) {
            const sceneU = this.#sceneScratch;
            sceneU.fill(0);
            const view = camera.view;
            const proj = camera.projection;
            const vp = Azm.M4.mul(proj, view, Azm.M4());
            sceneU.set(vp, 0);
            sceneU[16] = camera.position[0] ?? 0;
            sceneU[17] = camera.position[1] ?? 0;
            sceneU[18] = camera.position[2] ?? 0;
            sceneU[19] = 1;
            this.device.queue.writeBuffer(this.#sceneBuffer, 0, sceneU.buffer, sceneU.byteOffset, SCENE_UBO_SIZE);
        }

        #collectDraws(scene) {
            const draws = [];
            for (const [nodeId, node] of scene.traverse(scene.rootId, null, false)) {
                const mr = node.get("MeshRenderer") ?? node.get("meshRenderer");
                if (!(mr instanceof window.MeshRenderer) || !mr.active || !mr.meshID) continue;

                const mesh = this.assets.getMesh(mr.meshID);
                if (!mesh || !Array.isArray(mesh.submeshes) || mesh.submeshes.length <= 0) continue;

                const shaderIDs = Array.from(mr.shaderKeys?.values?.() ?? []);
                const shaderID = shaderIDs[0] ?? null;
                const shader = shaderID ? this.assets.getShader(shaderID) : null;
                if (!shader?.pipeline) continue;

                const tx = scene.getComponent(nodeId, "Transform") ?? scene.getComponent(nodeId, "transform");
                if (!tx?.world) continue;

                draws.push({
                    nodeId,
                    node,
                    mesh,
                    meshRenderer: mr,
                    shader,
                    transform: tx,
                });
            }
            return draws;
        }

        #sceneBindGroupFor(shader) {
            const pipeline = shader.pipeline;
            let bg = this.#sceneBindGroupCache.get(pipeline);
            if (bg) return bg;

            const layout = pipeline.getBindGroupLayout(0);
            bg = this.device.createBindGroup({
                label: "ZRenderGraph.SceneBG",
                layout,
                entries: [{ binding: 0, resource: { buffer: this.#sceneBuffer } }],
            });
            this.#sceneBindGroupCache.set(pipeline, bg);
            return bg;
        }

        #materialBindGroupFor(shader, textureView) {
            const pipeline = shader.pipeline;
            let map = this.#materialBindGroupCache.get(pipeline);
            if (!map) {
                map = new Map();
                this.#materialBindGroupCache.set(pipeline, map);
            }

            const key = textureView ?? this.#whiteView;
            let bg = map.get(key);
            if (bg) return bg;

            const layout = pipeline.getBindGroupLayout(1);
            bg = this.device.createBindGroup({
                label: "ZRenderGraph.MaterialBG",
                layout,
                entries: [
                    { binding: 0, resource: { buffer: this.#objectBuffer } },
                    { binding: 1, resource: this.#linearSampler },
                    { binding: 2, resource: key },
                ],
            });
            map.set(key, bg);
            return bg;
        }

        #writeObjectUniform(draw, submesh) {
            const out = this.#objectScratch;
            out.fill(0);

            const world = draw.transform.world;
            out.set(world, 0);

            const slot0 = draw.meshRenderer.getSlot(0) ?? new Float32Array([1, 1, 1, 1]);
            out.set(slot0, 16);

            const resolvedMaterial = this.#resolveMaterial(submesh);
            const albedoColorRaw = resolvedMaterial?.albedoColor;
            const albedoColor = (ArrayBuffer.isView(albedoColorRaw) || Array.isArray(albedoColorRaw))
                ? albedoColorRaw
                : [1, 1, 1, 1];
            out[20] = Number(albedoColor[0] ?? 1) || 1;
            out[21] = Number(albedoColor[1] ?? 1) || 1;
            out[22] = Number(albedoColor[2] ?? 1) || 1;
            out[23] = Number(albedoColor[3] ?? 1) || 1;

            const rigBit = window.EzMesh?.VertexType?.Rig ?? (1 << 0);
            const morphBit = window.EzMesh?.VertexType?.Morph ?? (1 << 1);
            const colorBit = window.EzMesh?.VertexType?.Color ?? (1 << 2);
            const flags = Number(submesh?.vrtxFlags ?? 0) | 0;
            out[24] = (flags & rigBit) ? 1 : 0;
            out[25] = (flags & morphBit) ? 1 : 0;
            out[26] = (flags & colorBit) ? 1 : 0;
            out[27] = 0;

            const primaryMorph = draw.meshRenderer.getPrimaryMorph?.()
                ?? { index: 0, weight: draw.meshRenderer.morphWeights?.[0] ?? 0 };
            out[28] = Number(primaryMorph.weight ?? 0) || 0;

            const skelComp = draw.meshRenderer.skeletonComponent;
            if (skelComp instanceof window.Skeleton) {
                if (skelComp.skeletonAsset) skelComp.use(skelComp.skeletonAsset);
                const palette = skelComp.buildPalette(MAX_BONES);
                if (palette?.length) out.set(palette, 32);
            }

            this.device.queue.writeBuffer(this.#objectBuffer, 0, out.buffer, out.byteOffset, OBJECT_UBO_SIZE);
        }

        #resolveMaterial(submesh) {
            const material = submesh?.material ?? {};
            const linkedID = material.materialID ?? null;
            if (!linkedID) return material;
            const linked = this.assets?.getMaterial?.(linkedID) ?? null;
            if (!linked) return material;
            return {
                ...linked,
                ...material,
                albedoTex: material.albedoTex ?? linked.albedoTex ?? null,
                albedoColor: material.albedoColor ?? linked.albedoColor ?? [1, 1, 1, 1],
            };
        }

        #drawOne(pass, draw, camera, scene, opts) {
            const shader = draw.shader;
            const sceneBG = this.#sceneBindGroupFor(shader);
            pass.setPipeline(shader.pipeline);
            pass.setBindGroup(0, sceneBG);

            for (const submesh of draw.mesh.submeshes) {
                this.#writeObjectUniform(draw, submesh);

                const resolvedMaterial = this.#resolveMaterial(submesh);
                const texID = resolvedMaterial?.albedoTex ?? null;
                const tex = texID ? this.assets.getTexture(texID) : null;
                const texView = tex?.gpu?.view ?? this.#whiteView;
                const matBG = this.#materialBindGroupFor(shader, texView);
                pass.setBindGroup(1, matBG);

                pass.setVertexBuffer(0, submesh.vertexBuffer);
                pass.setIndexBuffer(submesh.indexBuffer, submesh.indexFormat);
                pass.drawIndexed(submesh.indexCount, 1, 0, 0, 0);
            }
        }
    }

    window.ZRenderGraph = ZRenderGraph;
})();

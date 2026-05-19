import AzWGPU from "../../AzLib/AzWGPU.js";
import WrBackendBase from "./BackendBase.js";
import { wrPackMesh } from "../Core/MeshPacking.js";
import { wrNormalizeRenderCfg, wrRenderCfgKey } from "../Core/RenderConfig.js";

const WR_GPU_VERTEX_FORMAT = Object.freeze({
    float32: "float32",
    float32x2: "float32x2",
    float32x3: "float32x3",
    float32x4: "float32x4",
});

const WR_SCENE_UBO_BYTES = 80;
const WR_OBJECT_UBO_BYTES = 8320;
const WR_DEPTH_FORMAT = "depth24plus";
const WR_ALPHA_BLEND = Object.freeze({
    color: Object.freeze({
        srcFactor: "src-alpha",
        dstFactor: "one-minus-src-alpha",
        operation: "add",
    }),
    alpha: Object.freeze({
        srcFactor: "one",
        dstFactor: "one-minus-src-alpha",
        operation: "add",
    }),
});

function wrDepthCompareWgpu(compare, depthTest) {
    if (!depthTest) return "always";
    const key = String(compare ?? "less").trim().toLowerCase();
    if (key === "never") return "never";
    if (key === "less") return "less";
    if (key === "equal") return "equal";
    if (key === "less-equal" || key === "lequal") return "less-equal";
    if (key === "greater") return "greater";
    if (key === "greater-equal" || key === "gequal") return "greater-equal";
    if (key === "not-equal" || key === "notequal") return "not-equal";
    if (key === "always") return "always";
    return "less";
}

function wrNumberOr(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function wrColor4(value, fallback = [1, 1, 1, 1]) {
    const src = (ArrayBuffer.isView(value) || Array.isArray(value)) ? value : fallback;
    return [
        wrNumberOr(src?.[0], fallback[0]),
        wrNumberOr(src?.[1], fallback[1]),
        wrNumberOr(src?.[2], fallback[2]),
        wrNumberOr(src?.[3], fallback[3]),
    ];
}

function wrResolveSubmeshMaterial(meshAsset, submeshIndex, assets) {
    const submesh = Array.isArray(meshAsset?.submeshes) ? meshAsset.submeshes[submeshIndex] : null;
    const rawMaterial = (submesh && typeof submesh.material === "object") ? submesh.material : {};
    const materialID = rawMaterial?.materialID ?? null;

    let merged = rawMaterial;
    if (materialID != null && assets?.getMaterial) {
        const linked = assets.getMaterial(materialID);
        if (linked && typeof linked === "object") {
            merged = {
                ...linked,
                ...rawMaterial,
            };
            if (rawMaterial.albedoTex == null && linked.albedoTex != null) merged.albedoTex = linked.albedoTex;
            if (rawMaterial.albedoColor == null && linked.albedoColor != null) merged.albedoColor = linked.albedoColor;
        }
    }

    const hasRig = !!(submesh?.rigged?.boneIDs && submesh?.rigged?.boneWeights);
    const hasMorph = wrNumberOr(submesh?.morph?.targetCount, 0) > 0;
    return {
        albedoColor: wrColor4(merged?.albedoColor, [1, 1, 1, 1]),
        albedoTex: merged?.albedoTex == null ? null : String(merged.albedoTex),
        hasRig,
        hasMorph,
    };
}

function wrAddBinding(bindingMap, groupIndex, bindingIndex) {
    if (!bindingMap.has(groupIndex)) {
        bindingMap.set(groupIndex, new Set());
    }
    bindingMap.get(groupIndex).add(bindingIndex);
}

function wrParseWgslBindings(source, outMap) {
    const text = String(source ?? "");
    const groupThenBinding = /@group\s*\(\s*(\d+)\s*\)\s*@binding\s*\(\s*(\d+)\s*\)/g;
    const bindingThenGroup = /@binding\s*\(\s*(\d+)\s*\)\s*@group\s*\(\s*(\d+)\s*\)/g;

    let match = groupThenBinding.exec(text);
    while (match) {
        wrAddBinding(outMap, Number(match[1]), Number(match[2]));
        match = groupThenBinding.exec(text);
    }

    match = bindingThenGroup.exec(text);
    while (match) {
        wrAddBinding(outMap, Number(match[2]), Number(match[1]));
        match = bindingThenGroup.exec(text);
    }
}

function wrCollectShaderBindings(shaderAsset) {
    const bindingMap = new Map();
    wrParseWgslBindings(shaderAsset?.resolved?.vertex?.wgsl ?? shaderAsset?.vertex?.wgsl ?? "", bindingMap);
    wrParseWgslBindings(shaderAsset?.resolved?.fragment?.wgsl ?? shaderAsset?.fragment?.wgsl ?? "", bindingMap);
    return bindingMap;
}

function wrMulM4(a, b) {
    const out = new Float32Array(16);
    const a00 = a[0], a01 = a[1], a02 = a[2], a03 = a[3];
    const a10 = a[4], a11 = a[5], a12 = a[6], a13 = a[7];
    const a20 = a[8], a21 = a[9], a22 = a[10], a23 = a[11];
    const a30 = a[12], a31 = a[13], a32 = a[14], a33 = a[15];
    let b0; let b1; let b2; let b3;

    b0 = b[0]; b1 = b[1]; b2 = b[2]; b3 = b[3];
    out[0] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[1] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[2] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[3] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[4]; b1 = b[5]; b2 = b[6]; b3 = b[7];
    out[4] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[5] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[6] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[7] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[8]; b1 = b[9]; b2 = b[10]; b3 = b[11];
    out[8] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[9] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[10] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[11] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;

    b0 = b[12]; b1 = b[13]; b2 = b[14]; b3 = b[15];
    out[12] = b0 * a00 + b1 * a10 + b2 * a20 + b3 * a30;
    out[13] = b0 * a01 + b1 * a11 + b2 * a21 + b3 * a31;
    out[14] = b0 * a02 + b1 * a12 + b2 * a22 + b3 * a32;
    out[15] = b0 * a03 + b1 * a13 + b2 * a23 + b3 * a33;
    return out;
}

export class WrBackendWGPU extends WrBackendBase {
    constructor(canvas, options = {}) {
        super(canvas, options);
        this.adapter = null;
        this.device = null;
        this.context = null;
        this.format = null;
        this.report = {};
        this.#encoder = null;
        this.#textureView = null;
        this.#depthTexture = null;
        this.#depthView = null;
        this.#depthWidth = 0;
        this.#depthHeight = 0;
        this.#shaderCache = new Map();
        this.#meshCache = new Map();
        this.#pipelineCache = new Map();
        this.#warned = new Set();
        this.#sceneUniformBuffer = null;
        this.#objectUniformBuffer = null;
        this.#sceneScratch = new Float32Array(WR_SCENE_UBO_BYTES / 4);
        this.#objectScratch = new Float32Array(WR_OBJECT_UBO_BYTES / 4);
        this.#sceneBindGroupCache = new Map();
        this.#objectBindGroupCache = new Map();
        this.#textureCache = new Map();
        this.#fallbackSampler = null;
        this.#fallbackTexture = null;
        this.#fallbackTextureView = null;
    }

    get kind() { return "webgpu"; }

    async init() {
        if (!this.canvas) throw new Error("[WrBackendWGPU] canvas is required");

        const pick = await AzWGPU.Adapter.pickBest(this.options.pickBest ?? {});
        const adapter = pick.adapter ?? pick;
        const device = await AzWGPU.Device.create(adapter, this.options.device ?? {});
        const format = this.options.format ?? AzWGPU.Format.preferredCanvas();
        const context = AzWGPU.Context.create(device, this.canvas, {
            ...this.options.context,
            format,
        });

        this.adapter = adapter;
        this.device = device;
        this.context = context;
        this.format = format;
        this.ready = true;
        this.report = {
            score: pick.score ?? null,
            request: pick.request ?? null,
            adapterCapabilities: AzWGPU.Adapter.getCapabilities(adapter),
            limits: AzWGPU.Limits.inspect(adapter),
            features: Array.from(adapter.features ?? []),
            format,
        };
        return this;
    }

    resize() {
        if (!this.ready || !this.context || !this.device) return;
        AzWGPU.Context.reconfigure(this.context, {
            device: this.device,
            format: this.format,
            alphaMode: this.options.context?.alphaMode ?? "premultiplied",
        });
        this.#releaseDepthTarget();
    }

    beginFrame(frameCtx = {}) {
        if (!this.ready) return;
        this.#encoder = AzWGPU.Command.createEncoder(this.device, "WrFrame");
        this.#textureView = this.context.getCurrentTexture().createView();
        this.#frameCtx = frameCtx;
    }

    executeRenderQueue(queue = null) {
        if (!this.ready || !this.#encoder || !this.#textureView) return;

        const frameRenderCfg = wrNormalizeRenderCfg(
            queue?.renderCfg ?? this.#frameCtx?.renderCfg ?? null
        );
        const clear = WrBackendBase.normalizeClearColor(
            frameRenderCfg.clearColor
        );
        const queueNeedsDepth = this.#queueNeedsDepth(queue, frameRenderCfg);
        const depthView = queueNeedsDepth ? this.#ensureDepthTarget() : null;

        const pass = AzWGPU.Pass.beginRender(this.#encoder, {
            colorAttachments: [{
                view: this.#textureView,
                clearValue: clear,
                loadOp: frameRenderCfg.clearColorEnabled ? "clear" : "load",
                storeOp: "store",
            }],
            depthStencilAttachment: depthView ? {
                view: depthView,
                depthClearValue: frameRenderCfg.clearDepth,
                depthLoadOp: frameRenderCfg.clearDepthEnabled ? "clear" : "load",
                depthStoreOp: "store",
            } : undefined,
        });

        const assets = queue?.assets;
        const draws = Array.isArray(queue?.draws) ? queue.draws : [];
        if (assets && draws.length > 0) {
            const camera = queue.camera ?? null;
            this.#updateSceneUniform(camera);
            for (const draw of draws) {
                const shaderId = draw.shaderID;
                if (!shaderId) continue;
                const shaderAsset = assets.getShader(shaderId);
                if (!shaderAsset) continue;

                const shaderState = this.#ensureShader(shaderId, shaderAsset);
                if (!shaderState?.ok) continue;

                const meshAsset = assets.getMesh(draw.meshID);
                if (!meshAsset) continue;
                const meshGpu = this.#ensureMesh(draw.meshID, meshAsset);
                if (!meshGpu || meshGpu.submeshes.length <= 0) continue;

                const renderCfg = wrNormalizeRenderCfg(draw.renderCfg ?? shaderAsset.renderCfg ?? frameRenderCfg);
                const pipeline = this.#ensurePipeline(shaderId, shaderAsset, shaderState, renderCfg);
                if (!pipeline) continue;

                pass.setPipeline(pipeline);
                const requiresSceneGroup = this.#shaderUsesGroup(shaderState, 0);
                const sceneBindGroup = this.#ensureSceneBindGroup(shaderId, pipeline, shaderState);
                if (requiresSceneGroup) {
                    if (!sceneBindGroup) continue;
                    pass.setBindGroup(0, sceneBindGroup);
                }

                const requiresObjectGroup = this.#shaderUsesGroup(shaderState, 1);
                for (let submeshIndex = 0; submeshIndex < meshGpu.submeshes.length; submeshIndex++) {
                    const submesh = meshGpu.submeshes[submeshIndex];
                    const materialState = wrResolveSubmeshMaterial(meshAsset, submeshIndex, assets);
                    this.#updateObjectUniform(draw, materialState);
                    if (requiresObjectGroup) {
                        const objectBindGroup = this.#ensureObjectBindGroup(
                            shaderId,
                            pipeline,
                            shaderState,
                            materialState.albedoTex,
                            assets
                        );
                        if (!objectBindGroup) continue;
                        pass.setBindGroup(1, objectBindGroup);
                    }

                    pass.setVertexBuffer(0, submesh.vertexBuffer);
                    pass.setIndexBuffer(submesh.indexBuffer, submesh.indexFormat);
                    pass.drawIndexed(submesh.indexCount, 1, 0, 0, 0);
                }
            }
        }

        AzWGPU.Pass.end(pass);
    }

    endFrame() {
        if (!this.ready || !this.#encoder) return;
        const commandBuffer = AzWGPU.Command.finish(this.#encoder);
        AzWGPU.Command.submit(this.device, [commandBuffer]);
        this.#encoder = null;
        this.#textureView = null;
    }

    destroy() {
        if (!this.ready) return;
        try { AzWGPU.Context.unconfigure(this.context); }
        catch (_error) {}
        this.ready = false;
        this.context = null;
        this.device = null;
        this.adapter = null;
        this.#shaderCache.clear();
        this.#meshCache.clear();
        this.#pipelineCache.clear();
        this.#warned.clear();
        this.#sceneBindGroupCache.clear();
        this.#objectBindGroupCache.clear();
        this.#releaseDepthTarget();
        for (const textureState of this.#textureCache.values()) {
            if (textureState?.texture) textureState.texture.destroy();
        }
        this.#textureCache.clear();
        if (this.#sceneUniformBuffer) this.#sceneUniformBuffer.destroy();
        if (this.#objectUniformBuffer) this.#objectUniformBuffer.destroy();
        if (this.#fallbackTexture) this.#fallbackTexture.destroy();
        this.#sceneUniformBuffer = null;
        this.#objectUniformBuffer = null;
        this.#fallbackTexture = null;
        this.#fallbackTextureView = null;
        this.#fallbackSampler = null;
    }

    getCapabilities() { return this.report; }

    #warnOnce(key, message) {
        if (this.#warned.has(key)) return;
        this.#warned.add(key);
        console.warn(message);
    }

    #ensureShader(shaderId, shaderAsset) {
        const cached = this.#shaderCache.get(shaderId);
        if (cached) return cached;

        const state = { ok: false, vertexModule: null, fragmentModule: null, bindingMap: new Map() };
        try {
            state.bindingMap = wrCollectShaderBindings(shaderAsset);
            state.vertexModule = AzWGPU.Shader.create(this.device, {
                code: shaderAsset.resolved?.vertex?.wgsl ?? shaderAsset.vertex?.wgsl ?? "",
                label: `${shaderId}:vs`,
            });
            state.fragmentModule = AzWGPU.Shader.create(this.device, {
                code: shaderAsset.resolved?.fragment?.wgsl ?? shaderAsset.fragment?.wgsl ?? "",
                label: `${shaderId}:fs`,
            });
            state.ok = true;
        } catch (error) {
            state.error = String(error?.message ?? error);
            this.#warnOnce(`shader:${shaderId}`, `[WrBackendWGPU] shader create failed for "${shaderId}": ${state.error}`);
        }

        this.#shaderCache.set(shaderId, state);
        return state;
    }

    #ensurePipeline(shaderId, shaderAsset, shaderState, renderCfg) {
        const cfg = wrNormalizeRenderCfg(renderCfg);
        const cacheKey = `${shaderId}|${this.format}|${wrRenderCfgKey(cfg)}`;
        const cached = this.#pipelineCache.get(cacheKey);
        if (cached) return cached;

        try {
            const needsDepth = cfg.depthTest || cfg.depthWrite;
            const attrs = (shaderAsset.vertexLayout?.attributes ?? []).map((attr) => ({
                shaderLocation: attr.location,
                offset: attr.offset,
                format: WR_GPU_VERTEX_FORMAT[attr.format] ?? attr.format,
            }));
            const pipeline = AzWGPU.Pipeline.createRender(this.device, {
                label: `Wr:${cacheKey}`,
                layout: "auto",
                vertex: {
                    module: shaderState.vertexModule,
                    entryPoint: "wr_vs_main",
                    buffers: [{
                        arrayStride: shaderAsset.vertexLayout?.stride ?? 76,
                        attributes: attrs,
                    }],
                },
                fragment: {
                    module: shaderState.fragmentModule,
                    entryPoint: "wr_fs_main",
                    targets: [{
                        format: this.format,
                        blend: cfg.blend ? WR_ALPHA_BLEND : undefined,
                    }],
                },
                primitive: {
                    topology: "triangle-list",
                    cullMode: cfg.cull,
                },
                depthStencil: needsDepth ? {
                    format: WR_DEPTH_FORMAT,
                    depthWriteEnabled: cfg.depthWrite,
                    depthCompare: wrDepthCompareWgpu(cfg.depthCompare, cfg.depthTest),
                } : undefined,
            });
            this.#pipelineCache.set(cacheKey, pipeline);
            return pipeline;
        } catch (error) {
            this.#warnOnce(`pipeline:${cacheKey}`, `[WrBackendWGPU] pipeline create failed for "${cacheKey}": ${String(error?.message ?? error)}`);
            return null;
        }
    }

    #ensureMesh(meshId, meshAsset) {
        const cached = this.#meshCache.get(meshId);
        if (cached) return cached;

        const packedSubmeshes = wrPackMesh(meshAsset);
        const out = { submeshes: [] };

        for (const packed of packedSubmeshes) {
            const vertexBuffer = AzWGPU.Buffer.createMapped(this.device, {
                label: `Wr:${meshId}:vb`,
                size: packed.vertexData.byteLength,
                usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
            }, packed.vertexData);

            const indexBuffer = AzWGPU.Buffer.createMapped(this.device, {
                label: `Wr:${meshId}:ib`,
                size: packed.indexData.byteLength,
                usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
            }, packed.indexData);

            out.submeshes.push({
                vertexBuffer,
                indexBuffer,
                indexCount: packed.indexCount,
                indexFormat: packed.indexFormat,
            });
        }

        this.#meshCache.set(meshId, out);
        return out;
    }

    #ensureSceneUniformBuffer() {
        if (this.#sceneUniformBuffer) return this.#sceneUniformBuffer;
        this.#sceneUniformBuffer = AzWGPU.Buffer.create(this.device, {
            label: "WrSceneUBO",
            size: WR_SCENE_UBO_BYTES,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        return this.#sceneUniformBuffer;
    }

    #ensureObjectUniformBuffer() {
        if (this.#objectUniformBuffer) return this.#objectUniformBuffer;
        this.#objectUniformBuffer = AzWGPU.Buffer.create(this.device, {
            label: "WrObjectUBO",
            size: WR_OBJECT_UBO_BYTES,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
        });
        return this.#objectUniformBuffer;
    }

    #updateSceneUniform(camera) {
        const sceneBuffer = this.#ensureSceneUniformBuffer();
        this.#sceneScratch.fill(0);

        if (camera?.projection && camera?.view) {
            const vp = wrMulM4(camera.projection, camera.view);
            this.#sceneScratch.set(vp, 0);
        }
        if (camera?.position) {
            this.#sceneScratch[16] = Number(camera.position[0] ?? 0) || 0;
            this.#sceneScratch[17] = Number(camera.position[1] ?? 0) || 0;
            this.#sceneScratch[18] = Number(camera.position[2] ?? 0) || 0;
            this.#sceneScratch[19] = 1;
        }

        AzWGPU.Buffer.write(this.device, sceneBuffer, this.#sceneScratch, 0);
    }

    #updateObjectUniform(draw, materialState = null) {
        const objectBuffer = this.#ensureObjectUniformBuffer();
        this.#objectScratch.fill(0);

        const model = draw?.modelMatrix;
        if (model && (ArrayBuffer.isView(model) || Array.isArray(model)) && model.length >= 16) {
            this.#objectScratch.set(model.subarray ? model.subarray(0, 16) : model.slice(0, 16), 0);
        } else {
            this.#objectScratch[0] = 1;
            this.#objectScratch[5] = 1;
            this.#objectScratch[10] = 1;
            this.#objectScratch[15] = 1;
        }

        this.#objectScratch[16] = 1;
        this.#objectScratch[17] = 1;
        this.#objectScratch[18] = 1;
        this.#objectScratch[19] = 1;
        const color = materialState?.albedoColor ?? [1, 1, 1, 1];
        this.#objectScratch[20] = wrNumberOr(color[0], 1);
        this.#objectScratch[21] = wrNumberOr(color[1], 1);
        this.#objectScratch[22] = wrNumberOr(color[2], 1);
        this.#objectScratch[23] = wrNumberOr(color[3], 1);
        this.#objectScratch[24] = materialState?.hasRig ? 1 : 0;
        this.#objectScratch[25] = materialState?.hasMorph ? 1 : 0;
        this.#objectScratch[26] = 0;
        this.#objectScratch[27] = 0;
        this.#objectScratch[28] = 0;
        this.#objectScratch[29] = 0;
        this.#objectScratch[30] = 0;
        this.#objectScratch[31] = 0;

        AzWGPU.Buffer.write(this.device, objectBuffer, this.#objectScratch, 0);
    }

    #shaderUsesGroup(shaderState, groupIndex) {
        return (shaderState?.bindingMap?.get(groupIndex)?.size ?? 0) > 0;
    }

    #buildBindGroupEntries(shaderId, shaderState, groupIndex, resourceByBinding, warnKeyPrefix) {
        const requiredBindings = shaderState?.bindingMap?.get(groupIndex);
        if (!requiredBindings || requiredBindings.size <= 0) return [];

        const ordered = Array.from(requiredBindings).sort((a, b) => a - b);
        const entries = [];
        for (const bindingIndex of ordered) {
            if (!resourceByBinding.has(bindingIndex)) {
                this.#warnOnce(
                    `${warnKeyPrefix}:${shaderId}:g${groupIndex}:b${bindingIndex}`,
                    `[WrBackendWGPU] missing resource for "${shaderId}" at group ${groupIndex}, binding ${bindingIndex}; draw skipped`
                );
                return null;
            }
            entries.push({
                binding: bindingIndex,
                resource: resourceByBinding.get(bindingIndex),
            });
        }
        return entries;
    }

    #ensureSceneBindGroup(shaderId, pipeline, shaderState) {
        const key = `${shaderId}|scene`;
        const cached = this.#sceneBindGroupCache.get(key);
        if (cached) return cached;
        if (!this.#shaderUsesGroup(shaderState, 0)) return null;

        const sceneBuffer = this.#ensureSceneUniformBuffer();
        const entries = this.#buildBindGroupEntries(
            shaderId,
            shaderState,
            0,
            new Map([[0, { buffer: sceneBuffer }]]),
            "scene-bg-resource"
        );
        if (!entries || entries.length <= 0) return null;

        try {
            const bindGroup = AzWGPU.BindGroup.create(this.device, {
                label: `WrSceneBG:${shaderId}`,
                layout: pipeline.getBindGroupLayout(0),
                entries,
            });
            this.#sceneBindGroupCache.set(key, bindGroup);
            return bindGroup;
        } catch (error) {
            this.#warnOnce(`scene-bg:${shaderId}`, `[WrBackendWGPU] scene bind group failed for "${shaderId}": ${String(error?.message ?? error)}`);
            return null;
        }
    }

    #ensureObjectBindGroup(shaderId, pipeline, shaderState, albedoTexID, assets) {
        const texKey = albedoTexID ? String(albedoTexID) : "__fallback__";
        const key = `${shaderId}|object|${texKey}`;
        const cached = this.#objectBindGroupCache.get(key);
        if (cached) return cached;
        if (!this.#shaderUsesGroup(shaderState, 1)) return null;

        const objectBuffer = this.#ensureObjectUniformBuffer();
        let layout = null;
        try {
            layout = pipeline.getBindGroupLayout(1);
        } catch (_error) {
            return null;
        }
        const { sampler, textureView } = this.#ensureTextureResources(albedoTexID, assets);
        const entries = this.#buildBindGroupEntries(
            shaderId,
            shaderState,
            1,
            new Map([
                [0, { buffer: objectBuffer }],
                [1, sampler],
                [2, textureView],
            ]),
            "object-bg-resource"
        );
        if (!entries || entries.length <= 0) return null;

        try {
            const bindGroup = AzWGPU.BindGroup.create(this.device, {
                label: `WrObjectBG:${shaderId}`,
                layout,
                entries,
            });
            this.#objectBindGroupCache.set(key, bindGroup);
            return bindGroup;
        } catch (error) {
            this.#warnOnce(`object-bg:${shaderId}`, `[WrBackendWGPU] object bind group failed for "${shaderId}": ${String(error?.message ?? error)}`);
            return null;
        }
    }

    #ensureTextureResources(textureID, assets) {
        const key = String(textureID ?? "").trim();
        if (!key) return this.#ensureFallbackTextureResources();

        const cached = this.#textureCache.get(key);
        if (cached) return cached;

        const textureAsset = assets?.getTexture?.(key) ?? null;
        if (!textureAsset) {
            this.#warnOnce(`texture-missing:${key}`, `[WrBackendWGPU] texture "${key}" is missing; fallback white is used`);
            return this.#ensureFallbackTextureResources();
        }

        const width = Math.max(1, Math.floor(wrNumberOr(textureAsset.width ?? textureAsset.bitmap?.width, 1)));
        const height = Math.max(1, Math.floor(wrNumberOr(textureAsset.height ?? textureAsset.bitmap?.height, 1)));
        const wrap = String(textureAsset.wrap ?? "repeat").toLowerCase();
        const addressMode = (wrap === "clamp" || wrap === "clamp_to_edge") ? "clamp-to-edge" : "repeat";

        try {
            const texture = AzWGPU.Texture.create2D(this.device, {
                label: `WrTex:${key}`,
                width,
                height,
                format: "rgba8unorm",
            });

            const bitmap = textureAsset.bitmap ?? null;
            if (bitmap) {
                AzWGPU.Texture.writeExternal(this.device, texture, bitmap, {
                    width,
                    height,
                });
            } else {
                this.#warnOnce(`texture-empty:${key}`, `[WrBackendWGPU] texture "${key}" has no bitmap; fallback white is used`);
                texture.destroy();
                return this.#ensureFallbackTextureResources();
            }

            const textureView = AzWGPU.Texture.createView(texture, { dimension: "2d" });
            const sampler = AzWGPU.Sampler.create(this.device, {
                magFilter: "linear",
                minFilter: "linear",
                addressModeU: addressMode,
                addressModeV: addressMode,
            });
            const out = { sampler, texture, textureView };
            this.#textureCache.set(key, out);
            return out;
        } catch (error) {
            this.#warnOnce(`texture-failed:${key}`, `[WrBackendWGPU] texture upload failed for "${key}": ${String(error?.message ?? error)}`);
            return this.#ensureFallbackTextureResources();
        }
    }

    #ensureFallbackTextureResources() {
        if (this.#fallbackSampler && this.#fallbackTexture && this.#fallbackTextureView) {
            return {
                sampler: this.#fallbackSampler,
                texture: this.#fallbackTexture,
                textureView: this.#fallbackTextureView,
            };
        }

        this.#fallbackSampler = AzWGPU.Sampler.create(this.device, {
            magFilter: "linear",
            minFilter: "linear",
            addressModeU: "repeat",
            addressModeV: "repeat",
        });
        this.#fallbackTexture = AzWGPU.Texture.create2D(this.device, {
            label: "WrFallbackWhite",
            width: 1,
            height: 1,
            format: "rgba8unorm",
        });
        AzWGPU.Texture.writeLayer(this.device, this.#fallbackTexture, new Uint8Array([255, 255, 255, 255]), {
            width: 1,
            height: 1,
            depthOrArrayLayers: 1,
            bytesPerRow: 4,
            rowsPerImage: 1,
        });
        this.#fallbackTextureView = AzWGPU.Texture.createView(this.#fallbackTexture, {
            dimension: "2d",
        });
        return {
            sampler: this.#fallbackSampler,
            texture: this.#fallbackTexture,
            textureView: this.#fallbackTextureView,
        };
    }

    #queueNeedsDepth(queue, frameRenderCfg) {
        const frameCfg = wrNormalizeRenderCfg(frameRenderCfg);
        if (frameCfg.depthTest || frameCfg.depthWrite) return true;
        const draws = Array.isArray(queue?.draws) ? queue.draws : [];
        for (const draw of draws) {
            const drawCfg = wrNormalizeRenderCfg(draw?.renderCfg ?? null);
            if (drawCfg.depthTest || drawCfg.depthWrite) return true;
        }
        return false;
    }

    #releaseDepthTarget() {
        if (this.#depthTexture) this.#depthTexture.destroy();
        this.#depthTexture = null;
        this.#depthView = null;
        this.#depthWidth = 0;
        this.#depthHeight = 0;
    }

    #ensureDepthTarget() {
        const width = Math.max(1, this.canvas?.width ?? 1);
        const height = Math.max(1, this.canvas?.height ?? 1);
        if (this.#depthView && this.#depthWidth === width && this.#depthHeight === height) {
            return this.#depthView;
        }
        this.#releaseDepthTarget();
        this.#depthTexture = AzWGPU.Texture.create2D(this.device, {
            label: "WrDepth",
            width,
            height,
            format: WR_DEPTH_FORMAT,
            usage: GPUTextureUsage.RENDER_ATTACHMENT,
        });
        this.#depthView = AzWGPU.Texture.createView(this.#depthTexture, {
            dimension: "2d",
        });
        this.#depthWidth = width;
        this.#depthHeight = height;
        return this.#depthView;
    }

    #shaderCache;
    #meshCache;
    #pipelineCache;
    #warned;
    #sceneUniformBuffer;
    #objectUniformBuffer;
    #sceneScratch;
    #objectScratch;
    #sceneBindGroupCache;
    #objectBindGroupCache;
    #textureCache;
    #fallbackSampler;
    #fallbackTexture;
    #fallbackTextureView;
    #depthTexture;
    #depthView;
    #depthWidth;
    #depthHeight;
    #encoder;
    #textureView;
    #frameCtx;
}

export default WrBackendWGPU;

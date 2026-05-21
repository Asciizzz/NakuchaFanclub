import AzWGL from "../../AzLib/AzWGL.js";
import * as Azm from "../../AzLib/Azm.js";
import WrBackendBase from "./BackendBase.js";
import { wrPackMesh } from "../Core/MeshPacking.js";
import { wrNormalizeRenderCfg, wrRenderCfgKey } from "../Core/RenderConfig.js";

const WR_SKIN_BONE_CAP = 128;
const WR_IDENTITY_SKIN_PALETTE = (() => {
    const out = new Float32Array(WR_SKIN_BONE_CAP * 16);
    for (let i = 0; i < WR_SKIN_BONE_CAP; i++) {
        out.set(Azm.Mat4.IDENTITY, i * 16);
    }
    return out;
})();

/**
 * Convert numeric input with fallback.
 * @param {any} value input value
 * @param {number} [fallback=0] fallback value
 * @returns {number}
 */
function wrNumberOr(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

/**
 * Normalize RGBA array-like value.
 * @param {ArrayLike<number>|null|undefined} value source color
 * @param {number[]} [fallback=[1,1,1,1]] fallback color
 * @returns {number[]}
 */
function wrColor4(value, fallback = [1, 1, 1, 1]) {
    const src = (ArrayBuffer.isView(value) || Array.isArray(value)) ? value : fallback;
    return [
        wrNumberOr(src?.[0], fallback[0]),
        wrNumberOr(src?.[1], fallback[1]),
        wrNumberOr(src?.[2], fallback[2]),
        wrNumberOr(src?.[3], fallback[3]),
    ];
}

/**
 * Resolve effective material state for one mesh submesh.
 * @param {object} meshAsset mesh asset
 * @param {number} submeshIndex submesh index
 * @param {object} assets asset store
 * @returns {{albedoColor:number[],albedoTex:string|null,hasRig:boolean,hasMorph:boolean}}
 */
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

/**
 * Map render config depth compare to WebGL enum.
 * @param {WebGL2RenderingContext} gl GL context
 * @param {string} depthCompare compare mode
 * @param {boolean} depthTest depth test toggle
 * @returns {number}
 */
function wrDepthFuncGL(gl, depthCompare, depthTest) {
    if (!depthTest) return gl.ALWAYS;
    const key = String(depthCompare ?? "less").trim().toLowerCase();
    if (key === "never") return gl.NEVER;
    if (key === "less") return gl.LESS;
    if (key === "equal") return gl.EQUAL;
    if (key === "less-equal" || key === "lequal") return gl.LEQUAL;
    if (key === "greater") return gl.GREATER;
    if (key === "greater-equal" || key === "gequal") return gl.GEQUAL;
    if (key === "not-equal" || key === "notequal") return gl.NOTEQUAL;
    if (key === "always") return gl.ALWAYS;
    return gl.LESS;
}

/**
 * WebGL2 backend implementation.
 */
export class WrBackendWGL extends WrBackendBase {
    /**
     * @param {HTMLCanvasElement} canvas target canvas
     * @param {object} [options={}] backend options
     */
    constructor(canvas, options = {}) {
        super(canvas, options);
        this.gl = null;
        this.report = {};
        this.#frameCtx = null;
        this.#shaderCache = new Map();
        this.#meshCache = new Map();
        this.#textureCache = new Map();
        this.#warnedShaderIds = new Set();
        this.#warnedTextureIds = new Set();
        this.#fallbackTexture = null;
        this.#activeRenderCfgKey = null;
    }

    /**
     * Backend kind tag.
     * @returns {string}
     */
    get kind() { return "webgl2"; }

    /**
     * Initialize WebGL2 context and capability report.
     * @returns {Promise<WrBackendWGL>}
     */
    async init() {
        if (!this.canvas) throw new Error("[WrBackendWGL] canvas is required");
        const rawContextOptions = (this.options.context && typeof this.options.context === "object")
            ? this.options.context
            : this.options;
        const contextOptions = {
            alpha: true,
            premultipliedAlpha: true,
            ...(rawContextOptions ?? {}),
        };
        const gl = AzWGL.Context.create(this.canvas, contextOptions);
        this.gl = gl;
        this.ready = true;
        this.report = {
            info: AzWGL.Context.info(gl),
            limits: AzWGL.Limits.inspect(gl),
            timer: AzWGL.Timer.supportInfo(gl),
        };
        return this;
    }

    /**
     * Update viewport to current canvas pixel size.
     * @returns {void}
     */
    resize() {
        if (!this.ready || !this.gl) return;
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    }

    /**
     * Begin one frame.
     * @param {object} [frameCtx={}] frame context
     * @returns {void}
     */
    beginFrame(frameCtx = {}) {
        if (!this.ready || !this.gl) return;
        this.#frameCtx = frameCtx;
        this.#activeRenderCfgKey = null;
    }

    /**
     * Execute draw queue with shader, mesh, and texture caches.
     * @param {object|null} [queue=null] render queue
     * @returns {void}
     */
    executeRenderQueue(queue = null) {
        if (!this.ready || !this.gl) return;
        const frameRenderCfg = wrNormalizeRenderCfg(
            queue?.renderCfg ?? this.#frameCtx?.renderCfg ?? null
        );
        const clear = WrBackendBase.normalizeClearColor(
            frameRenderCfg.clearColor
        );
        if (frameRenderCfg.clearColorEnabled) {
            this.gl.clearColor(clear.r, clear.g, clear.b, clear.a);
        }
        if (frameRenderCfg.clearDepthEnabled) {
            this.gl.clearDepth(frameRenderCfg.clearDepth);
        }
        let clearMask = 0;
        if (frameRenderCfg.clearColorEnabled) clearMask |= this.gl.COLOR_BUFFER_BIT;
        if (frameRenderCfg.clearDepthEnabled) clearMask |= this.gl.DEPTH_BUFFER_BIT;
        if (clearMask) this.gl.clear(clearMask);

        const assets = queue?.assets;
        const draws = Array.isArray(queue?.draws) ? queue.draws : [];
        if (!assets || draws.length <= 0) return;

        const camera = queue.camera;
        const viewProj = (camera?.projection && camera?.view)
            ? Azm.Mat4.mul(camera.projection, camera.view)
            : null;

        for (const draw of draws) {
            const shaderId = draw.shaderID;
            if (!shaderId) continue;
            const shaderAsset = assets.getShader(shaderId);
            if (!shaderAsset) continue;

            const shader = this.#ensureShader(shaderId, shaderAsset);
            if (!shader?.ok || !shader.program) continue;

            const meshAsset = assets.getMesh(draw.meshID);
            if (!meshAsset) continue;
            const morphTargetIndex = Math.max(0, Number(draw?.primaryMorphIndex ?? 0) | 0);
            const meshGpu = this.#ensureMesh(draw.meshID, shaderId, meshAsset, shader.program, morphTargetIndex);
            if (!meshGpu || meshGpu.submeshes.length <= 0) continue;

            const renderCfg = wrNormalizeRenderCfg(draw.renderCfg ?? shaderAsset.renderCfg ?? frameRenderCfg);
            this.#applyRenderState(renderCfg);
            this.gl.useProgram(shader.program);

            if (viewProj) {
                const loc = this.gl.getUniformLocation(shader.program, "u_viewProj");
                if (loc !== null) this.gl.uniformMatrix4fv(loc, false, viewProj);
            }
            const modelLoc = this.gl.getUniformLocation(shader.program, "u_model");
            if (modelLoc !== null) this.gl.uniformMatrix4fv(modelLoc, false, draw.modelMatrix);

            const slot0Loc = this.gl.getUniformLocation(shader.program, "u_slot0");
            const colorLoc = this.gl.getUniformLocation(shader.program, "u_albedoColor");
            const flagsLoc = this.gl.getUniformLocation(shader.program, "u_vtxFlags");
            const extrasLoc = this.gl.getUniformLocation(shader.program, "u_extras");
            const texLoc = this.gl.getUniformLocation(shader.program, "u_albedoTex");
            const skinPaletteLoc = this.gl.getUniformLocation(shader.program, "u_skinPalette[0]");
            if (skinPaletteLoc !== null) {
                const drawPalette = draw?.skinPalette;
                const palette = (drawPalette && (ArrayBuffer.isView(drawPalette) || Array.isArray(drawPalette)) && drawPalette.length >= 16)
                    ? drawPalette
                    : WR_IDENTITY_SKIN_PALETTE;
                this.gl.uniformMatrix4fv(skinPaletteLoc, false, palette);
            }

            for (let submeshIndex = 0; submeshIndex < meshGpu.submeshes.length; submeshIndex++) {
                const submesh = meshGpu.submeshes[submeshIndex];
                const materialState = wrResolveSubmeshMaterial(meshAsset, submeshIndex, assets);
                if (slot0Loc !== null) this.gl.uniform4f(slot0Loc, 1, 1, 1, 1);
                if (colorLoc !== null) {
                    this.gl.uniform4f(
                        colorLoc,
                        materialState.albedoColor[0],
                        materialState.albedoColor[1],
                        materialState.albedoColor[2],
                        materialState.albedoColor[3]
                    );
                }
                if (flagsLoc !== null) {
                    this.gl.uniform4f(flagsLoc, materialState.hasRig ? 1 : 0, materialState.hasMorph ? 1 : 0, 0, 0);
                }
                if (extrasLoc !== null) this.gl.uniform4f(extrasLoc, wrNumberOr(draw?.morphWeight, 0), 0, 0, 0);
                if (texLoc !== null) {
                    const texture = this.#ensureTexture(materialState.albedoTex, assets);
                    this.gl.activeTexture(this.gl.TEXTURE0);
                    this.gl.bindTexture(this.gl.TEXTURE_2D, texture);
                    this.gl.uniform1i(texLoc, 0);
                }

                this.gl.bindVertexArray(submesh.vao);
                this.gl.drawElements(this.gl.TRIANGLES, submesh.indexCount, submesh.indexType, 0);
            }
        }

        this.gl.activeTexture(this.gl.TEXTURE0);
        this.gl.bindTexture(this.gl.TEXTURE_2D, null);
        this.gl.bindVertexArray(null);
        this.gl.useProgram(null);
    }

    /**
     * End frame hook.
     * @returns {void}
     */
    endFrame() {}

    /**
     * Destroy backend resources and GPU caches.
     * @returns {void}
     */
    destroy() {
        this.#destroyGpuCaches();
        this.ready = false;
        this.gl = null;
    }

    /**
     * Return cached capability report.
     * @returns {object}
     */
    getCapabilities() { return this.report; }

    /**
     * Get or compile shader program for one shader id.
     * @param {string} shaderId shader id
     * @param {object} shaderAsset shader asset
     * @returns {{ok:boolean,program:WebGLProgram|null,error:string|null}}
     */
    #ensureShader(shaderId, shaderAsset) {
        const cached = this.#shaderCache.get(shaderId);
        if (cached) return cached;

        const gl = this.gl;
        const state = { ok: false, program: null, error: null };
        try {
            state.program = AzWGL.Shader.create(gl, {
                vertex: shaderAsset.resolved?.vertex?.glsl ?? shaderAsset.vertex?.glsl,
                fragment: shaderAsset.resolved?.fragment?.glsl ?? shaderAsset.fragment?.glsl,
            });
            state.ok = true;
        } catch (error) {
            state.error = String(error?.message ?? error);
            if (!this.#warnedShaderIds.has(shaderId)) {
                console.warn(`[WrBackendWGL] shader compile failed for "${shaderId}"`, state.error);
                this.#warnedShaderIds.add(shaderId);
            }
        }

        this.#shaderCache.set(shaderId, state);
        return state;
    }

    /**
     * Get or build cached GPU mesh buffers for one mesh/shader pair.
     * @param {string} meshId mesh id
     * @param {string} shaderId shader id
     * @param {object} meshAsset mesh asset
     * @param {WebGLProgram} program shader program
     * @param {number} [morphTargetIndex=0] selected morph target index
     * @returns {{submeshes: object[]}}
     */
    #ensureMesh(meshId, shaderId, meshAsset, program, morphTargetIndex = 0) {
        const cacheKey = `${meshId}|${shaderId}|morph:${Math.max(0, Number(morphTargetIndex) | 0)}`;
        const cached = this.#meshCache.get(cacheKey);
        if (cached) return cached;

        const gl = this.gl;
        const packedSubmeshes = wrPackMesh(meshAsset, { morphTargetIndex });
        const out = { submeshes: [] };

        const attrLoc = {
            position: gl.getAttribLocation(program, "a_position"),
            normal: gl.getAttribLocation(program, "a_normal"),
            uv: gl.getAttribLocation(program, "a_uv"),
            boneID: gl.getAttribLocation(program, "a_boneID"),
            boneWeight: gl.getAttribLocation(program, "a_boneWeight"),
            morphPos: gl.getAttribLocation(program, "a_morphPos"),
        };

        for (const packed of packedSubmeshes) {
            const vbo = gl.createBuffer();
            const ibo = gl.createBuffer();
            const vao = gl.createVertexArray();
            if (!vbo || !ibo || !vao) continue;

            gl.bindVertexArray(vao);

            gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
            gl.bufferData(gl.ARRAY_BUFFER, packed.vertexData, gl.STATIC_DRAW);

            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, packed.indexData, gl.STATIC_DRAW);

            this.#wireAttr(attrLoc.position, 3, gl.FLOAT, 76, 0);
            this.#wireAttr(attrLoc.normal, 3, gl.FLOAT, 76, 12);
            this.#wireAttr(attrLoc.uv, 2, gl.FLOAT, 76, 24);
            this.#wireAttr(attrLoc.boneID, 4, gl.FLOAT, 76, 32);
            this.#wireAttr(attrLoc.boneWeight, 4, gl.FLOAT, 76, 48);
            this.#wireAttr(attrLoc.morphPos, 3, gl.FLOAT, 76, 64);

            out.submeshes.push({
                vao,
                vbo,
                ibo,
                indexCount: packed.indexCount,
                indexType: packed.indexFormat === "uint32" ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
            });
        }

        gl.bindVertexArray(null);
        gl.bindBuffer(gl.ARRAY_BUFFER, null);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);

        this.#meshCache.set(cacheKey, out);
        return out;
    }

    /**
     * Wire one vertex attribute pointer.
     * @param {number} location attrib location
     * @param {number} size components per vertex
     * @param {number} type GL type enum
     * @param {number} stride byte stride
     * @param {number} offset byte offset
     * @returns {void}
     */
    #wireAttr(location, size, type, stride, offset) {
        if (location == null || location < 0) return;
        this.gl.enableVertexAttribArray(location);
        this.gl.vertexAttribPointer(location, size, type, false, stride, offset);
    }

    /**
     * Apply normalized render state if key changed.
     * @param {object} renderCfg render config
     * @returns {void}
     */
    #applyRenderState(renderCfg) {
        const cfg = wrNormalizeRenderCfg(renderCfg);
        const nextKey = wrRenderCfgKey(cfg);
        if (this.#activeRenderCfgKey === nextKey) return;

        const gl = this.gl;
        if (cfg.depthTest) gl.enable(gl.DEPTH_TEST);
        else gl.disable(gl.DEPTH_TEST);
        gl.depthMask(!!cfg.depthWrite);
        gl.depthFunc(wrDepthFuncGL(gl, cfg.depthCompare, cfg.depthTest));

        if (cfg.cull === "none") {
            gl.disable(gl.CULL_FACE);
        } else {
            gl.enable(gl.CULL_FACE);
            gl.cullFace(cfg.cull === "front" ? gl.FRONT : gl.BACK);
        }

        if (cfg.blend) {
            gl.enable(gl.BLEND);
            gl.blendEquation(gl.FUNC_ADD);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        } else {
            gl.disable(gl.BLEND);
        }

        this.#activeRenderCfgKey = nextKey;
    }

    /**
     * Destroy all cached GL resources.
     * @returns {void}
     */
    #destroyGpuCaches() {
        if (!this.gl) return;
        for (const shader of this.#shaderCache.values()) {
            if (shader?.program) this.gl.deleteProgram(shader.program);
        }
        this.#shaderCache.clear();
        for (const mesh of this.#meshCache.values()) {
            for (const sub of mesh?.submeshes ?? []) {
                if (sub.vao) this.gl.deleteVertexArray(sub.vao);
                if (sub.vbo) this.gl.deleteBuffer(sub.vbo);
                if (sub.ibo) this.gl.deleteBuffer(sub.ibo);
            }
        }
        this.#meshCache.clear();
        for (const texture of this.#textureCache.values()) {
            this.gl.deleteTexture(texture);
        }
        this.#textureCache.clear();
        if (this.#fallbackTexture) this.gl.deleteTexture(this.#fallbackTexture);
        this.#fallbackTexture = null;
        this.#warnedShaderIds.clear();
        this.#warnedTextureIds.clear();
        this.#activeRenderCfgKey = null;
    }

    /**
     * Emit texture warning once per key.
     * @param {string} key warning key
     * @param {string} message warning message
     * @returns {void}
     */
    #warnTextureOnce(key, message) {
        if (this.#warnedTextureIds.has(key)) return;
        this.#warnedTextureIds.add(key);
        console.warn(message);
    }

    /**
     * Get or upload one texture by texture id.
     * Falls back to internal white texture when missing.
     * @param {string|null} textureID texture id
     * @param {object} assets asset store
     * @returns {WebGLTexture}
     */
    #ensureTexture(textureID, assets) {
        const key = String(textureID ?? "").trim();
        if (!key) return this.#ensureFallbackTexture();

        const cached = this.#textureCache.get(key);
        if (cached) return cached;

        const textureAsset = assets?.getTexture?.(key) ?? null;
        if (!textureAsset) {
            this.#warnTextureOnce(`missing:${key}`, `[WrBackendWGL] texture "${key}" is missing; fallback white is used`);
            return this.#ensureFallbackTexture();
        }

        const gl = this.gl;
        const width = Math.max(1, Math.floor(wrNumberOr(textureAsset.width ?? textureAsset.bitmap?.width, 1)));
        const height = Math.max(1, Math.floor(wrNumberOr(textureAsset.height ?? textureAsset.bitmap?.height, 1)));
        const wrap = String(textureAsset.wrap ?? "repeat").toLowerCase();
        const wrapMode = (wrap === "clamp" || wrap === "clamp_to_edge") ? gl.CLAMP_TO_EDGE : gl.REPEAT;
        const bitmap = textureAsset.bitmap ?? null;

        if (!bitmap) {
            this.#warnTextureOnce(`empty:${key}`, `[WrBackendWGL] texture "${key}" has no bitmap; fallback white is used`);
            return this.#ensureFallbackTexture();
        }

        try {
            const texture = AzWGL.Texture.create2D(gl, {
                width,
                height,
                wrapS: wrapMode,
                wrapT: wrapMode,
                minFilter: gl.LINEAR,
                magFilter: gl.LINEAR,
            });
            AzWGL.Texture.write2D(gl, texture, bitmap, {
                format: gl.RGBA,
                type: gl.UNSIGNED_BYTE,
            });
            this.#textureCache.set(key, texture);
            return texture;
        } catch (error) {
            this.#warnTextureOnce(`failed:${key}`, `[WrBackendWGL] texture upload failed for "${key}": ${String(error?.message ?? error)}`);
            return this.#ensureFallbackTexture();
        }
    }

    /**
     * Get or create shared 1x1 white fallback texture.
     * @returns {WebGLTexture}
     */
    #ensureFallbackTexture() {
        if (this.#fallbackTexture) return this.#fallbackTexture;
        const gl = this.gl;
        this.#fallbackTexture = AzWGL.Texture.create2D(gl, {
            width: 1,
            height: 1,
            wrapS: gl.CLAMP_TO_EDGE,
            wrapT: gl.CLAMP_TO_EDGE,
            minFilter: gl.NEAREST,
            magFilter: gl.NEAREST,
        });
        AzWGL.Texture.write2D(gl, this.#fallbackTexture, new Uint8Array([255, 255, 255, 255]), {
            width: 1,
            height: 1,
            format: gl.RGBA,
            type: gl.UNSIGNED_BYTE,
        });
        return this.#fallbackTexture;
    }

    #shaderCache;
    #meshCache;
    #textureCache;
    #warnedShaderIds;
    #warnedTextureIds;
    #fallbackTexture;
    #activeRenderCfgKey;
    #frameCtx;
}

export default WrBackendWGL;

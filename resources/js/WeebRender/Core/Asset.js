import { AzCamera } from "../../AzLib/AzCamera.js";
import WrAssetStore from "../Assets/AssetStore.js";
import { wrChooseBackend } from "../Backends/BackendChooser.js";
import { wrCompareVertexSignatures, wrValidateShaderDefinition } from "./ShaderAbi.js";
import {
    wrDefaultKeyMapGlsl,
    wrDefaultKeyMapWgsl,
    wrReplaceTemplateKeys,
    wrTemplateKeyMapGlsl,
    wrTemplateKeyMapWgsl,
} from "./ShaderTemplate.js";
import { wrBuildTemplateShaderDefinition, wrIsTemplateShaderDefinition } from "./ShaderBuilder.js";
import { WR_DEFAULT_RENDER_CFG, wrNormalizeRenderCfg } from "./RenderConfig.js";
import WrScene from "./Scene.js";

/**
 * Check whether value is a canvas element.
 * @param {any} value input value
 * @returns {boolean}
 */
function wrIsCanvasElement(value) {
    return value instanceof HTMLCanvasElement;
}

/**
 * Resolve or create a canvas using canvas options.
 * @param {object} [opts={}] canvas options
 * @returns {HTMLCanvasElement}
 */
function wrEnsureCanvas(opts = {}) {
    if (wrIsCanvasElement(opts.element)) return opts.element;

    const id = String(opts.id ?? "wr-canvas");
    const found = globalThis.document?.getElementById?.(id);
    if (wrIsCanvasElement(found)) return found;

    const canvas = globalThis.document?.createElement?.("canvas");
    if (!wrIsCanvasElement(canvas)) {
        throw new Error("[WrAsset] failed to create canvas");
    }

    let canvasId = id;
    if (found && !wrIsCanvasElement(found)) {
        canvasId = `${id}-canvas`;
    }
    if (globalThis.document?.getElementById) {
        let suffix = 1;
        while (globalThis.document.getElementById(canvasId)) {
            canvasId = `${id}-canvas-${suffix++}`;
        }
    }
    canvas.id = canvasId;
    return canvas;
}

/**
 * Main Wr asset context.
 * Owns backend lifecycle, shared asset registry, and shader registration.
 */
export class WrAsset {
    /**
     * Create a new asset context.
     * @param {object} [options={}] initialization options
     */
    constructor(options = {}) {
        this.options = options ?? {};
        this.canvasOptions = this.options.canvas ?? {};
        this.canvas = wrEnsureCanvas(this.canvasOptions);
        this.backendOptions = this.options.backend ?? {};
        this.camera = this.options.camera instanceof AzCamera
            ? this.options.camera
            : new AzCamera();

        this.assets = new WrAssetStore();
        this.backend = null;
        this.runtimeReport = null;
        this.defaultShaderId = null;
        this.defaultRenderCfg = wrNormalizeRenderCfg(this.options.renderCfg ?? WR_DEFAULT_RENDER_CFG);
    }

    /**
     * Active backend kind string.
     * @returns {string|null}
     */
    get backendKind() { return this.backend?.kind ?? null; }
    /**
     * Backend capability report.
     * @returns {object}
     */
    get capabilities() { return this.backend?.getCapabilities?.() ?? {}; }

    /**
     * Initialize backend and configure initial size.
     * @param {object} [options={}] backend override options
     * @returns {Promise<WrAsset>}
     */
    async init(options = {}) {
        const mergedBackendOpts = {
            ...this.backendOptions,
            ...options,
        };
        const webglOptions = {
            ...(mergedBackendOpts.webgl ?? {}),
        };
        if (webglOptions.alpha == null && this.canvasOptions.alpha != null) {
            webglOptions.alpha = !!this.canvasOptions.alpha;
        }
        if (webglOptions.premultipliedAlpha == null && this.canvasOptions.premultipliedAlpha != null) {
            webglOptions.premultipliedAlpha = !!this.canvasOptions.premultipliedAlpha;
        }
        mergedBackendOpts.webgl = webglOptions;

        const { backend, report } = await wrChooseBackend(this.canvas, mergedBackendOpts);
        this.backend = backend;
        this.runtimeReport = { backend: report };
        this.resize(
            this.canvas.clientWidth || this.canvas.width || 800,
            this.canvas.clientHeight || this.canvas.height || 600
        );
        return this;
    }

    /**
     * Mount canvas into a DOM target.
     * @param {Element} target target DOM element
     * @returns {WrAsset}
     */
    mount(target) {
        if (!(target instanceof Element)) return this;
        if (this.canvas.parentElement !== target) {
            this.unmount();
            target.appendChild(this.canvas);
        }
        return this;
    }

    /**
     * Unmount canvas from current parent.
     * @returns {WrAsset}
     */
    unmount() {
        this.canvas.parentElement?.removeChild(this.canvas);
        return this;
    }

    /**
     * Resize canvas to current parent client rect.
     * @returns {WrAsset}
     */
    fitContainer() {
        const parent = this.canvas.parentElement;
        if (!parent) return this;
        const rect = parent.getBoundingClientRect();
        return this.resize(rect.width, rect.height);
    }

    /**
     * Resize canvas and backend buffers using DPR scaling.
     * @param {number} width css width
     * @param {number} height css height
     * @returns {WrAsset}
     */
    resize(width, height) {
        const w = Math.max(1, Math.round(Number(width) || 1));
        const h = Math.max(1, Math.round(Number(height) || 1));
        const maxPixelRatio = Math.max(1, Number(this.canvasOptions.maxPixelRatio ?? 2) || 2);
        const dpr = Math.min(maxPixelRatio, globalThis.devicePixelRatio || 1);
        const drawWidth = Math.max(1, Math.round(w * dpr));
        const drawHeight = Math.max(1, Math.round(h * dpr));

        this.canvas.style.width = `${w}px`;
        this.canvas.style.height = `${h}px`;
        this.canvas.width = drawWidth;
        this.canvas.height = drawHeight;
        this.camera.aspect = w / Math.max(1, h);
        this.backend?.resize?.(drawWidth, drawHeight);
        return this;
    }

    /**
     * Set active camera for scenes that use asset defaults.
     * @param {AzCamera} camera camera instance
     * @returns {WrAsset}
     */
    setCamera(camera) {
        this.camera = camera instanceof AzCamera ? camera : this.camera;
        return this;
    }

    /**
     * Read backend capabilities.
     * @returns {object}
     */
    getCapabilities() {
        return this.capabilities;
    }

    /**
     * Register shader with dual WGSL/GLSL support and resolved template keys.
     * @param {string} shaderId shader id
     * @param {object} [shaderDesc={}] shader description
     * @param {object|undefined} [renderCfgInput=undefined] optional render config override
     * @returns {string}
     */
    registerShader(shaderId, shaderDesc = {}, renderCfgInput = undefined) {
        const id = String(shaderId ?? "").trim();
        if (!id) throw new Error("[WrAsset] shaderId is required");

        const isTemplate = wrIsTemplateShaderDefinition(shaderDesc);
        const sourceDesc = isTemplate ? wrBuildTemplateShaderDefinition(shaderDesc) : shaderDesc;
        const validated = wrValidateShaderDefinition(sourceDesc);
        const renderCfg = wrNormalizeRenderCfg(renderCfgInput ?? shaderDesc.renderCfg ?? sourceDesc.renderCfg ?? null);
        const defaultWgslMap = isTemplate ? wrTemplateKeyMapWgsl() : wrDefaultKeyMapWgsl();
        const defaultGlslMap = isTemplate ? wrTemplateKeyMapGlsl() : wrDefaultKeyMapGlsl();
        const autoKeyMap = sourceDesc.linkKeyMap ?? {};
        const keyMap = {
            wgsl: { ...defaultWgslMap, ...(autoKeyMap.wgsl ?? {}), ...(shaderDesc.keyMap?.wgsl ?? {}) },
            glsl: { ...defaultGlslMap, ...(autoKeyMap.glsl ?? {}), ...(shaderDesc.keyMap?.glsl ?? {}) },
        };

        const resolved = {
            vertex: {
                wgsl: wrReplaceTemplateKeys(validated.vertex.wgsl, "vertex", keyMap.wgsl),
                glsl: wrReplaceTemplateKeys(validated.vertex.glsl, "vertex", keyMap.glsl),
            },
            fragment: {
                wgsl: wrReplaceTemplateKeys(validated.fragment.wgsl, "fragment", keyMap.wgsl),
                glsl: wrReplaceTemplateKeys(validated.fragment.glsl, "fragment", keyMap.glsl),
            },
        };

        this.assets.addShader({
            id,
            ...validated,
            resolved,
            keyMap,
            renderCfg,
        });
        if (!this.defaultShaderId) {
            this.defaultShaderId = id;
            this.defaultRenderCfg = renderCfg;
        }
        return id;
    }

    /**
     * Compare shader vertex layout with provided mesh layout.
     * @param {string} shaderId shader id
     * @param {object} providedLayout mesh vertex layout
     * @returns {object}
     */
    validateShaderMeshLayout(shaderId, providedLayout) {
        const shader = this.assets.getShader(shaderId);
        if (!shader) throw new Error(`[WrAsset] shader "${shaderId}" not found`);
        return wrCompareVertexSignatures(shader.vertexLayout, providedLayout);
    }

    /**
     * Create a detached scene bound to this asset context.
     * @param {object} [sceneData={}] scene data payload
     * @param {object} [options={}] scene options
     * @returns {WrScene}
     */
    createScene(sceneData = {}, options = {}) {
        return new WrScene(this, sceneData, options);
    }

    /**
     * Load model via EzLoader, ingest assets, and return standalone WrScene.
     * @param {string} url model URL
     * @param {object} [options={}] scene creation options
     * @returns {Promise<WrScene>}
     */
    async loadModelFromURL(url, options = {}) {
        const targetUrl = String(url ?? "").trim();
        if (!targetUrl) throw new Error("[WrAsset] model URL is required");

        if (!globalThis.window?.EzLoader?.load) {
            await import("../../WeebGL/EzLoader.js");
        }
        const loader = globalThis.window?.EzLoader;
        if (!loader?.load) throw new Error("[WrAsset] EzLoader.load() is unavailable");

        const payload = await loader.load(targetUrl);
        const sceneData = this.assets.addFromLoader(payload);
        return new WrScene(this, sceneData, {
            camera: options.camera ?? this.camera,
            defaultShaderId: options.defaultShaderId ?? this.defaultShaderId,
            renderCfg: options.renderCfg ?? this.defaultRenderCfg,
        });
    }

    /**
     * Destroy backend resources for this asset context.
     * @returns {void}
     */
    destroy() {
        this.backend?.destroy?.();
        this.backend = null;
        this.runtimeReport = null;
    }
}

export default WrAsset;

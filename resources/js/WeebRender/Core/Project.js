import { AzCamera } from "../../AzLib/AzCamera.js";
import WrAssetStore from "../Assets/AssetStore.js";
import { wrChooseBackend } from "../Backends/BackendChooser.js";
import WrSceneRuntime from "./SceneRuntime.js";
import WrRenderQueue from "./RenderQueue.js";
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

function wrIsCanvasElement(value) {
    return value instanceof HTMLCanvasElement;
}

function wrEnsureCanvas(opts = {}) {
    if (wrIsCanvasElement(opts.element)) return opts.element;

    const id = String(opts.id ?? "wr-canvas");
    const found = globalThis.document?.getElementById?.(id);
    if (wrIsCanvasElement(found)) return found;

    const canvas = globalThis.document?.createElement?.("canvas");
    if (!wrIsCanvasElement(canvas)) {
        throw new Error("[WrProject] failed to create canvas");
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

export class WrProject {
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
        this.activeSceneId = null;
        this.defaultShaderId = null;
        this.defaultRenderCfg = wrNormalizeRenderCfg(this.options.renderCfg ?? WR_DEFAULT_RENDER_CFG);
    }

    get backendKind() { return this.backend?.kind ?? null; }
    get capabilities() { return this.backend?.getCapabilities?.() ?? {}; }

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

    mount(target) {
        if (!(target instanceof Element)) return this;
        if (this.canvas.parentElement !== target) {
            this.unmount();
            target.appendChild(this.canvas);
        }
        return this;
    }

    unmount() {
        this.canvas.parentElement?.removeChild(this.canvas);
        return this;
    }

    fitContainer() {
        const parent = this.canvas.parentElement;
        if (!parent) return this;
        const rect = parent.getBoundingClientRect();
        return this.resize(rect.width, rect.height);
    }

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

    setCamera(camera) {
        this.camera = camera instanceof AzCamera ? camera : this.camera;
        return this;
    }

    getCapabilities() {
        return this.capabilities;
    }

    registerShader(shaderId, shaderDesc = {}, renderCfgInput = undefined) {
        const id = String(shaderId ?? "").trim();
        if (!id) throw new Error("[WrProject] shaderId is required");

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

    validateShaderMeshLayout(shaderId, providedLayout) {
        const shader = this.assets.getShader(shaderId);
        if (!shader) throw new Error(`[WrProject] shader "${shaderId}" not found`);
        return wrCompareVertexSignatures(shader.vertexLayout, providedLayout);
    }

    addScene(sceneData) {
        return this.assets.addScene(sceneData);
    }

    getScene(sceneId) {
        return this.assets.getScene(sceneId);
    }

    useScene(sceneOrId) {
        const id = typeof sceneOrId === "string" ? sceneOrId : String(sceneOrId?.id ?? sceneOrId?.sceneID ?? "");
        if (!id) throw new Error("[WrProject] useScene requires a scene id or scene object");
        if (!this.assets.getScene(id)) throw new Error(`[WrProject] scene "${id}" not found`);
        this.activeSceneId = id;
        return this;
    }

    getActiveScene() {
        return this.activeSceneId ? this.assets.getScene(this.activeSceneId) : null;
    }

    async loadModelFromURL(url, options = {}) {
        const targetUrl = String(url ?? "").trim();
        if (!targetUrl) throw new Error("[WrProject] model URL is required");

        if (!globalThis.window?.EzLoader?.load) {
            await import("../../WeebGL/EzLoader.js");
        }
        const loader = globalThis.window?.EzLoader;
        if (!loader?.load) throw new Error("[WrProject] EzLoader.load() is unavailable");

        const payload = await loader.load(targetUrl);
        const sceneId = this.assets.addFromLoader(payload);
        if (options.useNow ?? true) this.useScene(sceneId);
        return sceneId;
    }

    update(deltaTime = 0) {
        const scene = this.getActiveScene();
        if (!scene) return this;
        scene.deltaTime = Number(deltaTime) || 0;
        WrSceneRuntime.updateTransforms(scene);
        return this;
    }

    render() {
        if (!this.backend || !this.backend.ready) return this;
        const scene = this.getActiveScene();
        if (!scene) return this;

        const queue = WrRenderQueue.build(scene, this.camera, this.assets, {
            defaultShaderId: this.defaultShaderId,
            defaultRenderCfg: this.defaultRenderCfg,
        });
        this.backend.beginFrame({
            camera: this.camera,
            renderCfg: queue.renderCfg ?? this.defaultRenderCfg,
        });
        this.backend.executeRenderQueue(queue, { scene, camera: this.camera });
        this.backend.endFrame({ scene, camera: this.camera });
        return this;
    }

    destroy() {
        this.backend?.destroy?.();
        this.backend = null;
        this.runtimeReport = null;
    }
}

export default WrProject;

// export { WrAsset } from "./Core/Asset.js";
export { WrWorld } from "./Core/World.js";
export { WrWorldRuntime } from "./Core/WorldRuntime.js";
export { WrRenderQueue } from "./Core/RenderQueue.js";

export { WrBackendBase } from "./Backends/BackendBase.js";
export { WrBackendWGPU } from "./Backends/WGPUBackend.js";
export { WrBackendWGL } from "./Backends/WGLBackend.js";

export { WrAssetStore, WrAssetKind, AssetKind } from "./Assets/AssetStore.js";
export { WrMesh } from "./Assets/Mesh.js";
export { WrSkeleton } from "./Assets/Skeleton.js";

export {
    WR_VERTEX_ABI_VERSION,
    WR_VERTEX_LAYOUT_V1,
    wrCompareVertexSignatures,
    wrNormalizeVertexLayout,
    wrValidateShaderDefinition,
} from "./Core/ShaderAbi.js";

export {
    WR_SHADER_KEYS,
    wrDefaultKeyMapGlsl,
    wrDefaultKeyMapWgsl,
    wrExtractTemplateKeys,
    wrReplaceTemplateKeys,
    wrTemplateKeyMapGlsl,
    wrTemplateKeyMapWgsl,
    wrValidateTemplateKeys,
} from "./Core/ShaderTemplate.js";

export {
    wrBuildTemplateShaderDefinition,
    wrIsTemplateShaderDefinition,
} from "./Core/ShaderBuilder.js";

export {
    WR_DEFAULT_RENDER_CFG,
    wrNormalizeClearColor,
    wrNormalizeRenderCfg,
    wrRenderCfgKey,
} from "./Core/RenderConfig.js";

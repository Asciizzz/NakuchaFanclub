import WrAsset from "../Core/Asset.js";
import WrScene from "../Core/Scene.js";
import WrNode from "../Core/Node.js";
import WrSceneRuntime from "../Core/SceneRuntime.js";
import WrRenderQueue from "../Core/RenderQueue.js";

if (typeof window !== "undefined") {
    window.WrAsset = WrAsset;
    window.WrScene = WrScene;
    window.WrNode = WrNode;
    window.WrSceneRuntime = WrSceneRuntime;
    window.WrRenderQueue = WrRenderQueue;
}

export default WrAsset;

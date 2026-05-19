import WrProject from "../Core/Project.js";
import WrSceneRuntime from "../Core/SceneRuntime.js";
import WrRenderQueue from "../Core/RenderQueue.js";

class EzProjectCompat extends WrProject {
    constructor(name = "wr-canvas", canvasOptions = {}) {
        super({
            canvas: {
                id: String(name ?? "wr-canvas"),
                ...canvasOptions,
            },
            backend: canvasOptions.backend ?? {},
        });
    }
}

if (typeof window !== "undefined") {
    window.WrProject = WrProject;
    window.WrSceneRuntime = WrSceneRuntime;
    window.WrRenderQueue = WrRenderQueue;

    if (typeof window.EzProject !== "function") {
        window.EzProject = EzProjectCompat;
    }
}

export { EzProjectCompat };
export default WrProject;

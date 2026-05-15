/* EzProject
By Asciiz

Central WeebGPU project container: canvas + assets + camera.
*/

(function () {
    if (typeof window.ZCanvasWGPU !== "function") throw new Error("[EzProject] ZCanvasWGPU is required");
    if (typeof window.EzAssets !== "function") throw new Error("[EzProject] EzAssets is required");
    if (typeof window.ZRenderGraph !== "function") throw new Error("[EzProject] ZRenderGraph is required");

    class EzProject {
        canvas = null;
        assets = null;
        camera = null;
        renderGraph = null;

        #ready = false;

        constructor(name = "z-project-wgpu", canvasOpts = {}) {
            this.canvas = new ZCanvasWGPU(name, canvasOpts);
            this.camera = typeof window.ZCamera === "function" ? new ZCamera() : null;
            this.assets = new EzAssets({
                camera: this.camera,
            });
        }

        get ready() { return this.#ready; }
        get device() { return this.canvas?.device ?? null; }
        get context() { return this.canvas?.context ?? null; }
        get format() { return this.canvas?.format ?? null; }

        async init(opts = {}) {
            if (this.#ready) return this;
            await this.canvas.init(opts);
            this.assets.setRuntime({
                device: this.device,
                context: this.context,
                camera: this.camera,
            });
            this.renderGraph = new ZRenderGraph({
                device: this.device,
                context: this.context,
                assets: this.assets,
                camera: this.camera,
            });
            this.#ready = true;
            return this;
        }

        mount(el) {
            this.canvas.mount(el);
            return this;
        }

        unmount() {
            this.canvas.unmount();
            return this;
        }

        fitContainer() {
            this.canvas.fitContainer();
            return this;
        }

        resize(w, h) {
            this.canvas.resize(w, h);
            return this;
        }

        setCamera(camera) {
            this.camera = camera ?? null;
            this.assets.setCamera(this.camera);
            this.renderGraph?.setRuntime({ camera: this.camera });
            return this;
        }

        registerShader(shaderID, shaderOrDesc, pipelineOverrides = {}) {
            return this.assets.registerShader(shaderID, shaderOrDesc, pipelineOverrides);
        }

        registerRenderShader(shaderID, shaderOrDesc, pipelineOverrides = {}) {
            return this.assets.registerRenderShader(shaderID, shaderOrDesc, pipelineOverrides);
        }

        registerComputeShader(shaderID, shaderOrDesc, pipelineOverrides = {}) {
            return this.assets.registerComputeShader(shaderID, shaderOrDesc, pipelineOverrides);
        }

        createRenderShader(desc = {}, pipelineOverrides = {}) {
            return this.assets.createRenderShader(desc, pipelineOverrides);
        }

        createComputeShader(desc = {}, pipelineOverrides = {}) {
            return this.assets.createComputeShader(desc, pipelineOverrides);
        }

        async loadModelFromURL(url) {
            const loader = window.EzLoader ?? null;
            if (!loader?.load) throw new Error("[EzProject] EzLoader.load() is required");
            const payload = await loader.load(url);
            const sceneID = this.assets.addFromLoader(payload);
            this.getScene(sceneID);
            return sceneID;
        }

        getScene(sceneID) {
            const scene = this.assets.getScene(sceneID);
            if (!scene) return null;
            scene.bindRuntime({
                device: this.device,
                context: this.context,
                assets: this.assets,
                camera: this.camera,
                renderer: (targetScene, renderOpts = {}) => this.renderGraph?.render(targetScene, {
                    ...renderOpts,
                    depthView: this.canvas.depthView,
                }),
            });
            return scene;
        }
    }

    window.EzProject = EzProject;
})();

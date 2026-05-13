/* EzProject
By Asciiz

Central 3D project container: canvas + assets + camera.
*/

(function () {
    if (typeof window.ZCanvas !== "function") throw new Error("[EzProject] ZCanvas is required");
    if (typeof window.EzAssets !== "function") throw new Error("[EzProject] EzAssets is required");

    class EzProject {
        canvas = null;
        assets = null;
        camera = null;

        constructor(name = "z-project", canvasOpts = {}) {
            this.canvas = new ZCanvas(name, canvasOpts);
            this.camera = typeof window.ZCamera === "function" ? new ZCamera() : null;
            this.assets = new EzAssets(this.canvas.gl, this.camera);
        }

        get gl() { return this.canvas.gl; }

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
            return this;
        }

        registerShader(shaderID, shaderOrDesc) {
            return this.assets.registerShader(shaderID, shaderOrDesc);
        }

        createShader(desc = {}) {
            return this.assets.createShader(desc);
        }

        async loadFromURL(url, opts = {}) {
            const loader = window.EzLoader ?? window.EzLoader;
            if (!loader?.load) throw new Error("[EzProject] EzLoader.load() is required");

            const payload = await loader.load(url);
            const sceneID = this.assets.addFromLoader(payload, opts);
            this.getScene(sceneID); // ensure runtime binding to latest camera
            return sceneID;
        }

        async fromURL(url, opts = {}) {
            return this.loadFromURL(url, opts);
        }

        getScene(sceneID) {
            const scene = this.assets.getScene(sceneID);
            if (!scene) return null;
            scene.bindRuntime({ gl: this.gl, assets: this.assets, camera: this.camera });
            return scene;
        }
    }

    window.EzProject = EzProject;
})();

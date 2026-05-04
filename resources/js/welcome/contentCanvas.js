const ez3d = new EzCanvas3D("content");
const container = document.querySelector("#welcome");
const gl = ez3d.gl;

ez3d.mount(container);
ez3d.resize(window.innerWidth, window.innerHeight);
new ResizeObserver(() => ez3d.settings.fitContainer()).observe(container);

ez3d.camera.set({ position: [0, 1.2, 4.5], near: 0.1, far: 100, fov: 45 });
ez3d.camera.lookAt([0, 0.9, 0]);

const sea = new Nakusea(gl);

sea.init().then(() => {
    sea.spawn({
        position: [0, 0, 0],
        rotation: EzMath.Quat.fromEulerYPR(45, 0, 0),
        behavior: (self) => self.walk(),
    });
}).catch(err => console.error("[contentCanvas] Nakusea init failed:", err));

let lastT = performance.now();
function frame(now) {
    const dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;

    sea.update(dt);

    EzRender.applyState(gl, { clear: ['color', 'depth'] });
    sea.render(ez3d.camera);

    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

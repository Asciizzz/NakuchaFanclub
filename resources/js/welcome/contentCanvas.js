const SHADER_LIT = "lit";

function buildLitShader() {
    return new EzShader3D().describe({
        renderCfg: { blend: true, cull: 'back', rQueue: 1000 },
        vertex: {
            hasSkeleton: true,
            attributes: [
                { name: "a_position",   size: 3 },
                { name: "a_normal",     size: 3, default: [0, 1, 0, 0] },
                { name: "a_uv",         size: 2 },
                { name: "a_boneID",     size: 4 },
                { name: "a_boneWeight", size: 4, default: [1, 0, 0, 0] },
            ],
            instanceData: [
                { name: "a_instMat4",  type: "mat4" },
                { name: "a_instColor", type: "vec4", default: [1, 1, 1, 1] },
            ],
            defaultKeys: { view: "u_view", projection: "u_proj" },
            outputs: [
                { name: "v_uv",     type: "vec2" },
                { name: "v_normal", type: "vec3" },
                { name: "v_color",  type: "vec4" },
            ],
            main: `
                mat4 skin = computeSkin(a_boneID, a_boneWeight);
                mat4 model = a_instMat4 * skin;
                gl_Position = u_proj * u_view * model * vec4(a_position, 1.0);
                v_uv     = a_uv;
                v_normal = normalize(mat3(model) * a_normal);
                v_color  = a_instColor;
            `,
        },
        fragment: {
            defaultKeys: { fill: "u_fill", albedo: "u_albedo" },
            outputColor: "fragColor",
            main: `
                vec4 base = texture(u_albedo, v_uv);
                float ndl = clamp(dot(normalize(v_normal), normalize(vec3(0.4, 0.8, 0.6))), 0.0, 1.0);
                // float lit = mix(0.55, 1.0, ndl);
                float lit = 1.0;
                vec3 fragRGB = base.rgb * v_color.rgb * u_fill.rgb * lit;
                float fragA = base.a * v_color.a * u_fill.a;

                fragColor = vec4(fragRGB, fragA);
            `,
        },
    });
}

const canvas3d = new EzCanvas3D("content");
const container = document.querySelector("#welcome");
canvas3d.mount(container);
canvas3d.resize(window.innerWidth, window.innerHeight);

const project = new EzProject(canvas3d);
project.addShader(SHADER_LIT, buildLitShader());

project.camera.set({
    position: [0, 1.2, 4.5],
    near: 0.1, far: 100, fov: 45,
    aspect: canvas3d.info.aspectRatio,
});
project.camera.lookAt([0, 0, 0]);

new ResizeObserver(() => {
    canvas3d.fitContainer();
    project.camera.set({ aspect: canvas3d.info.aspectRatio });
}).observe(container);

let nakurinRoot = null;

EzLoader.load("/Models/Nakurin.glb")
    .then(model => {
        const scene = project.addModel(model, { sceneName: "Nakurin" });
        project.setActiveScene(scene);

        // Find the topmost child of scene.root - that's Nakurin's model root.
        nakurinRoot = scene.root.children[0] ?? null;
    })
    .catch(err => console.error("[contentCanvas] Nakurin load failed:", err));

let lastT = performance.now();
function frame(now) {
    const dt = Math.min((now - lastT) / 1000, 0.05);
    lastT = now;

    if (nakurinRoot) {
        // Idle yaw spin around Y.
        const t = now * 0.0005;
        const q = EzMath.fromEulerYPR(new Quat(), Math.sin(t) * 25, 0, 0);
        EzMath.compose(
            nakurinRoot.transform.local,
            new Vec3(0, 0, 0),
            q,
            new Vec3(1, 1, 1),
        );
    }

    project.update(dt);
    project.render();

    requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

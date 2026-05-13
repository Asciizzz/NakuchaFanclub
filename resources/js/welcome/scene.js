const container = document.getElementById("main-canvas");

const project = new ZProject("main-canvas", { antialias: true, alpha: true });
project.mount(container).fitContainer();

const camera = project.camera;
if (camera) {
    camera.fov = 45;
    camera.near = 0.1;
    camera.far = 200;
    camera.position = ZMath.V3.set(0, 1.2, 4.8);
    camera.lookAt(ZMath.V3.set(0, 0.8, 0));
    camera.aspect = container.clientWidth / container.clientHeight;
}

new ResizeObserver(() => {
    project.fitContainer();
    if (camera) camera.aspect = container.clientWidth / container.clientHeight;
}).observe(container);

project.registerShader("model-default", {
    vertex: {
        outputs: [{ name: "v_uv", type: "vec2" }],
        main: `
            mat4 instModel = mat4(a_instModel0, a_instModel1, a_instModel2, a_instModel3);
            vec4 worldPos = u_model * instModel * vec4($POSITION$, 1.0);
            gl_Position = u_proj * u_view * worldPos;
            v_uv = a_uv;
        `,
    },
    fragment: {
        inputs: [{ name: "v_uv", type: "vec2" }],
        main: `
            vec4 texel = texture($ALBEDO_TEX$, v_uv);
            vec4 baseColor = texel.a > 0.0 ? texel : $FILL_COLOR$;
            fragColor = baseColor;
        `,
    },
});

async function main() {
    const sceneID = await project.loadFromURL("/Models/Frog.glb", {
        defaultShaderID: "model-default",
    });
    const scene = project.getScene(sceneID);
    if (!scene) throw new Error("Loaded scene is missing");

    const meshNodes = scene.findByComponent("MeshRenderer");
    const target = meshNodes.length > 0 ? meshNodes[0][1] : null;
    const transform = target ? target.get("Transform") : null;

    const start = performance.now();
    function frame() {
        const t = (performance.now() - start) * 0.001;

        if (transform) {
            const y = Math.sin(t * 1.4) * 0.35;
            const tr = ZMath.M4.fromTranslation(ZMath.V3.set(0, y, -1.8));
            const rot = ZMath.M4.fromRotationY(t * 0.8);
            ZMath.M4.mul(tr, rot, transform.local);
        }

        ZRender.setState(project.gl, {
            clear: ["color", "depth"],
            clearColor: [0, 0, 0, 0],
            depthTest: true,
            cull: "back",
            blend: true,
        });

        scene.render();
        requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
}

main().catch((error) => {
    console.error("[welcome/scene] model demo failed", error);
});

import { AzCamera } from "../AzLib/AzCamera.js";
import WrProject from "../WeebRender/Core/Project.js";

import * as Azm from "../AzLib/Azm.js";

const container = document.getElementById("main-canvas");

if (!container) {
    console.warn("[WrScene] #main-canvas is missing");
} else {
    run().catch((error) => {
        console.error("[WrScene] fatal error", error);
    });
}

async function run() {
    const project = new WrProject({
        canvas: { id: "wr-canvas", alpha: true, maxPixelRatio: 2 },
        backend: {
            prefer: "webgpu",
            pickBest: {
                policy: {
                    preferFallback: false,
                },
            },
        },
    });

    await project.init();
    project.mount(container).fitContainer();

    const camera = new AzCamera({
        position: [0, 1, 5],
        near: 0.1,
        far: 250,
        fov: 45,
    });
    camera.lookAt([0, 1, 0]);
    project.setCamera(camera);

    project.registerShader("wr-default", {
        vertexAbiVersion: 1,
        mode: "template",
        links: [
            { name: "out_uv", type: "vec2f" },
        ],
        renderCfg: {
            clearColor: [0.00, 0.00, 0.00, 0.0],
            clearDepth: 1.0,
            depthTest: true,
            depthWrite: true,
            cull: "back",
            blend: false,
        },
        vertex: {
            wgslMain: `
                out_uv = $UV$;
                if ($HAS_MORPH$) {
                    output.position = $VIEW$ * $INST_MODEL$ * vec4f($POSITION$ + ($MORPH_POS$ * $MORPH_WEIGHT$), 1.0);
                } else {
                    output.position = $VIEW$ * $INST_MODEL$ * vec4f($POSITION$, 1.0);
                }
            `,
            glslMain: `
                out_uv = $UV$;
                if ($HAS_MORPH$) {
                    gl_Position = $VIEW$ * $INST_MODEL$ * vec4($POSITION$ + ($MORPH_POS$ * $MORPH_WEIGHT$), 1.0);
                } else {
                    gl_Position = $VIEW$ * $INST_MODEL$ * vec4($POSITION$, 1.0);
                }
            `,
        },
        fragment: {
            wgslMain: `
                $OUT_COLOR$ = textureSample($ALBEDO_TEX$, texSampler, out_uv) * $ALBEDO_COLOR$;
            `,
            glslMain: `
                $OUT_COLOR$ = texture($ALBEDO_TEX$, out_uv) * $ALBEDO_COLOR$;
            `,
        },
    });

    try {
        const sceneId = await project.loadModelFromURL("/Models/Nakurin.glb", { useNow: true });
        console.info("[WrScene] model loaded", sceneId);
    } catch (error) {
        console.warn("[WrScene] model load skipped", String(error?.message ?? error));
    }

    new ResizeObserver(() => {
        project.fitContainer();
    }).observe(container);

    let lastTime = performance.now();
    function frame(now) {
        const dt = (now - lastTime) * 0.001;
        lastTime = now;

        const scene = project.getActiveScene();
        const ltr = scene.nodes[0].components.Transform.local;
        const dir = Azm.Vec3([0, dt, 0]);
        Azm.Mat4.translate(ltr, dir, ltr);

        project.update(dt);
        project.render();

        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}

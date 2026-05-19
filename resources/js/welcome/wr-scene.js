import { AzCamera } from "../AzLib/AzCamera.js";
import WrAsset from "../WeebRender/Core/Asset.js";

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
    const asset = new WrAsset({
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

    await asset.init();
    asset.mount(container).fitContainer();

    const camera = new AzCamera({
        position: [0, 1, 5],
        near: 0.1,
        far: 250,
        fov: 45,
    });
    camera.lookAt([0, 1, 0]);
    asset.setCamera(camera);

    asset.registerShader("wr-default", {
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

    let scene = null;
    try {
        scene = await asset.loadModelFromURL("/Models/Nakurin.glb");
        console.info("[WrScene] model loaded", scene.id);
    } catch (error) {
        console.warn("[WrScene] model load skipped", String(error?.message ?? error));
    }

    new ResizeObserver(() => {
        asset.fitContainer();
    }).observe(container);

    let lastTime = performance.now();
    function frame(now) {
        const dt = (now - lastTime) * 0.001;
        lastTime = now;

        if (scene) {
            const root = scene.node(scene.rootId);
            const tx = root?.get("Transform");
            const ltr = tx?.local ?? null;
            if (ltr) {
                const dir = Azm.Vec3([0, dt, 0]);
                Azm.Mat4.translate(ltr, dir, ltr);
            }

            scene.update(dt);
            scene.render();
        }

        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}

const container = document.getElementById("main-canvas");

const project = new EzProject("main-canvas", { antialias: true, alpha: true });
project.mount(container).fitContainer();

const camera = project.camera;
if (camera) {
    camera.fov = 45;
    camera.near = 0.1;
    camera.far = 200;
    camera.position = ZMath.V3.set(0, 4, 4);
    camera.lookAt(ZMath.V3());
    camera.aspect = container.clientWidth / container.clientHeight;
}

new ResizeObserver(() => {
    project.fitContainer();
    if (camera) camera.aspect = container.clientWidth / container.clientHeight;
}).observe(container);

const cameraControl = {
    keys: Object.create(null),
    yaw: 0,
    pitch: 0,
    moveSpeed: 7.5,
    lookSensitivity: 0.0022,
    pitchLimit: 1.52,
    pointerTarget: container.querySelector("canvas") ?? container,
};

if (camera) {
    const f = camera.forward;
    cameraControl.yaw = Math.atan2(-f[0], -f[2]);
    cameraControl.pitch = Math.asin(Math.max(-1, Math.min(1, Number(f[1]) || 0)));
}

function applyCameraLook() {
    if (!camera) return;
    const qYaw = ZMath.Q.fromAxisAngle(ZMath.V3.UP, cameraControl.yaw);
    const qPitch = ZMath.Q.fromAxisAngle(ZMath.V3.RIGHT, cameraControl.pitch);
    ZMath.Q.mul(qYaw, qPitch, camera.orientation);
}

applyCameraLook();

window.addEventListener("keydown", (event) => {
    cameraControl.keys[event.code] = true;
});
window.addEventListener("keyup", (event) => {
    cameraControl.keys[event.code] = false;
});
window.addEventListener("blur", () => {
    cameraControl.keys = Object.create(null);
});

cameraControl.pointerTarget?.addEventListener("click", () => {
    cameraControl.pointerTarget.requestPointerLock?.();
});

document.addEventListener("mousemove", (event) => {
    if (!camera || document.pointerLockElement !== cameraControl.pointerTarget) return;
    cameraControl.yaw -= event.movementX * cameraControl.lookSensitivity;
    cameraControl.pitch -= event.movementY * cameraControl.lookSensitivity;
    cameraControl.pitch = Math.max(-cameraControl.pitchLimit, Math.min(cameraControl.pitchLimit, cameraControl.pitch));
    applyCameraLook();
});

project.registerShader("model-default", {
    renderCfg: {
        cull: "back",
        blend: true,
        depthTest: true,
        depthWrite: true,
    },
    vertex: {
        outputs: [
            { name: "v_uv", type: "vec2" },
            { name: "v_slot0Color", type: "vec4" },
        ],
        main: `
            vec3 localPos = $POSITION$;
            if ($HAS_MORPH$) localPos += $MORPH_POS$ * $MORPH_WEIGHT$;
            vec4 weights = $BONE_WEIGHTS$;
            float wsum = weights.x + weights.y + weights.z + weights.w;
            mat4 skin = mat4(1.0);
            if (wsum > 0.00001) {
                ivec4 ids = ivec4($BONE_IDS$);
                skin =
                    weights.x * $SKIN_PALETTE$[clamp(ids.x, 0, $SKIN_MAX_INDEX$)] +
                    weights.y * $SKIN_PALETTE$[clamp(ids.y, 0, $SKIN_MAX_INDEX$)] +
                    weights.z * $SKIN_PALETTE$[clamp(ids.z, 0, $SKIN_MAX_INDEX$)] +
                    weights.w * $SKIN_PALETTE$[clamp(ids.w, 0, $SKIN_MAX_INDEX$)];
            }
            vec4 skinnedPos = skin * vec4(localPos, 1.0);
            gl_Position = $PROJECTION$ * $VIEW$ * $INST_MODEL$ * skinnedPos;
            v_uv = $UV$;
            v_slot0Color = $INST_SLOT0$;
        `,
    },
    fragment: {
        inputs: [
            { name: "v_uv", type: "vec2" },
            { name: "v_slot0Color", type: "vec4" },
        ],
        main: `
            vec4 texel = texture($ALBEDO_TEX$, v_uv);

            float alpha = texel.a * v_slot0Color.a * $ALBEDO_COLOR$.a;
            if (alpha < 0.01) discard;

            vec3 rgb = texel.rgb * v_slot0Color.rgb * $ALBEDO_COLOR$.rgb;
            $OUT_COLOR$ = vec4(rgb, texel.a * v_slot0Color.a);
        `,
    },
});

async function main() {
    const sourceSceneID = await project.loadModelFromURL("/Models/Nakurin.glb");
    const sourceScene = project.getScene(sourceSceneID);
    if (!sourceScene) throw new Error("Loaded source scene is missing");

    // A standalone scene that utilizes the ZProject's shared resources
    const compositeScene = new EzScene("WacaoNiMa", {
        sceneID: "Wacao",
        gl: project.gl,
        assets: project.assets,
        camera: project.camera
    });

    console.log(compositeScene.nodes);

    const merged = compositeScene.addScene(sourceScene, { suffix: "_base" });
    const nodeIds = Object.values(merged?.map ?? {});
    const rootNode = compositeScene.node(nodeIds[0] ?? compositeScene.rootId);

    let boundNodeId = null;
    for (const nodeId of nodeIds) {
        const node = compositeScene.node(nodeId);
        const meshRenderer = node?.get("MeshRenderer");
        if (!meshRenderer) continue;
        meshRenderer.clearShaders().withShader("model-default");
        meshRenderer.setSlot(0, { x: 1.0, y: 1.0, z: 1.0, w: 1.0 });

        const skelNode = compositeScene.node(meshRenderer.skeletonNode ?? "");
        const skeleton = skelNode?.get("Skeleton");
        if (!boundNodeId && skeleton instanceof Skeleton) boundNodeId = nodeId;
    }

    const nakurin = compositeScene.addComponent(rootNode?.id ?? compositeScene.rootId, "Custom", new Nakurin());
    if (nakurin instanceof Nakurin && boundNodeId) nakurin.bind(boundNodeId);

    let previous = performance.now();
    function frame(now = performance.now()) {
        const deltaTime = (now - previous) * 0.001;
        previous = now;

        if (camera) {
            const speed = cameraControl.moveSpeed * deltaTime;
            const forward = camera.forward;
            const right = camera.right;

            if (cameraControl.keys.KeyW) {
                camera.position[0] += forward[0] * speed;
                camera.position[1] += forward[1] * speed;
                camera.position[2] += forward[2] * speed;
            }
            if (cameraControl.keys.KeyS) {
                camera.position[0] -= forward[0] * speed;
                camera.position[1] -= forward[1] * speed;
                camera.position[2] -= forward[2] * speed;
            }
            if (cameraControl.keys.KeyD) {
                camera.position[0] += right[0] * speed;
                camera.position[1] += right[1] * speed;
                camera.position[2] += right[2] * speed;
            }
            if (cameraControl.keys.KeyA) {
                camera.position[0] -= right[0] * speed;
                camera.position[1] -= right[1] * speed;
                camera.position[2] -= right[2] * speed;
            }
        }

        compositeScene.update(deltaTime);

        ZRender.setState(project.gl, {
            clear: ["color", "depth"],
            clearColor: [0, 0, 0, 0],
            depthTest: true,
            cull: "back",
            blend: true,
        });

        compositeScene.render({ skipUpdate: true });
        requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
}

main().catch((error) => {
    console.error("YOU FUCKED UP", error);
});

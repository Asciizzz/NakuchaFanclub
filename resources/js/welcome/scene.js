const container = document.getElementById("main-canvas");
if (!container) throw new Error("[WeebGPU scene] #main-canvas is required");

const project = new EzProject("main-canvas", { alpha: true, maxPixelRatio: 2 });
const camera = project.camera;

if (camera) {
    camera.fov = 45;
    camera.near = 0.1;
    camera.far = 200;
    camera.position = Azm.V3.set(0, 4, 4);
    camera.lookAt(Azm.V3());
    camera.aspect = Math.max(1e-6, container.clientWidth / Math.max(1, container.clientHeight));
}

const cameraControl = {
    keys: Object.create(null),
    yaw: 0,
    pitch: 0,
    moveSpeed: 7.5,
    lookSensitivity: 0.0022,
    pitchLimit: 1.52,
    pointerTarget: null,
};

function applyCameraLook() {
    if (!camera) return;
    const qYaw = Azm.Q.fromAxisAngle(Azm.V3.UP, cameraControl.yaw);
    const qPitch = Azm.Q.fromAxisAngle(Azm.V3.RIGHT, cameraControl.pitch);
    Azm.Q.mul(qYaw, qPitch, camera.orientation);
}

function hookCameraInput() {
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
}

function registerDefaultShader() {
    project.registerShader("model-default", {
        code: `
struct SceneUBO {
    viewProj: mat4x4f,
    cameraPos: vec4f,
}

struct ObjectUBO {
    model: mat4x4f,
    slot0: vec4f,
    albedoColor: vec4f,
    vtxFlags: vec4f,
    extras: vec4f,
    skinPalette: array<mat4x4f, 128>,
}

@group(0) @binding(0) var<uniform> sceneUBO: SceneUBO;
@group(1) @binding(0) var<uniform> objectUBO: ObjectUBO;
@group(1) @binding(1) var texSampler: sampler;
@group(1) @binding(2) var albedoTex: texture_2d<f32>;

struct VSIn {
    @location(0) position: vec3f,
    @location(1) normal: vec3f,
    @location(2) uv: vec2f,
    @location(3) boneID: vec4f,
    @location(4) boneWeight: vec4f,
    @location(5) morphPos: vec3f,
}

struct VSOut {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
    @location(1) slot0: vec4f,
}

@vertex
fn vs_main(input: VSIn) -> VSOut {
    var localPos = input.position;
    if (objectUBO.vtxFlags.y > 0.5) {
        localPos += input.morphPos * objectUBO.extras.x;
    }

    var skinned = vec4f(localPos, 1.0);
    let weights = input.boneWeight;
    let wsum = weights.x + weights.y + weights.z + weights.w;
    if (objectUBO.vtxFlags.x > 0.5 && wsum > 0.00001) {
        let ids = vec4i(input.boneID);
        let m =
            weights.x * objectUBO.skinPalette[clamp(ids.x, 0, 127)] +
            weights.y * objectUBO.skinPalette[clamp(ids.y, 0, 127)] +
            weights.z * objectUBO.skinPalette[clamp(ids.z, 0, 127)] +
            weights.w * objectUBO.skinPalette[clamp(ids.w, 0, 127)];
        skinned = m * vec4f(localPos, 1.0);
    }

    let worldPos = objectUBO.model * skinned;

    var out: VSOut;
    out.position = sceneUBO.viewProj * worldPos;
    out.uv = input.uv;
    out.slot0 = objectUBO.slot0;
    return out;
}

@fragment
fn fs_main(input: VSOut) -> @location(0) vec4f {
    let texel = textureSample(albedoTex, texSampler, input.uv);
    let alpha = texel.a * input.slot0.a * objectUBO.albedoColor.a;
    if (alpha < 0.01) {
        discard;
    }
    let rgb = texel.rgb * input.slot0.rgb * objectUBO.albedoColor.rgb;
    return vec4f(rgb, alpha);
}
`,
        vertex: {
            buffers: [{
                arrayStride: 76,
                attributes: [
                    { shaderLocation: 0, offset: 0, format: "float32x3" },
                    { shaderLocation: 1, offset: 12, format: "float32x3" },
                    { shaderLocation: 2, offset: 24, format: "float32x2" },
                    { shaderLocation: 3, offset: 32, format: "float32x4" },
                    { shaderLocation: 4, offset: 48, format: "float32x4" },
                    { shaderLocation: 5, offset: 64, format: "float32x3" },
                ],
            }],
        },
        fragment: {
            targets: [{ format: project.format }],
        },
        primitive: {
            topology: "triangle-list",
            cullMode: "back",
        },
        depthStencil: {
            format: "depth24plus",
            depthWriteEnabled: true,
            depthCompare: "less",
        },
    });
}

function stepCamera(deltaTime) {
    if (!camera) return;
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

async function main() {
    await project.init({
        alphaMode: "premultiplied",
        pickBest: {
            policy: {
                preferFallback: false,
                requiredLimits: { maxBindGroups: 2 },
            },
        },
    });

    project.mount(container).fitContainer();

    if (camera) {
        const f = camera.forward;
        cameraControl.yaw = Math.atan2(-f[0], -f[2]);
        cameraControl.pitch = Math.asin(Math.max(-1, Math.min(1, Number(f[1]) || 0)));
        applyCameraLook();
    }

    cameraControl.pointerTarget = container.querySelector("canvas") ?? container;
    hookCameraInput();

    new ResizeObserver(() => {
        project.fitContainer();
        if (camera) camera.aspect = Math.max(1e-6, container.clientWidth / Math.max(1, container.clientHeight));
    }).observe(container);

    registerDefaultShader();

    const sourceSceneID = await project.loadModelFromURL("/Models/Nakurin.glb");
    const sourceScene = project.getScene(sourceSceneID);
    if (!sourceScene) throw new Error("[WeebGPU scene] loaded source scene is missing");

    const compositeScene = new EzScene("WacaoNiMa", {
        sceneID: "Wacao",
        device: project.device,
        context: project.context,
        assets: project.assets,
        camera: project.camera,
        renderer: (targetScene, renderOpts = {}) => project.renderGraph?.render(targetScene, {
            ...renderOpts,
            depthView: project.canvas.depthView,
        }),
    });

    const merged = compositeScene.addScene(sourceScene, { suffix: "_base" });
    const nodeIds = Object.values(merged?.map ?? {});
    const rootNode = compositeScene.node(nodeIds[0] ?? compositeScene.rootId);

    let boundNodeId = null;
    for (const nodeId of nodeIds) {
        const node = compositeScene.node(nodeId);
        const meshRenderer = node?.get("MeshRenderer");
        if (!meshRenderer) continue;
        meshRenderer.clearShaders().withShader("model-default");
        meshRenderer.setSlot(0, { x: 1, y: 1, z: 1, w: 1 });

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

        stepCamera(deltaTime);
        compositeScene.update(deltaTime);
        compositeScene.render({
            skipUpdate: true,
            clearColor: { r: 0, g: 0, b: 0, a: 0 },
        });

        requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
}

main().catch((error) => {
    console.error("[WeebGPU scene] fatal error", error);
});


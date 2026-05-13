const container = document.getElementById("main-canvas");

const project = new ZProject("main-canvas", { antialias: true, alpha: true });
project.mount(container).fitContainer();

const camera = project.camera;
if (camera) {
    camera.fov = 45;
    camera.near = 0.1;
    camera.far = 200;
    camera.position = ZMath.V3.set(0, 0.5, 0.8);
    // camera.lookAt(ZMath.V3.set(0, 0.0, 0));
    camera.aspect = container.clientWidth / container.clientHeight;
}

new ResizeObserver(() => {
    project.fitContainer();
    if (camera) camera.aspect = container.clientWidth / container.clientHeight;
}).observe(container);

project.registerShader("model-default", {
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
            vec3 baseColor = texel.rgb * v_slot0Color.rgb;
            $OUT_COLOR$ = vec4(baseColor, texel.a * v_slot0Color.a);
        `,
    },
});

project.registerShader("model-outline", {
    renderCfg: {
        depthTest: true,
        depthWrite: false,
        cull: "front",
        blend: true,
        blendSrc: "SRC_ALPHA",
        blendDst: "ONE_MINUS_SRC_ALPHA",
    },
    vertex: {
        outputs: [{ name: "v_outlineColor", type: "vec4" }],
        main: `
            vec3 localPos = $POSITION$;
            vec3 localNormal = $NORMAL$;
            if ($HAS_MORPH$) {
                localPos += $MORPH_POS$ * $MORPH_WEIGHT$;
                localNormal = normalize(localNormal + $MORPH_NORMAL$ * $MORPH_WEIGHT$);
            }
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
            vec3 skinnedNormal = normalize((skin * vec4(localNormal, 0.0)).xyz);
            float outlineWidth = max($INST_SLOT1$.x, 0.001);
            vec3 expanded = skinnedPos.xyz + skinnedNormal * outlineWidth;
            gl_Position = $PROJECTION$ * $VIEW$ * $INST_MODEL$ * vec4(expanded, 1.0);
            v_outlineColor = $INST_SLOT0$;
        `,
    },
    fragment: {
        inputs: [{ name: "v_outlineColor", type: "vec4" }],
        main: `
            $OUT_COLOR$ = v_outlineColor;
        `,
    },
});

async function main() {
    const sourceSceneID = await project.loadFromURL("/Models/Agnes.glb", {
        defaultShaderID: "model-default",
    });
    const sourceScene = project.getScene(sourceSceneID);
    if (!sourceScene) throw new Error("Loaded source scene is missing");

    const compositeScene = new ZScene("FrogComposite", {
        sceneID: "frog-composite",
        gl: project.gl,
        assets: project.assets,
        camera: project.camera,
    });

    const firstTracker = compositeScene.addScene(sourceScene, {
        suffix: "_base",
    });

    const secondTracker = compositeScene.addScene(sourceScene, {
        suffix: "_outline",
    });

    for (const nodeId of Object.values(firstTracker.map)) {
        const node = compositeScene.node(nodeId);
        const meshRenderer = node?.get("MeshRenderer");
        if (meshRenderer) {
            meshRenderer.shaderID = "model-default";
            meshRenderer.setSlot(0, { x: 1.0, y: 1.0, z: 1.0, w: 1.0 });
        }
    }

    for (const nodeId of Object.values(secondTracker.map)) {
        const node = compositeScene.node(nodeId);
        const meshRenderer = node?.get("MeshRenderer");
        if (!meshRenderer) continue;
        meshRenderer.shaderID = "model-outline";
        meshRenderer.setSlot(0, { x: 0.00, y: 0.00, z: 0.00, w: 1.0 });
        meshRenderer.setSlot(1, { x: 0.0001, y: 0, z: 0, w: 0 });
    }

    const morphControllers = [];
    for (const [, node] of compositeScene.traverse(compositeScene.rootId, null, false)) {
        const meshRenderer = node.get("MeshRenderer");
        if (!meshRenderer?.meshID || !meshRenderer.morphWeights?.length) continue;
        const meshData = project.assets.getMeshData(meshRenderer.meshID);
        const morphName = meshData?.morphTargetNames?.[70] ?? "Target_0";
        morphControllers.push({ meshRenderer, morphName });
    }

    const root = compositeScene.root();
    const transform = root ? root.get("Transform") : null;
    const skeletonEntries = compositeScene.findByComponent("Skeleton");
    const animatedSkeletons = [];
    for (const entry of skeletonEntries) {
        const skelComp = entry.node.get("Skeleton");
        if (!skelComp?.skeletonID) continue;
        const skelData = project.assets.getSkeleton(skelComp.skeletonID);
        skelComp.bindSkeletonData(skelData);
        const hipByName = skelComp.resolveBoneIndex("Hip", skelData);
        const hipsByName = skelComp.resolveBoneIndex("Hips", skelData);
        const hipRef = hipByName >= 0
            ? "Hip"
            : (hipsByName >= 0 ? "Hips" : 0);
        animatedSkeletons.push({ skeleton: skelComp, hipRef });
    }

    const start = performance.now();
    function frame() {
        const t = (performance.now() - start) * 0.001;

        if (transform) {
            const y = Math.sin(t * 1.4) * 0.35;
            const tr = ZMath.M4.fromTranslation(ZMath.V3.set(0, y, -1.8));
            const rot = ZMath.M4.fromRotationY(t * 0.8);
            ZMath.M4.mul(tr, rot, transform.local);
        }

        const hipRotY = Math.sin(t * 2.2) * 0.55;
        for (const entry of animatedSkeletons) {
            entry.skeleton.set(entry.hipRef, { euler: [0, hipRotY, 0] });
        }

        const morphW = Math.sin(t * 3.4);
        for (const morph of morphControllers) {
            morph.meshRenderer.setMorphWeight(morph.morphName, morphW);
        }

        ZRender.setState(project.gl, {
            clear: ["color", "depth"],
            clearColor: [0, 0, 0, 0],
            depthTest: true,
            cull: "back",
            blend: true,
        });

        compositeScene.render();
        requestAnimationFrame(frame);
    }

    requestAnimationFrame(frame);
}

main().catch((error) => {
    console.error("YOU FUCKED UP", error);
});

const container = document.getElementById("main-canvas");

const project = new EzProject("main-canvas", { antialias: true, alpha: true });
project.mount(container).fitContainer();

const camera = project.camera;
if (camera) {
    camera.fov = 45;
    camera.near = 0.1;
    camera.far = 200;
    camera.position = ZMath.V3.set(0, 0, 0);
    camera.aspect = container.clientWidth / container.clientHeight;
}

new ResizeObserver(() => {
    project.fitContainer();
    if (camera) camera.aspect = container.clientWidth / container.clientHeight;
}).observe(container);

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
    const sourceSceneID = await project.loadFromURL("/Models/Nakurin.glb", {
        defaultShaderID: "model-default",
    });
    const sourceScene = project.getScene(sourceSceneID);
    if (!sourceScene) throw new Error("Loaded source scene is missing");

    const compositeScene = new EzScene("FrogComposite", {
        sceneID: "frog-composite",
        gl: project.gl,
        assets: project.assets,
        camera: project.camera
    });

    const addedData = {};

    addedData.scene = compositeScene.addScene(sourceScene, {
        suffix: "_base"
    });
    addedData.nodeIds = Object.values(addedData.scene.map);

    addedData.root = compositeScene.node(addedData.nodeIds[0]);
    addedData.transform = addedData.root.get("Transform");

    addedData.meshRenderers = [];
    addedData.skeletons = [];
    for (const nodeId of addedData.nodeIds) {
        const node = compositeScene.node(nodeId);

        const meshRenderer = node?.get("MeshRenderer");
        if (meshRenderer) {
            meshRenderer.shaderID = "model-default";
            meshRenderer.setSlot(0, { x: 1.0, y: 1.0, z: 1.0, w: 1.0 });

            addedData.meshRenderers.push(meshRenderer);

            const mesh = meshRenderer.meshAsset;
            console.log(mesh);
        }

        const skeleton = node?.get("Skeleton");
        if (skeleton) {
            addedData.skeletons.push(skeleton);
            console.log(skeleton);
        }
    }

    console.log("Added data", addedData);

    const start = performance.now();
    function frame() {
        const t = (performance.now() - start) * 0.001;

        if (addedData.transform) {
            const y = Math.sin(t * 1.4) * 0.35 - 1.4;
            const tr = ZMath.M4.fromTranslation(ZMath.V3.set(0, y, -4.8));
            const scl = ZMath.M4.fromScaling(ZMath.V3.set(1, 1, 1));
            ZMath.M4.mul(tr, scl, addedData.transform.local);
        }

        for (const meshRenderer of addedData.meshRenderers) {
            meshRenderer.setMorphWeight("Mouth_15_0(OdorokiB)[M_Face]", Math.sin(t * 3.7) * 0.5 + 0.5);
            
        }

        const hipRotY = Math.sin(t * 2.2) * 0.55;
        for (const skeleton of addedData.skeletons) {
            skeleton.set("Hip", { euler: [0, hipRotY, 0] });
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

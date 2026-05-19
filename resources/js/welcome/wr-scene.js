import { AzCamera } from "../AzLib/AzCamera.js";
import WrAsset from "../WeebRender/Core/Asset.js";

import * as Azm from "../AzLib/Azm.js";

const container = document.getElementById("main-canvas");
const EYE_CLOSE_MORPH = "Eye_2_R(CloseA)[M_Face]";

function createEmptyCompositeScene(asset) {
    return asset.createScene({
        id: "wr-composite",
        name: "WrComposite",
        rootId: "CompositeRoot",
        nodes: [{
            id: "CompositeRoot",
            name: "CompositeRoot",
            parent: null,
            children: [],
            components: {
                Transform: {
                    local: new Float32Array([
                        1, 0, 0, 0,
                        0, 1, 0, 0,
                        0, 0, 1, 0,
                        0, 0, 0, 1,
                    ]),
                    world: new Float32Array([
                        1, 0, 0, 0,
                        0, 1, 0, 0,
                        0, 0, 1, 0,
                        0, 0, 0, 1,
                    ]),
                },
            },
        }],
    });
}

function createInstanceBundle(compositeScene, sourceScene, offset = [0, 0, 0], speed = 1) {
    const tracker = compositeScene.instantiate(sourceScene, compositeScene.rootId);
    const rootId = tracker.map[sourceScene.rootId] ?? tracker.nodeIds[0] ?? null;
    const rootNode = rootId ? compositeScene.node(rootId) : null;
    const rootTransform = rootNode?.get("Transform") ?? null;
    if (rootTransform?.local) {
        rootTransform.local.set(Azm.Mat4.fromTranslation(offset));
    }

    const morphs = [];
    const skeletons = [];
    for (const nodeId of tracker.nodeIds) {
        const node = compositeScene.node(nodeId);
        const mr = node?.get("MeshRenderer") ?? null;
        if (!mr) continue;
        morphs.push(mr);

        const skeletonNode = mr.skeletonNode ? compositeScene.node(mr.skeletonNode) : null;
        const skeleton = skeletonNode?.get("Skeleton") ?? null;
        if (skeleton && !skeletons.includes(skeleton)) {
            skeletons.push(skeleton);
        }
    }

    let hip = null;
    const skeleton = skeletons[0] ?? null;
    if (skeleton && typeof skeleton.resolveBoneIndex === "function" && typeof skeleton.set === "function") {
        let ref = 0;
        if (skeleton.resolveBoneIndex("hip") >= 0) ref = "hip";
        else if (skeleton.resolveBoneIndex("Hips") >= 0) ref = "Hips";
        hip = { skeleton, ref };
    }

    return {
        tracker,
        rootNode,
        rootTransform,
        morphs,
        skeletons,
        hip,
        offset: Float32Array.from(offset),
        speed: Number(speed) || 1,
        time: 0,
    };
}

function logMeshMorphTargetNames(scene, asset) {
    const meshNodes = scene.findByComponent("MeshRenderer");
    console.group(`[WrScene] Mesh morph targets (${meshNodes.length} mesh renderers)`);
    for (let i = 0; i < meshNodes.length; i++) {
        const node = meshNodes[i];
        const mr = node?.get("MeshRenderer") ?? null;
        const meshID = String(mr?.meshID ?? "");
        const mesh = asset.assets.getMesh(meshID);
        const names = Array.isArray(mesh?.morphTargetNames) ? mesh.morphTargetNames : [];
        console.log({
            nodeId: node?.id ?? null,
            nodeName: node?.name ?? null,
            meshID,
            morphTargetCount: Number(mesh?.morphTargetCount ?? names.length ?? 0),
            morphTargetNames: names,
        });
    }
    console.groupEnd();
}

function dumpSceneStructure(scene, label = "scene") {
    if (!scene) return;
    const nodes = Array.isArray(scene.nodes) ? scene.nodes : [];
    const nodeById = new Map(nodes.map((n) => [String(n.id), n]));

    const formatComponent = (key, value) => {
        if (!value || typeof value !== "object") return value;
        if (key === "Transform") {
            return {
                local: ArrayBuffer.isView(value.local) ? `mat4(${value.local.length})` : null,
                world: ArrayBuffer.isView(value.world) ? `mat4(${value.world.length})` : null,
            };
        }
        if (key === "MeshRenderer") {
            return {
                active: value.active ?? true,
                meshID: value.meshID ?? null,
                shaderKeys: Array.isArray(value.shaderKeys) ? value.shaderKeys.slice() : [],
                skeletonNode: value.skeletonNode ?? null,
                morphWeights: ArrayBuffer.isView(value.morphWeights) ? `f32[${value.morphWeights.length}]` : null,
            };
        }
        if (key === "Skeleton") {
            return {
                skeletonID: value.skeletonID ?? value.skeletonId ?? null,
                bones: Array.isArray(value.bones) ? `bones[${value.bones.length}]` : null,
            };
        }
        return Object.keys(value);
    };

    const walk = (nodeId, depth = 0) => {
        const node = scene.node(nodeId);
        const raw = nodeById.get(String(nodeId));
        if (!node || !raw) return;
        const indent = "  ".repeat(depth);
        console.group(`${indent}Node ${node.id} (${node.name})`);
        console.log({
            id: node.id,
            name: node.name,
            parentId: node.parentId,
            children: Array.isArray(raw.children) ? raw.children.slice() : [],
        });
        const comps = node.components ?? {};
        console.group(`${indent}Components`);
        for (const [key, value] of Object.entries(comps)) {
            console.log(`${key}:`, formatComponent(key, value));
        }
        console.groupEnd();
        const children = Array.isArray(raw.children) ? raw.children : [];
        for (const childId of children) walk(childId, depth + 1);
        console.groupEnd();
    };

    console.group(`[WrScene] Tree: ${label}`);
    console.log({
        sceneId: scene.id,
        rootId: scene.rootId,
        nodeCount: nodes.length,
    });
    walk(scene.rootId, 0);
    console.groupEnd();
}

if (!container) {
    console.warn("[WrScene] #main-canvas is missing");
} else {
    run().catch((error) => {
        console.error("[WrScene] fatal error", error);
    });
}

async function run() {
    let backendPrefer = "webgpu";
    if (typeof window !== "undefined" && typeof window.prompt === "function") {
        const raw = String(window.prompt("Select backend: 0 = webgpu, 1 = webgl2", "0") ?? "").trim();
        backendPrefer = raw === "1" ? "webgl2" : "webgpu";
    }

    const asset = new WrAsset({
        canvas: { id: "wr-canvas", alpha: true, maxPixelRatio: 2 },
        backend: {
            prefer: backendPrefer,
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
                var localPos = $POSITION$;
                if ($HAS_MORPH$) {
                    localPos += $MORPH_POS$ * $MORPH_WEIGHT$;
                }

                var skinned = vec4f(localPos, 1.0);
                if ($HAS_RIG$) {
                    let weights = $BONE_WEIGHT$;
                    let wsum = weights.x + weights.y + weights.z + weights.w;
                    if (wsum > 0.00001) {
                        let ids = vec4i($BONE_ID$);
                        let skin =
                            weights.x * $SKIN_PALETTE$[clamp(ids.x, 0, 127)] +
                            weights.y * $SKIN_PALETTE$[clamp(ids.y, 0, 127)] +
                            weights.z * $SKIN_PALETTE$[clamp(ids.z, 0, 127)] +
                            weights.w * $SKIN_PALETTE$[clamp(ids.w, 0, 127)];
                        skinned = skin * vec4f(localPos, 1.0);
                    }
                }

                output.position = $VIEW$ * $INST_MODEL$ * skinned;
            `,
            glslMain: `
                out_uv = $UV$;
                vec3 localPos = $POSITION$;
                if ($HAS_MORPH$) {
                    localPos += $MORPH_POS$ * $MORPH_WEIGHT$;
                }

                vec4 skinned = vec4(localPos, 1.0);
                if ($HAS_RIG$) {
                    vec4 weights = $BONE_WEIGHT$;
                    float wsum = weights.x + weights.y + weights.z + weights.w;
                    if (wsum > 0.00001) {
                        ivec4 ids = ivec4($BONE_ID$);
                        mat4 skin =
                            weights.x * $SKIN_PALETTE$[clamp(ids.x, 0, 127)] +
                            weights.y * $SKIN_PALETTE$[clamp(ids.y, 0, 127)] +
                            weights.z * $SKIN_PALETTE$[clamp(ids.z, 0, 127)] +
                            weights.w * $SKIN_PALETTE$[clamp(ids.w, 0, 127)];
                        skinned = skin * vec4(localPos, 1.0);
                    }
                }

                gl_Position = $VIEW$ * $INST_MODEL$ * skinned;
            `,
        },
        fragment: {
            wgslMain: `
                $OUT_COLOR$ = textureSample($ALBEDO_TEX$, texSampler, out_uv) * $ALBEDO_COLOR$;
            `,
            glslMain: `
                // $OUT_COLOR$ = texture($ALBEDO_TEX$, out_uv) * $ALBEDO_COLOR$;

                vec4 texColor = texture($ALBEDO_TEX$, out_uv) * $ALBEDO_COLOR$;
                texColor.rg *= 0.5;
                $OUT_COLOR$ = texColor;
            `,
        },
    });

    let scene = null;
    let composite = null;
    let bundles = [];
    try {
        scene = await asset.loadModelFromURL("/Models/Agnes.glb");
        console.info("[WrScene] model loaded", scene.id);
        logMeshMorphTargetNames(scene, asset);
        dumpSceneStructure(scene, "source");
        composite = createEmptyCompositeScene(asset);

        bundles = [
            // createInstanceBundle(composite, scene, [-0.2, 0, 0], 0.6),
            createInstanceBundle(composite, scene, [0, 0, 0], 1.1),
            // createInstanceBundle(composite, scene, [0.2, 0, 0], 1.8),
        ];

        console.log(composite);
        dumpSceneStructure(composite, "composite");

        for (const [index, bundle] of bundles.entries()) {
            for (const morph of bundle.morphs) {
                if (!morph?.resolveMorphIndex) continue;
                const targetIndex = morph.resolveMorphIndex(EYE_CLOSE_MORPH);
                if (targetIndex >= 0) {
                    console.info("[WrScene] eye morph resolved", {
                        meshID: morph.meshID,
                        morphName: EYE_CLOSE_MORPH,
                        morphIndex: targetIndex,
                    });
                }
            }
        }
        console.info("[WrScene] composite instantiated", bundles.length);
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

        if (composite && bundles.length > 0) {
            for (let i = 0; i < bundles.length; i++) {
                const bundle = bundles[i];
                bundle.time += dt;

                // if (bundle.rootTransform?.local) {
                //     const local = Azm.Mat4.fromTranslation(bundle.offset);
                //     Azm.Mat4.rotateY(local, bundle.time * bundle.speed, local);
                //     bundle.rootTransform.local.set(local);
                // }

                if (bundle.hip) {
                    const angle = Math.sin((bundle.time * 2.0) + (i * 0.6)) * 0.35;
                    bundle.hip.skeleton.set(bundle.hip.ref, Azm.Mat4.fromRotationY(angle));
                }

                const eyeCloseWeight = 0.5 + (0.5 * Math.sin((bundle.time * 5.0) + (i * 0.7)));
                for (const morph of bundle.morphs) {
                    if (morph?.setMorphWeight) {
                        morph.setMorphWeight(EYE_CLOSE_MORPH, eyeCloseWeight);
                    }
                }
            }

            composite.update(dt);
            composite.render();
        }

        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}

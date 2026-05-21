import { AzCamera } from "../AzLib/AzCamera.js";
import WrWorld from "../WeebRender/Core/World.js";
import * as Azm from "../AzLib/Azm.js";

const container = document.getElementById("main-canvas");
const EYE_CLOSE_MORPH = "Eye_2_R(CloseA)[M_Face]";
const WR_NODE_CORE_KEYS = new Set(["ctx", "id", "parentId", "childIds", "name"]);

/**
 * Create identity matrix clone.
 * @returns {Float32Array}
 */
function wrIdentityM4() {
    return new Float32Array([
        1, 0, 0, 0,
        0, 1, 0, 0,
        0, 0, 1, 0,
        0, 0, 0, 1,
    ]);
}

/**
 * Iterate one branch into flat node list.
 * @param {import("../AzLib/Azt.js").Node|null} branchRoot branch root node
 * @returns {import("../AzLib/Azt.js").Node[]}
 */
function wrCollectBranchNodes(branchRoot) {
    if (!branchRoot) return [];
    const out = [];
    for (const node of branchRoot.traverse({
        mode: "dfs_pre",
        includeFrom: true,
    })) {
        out.push(node);
    }
    return out;
}

/**
 * Create one empty composite root branch.
 * @param {WrWorld} world world context
 * @returns {import("../AzLib/Azt.js").Node}
 */
function createEmptyCompositeRoot(world) {
    const root = world.addNode(null);
    if (!root) throw new Error("[WrWorld] failed to create composite root");
    root.name = "CompositeRoot";
    root.Transform = {
        local: wrIdentityM4(),
        world: wrIdentityM4(),
    };
    return root;
}

/**
 * Create one copied branch bundle from model root.
 * @param {WrWorld} world world context
 * @param {import("../AzLib/Azt.js").Node} compositeRoot composite branch root
 * @param {import("../AzLib/Azt.js").Node} sourceRoot source model branch root
 * @param {number[]} [offset=[0,0,0]] translation offset
 * @param {number} [speed=1] animation speed
 * @returns {object|null}
 */
function createInstanceBundle(world, compositeRoot, sourceRoot, offset = [0, 0, 0], speed = 1) {
    const copiedRoot = world.copyBranch(sourceRoot, compositeRoot);
    if (!copiedRoot) return null;

    const rootTransform = copiedRoot.Transform ?? copiedRoot.transform ?? null;
    if (rootTransform?.local) {
        rootTransform.local.set(Azm.Mat4.fromTranslation(offset));
    }

    const nodeIds = [];
    const morphs = [];
    const skeletons = [];
    for (const node of wrCollectBranchNodes(copiedRoot)) {
        nodeIds.push(node.id);
        const mr = node.MeshRenderer ?? node.meshRenderer ?? null;
        if (!mr) continue;
        morphs.push(mr);

        const skeletonNode = mr.skeletonNode ? world.getNode(mr.skeletonNode) : null;
        const skeleton = skeletonNode?.Skeleton ?? skeletonNode?.skeleton ?? null;
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
        rootNode: copiedRoot,
        rootTransform,
        nodeIds,
        morphs,
        skeletons,
        hip,
        offset: Float32Array.from(offset),
        speed: Number(speed) || 1,
        time: 0,
    };
}

/**
 * Print mesh morph target summary for one branch.
 * @param {WrWorld} world world context
 * @param {import("../AzLib/Azt.js").Node} branchRoot branch root node
 * @returns {void}
 */
function logMeshMorphTargetNames(world, branchRoot) {
    const meshNodes = wrCollectBranchNodes(branchRoot)
        .filter((node) => !!(node.MeshRenderer ?? node.meshRenderer ?? null));

    console.group(`[WrWorld] Mesh morph targets (${meshNodes.length} mesh renderers)`);
    for (const node of meshNodes) {
        const mr = node.MeshRenderer ?? node.meshRenderer ?? null;
        const meshID = String(mr?.meshID ?? "");
        const mesh = world.assets.getMesh(meshID);
        const names = Array.isArray(mesh?.morphTargetNames) ? mesh.morphTargetNames : [];
        console.log({
            nodeId: node.id,
            nodeName: node.name ?? null,
            meshID,
            morphTargetCount: Number(mesh?.morphTargetCount ?? names.length ?? 0),
            morphTargetNames: names,
        });
    }
    console.groupEnd();
}

/**
 * Dump branch hierarchy + component summary.
 * @param {WrWorld} world world context
 * @param {import("../AzLib/Azt.js").Node} branchRoot branch root node
 * @param {string} [label="branch"] label
 * @returns {void}
 */
function dumpBranchStructure(world, branchRoot, label = "branch") {
    if (!branchRoot) return;

    const formatComponent = (key, value) => {
        if (!value || typeof value !== "object") return value;
        if (key === "Transform" || key === "transform") {
            return {
                local: ArrayBuffer.isView(value.local) ? `mat4(${value.local.length})` : null,
                world: ArrayBuffer.isView(value.world) ? `mat4(${value.world.length})` : null,
            };
        }
        if (key === "MeshRenderer" || key === "meshRenderer") {
            return {
                active: value.active ?? true,
                meshID: value.meshID ?? null,
                shaderKeys: Array.isArray(value.shaderKeys) ? value.shaderKeys.slice() : [],
                skeletonNode: value.skeletonNode ?? null,
                morphWeights: ArrayBuffer.isView(value.morphWeights) ? `f32[${value.morphWeights.length}]` : null,
            };
        }
        if (key === "Skeleton" || key === "skeleton") {
            return {
                skeletonID: value.skeletonID ?? value.skeletonId ?? null,
                bones: Array.isArray(value.bones) ? `bones[${value.bones.length}]` : null,
            };
        }
        return Object.keys(value);
    };

    const walk = (nodeId, depth = 0) => {
        const node = world.getNode(nodeId);
        if (!node) return;
        const indent = "  ".repeat(depth);
        console.group(`${indent}Node ${node.id} (${node.name ?? node.id})`);
        console.log({
            id: node.id,
            name: node.name ?? null,
            parentId: node.parentId,
            children: Array.isArray(node.childIds) ? node.childIds.slice() : [],
        });
        console.group(`${indent}Components`);
        for (const [key, value] of Object.entries(node)) {
            if (WR_NODE_CORE_KEYS.has(key)) continue;
            if (!value || typeof value !== "object") continue;
            console.log(`${key}:`, formatComponent(key, value));
        }
        console.groupEnd();
        for (const childId of node.childIds ?? []) {
            walk(String(childId), depth + 1);
        }
        console.groupEnd();
    };

    console.group(`[WrWorld] Tree: ${label}`);
    console.log({
        worldId: world.id,
        branchRootId: branchRoot.id,
        rootCount: world.roots.length,
        branchNodeCount: wrCollectBranchNodes(branchRoot).length,
    });
    walk(branchRoot.id, 0);
    console.groupEnd();
}

if (!container) {
    console.warn("[WrWorld] #main-canvas is missing");
} else {
    run().catch((error) => {
        console.error("[WrWorld] fatal error", error);
    });
}

async function run() {
    let backendPrefer = "webgpu";
    if (typeof window !== "undefined" && typeof window.prompt === "function") {
        const raw = String(window.prompt("Select backend: 0 = webgpu, 1 = webgl2", "0") ?? "").trim();
        backendPrefer = raw === "1" ? "webgl2" : "webgpu";
    }

    const world = new WrWorld({
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

    await world.init();
    world.mount(container).fitContainer();

    const camera = new AzCamera({
        position: [0, 1, 5],
        near: 0.1,
        far: 250,
        fov: 45,
    });
    camera.lookAt([0, 1, 0]);
    world.setCamera(camera);

    world.registerShader("wr-default", {
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
                vec4 texColor = texture($ALBEDO_TEX$, out_uv) * $ALBEDO_COLOR$;
                texColor.rg *= 0.5;
                $OUT_COLOR$ = texColor;
            `,
        },
    });

    let sourceRoot = null;
    let compositeRoot = null;
    let bundles = [];
    try {
        sourceRoot = await world.loadModelFromURL("/Models/Agnes.glb");
        console.info("[WrWorld] model loaded", sourceRoot.id);
        logMeshMorphTargetNames(world, sourceRoot);
        dumpBranchStructure(world, sourceRoot, "source");

        compositeRoot = createEmptyCompositeRoot(world);
        bundles = [
            createInstanceBundle(world, compositeRoot, sourceRoot, [0, 0, 0], 1.1),
        ].filter(Boolean);

        dumpBranchStructure(world, compositeRoot, "composite");

        for (const bundle of bundles) {
            for (const morph of bundle.morphs) {
                if (!morph?.resolveMorphIndex) continue;
                const targetIndex = morph.resolveMorphIndex(EYE_CLOSE_MORPH);
                if (targetIndex >= 0) {
                    console.info("[WrWorld] eye morph resolved", {
                        meshID: morph.meshID,
                        morphName: EYE_CLOSE_MORPH,
                        morphIndex: targetIndex,
                    });
                }
            }
        }
        console.info("[WrWorld] composite instantiated", bundles.length);
    } catch (error) {
        console.warn("[WrWorld] model load skipped", String(error?.message ?? error));
    }

    new ResizeObserver(() => {
        world.fitContainer();
    }).observe(container);

    let lastTime = performance.now();
    function frame(now) {
        const dt = (now - lastTime) * 0.001;
        lastTime = now;

        if (compositeRoot && bundles.length > 0) {
            for (let i = 0; i < bundles.length; i++) {
                const bundle = bundles[i];
                bundle.time += dt;

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

            world.update(dt, { from: compositeRoot.id });
            world.render({ from: compositeRoot.id });
        }

        requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
}

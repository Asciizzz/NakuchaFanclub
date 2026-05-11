/**
 * EzProject.js - high-level scene/asset/render orchestrator.
 *
 * EzProject is to ZCanvas what tinyProject is to tinyVk: the canvas owns
 * the GL surface and nothing else, and the project owns *everything* you
 * actually care about - assets, scenes, the camera, the render loop. A
 * project contains many EzScenes; scenes contain Nodes; Nodes carry
 * components (transform/meshRender/skeleton/scripts) directly as plain
 * properties. JS lets us skip C++-style component registries entirely.
 *
 * Asset stores live on the project so component data can stay tiny - a
 * MeshRender3D is just `{ meshKey, color, ... }`, the heavy GL stuff is in
 * `project.meshes.get(meshKey)`.
 *
 * Instancing is handled exclusively here: one instance VBO per project,
 * uploaded fresh every draw chunk. VAOs are cached on demand keyed by
 * (shader, mesh). Meshes themselves stay shader-agnostic.
 *
 * Dependencies:
 *   ZCanvas.js   - ZMath/ZShader/EzMesh3D/ZRender/ZCamera
 *   EzLoader.js     - only used implicitly when you feed addModel() a model
 *                     loaded by EzLoader.load(...).
 *
 * Todo: rework the scene graph to inherit from EzTree instead
 */

(function () {
    "use strict";

    const TEX_UNIT_ALBEDO       = 0;
    const TEX_UNIT_BONES        = 1;
    const TEX_UNIT_MORPH_WEIGHT = 2;
    const TEX_UNIT_MORPH_DELTA  = 3; // first delta channel; +1 per extra

    // Shared scratch - GL calls are sync so this is safe to reuse.
    const _scratchMat = ZMath.M4();

    // --------------------------------------------------------------------
    // Components - plain factories. Attach the result directly to a node.
    // --------------------------------------------------------------------
    function Transform3D(local) {
        const t = { local: ZMath.M4.identity(), world: ZMath.M4.identity() };
        if (local && (ArrayBuffer.isView(local) || Array.isArray(local)) && local.length >= 16) t.local.set(local);
        return t;
    }

    function MeshRender3D(opts = {}) {
        return {
            meshKey:      opts.meshKey      ?? null,
            shaderKey:    opts.shaderKey    ?? null, // override the project's defaultShaderKey
            color:        opts.color        ? Float32Array.from(opts.color) : new Float32Array([1, 1, 1, 1]),
            morphWeights: opts.morphWeights ? Float32Array.from(opts.morphWeights) : null,
            skeletonNode: opts.skeletonNode ?? null, // ref to a Node holding a Skeleton3D
            visible:      opts.visible !== false,
        };
    }

    // skeletonAsset = { bones: [{ parent, name, localBind, inverseBind, children }] }
    function Skeleton3D(skeletonAsset) {
        const n = skeletonAsset.bones.length;
        const localPose = new Array(n);
        for (let i = 0; i < n; i++) {
            const m = ZMath.M4.identity();
            const lb = skeletonAsset.bones[i].localBind;
            if (lb) m.set(lb);
            localPose[i] = m;
        }
        return {
            asset:      skeletonAsset,
            localPose,
            finalPose:  Array.from({ length: n }, () => ZMath.M4.identity()),
            skinData:   new Float32Array(n * 16),
            paletteTex: null, // GL texture, lazily uploaded each frame
        };
    }

    function Script3D(opts = {}) {
        return {
            onStart:  opts.onStart  || null,
            onUpdate: opts.onUpdate || null,
            started:  false,
        };
    }

    // --------------------------------------------------------------------
    // Node - bare object so users can poke any field at will.
    // --------------------------------------------------------------------
    function makeNode(name, parent = null) {
        return {
            name, parent,
            children:   [],
            transform:  null,
            meshRender: null,
            skeleton:   null,
            scripts:    null,    // optional Script3D[]
            userData:   null,    // free-form
        };
    }

    // --------------------------------------------------------------------
    // EzScene - node graph + per-frame update.
    // --------------------------------------------------------------------
    class EzScene {
        constructor(project, name = "Scene") {
            this.project = project;
            this.name    = name;
            this.root    = makeNode("__root__");
            this.root.transform = Transform3D();
            this._nodes  = [this.root];
        }

        addNode(name = "Node", parent = this.root) {
            const n = makeNode(name, parent);
            n.transform = Transform3D();
            parent.children.push(n);
            this._nodes.push(n);
            return n;
        }

        removeNode(node) {
            if (!node || node === this.root) return false;
            const p = node.parent;
            if (p) {
                const i = p.children.indexOf(node);
                if (i >= 0) p.children.splice(i, 1);
            }
            const stack = [node];
            while (stack.length) {
                const n = stack.pop();
                stack.push(...n.children);
                const idx = this._nodes.indexOf(n);
                if (idx >= 0) this._nodes.splice(idx, 1);
            }
            return true;
        }

        // DFS - return false from cb to skip a subtree.
        traverse(cb, start = this.root) {
            const stack = [start];
            while (stack.length) {
                const n = stack.pop();
                if (cb(n) === false) continue;
                for (let i = n.children.length - 1; i >= 0; i--) stack.push(n.children[i]);
            }
        }

        findNode(name, start = this.root) {
            let found = null;
            this.traverse(n => {
                if (n.name === name) { found = n; return false; }
            }, start);
            return found;
        }

        // Per-frame update: scripts → world transforms → skeleton palettes.
        update(dt = 0) {
            // Scripts run before transform composition so they can poke locals.
            this.traverse(n => {
                if (!n.scripts) return;
                for (const s of n.scripts) {
                    if (!s.started && s.onStart) { s.onStart(n, this); s.started = true; }
                    if (s.onUpdate) s.onUpdate(n, dt, this);
                }
            });

            // World transforms - DFS, parent-first.
            const stack = [{ node: this.root, parentWorld: null }];
            while (stack.length) {
                const { node, parentWorld } = stack.pop();
                let world = parentWorld;
                if (node.transform) {
                    if (parentWorld) ZMath.M4.mul(parentWorld, node.transform.local, node.transform.world);
                    else             node.transform.world.set(node.transform.local);
                    world = node.transform.world;
                }
                for (const c of node.children) stack.push({ node: c, parentWorld: world });
            }

            // Skeleton palettes.
            for (const n of this._nodes) {
                if (n.skeleton) this._updateSkeleton(n.skeleton);
            }
        }

        _updateSkeleton(skel) {
            const bones = skel.asset.bones, n = bones.length;
            const finalPose = skel.finalPose, palette = skel.skinData;
            for (let i = 0; i < n; i++) {
                const pIdx = bones[i].parent;
                if (pIdx < 0) finalPose[i].set(skel.localPose[i]);
                else          ZMath.M4.mul(finalPose[pIdx], skel.localPose[i], finalPose[i]);

                if (bones[i].inverseBind) {
                    _scratchMat.set(bones[i].inverseBind);
                    ZMath.M4.mul(finalPose[i], _scratchMat, _scratchMat);
                    palette.set(_scratchMat, i * 16);
                } else {
                    palette.set(finalPose[i], i * 16);
                }
            }
        }
    }

    // --------------------------------------------------------------------
    // EzProject - top-level orchestrator.
    // --------------------------------------------------------------------
    class EzProject {
        constructor(canvas3d) {
            this.canvas3d = canvas3d;
            this.gl       = canvas3d.gl;

            this.shaders   = new Map();
            this.textures  = new Map();
            this.materials = new Map();
            this.meshes    = new Map();
            this.skeletons = new Map();

            this.scenes      = new Map();
            this.activeScene = null;

            this.camera = new ZCamera();
            this.camera.set({ aspect: canvas3d.info?.aspectRatio ?? 1 });

            // Default shader - first registered, can be overridden per node.
            this.defaultShaderKey = null;

            const gl = this.gl;

            // Single shared instance buffer (project-wide). All cached VAOs
            // wire their per-instance attribute pointers to this buffer.
            this._instanceVBO = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, this._instanceVBO);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(0), gl.DYNAMIC_DRAW);

            // VAO cache: key `${shaderKey}|${meshKey}` → { vao, defaulted }
            this._vaoCache = new Map();

            // Reusable morph-weight tex (W = mesh.morphTargetCount, H = instance count).
            this._morphWeightTex = null;

            // Default GL fallbacks (1×1 placeholders).
            const dummy = (iFmt, fmt, type, data) =>
                ZRender.uploadTexture2D(gl, null, iFmt, fmt, type, 1, 1, data);
            this._whiteTex         = dummy(gl.RGBA8,  gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array  ([255, 255, 255, 255]));
            this._morphDummyDelta  = dummy(gl.RGB32F, gl.RGB,  gl.FLOAT,         new Float32Array([0, 0, 0]));
            this._morphDummyWeight = dummy(gl.R32F,   gl.RED,  gl.FLOAT,         new Float32Array([0]));
        }

        _getUniformLocation(shader, name) {
            if (!shader || !name) return null;
            if (typeof shader.getUniformLocation === "function") return shader.getUniformLocation(name);
            if (shader.uniformLocations instanceof Map) return shader.uniformLocations.get(name) ?? null;
            if (shader.uloc && Object.prototype.hasOwnProperty.call(shader.uloc, name)) return shader.uloc[name] ?? null;
            return ZRender.getUniformLocation(this.gl, shader.program, name);
        }

        _getAttributeDecls(shader) {
            if (!shader) return [];
            if (Array.isArray(shader.vertexInputs)) return shader.vertexInputs;
            if (Array.isArray(shader.attributes)) return shader.attributes;
            return [];
        }

        _getInstanceDecls(shader) {
            const layout = shader?.instanceLayout;
            if (layout && Array.isArray(layout.entries)) return layout.entries;
            const allAttrs = this._getAttributeDecls(shader);
            const instanceAttrs = allAttrs.filter(d => (d.divisor ?? 0) > 0 || d.instance === true);
            return instanceAttrs;
        }

        _typeFloatCount(type) {
            switch (type) {
                case "float": return 1;
                case "vec2":  return 2;
                case "vec3":  return 3;
                case "vec4":  return 4;
                case "mat4":  return 16;
                default:       return 4;
            }
        }

        _buildInstanceLayout(shader) {
            if (shader?.instanceLayout && Array.isArray(shader.instanceLayout.entries)) return shader.instanceLayout;

            const instDecls = this._getInstanceDecls(shader);
            const entries = [];
            let byteOffset = 0;
            let slotOffset = 0;
            for (const decl of instDecls) {
                const type = decl.type ?? "vec4";
                const floats = decl.floats ?? this._typeFloatCount(type);
                const slots = decl.slots ?? (type === "mat4" ? 4 : 1);
                const entry = {
                    ...decl,
                    type,
                    floats,
                    slots,
                    byteOffset,
                    locOffset: slotOffset,
                    default: decl.default != null ? decl.default : (type === "mat4"
                        ? new Float32Array([1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1])
                        : new Float32Array(floats)),
                };
                entries.push(entry);
                byteOffset += floats * 4;
                slotOffset += slots;
            }
            const layout = { entries, strideBytes: byteOffset, strideFloats: byteOffset / 4, slotCount: slotOffset };
            shader.instanceLayout = layout;
            return layout;
        }

        // -- Asset registration -------------------------------------------
        addShader(key, shader) {
            if (!shader.compiled) shader.compile(this.gl);
            this.shaders.set(key, shader);
            if (!this.defaultShaderKey) this.defaultShaderKey = key;
            return shader;
        }

        addTexture(key, { data, width, height, channels = 4, wrap = "repeat", mipmap = true } = {}) {
            const gl = this.gl;
            const ch = channels;
            const [iFmt, fmt] =
                ch === 1 ? [gl.R8,    gl.RED] :
                ch === 2 ? [gl.RG8,   gl.RG]  :
                ch === 3 ? [gl.RGB8,  gl.RGB] :
                           [gl.RGBA8, gl.RGBA];
            const wrapEnum = wrap === "clamp" ? gl.CLAMP_TO_EDGE : gl.REPEAT;
            const glTex = ZRender.createTexture(gl, {
                data, width, height,
                format: fmt, internalFormat: iFmt,
                wrapS: wrapEnum, wrapT: wrapEnum, mipmap,
            });
            const tex = { glTex, width, height, channels: ch, wrap };
            this.textures.set(key, tex);
            return tex;
        }

        addMaterial(key, opts = {}) {
            const m = {
                fill:   Float32Array.from(opts.fill || opts.baseColor || [1, 1, 1, 1]),
                albedo: opts.albedo ?? null, // texture key or null
            };
            this.materials.set(key, m);
            return m;
        }

        // Shader-agnostic. Hands the desc straight to EzMesh3D.fromDesc with
        // material indices resolved into project material keys. Accepts either
        // the EzMesh3D-native `submeshes` shape or the EzLoader-style
        // `primitives` shape (auto-translated).
        //
        // opts:
        //   vertexBuffers? / vertices? + attributes? - see EzMesh3D.fromDesc
        //   indices?
        //   submeshes?: [{ ...EzMesh3D.fromDesc submeshes ... }]
        //   primitives?: [{ indexOffset, indexCount, vertexOffset, vertexCount,
        //                   materialIdx, morphDeltas?, morphTargetCount? }]
        //   materialKeyOf?: (matIdx) => key|null
        //   morphTargetNames?: string[]
        addMesh(key, opts = {}) {
            const matKeyOf = opts.materialKeyOf || (() => null);

            let submeshes = opts.submeshes;
            if (!submeshes && Array.isArray(opts.primitives)) {
                submeshes = opts.primitives.map(p => {
                    const out = {
                        indexOffset:  p.indexOffset,
                        indexCount:   p.indexCount,
                        vertexOffset: p.vertexOffset,
                        vertexCount:  p.vertexCount,
                        materialKey:  matKeyOf(p.materialIdx),
                    };
                    if (p.morphDeltas && p.morphTargetCount > 0) {
                        const mt = {};
                        if (p.morphDeltas.POSITION) mt["u_morphPosTex"] = sliceTargets(p.morphDeltas.POSITION, p.morphTargetCount);
                        if (p.morphDeltas.NORMAL)   mt["u_morphNrmTex"] = sliceTargets(p.morphDeltas.NORMAL,   p.morphTargetCount);
                        if (p.morphDeltas.TANGENT)  mt["u_morphTanTex"] = sliceTargets(p.morphDeltas.TANGENT,  p.morphTargetCount);
                        if (Object.keys(mt).length) out.morphTargets = mt;
                    }
                    return out;
                });
            }

            const mesh = EzMesh3D.fromDesc(this.gl, {
                vertexBuffers:    opts.vertexBuffers,
                vertices:         opts.vertices,
                attributes:       opts.attributes,
                stride:           opts.stride,
                indices:          opts.indices,
                submeshes,
                morphTargetNames: opts.morphTargetNames,
            });

            this.meshes.set(key, mesh);
            return mesh;
        }

        addSkeleton(key, bones) {
            const skel = { bones };
            this.skeletons.set(key, skel);
            return skel;
        }

        // -- Scene API ----------------------------------------------------
        createScene(name = "Scene") {
            const s = new EzScene(this, name);
            this.scenes.set(name, s);
            if (!this.activeScene) this.activeScene = s;
            return s;
        }

        setActiveScene(s) {
            this.activeScene = (typeof s === "string") ? this.scenes.get(s) : s;
            return this.activeScene;
        }

        // -- Model import -------------------------------------------------
        // Registers every asset on the project and returns a fresh scene
        // mirroring the model's node graph.
        addModel(model, { keyPrefix, sceneName } = {}) {
            const prefix = keyPrefix || model.name;
            sceneName    = sceneName || prefix;

            // Textures
            const texKeyOf = [];
            for (let i = 0; i < model.textures.length; i++) {
                const t = model.textures[i];
                const k = `${prefix}_t${i}`;
                this.addTexture(k, { data: t.bitmap, width: t.width, height: t.height, channels: t.channels, wrap: t.wrap });
                texKeyOf.push(k);
            }

            // Materials
            const matKeyOf = [];
            for (let i = 0; i < model.materials.length; i++) {
                const m = model.materials[i];
                const k = `${prefix}_m${i}`;
                this.addMaterial(k, {
                    fill:   m.baseColor,
                    albedo: m.albedoIdx >= 0 ? texKeyOf[m.albedoIdx] : null,
                });
                matKeyOf.push(k);
            }

            // Skeletons
            const skelKeyOf = [];
            for (let i = 0; i < model.skeletons.length; i++) {
                const k = `${prefix}_s${i}`;
                this.addSkeleton(k, model.skeletons[i].bones);
                skelKeyOf.push(k);
            }

            // Meshes
            const meshKeyOf = [];
            for (let i = 0; i < model.meshes.length; i++) {
                const m = model.meshes[i];
                const k = `${prefix}_mesh${i}`;
                this.addMesh(k, {
                    vertices:        m.vertices,
                    attributes:      m.attributes,
                    indices:         m.indices,
                    primitives:      m.primitives,
                    materialKeyOf:   idx => idx >= 0 ? matKeyOf[idx] : null,
                    morphTargetNames: m.morphTargetNames,
                });
                meshKeyOf.push(k);
            }

            // Build scene.
            // glTF doesn't constrain the ordering of `nodes` w.r.t. their
            // child/parent relationships, and EzLoader's `buildNodes` keeps
            // the original glTF order. So a node's `parent` index may be
            // greater than its own index. We therefore visit in topological
            // order - parents are always created before their children.
            const scene = this.createScene(sceneName);
            const nodeOf = new Array(model.nodes.length);
            const visited = new Uint8Array(model.nodes.length);
            const createNode = (i) => {
                if (visited[i]) return;
                visited[i] = 1;
                const m = model.nodes[i];
                if (m.parent >= 0) createNode(m.parent);
                const parent = m.parent >= 0 ? nodeOf[m.parent] : scene.root;
                const node   = scene.addNode(m.name, parent);
                node.transform.local.set(m.local);
                nodeOf[i] = node;
            };
            for (let i = 0; i < model.nodes.length; i++) createNode(i);

            // Components
            for (let i = 0; i < model.nodes.length; i++) {
                const m    = model.nodes[i];
                const node = nodeOf[i];

                if (m.skeletonIdx >= 0) {
                    node.skeleton = Skeleton3D(this.skeletons.get(skelKeyOf[m.skeletonIdx]));
                }
                if (m.meshIdx >= 0) {
                    const srcMesh = model.meshes[m.meshIdx];
                    const ezMesh  = this.meshes.get(meshKeyOf[m.meshIdx]);
                    const morphW  = ezMesh.morphTargetCount > 0
                        ? new Float32Array(ezMesh.morphTargetCount)
                        : null;
                    if (morphW && srcMesh.defaultWeights) {
                        const cap = Math.min(srcMesh.defaultWeights.length, morphW.length);
                        for (let w = 0; w < cap; w++) morphW[w] = srcMesh.defaultWeights[w];
                    }
                    node.meshRender = MeshRender3D({
                        meshKey:      meshKeyOf[m.meshIdx],
                        skeletonNode: m.skinSkeletonNodeIdx >= 0 ? nodeOf[m.skinSkeletonNodeIdx] : null,
                        morphWeights: morphW,
                    });
                }
            }

            scene.update(0);
            return scene;
        }

        // -- Frame --------------------------------------------------------
        update(dt = 0) {
            if (this.activeScene) this.activeScene.update(dt);
        }

        // Renders the active scene. Clears color+depth by default - pass
        // `{ clear: false }` for multi-pass setups (e.g. an outline pass
        // before the lit pass). `nodeFilter(node) -> bool` can be used to
        // render only a subset of nodes for explicit pass orchestration.
        render(camera = this.camera, scene = this.activeScene, { clear = true, nodeFilter = null } = {}) {
            const gl = this.gl;
            if (clear) ZRender.applyState(gl, { clear: ['color', 'depth'] });
            if (!scene) { ZRender.restoreDefaultState(gl); return; }

            // Group visible meshRender nodes by (shaderKey → meshKey).
            const batches = new Map();
            for (const n of scene._nodes) {
                if (nodeFilter && !nodeFilter(n)) continue;
                if (!n.meshRender || !n.meshRender.visible) continue;
                const meshKey = n.meshRender.meshKey;
                const mesh    = this.meshes.get(meshKey);
                if (!mesh) continue;
                const shaderKey = n.meshRender.shaderKey || this.defaultShaderKey;
                if (!shaderKey) continue;
                let mm = batches.get(shaderKey);
                if (!mm) batches.set(shaderKey, mm = new Map());
                let list = mm.get(meshKey);
                if (!list) mm.set(meshKey, list = []);
                list.push(n);
            }

            const sorted = [...batches.entries()].sort((a, b) =>
                (this.shaders.get(a[0])?.other.renderCfg?.rQueue ?? 1000) -
                (this.shaders.get(b[0])?.other.renderCfg?.rQueue ?? 1000));

            const viewData = camera.view, projData = camera.projection;

            for (const [shaderKey, mm] of sorted) {
                const shader = this.shaders.get(shaderKey);
                if (!shader) continue;
                shader.applyRenderState(gl).bind(gl);
                ZRender.setUniforms(gl, shader.program, [
                    { loc: this._getUniformLocation(shader, "u_view"),       type: 'mat4', value: viewData },
                    { loc: this._getUniformLocation(shader, "u_projection"), type: 'mat4', value: projData },
                ]);

                for (const [meshKey, nodes] of mm) {
                    const mesh = this.meshes.get(meshKey);
                    const vaoEntry = this._getVAO(shaderKey, meshKey);
                    if (!vaoEntry) continue;

                    const perInstance = this._getUniformLocation(shader, "u_bonesTex") != null;
                    const chunks = perInstance ? nodes.map(n => [n]) : [nodes];

                    ZRender.withVAO(gl, vaoEntry.vao, () => {
                        ZRender.setConstAttrs(gl, vaoEntry.defaulted);
                        for (const chunk of chunks) this._drawChunk(shader, mesh, chunk);
                    });
                }
            }

            ZRender.restoreDefaultState(gl);
        }

        // -- VAO cache ----------------------------------------------------
        // Build a VAO that wires `shader`'s attributes against `mesh`'s named
        // streams, plus the project's shared instance buffer.
        _getVAO(shaderKey, meshKey) {
            const cacheKey = `${shaderKey}|${meshKey}`;
            const cached = this._vaoCache.get(cacheKey);
            if (cached) return cached;

            const shader = this.shaders.get(shaderKey);
            const mesh   = this.meshes.get(meshKey);
            if (!shader || !mesh) return null;

            const gl  = this.gl;
            const vao = gl.createVertexArray();
            gl.bindVertexArray(vao);

            const defaulted = [];
            for (const sa of this._getAttributeDecls(shader)) {
                if ((sa.divisor ?? 0) > 0 || sa.instance === true) continue;
                if (sa.loc < 0) continue;
                let foundAttr = null, foundVB = null;
                for (const vb of mesh.vertexBuffers) {
                    const a = vb.attributes.find(at => at.name === sa.name);
                    if (a) { foundAttr = a; foundVB = vb; break; }
                }
                if (foundAttr) {
                    ZRender.wireAttr(gl, {
                        buffer: foundVB.vbo,
                        loc:    sa.loc,
                        size:   foundAttr.size,
                        type:   foundAttr.type,
                        normalized: foundAttr.normalized,
                        stride: foundVB.stride,
                        offset: foundAttr.offset,
                    });
                } else {
                    gl.disableVertexAttribArray(sa.loc);
                    defaulted.push({ loc: sa.loc, default: sa.default });
                }
            }

            if (mesh.ebo) gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ebo);

            // Per-instance attributes wired to the project-wide buffer.
            const layout = this._buildInstanceLayout(shader);
            for (const e of layout.entries) {
                if (e.loc < 0) continue;
                if (e.type === "mat4") {
                    for (let col = 0; col < 4; col++) {
                        ZRender.wireAttr(gl, {
                            buffer: this._instanceVBO,
                            loc:    e.loc + col,
                            size:   4,
                            stride: layout.strideBytes,
                            offset: e.byteOffset + col * 16,
                            divisor: 1,
                        });
                    }
                } else {
                    ZRender.wireAttr(gl, {
                        buffer: this._instanceVBO,
                        loc:    e.loc,
                        size:   e.floats,
                        stride: layout.strideBytes,
                        offset: e.byteOffset,
                        divisor: 1,
                    });
                }
            }

            gl.bindVertexArray(null);
            const entry = { vao, defaulted };
            this._vaoCache.set(cacheKey, entry);
            return entry;
        }

        // Draw one chunk of nodes (single instance for skinned, all for non-skinned).
        _drawChunk(shader, mesh, nodes) {
            const gl     = this.gl;
            const layout = this._buildInstanceLayout(shader);

            // Pack instance data straight from node.transform.world / meshRender.color.
            const dataArray = nodes.map(n => {
                const data = {};
                for (const e of layout.entries) {
                    if (e.type === 'mat4')              data[e.name] = n.transform.world;
                    else if (e.name === 'a_instColor')  data[e.name] = n.meshRender.color;
                    else                                data[e.name] = e.default;
                }
                return data;
            });
            const packed = ZRender.packInstances(dataArray, layout);
            if (packed) ZRender.uploadVBO(gl, this._instanceVBO, packed);

            // Skeleton palette (per-instance for skinned shaders)
            const bonesTexLoc = this._getUniformLocation(shader, "u_bonesTex");
            if (bonesTexLoc != null) {
                const skelNode = nodes[0].meshRender.skeletonNode;
                if (skelNode && skelNode.skeleton) {
                    const skel = skelNode.skeleton;
                    skel.paletteTex = ZRender.uploadTexture2D(gl, skel.paletteTex,
                        gl.RGBA32F, gl.RGBA, gl.FLOAT, 4, skel.asset.bones.length, skel.skinData);
                    ZRender.bindSampler(gl, bonesTexLoc, TEX_UNIT_BONES, skel.paletteTex);
                }
            }

            // Per-instance morph-weight texture (W = mesh.morphTargetCount, H = instances).
            const morphWeightLoc = this._getUniformLocation(shader, "u_morphWeightTex");
            if (morphWeightLoc != null) {
                if (mesh.morphTargetCount <= 0) {
                    ZRender.bindSampler(gl, morphWeightLoc, TEX_UNIT_MORPH_WEIGHT, this._morphDummyWeight);
                } else {
                    const W = mesh.morphTargetCount, H = nodes.length;
                    const data = new Float32Array(W * H);
                    for (let i = 0; i < H; i++) {
                        const w = nodes[i].meshRender.morphWeights;
                        if (w) data.set(w.subarray(0, Math.min(w.length, W)), i * W);
                    }
                    this._morphWeightTex = ZRender.uploadTexture2D(gl, this._morphWeightTex,
                        gl.R32F, gl.RED, gl.FLOAT, W, H, data);
                    ZRender.bindSampler(gl, morphWeightLoc, TEX_UNIT_MORPH_WEIGHT, this._morphWeightTex);
                }
            }

            // Per-submesh draws
            for (let pi = 0; pi < mesh.submeshes.length; pi++) {
                const sm  = mesh.submeshes[pi];
                const mat = sm.materialKey ? this.materials.get(sm.materialKey) : null;
                const fill = mat ? mat.fill : [1, 1, 1, 1];
                const tex  = mat?.albedo ? this.textures.get(mat.albedo) : null;

                ZRender.bindSampler(gl, this._getUniformLocation(shader, "u_albedo"), TEX_UNIT_ALBEDO, tex ? tex.glTex : this._whiteTex);
                ZRender.setUniforms(gl, shader.program, [
                    { loc: this._getUniformLocation(shader, "u_fill"), type: 'vec4', value: fill },
                ]);

                const morphCountLoc = this._getUniformLocation(shader, "u_morphCount");
                const morphWeightOffsetLoc = this._getUniformLocation(shader, "u_morphWeightOffset");
                const morphVertexBaseLoc = this._getUniformLocation(shader, "u_morphVertexBase");
                if (morphCountLoc != null) {
                    const m = sm.morph;
                    ZRender.setUniforms(gl, shader.program, [
                        { loc: morphCountLoc,        type: 'int', value: m ? m.targetCount : 0 },
                        { loc: morphWeightOffsetLoc, type: 'int', value: 0 }, // mesh-level shared weights
                        { loc: morphVertexBaseLoc,   type: 'int', value: m ? m.vertexBase  : 0 },
                    ]);
                    // Bind one delta sampler per shader-declared morph channel.
                    const morphChannels = shader.other?.morphChannels ?? shader.morphChannels ?? [];
                    for (let i = 0; i < morphChannels.length; i++) {
                        const chName = morphChannels[i];
                        const chLoc = this._getUniformLocation(shader, `u_morphDelta_${i}`);
                        if (chLoc == null) continue;
                        const dltTex  = m ? m.channels.get(chName) : null;
                        ZRender.bindSampler(gl, chLoc, TEX_UNIT_MORPH_DELTA + i, dltTex || this._morphDummyDelta);
                    }
                }

                if (sm.indexCount > 0 && mesh.ebo) {
                    ZRender.drawInstanced(gl, {
                        indexed:     true,
                        indexCount:  sm.indexCount,
                        indexType:   mesh.indexType,
                        indexOffset: sm.indexOffset * mesh.indexBytes,
                    }, nodes.length);
                } else {
                    ZRender.drawInstanced(gl, {
                        indexed:      false,
                        vertexOffset: sm.vertexOffset,
                        vertexCount:  sm.vertexCount,
                    }, nodes.length);
                }
            }
        }
    }

    // Slice a flat-packed [target0..targetN] buffer (each target = vcount*3
    // floats) into the per-target Float32Array list EzMesh3D.fromDesc wants.
    function sliceTargets(packed, targetCount) {
        const stride = packed.length / targetCount;
        const out = new Array(targetCount);
        for (let t = 0; t < targetCount; t++) {
            out[t] = packed.subarray(t * stride, (t + 1) * stride);
        }
        return out;
    }

    // -- Public surface ---------------------------------------------------
    window.EzProject    = EzProject;
    window.EzScene      = EzScene;
    window.EzNode       = { make: makeNode };
    window.EzComponents = {
        Transform:  Transform3D,
        MeshRender: MeshRender3D,
        Skeleton:   Skeleton3D,
        Script:     Script3D,
    };
})();

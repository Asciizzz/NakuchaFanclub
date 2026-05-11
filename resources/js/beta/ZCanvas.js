/*
ZCanvas
By Asciiz

Holy crap guys I actually made a proper 3D html webgl renderer instead of using canvas2d lmao

Contains
    ZRender     static, dimension-agnostic GL helpers
    ZShader     low-level shader compile + render-state base
    ZCanvas   thin wrapper around <canvas> + WebGL2 context

    -- Highly specialized --
    ZCamera   view/projection helper
    EzMesh3D     VAO + VBO geometry container
    EzSkeleton3D bone rig + skinning palette builder
*/

(function () {
    class _c {
        static warn(TAG, ...a) { console.warn(TAG, ...a); return false; }
        static err(TAG, ...a) { console.error(TAG, ...a) }
    }

    class _is {
        static str = v => typeof v === "string" && v.trim() !== "";
        static obj = v => typeof v === "object" && v !== null;
        static POT = n => n > 0 && (n & (n - 1)) === 0; // Power of 2?
        static sampler = t => t === "sampler2D" || t === "highp sampler2D"
    }

    const TAGRENDER = "[ZRender]";
    class ZRender {
        static #BLEND_ENUM_BY_NAME = {
            ZERO:                     0,
            ONE:                      1,
            SRC_ALPHA:                0x0302,
            ONE_MINUS_SRC_ALPHA:      0x0303,
            DST_ALPHA:                0x0304,
            ONE_MINUS_DST_ALPHA:      0x0305,
            SRC_COLOR:                0x0300,
            ONE_MINUS_SRC_COLOR:      0x0301,
            DST_COLOR:                0x0306,
            ONE_MINUS_DST_COLOR:      0x0307,
            CONSTANT_COLOR:           0x8001,
            ONE_MINUS_CONSTANT_COLOR: 0x8002,
            CONSTANT_ALPHA:           0x8003,
            ONE_MINUS_CONSTANT_ALPHA: 0x8004,
            SRC_ALPHA_SATURATE:       0x0308,
        };

        static #resolveBlendEnum(gl, spec, fallback) {
            if (typeof spec === 'number' && Number.isFinite(spec)) return spec;
            if (typeof spec === 'string') {
                const key = spec.trim();
                if (!key) return fallback;
                if (Object.prototype.hasOwnProperty.call(gl, key)) return gl[key];
                const mapped = ZRender.#BLEND_ENUM_BY_NAME[key.toUpperCase()];
                if (mapped != null) return mapped;
            }
            return fallback;
        }

        static bind(gl, program) {
            gl.useProgram(program);
        }

        static applyState(gl, cfg) {
            if (!cfg) return;
            const hasProp = (prop) => Object.prototype.hasOwnProperty.call(cfg, prop);

            if (hasProp('depthWrite')) gl.depthMask(!!cfg.depthWrite);
            if (hasProp('depthTest')) {
                cfg.depthTest ? gl.enable(gl.DEPTH_TEST) : gl.disable(gl.DEPTH_TEST);
            }
            if (hasProp('blend')) {
                cfg.blend ? gl.enable(gl.BLEND) : gl.disable(gl.BLEND);

                if (cfg.blend && (hasProp('blendSrc') || hasProp('blendDst'))) {
                    const src = ZRender.#resolveBlendEnum(gl, cfg.blendSrc, gl.SRC_ALPHA);
                    const dst = ZRender.#resolveBlendEnum(gl, cfg.blendDst, gl.ONE_MINUS_SRC_ALPHA);
                    gl.blendFunc(src, dst);
                }
            }
            if (hasProp('cull')) {
                switch (cfg.cull) {
                    case 'none':  gl.disable(gl.CULL_FACE); break;
                    case 'front': gl.enable(gl.CULL_FACE);  gl.cullFace(gl.FRONT); break;
                    default:      gl.enable(gl.CULL_FACE);  gl.cullFace(gl.BACK);  break;
                }
            }
            if (hasProp('clearColor') && cfg.clearColor != null) {
                const c = cfg.clearColor;
                if (Array.isArray(c) || ArrayBuffer.isView(c)) {
                    gl.clearColor(c[0] ?? 0, c[1] ?? 0, c[2] ?? 0, c[3] ?? 0);
                }
            }
            if (hasProp('clear') && cfg.clear) {
                const list = Array.isArray(cfg.clear) ? cfg.clear : [cfg.clear];
                let mask = 0;
                for (const k of list) {
                    switch (k) {
                        case 'color':   mask |= gl.COLOR_BUFFER_BIT; break;
                        case 'depth':   mask |= gl.DEPTH_BUFFER_BIT; break;
                        case 'stencil': mask |= gl.STENCIL_BUFFER_BIT; break;
                    }
                }
                if (mask) gl.clear(mask);
            }
        }

        static restoreDefaultState(gl) {
            gl.depthMask(true);
            gl.enable(gl.DEPTH_TEST);
            gl.enable(gl.BLEND);
            gl.enable(gl.CULL_FACE);
            gl.cullFace(gl.BACK);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        }

        static withVAO(gl, vao, fn) {
            gl.bindVertexArray(vao);
            try { fn(); }
            finally { gl.bindVertexArray(null); }
        }


        static uploadVBO(gl, vbo, data, usage) {
            const need = data.byteLength;
            const cap  = vbo._ezCapacity | 0;
            gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
            if (need > 0 && need <= cap) {
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
            } else {
                const grow   = Math.ceil(cap * 1.5);
                const newCap = Math.max(need, grow);
                gl.bufferData(gl.ARRAY_BUFFER, newCap, usage ?? gl.DYNAMIC_DRAW);
                if (need > 0) gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
                vbo._ezCapacity = newCap;
            }
        }

        static setConstAttrs(gl, list) {
            for (const a of list) {
                const v = a.value ?? a.default ?? [0,0,0,0];
                gl.vertexAttrib4f(a.loc, v[0]??0, v[1]??0, v[2]??0, v[3]??0);
            }
        }

        static wireAttr(gl, { buffer, loc, size, type, normalized, stride, offset, divisor, enabled }) {
            if (loc == null || loc === -1) return;
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            if (enabled !== false) gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, size, type ?? gl.FLOAT, !!normalized, stride ?? 0, offset ?? 0);
            if (divisor) gl.vertexAttribDivisor(loc, divisor);
        }

        static bindSampler(gl, loc, unit, tex, target) {
            if (loc == null) return;
            gl.activeTexture(gl.TEXTURE0 + unit);
            gl.bindTexture(target ?? gl.TEXTURE_2D, tex);
            gl.uniform1i(loc, unit);
        }

        static createTexture(gl, {
            data, width = 1, height = 1,
            format = gl.RGBA, internalFormat = format, type = gl.UNSIGNED_BYTE,
            wrapS = gl.CLAMP_TO_EDGE, wrapT = gl.CLAMP_TO_EDGE,
            minFilter = gl.LINEAR, magFilter = gl.LINEAR,
            mipmap = false, flipY = false, premultiplyAlpha = false,
        }) {
            const tex = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, tex);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, flipY);
            gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiplyAlpha);

            const isImageSrc = data instanceof ImageBitmap || data instanceof HTMLImageElement || data instanceof HTMLCanvasElement;
            if (isImageSrc) gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, format, type, data);
            else            gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, data);

            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, magFilter);

            if (mipmap && _is.POT(width) && _is.POT(height)) {
                gl.generateMipmap(gl.TEXTURE_2D);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            } else {
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, minFilter);
            }

            gl.bindTexture(gl.TEXTURE_2D, null);
            return tex;
        }

        static SCRATCH_TEX_UNIT = 15;
        static uploadTexture2D(gl, existing, internalFmt, fmt, type, w, h, data, unit = null) {
            const tex = existing ?? gl.createTexture();
            const explicit = unit != null;
            const prevActive = explicit ? 0 : gl.getParameter(gl.ACTIVE_TEXTURE);
            gl.activeTexture(gl.TEXTURE0 + (explicit ? unit : ZRender.SCRATCH_TEX_UNIT));
            gl.bindTexture(gl.TEXTURE_2D, tex);
            if (!existing) {
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S,     gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T,     gl.CLAMP_TO_EDGE);
            }
            gl.texImage2D(gl.TEXTURE_2D, 0, internalFmt, w, h, 0, fmt, type, data);
            if (!explicit) gl.activeTexture(prevActive);
            return tex;
        }

        static createRenderTarget(gl, {
            width = 256, height = 256,
            hasColor = false,
            hasDepth = true,
            colorFormat = gl.RGBA, colorInternalFormat = colorFormat, colorType = gl.UNSIGNED_BYTE,
            depthFormat = gl.DEPTH_COMPONENT, depthInternalFormat = gl.DEPTH_COMPONENT24, depthType = gl.UNSIGNED_INT,
            colorFilter = gl.LINEAR,
            depthFilter = gl.NEAREST,
            wrapS = gl.CLAMP_TO_EDGE, wrapT = gl.CLAMP_TO_EDGE,
            depthCompare = false,
            depthCompareFunc = gl.LEQUAL,
        } = {}) {
            const w = Math.max(1, Math.round(width));
            const h = Math.max(1, Math.round(height));
            const fbo = gl.createFramebuffer();
            gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);

            let colorTex = null;
            if (hasColor) {
                colorTex = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, colorTex);
                gl.texImage2D(gl.TEXTURE_2D, 0, colorInternalFormat, w, h, 0, colorFormat, colorType, null);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapT);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, colorFilter);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, colorFilter);
                gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, colorTex, 0);
            }

            let depthTex = null;
            if (hasDepth) {
                depthTex = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, depthTex);
                gl.texImage2D(gl.TEXTURE_2D, 0, depthInternalFormat, w, h, 0, depthFormat, depthType, null);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wrapS);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wrapT);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, depthFilter);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, depthFilter);
                if (depthCompare) {
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, depthCompareFunc);
                }
                gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTex, 0);
            }

            if (hasColor) {
                gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
                gl.readBuffer(gl.COLOR_ATTACHMENT0);
            } else {
                gl.drawBuffers([gl.NONE]);
                gl.readBuffer(gl.NONE);
            }

            const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
            if (status !== gl.FRAMEBUFFER_COMPLETE) _c.warn(TAGRENDER, "framebuffer incomplete:", status);

            gl.bindTexture(gl.TEXTURE_2D, null);
            gl.bindFramebuffer(gl.FRAMEBUFFER, null);

            return {
                fbo,
                width: w,
                height: h,
                colorTex,
                depthTex,
                hasColor,
                hasDepth,
                colorFormat,
                colorInternalFormat,
                colorType,
                depthFormat,
                depthInternalFormat,
                depthType,
                colorFilter,
                depthFilter,
                wrapS,
                wrapT,
                depthCompare: !!depthCompare,
                depthCompareFunc,
            };
        }

        static resizeRenderTarget(gl, target, width, height) {
            if (!target || !target.fbo) return target;
            const w = Math.max(1, Math.round(width));
            const h = Math.max(1, Math.round(height));
            if (w === target.width && h === target.height) return target;
            target.width = w;
            target.height = h;

            if (target.colorTex) {
                gl.bindTexture(gl.TEXTURE_2D, target.colorTex);
                gl.texImage2D(
                    gl.TEXTURE_2D,
                    0,
                    target.colorInternalFormat,
                    w,
                    h,
                    0,
                    target.colorFormat,
                    target.colorType,
                    null
                );
            }

            if (target.depthTex) {
                gl.bindTexture(gl.TEXTURE_2D, target.depthTex);
                gl.texImage2D(
                    gl.TEXTURE_2D,
                    0,
                    target.depthInternalFormat,
                    w,
                    h,
                    0,
                    target.depthFormat,
                    target.depthType,
                    null
                );
                if (target.depthCompare) {
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
                    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_COMPARE_FUNC, target.depthCompareFunc ?? gl.LEQUAL);
                }
            }

            gl.bindTexture(gl.TEXTURE_2D, null);
            return target;
        }

        static withRenderTarget(gl, target, fn, { clear = true, clearColor = null, clearDepth = 1 } = {}) {
            if (!target || !target.fbo || typeof fn !== "function") return null;
            const prevFbo = gl.getParameter(gl.FRAMEBUFFER_BINDING);
            const prevViewport = gl.getParameter(gl.VIEWPORT);
            const prevRead = gl.getParameter(gl.READ_BUFFER);
            const prevDraw = [];
            const maxDraw = gl.getParameter(gl.MAX_DRAW_BUFFERS);
            for (let i = 0; i < maxDraw; i++) prevDraw.push(gl.getParameter(gl.DRAW_BUFFER0 + i));

            gl.bindFramebuffer(gl.FRAMEBUFFER, target.fbo);
            gl.viewport(0, 0, target.width, target.height);
            if (target.hasColor) {
                gl.drawBuffers([gl.COLOR_ATTACHMENT0]);
                gl.readBuffer(gl.COLOR_ATTACHMENT0);
            } else {
                gl.drawBuffers([gl.NONE]);
                gl.readBuffer(gl.NONE);
            }

            if (clear) {
                if (clearColor && (Array.isArray(clearColor) || ArrayBuffer.isView(clearColor))) {
                    gl.clearColor(clearColor[0] ?? 0, clearColor[1] ?? 0, clearColor[2] ?? 0, clearColor[3] ?? 0);
                }
                if (clearDepth != null) gl.clearDepth(clearDepth);
                let mask = gl.DEPTH_BUFFER_BIT;
                if (target.hasColor) mask |= gl.COLOR_BUFFER_BIT;
                gl.clear(mask);
            }

            try { return fn(); }
            finally {
                gl.bindFramebuffer(gl.FRAMEBUFFER, prevFbo);
                gl.viewport(prevViewport[0], prevViewport[1], prevViewport[2], prevViewport[3]);
                if (prevFbo == null) {
                    gl.drawBuffers([gl.BACK]);
                    gl.readBuffer(gl.BACK);
                } else {
                    gl.drawBuffers(prevDraw);
                    gl.readBuffer(prevRead);
                }
            }
        }

        static destroyRenderTarget(gl, target) {
            if (!target) return;
            if (target.colorTex) gl.deleteTexture(target.colorTex);
            if (target.depthTex) gl.deleteTexture(target.depthTex);
            if (target.fbo) gl.deleteFramebuffer(target.fbo);
            target.colorTex = null;
            target.depthTex = null;
            target.fbo = null;
        }

        static drawInstanced(gl, drawCfg, instanceCount) {
            const mode = drawCfg.mode ?? gl.TRIANGLES;
            if (drawCfg.indexed) {
                gl.drawElementsInstanced(mode, drawCfg.indexCount, drawCfg.indexType, drawCfg.indexOffset, instanceCount);
            } else {
                gl.drawArraysInstanced(mode, drawCfg.vertexOffset, drawCfg.vertexCount, instanceCount);
            }
        }


        static packInstanceRow(arr, offFloats, data, layout) {
            for (const e of layout.entries) {
                const src = data[e.name];
                if (src) arr.set(src, offFloats + (e.byteOffset >> 2));
            }
        }

        static packInstances(dataArray, layout) {
            const stride = layout.strideFloats;
            if (stride === 0) return null;
            const flat = new Float32Array(dataArray.length * stride);
            for (let i = 0; i < dataArray.length; i++)
                ZRender.packInstanceRow(flat, i * stride, dataArray[i], layout);
            return flat;
        }
    }

    class ZShader {
        program   = null;
        other     = {};   // free whatever things (includes renderCfg, onbind, custom data)

        _compiled = false;
        get compiled() { return this._compiled; }

        #activeStage = 0;
        #spec = null;

        constructor() {
            this.#spec = {
                version: '300 es',
                precision: {},
                outputName: 'ez_output',
                passes: [this.#newPassSpec(), this.#newPassSpec()],
                links: [],
            };

            this.vertexInputs = [];
            this.vertexOutputs = [];
            this.vertexUniforms = [];
            this.fragmentInputs = [];
            this.fragmentOutputs = [];
            this.fragmentUniforms = [];
            this.uniformLocations = new Map();
            this.attributeLocations = new Map();
        }

        static BLEND = {
            ZERO:                     0,
            ONE:                      1,
            SRC_ALPHA:                0x0302,
            ONE_MINUS_SRC_ALPHA:      0x0303,
            DST_ALPHA:                0x0304,
            ONE_MINUS_DST_ALPHA:      0x0305,
            SRC_COLOR:                0x0300,
            ONE_MINUS_SRC_COLOR:      0x0301,
            DST_COLOR:                0x0306,
            ONE_MINUS_DST_COLOR:      0x0307,
            CONSTANT_COLOR:           0x8001,
            ONE_MINUS_CONSTANT_COLOR: 0x8002,
            CONSTANT_ALPHA:           0x8003,
            ONE_MINUS_CONSTANT_ALPHA: 0x8004,
            SRC_ALPHA_SATURATE:       0x0308,
        };

        static STAGE = {
            VERTEX: 0,
            FRAGMENT: 1
        }

        #newPassSpec() {
            return {
                inputs: [],
                outputs: [],
                uniforms: [],
                methods: [],
                main: null,
                precision: {},
            };
        }

        #cloneSpecValue(v) {
            if (Array.isArray(v)) return v.map(item => this.#cloneSpecValue(item));
            if (v && typeof v === 'object') return { ...v };
            return v;
        }

        #resolveStages(options, fallback = [this.#activeStage]) {
            const stage = options?.stage ?? options?.pass;
            if (stage == null) return fallback.slice();
            if (stage === 'both') return [0, 1];
            if (Array.isArray(stage)) return stage.map(p => (p === 1 || p === '1' || p === 'second') ? 1 : 0);
            return [(stage === 1 || stage === '1' || stage === 'second') ? 1 : 0];
        }

        #normalizeDecl(kind, typeOrSpec, name = null, options = {}) {
            const spec = _is.obj(typeOrSpec) ? { ...typeOrSpec } : { type: typeOrSpec, name };
            if (!_is.str(spec.name)) throw new Error('[ZShader] declaration requires a name');
            if (!_is.str(spec.type)) throw new Error(`[ZShader] declaration "${spec.name}" requires a type`);
            const out = {
                kind,
                name: spec.name,
                type: spec.type,
                precision: spec.precision ?? options.precision ?? null,
                location: spec.location ?? options.location ?? null,
                interpolation: spec.interpolation ?? options.interpolation ?? null,
                arraySize: spec.arraySize ?? options.arraySize ?? null,
                divisor: spec.divisor ?? options.divisor ?? undefined,
                instance: spec.instance ?? options.instance ?? undefined,
                floats: spec.floats ?? options.floats ?? undefined,
                slots: spec.slots ?? options.slots ?? undefined,
                default: spec.default != null ? this.#cloneSpecValue(spec.default) : null,
            };
            return out;
        }

        #normalizeMethod(methodOrSig, body = null) {
            if (_is.str(methodOrSig)) {
                const signature = methodOrSig.trim().replace(/[\s;{]+$/, '');
                if (!signature) throw new Error('[ZShader] method signature cannot be empty');
                return { signature, body: body != null ? String(body) : '' };
            }
            if (!_is.obj(methodOrSig)) throw new Error('[ZShader] method requires a signature string or descriptor object');
            const spec = { ...methodOrSig };
            let signature = _is.str(spec.signature) ? spec.signature.trim().replace(/[\s;{]+$/, '') : null;
            if (!signature) {
                if (!_is.str(spec.name)) throw new Error('[ZShader] method descriptor requires name');
                const returnType = _is.str(spec.returnType) ? spec.returnType : 'void';
                const args = Array.isArray(spec.args)
                    ? spec.args.map(arg => {
                        if (_is.str(arg)) return arg.trim();
                        if (!_is.obj(arg)) throw new Error(`[ZShader] method "${spec.name}" has an invalid argument descriptor`);
                        const argType = _is.str(arg.type) ? arg.type : null;
                        const argName = _is.str(arg.name) ? arg.name : null;
                        if (!argType || !argName) throw new Error(`[ZShader] method "${spec.name}" argument requires type and name`);
                        return `${argType} ${argName}`;
                    })
                    : [];
                signature = `${returnType} ${spec.name}(${args.join(', ')})`;
            }
            return { signature, body: spec.body != null ? String(spec.body) : (body != null ? String(body) : '') };
        }

        #indentBlock(src, indent = '    ') {
            const text = String(src ?? '').replace(/\s+$/, '');
            if (!text) return indent;
            return text.split('\n').map(line => indent + line).join('\n');
        }

        #formatDecl(decl, storage) {
            const parts = [];
            if (decl.location != null) parts.push(`layout(location=${decl.location})`);
            if (decl.interpolation) parts.push(decl.interpolation);
            parts.push(storage);
            if (decl.precision) parts.push(decl.precision);
            parts.push(decl.type);
            parts.push(decl.arraySize != null ? `${decl.name}[${decl.arraySize}]` : decl.name);
            return `${parts.join(' ')};`;
        }

        #formatMethod(method) {
            const body = this.#indentBlock(method.body);
            return `${method.signature} {\n${body}\n}`;
        }

        #assertStageIndex(stage) {
            if (stage !== 0 && stage !== 1) throw new Error('[ZShader] stage index must be 0 or 1');
            return stage;
        }

        #stageLabel(stage) {
            return stage === 0 ? 'primary' : 'secondary';
        }

        stage(stageIndex = 0) {
            this.#activeStage = this.#assertStageIndex(stageIndex);
            return this;
        }

        version(versionText) {
            if (_is.str(versionText)) this.#spec.version = versionText.trim();
            return this;
        }

        precision(type, value, options = {}) {
            if (!_is.str(type) || !_is.str(value)) throw new Error('[ZShader] precision requires type and value');
            const stages = this.#resolveStages(options);
            for (const stage of stages) {
                this.#spec.passes[stage].precision[type] = value;
            }
            return this;
        }

        input(typeOrSpec, name = null, options = {}) {
            const spec = this.#normalizeDecl('input', typeOrSpec, name, options);
            const stages = this.#resolveStages(options);
            for (const stage of stages) this.#spec.passes[stage].inputs.push(spec);
            return this;
        }

        inputs(specs, options = {}) {
            if (Array.isArray(specs)) {
                for (const spec of specs) this.input(spec, null, options);
            }
            return this;
        }

        output(typeOrSpec, name = null, options = {}) {
            const spec = this.#normalizeDecl('output', typeOrSpec, name, options);
            const stages = this.#resolveStages(options);
            for (const stage of stages) this.#spec.passes[stage].outputs.push(spec);
            return this;
        }

        outputs(specs, options = {}) {
            if (Array.isArray(specs)) {
                for (const spec of specs) this.output(spec, null, options);
            }
            return this;
        }

        uniform(typeOrSpec, name = null, options = {}) {
            const spec = this.#normalizeDecl('uniform', typeOrSpec, name, options);
            const stages = this.#resolveStages(options);
            for (const stage of stages) this.#spec.passes[stage].uniforms.push(spec);
            return this;
        }

        uniforms(specs, options = {}) {
            if (Array.isArray(specs)) {
                for (const spec of specs) this.uniform(spec, null, options);
            }
            return this;
        }

        link(typeOrSpec, name = null, options = {}) {
            const spec = this.#normalizeDecl('link', typeOrSpec, name, options);
            this.#spec.links.push(spec);
            return this;
        }

        method(methodOrSig, body = null, options = {}) {
            const spec = this.#normalizeMethod(methodOrSig, body);
            const stages = this.#resolveStages(options);
            for (const stage of stages) this.#spec.passes[stage].methods.push(spec);
            return this;
        }

        methods(specs, options = {}) {
            if (Array.isArray(specs)) {
                for (const spec of specs) this.method(spec, null, options);
            }
            return this;
        }

        main(body, options = {}) {
            const stage = this.#assertStageIndex(options.stage ?? options.pass ?? this.#activeStage);
            this.#spec.passes[stage].main = String(body ?? '');
            return this;
        }

        custom(nameOrObj, value = undefined) {
            if (_is.obj(nameOrObj)) {
                for (const [key, val] of Object.entries(nameOrObj)) {
                    this.other[key] = val;
                }
            } else if (_is.str(nameOrObj)) {
                this.other[nameOrObj] = value;
            }
            return this;
        }

        customs(obj) {
            if (_is.obj(obj)) { Object.assign(this.other, obj); }
            return this;
        }

        #buildStage(stageIndex) {
            const spec = this.#spec.passes[stageIndex];
            const seen = new Set();
            const checkName = (name, where) => {
                if (seen.has(name)) throw new Error(`[ZShader] duplicate name "${name}" in ${where}`);
                seen.add(name);
            };

            const lines = [`#version ${this.#spec.version}`];
            const precision = { float: 'highp', int: 'highp', ...spec.precision };
            for (const [type, value] of Object.entries(precision)) lines.push(`precision ${value} ${type};`);

            if (stageIndex === 0) {
                for (const decl of this.#spec.links) {
                    checkName(decl.name, 'link');
                    lines.push(this.#formatDecl(decl, 'out'));
                }
            }
            if (stageIndex === 1) {
                for (const decl of this.#spec.links) {
                    checkName(decl.name, 'link');
                    lines.push(this.#formatDecl(decl, 'in'));
                }
            }

            for (const decl of spec.inputs) {
                checkName(decl.name, 'inputs');
                lines.push(this.#formatDecl(decl, 'in'));
            }
            for (const decl of spec.outputs) {
                checkName(decl.name, 'outputs');
                lines.push(this.#formatDecl(decl, 'out'));
            }
            for (const decl of spec.uniforms) {
                checkName(decl.name, 'uniforms');
                lines.push(this.#formatDecl(decl, 'uniform'));
            }
            for (const method of spec.methods) {
                const signatureHead = method.signature.replace(/\s*\(.*/, '');
                const methodName = signatureHead.split(/\s+/).filter(Boolean).pop() ?? method.signature;
                checkName(methodName, 'methods');
                lines.push(this.#formatMethod(method));
            }

            if (!spec.main) throw new Error(`[ZShader] ${this.#stageLabel(stageIndex)} stage is missing main body`);
            lines.push(`void main() {`, this.#indentBlock(spec.main), `}`);
            return lines.join('\n');
        }

        build() {
            const source0 = this.#buildStage(0);
            const source1 = this.#buildStage(1);
            const built = {
                sources: [source0, source1],
                primary: source0,
                secondary: source1,
                stages: this.#spec.passes.map(stage => ({
                    inputs: stage.inputs.map(decl => ({ ...decl })),
                    outputs: stage.outputs.map(decl => ({ ...decl })),
                    uniforms: stage.uniforms.map(decl => ({ ...decl })),
                })),
            };
            this.other.builder = built;
            return built;
        }

        compile(vertSrc, fragSrc, gl) {
            if (arguments.length === 1) {
                gl = vertSrc;
                const built = this.build();
                this.program = this.#createProgram(gl, built.primary, built.secondary);
                if (!this.program) throw new Error('[ZShader] GL program compilation failed');
                this.#refreshReflection(gl);
                this._compiled = true;
                return this;
            }

            this.program = this.#createProgram(gl, vertSrc, fragSrc);
            if (!this.program) throw new Error("[ZShader] GL program compilation failed");
            this.#refreshReflection(gl);
            this._compiled = true;
            return this;
        }

        #refreshReflection(gl) {
            const stage0 = this.#spec.passes[0];
            const stage1 = this.#spec.passes[1];

            const resolveAttr = decl => ({
                ...decl,
                loc: gl.getAttribLocation(this.program, decl.name),
            });
            const resolveUniform = decl => ({
                ...decl,
                loc: gl.getUniformLocation(this.program, decl.name),
            });

            this.vertexInputs   = stage0.inputs.map(resolveAttr);
            this.vertexOutputs  = stage0.outputs.map(resolveUniform);
            this.vertexUniforms = stage0.uniforms.map(resolveUniform);
            this.fragmentInputs  = stage1.inputs.map(resolveUniform);
            this.fragmentOutputs = stage1.outputs.map(resolveUniform);
            this.fragmentUniforms = stage1.uniforms.map(resolveUniform);

            this.attributeLocations = new Map(this.vertexInputs.map(decl => [decl.name, decl.loc]));
            this.uniformLocations = new Map([
                ...this.vertexUniforms.map(decl => [decl.name, decl.loc]),
                ...this.fragmentUniforms.map(decl => [decl.name, decl.loc]),
            ]);

            this.attributes = this.vertexInputs;
            this.outputs = this.fragmentOutputs;
            this.uniforms = [...this.vertexUniforms, ...this.fragmentUniforms];
        }

        getInputLocation(name) {
            return this.attributeLocations.get(name) ?? -1;
        }

        getUniformLocation(name) {
            return this.uniformLocations.get(name) ?? null;
        }

        static #UNI = {
            mat4:  (gl, loc, v) => gl.uniformMatrix4fv(loc, false, v),
            mat3:  (gl, loc, v) => gl.uniformMatrix3fv(loc, false, v),
            vec4:  (gl, loc, v) => gl.uniform4fv(loc, v),
            vec3:  (gl, loc, v) => gl.uniform3fv(loc, v),
            vec2:  (gl, loc, v) => gl.uniform2fv(loc, v),
            float: (gl, loc, v) => gl.uniform1f(loc, v),
            int:   (gl, loc, v) => gl.uniform1i(loc, v),
            bool:  (gl, loc, v) => gl.uniform1i(loc, v ? 1 : 0),
        };

        setUniform(gl, name, value) {
            const loc = this.getUniformLocation(name);
            if (loc == null) return false;
            const decl = this.uniforms.find(u => u.name === name);
            if (!decl) return false;
            const setter = ZShader.#UNI[decl.type];
            if (!setter) throw new Error(`[ZShader] unsupported uniform type "${decl.type}" for "${name}"`);
            setter(gl, loc, value);
            return true;
        }

        setUniforms(gl, list) {
            for (const { name, value } of list) {
                this.setUniform(gl, name, value);
            }
        }

        bind(gl) {
            ZRender.bind(gl, this.program);
            return this;
        }

        applyRenderState(gl) { ZRender.applyState(gl, this.other.renderCfg); return this; }
        static restoreRenderState(gl) { ZRender.restoreDefaultState(gl); }

        #compileShader(gl, type, src) {
            const shader = gl.createShader(type);

            gl.shaderSource(shader, src);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                _c.err("[ZShader]", "shader compile error:", gl.getShaderInfoLog(shader));
                gl.deleteShader(shader);
                return null;
            }
            return shader;
        }

        #createProgram(gl, vertSrc, fragSrc) {
            const vshader = this.#compileShader(gl, gl.VERTEX_SHADER,   vertSrc);
            const fshader = this.#compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);

            if (!vshader || !fshader) return null;

            const program = gl.createProgram();
            gl.attachShader(program, vshader);
            gl.attachShader(program, fshader);
            gl.linkProgram(program);

            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                _c.err("[ZShader]", "program link error:", gl.getProgramInfoLog(program));
                return null;
            }

            gl.deleteShader(vshader);
            gl.deleteShader(fshader);
            return program;
        }
    }

    const TAGC3D = "[ZCanvas]";
    class ZCanvas {
        name    = null;
        #canvas = null;
        #gl     = null;

        get canvas() { return this.#canvas; }
        get gl()     { return this.#gl; }

        #logicalWidth  = 800;
        #logicalHeight = 600;
        #pixelRatio    = 1;
        #maxPixelRatio = 2;
        #msaaEnabled   = false;

        get info() {
            return {
                width:         this.#canvas.width,
                height:        this.#canvas.height,
                logicalWidth:  this.#logicalWidth,
                logicalHeight: this.#logicalHeight,
                aspectRatio:   this.#logicalWidth / Math.max(1e-6, this.#logicalHeight),
                pixelRatio:    this.#pixelRatio,
            };
        }

        setPixelRatio(ratio) {
            this.#pixelRatio = this.#clampPixelRatio(ratio);
            this.#applyViewportSize();
            return this.#pixelRatio;
        }

        aaInfo() {
            return {
                mode:          "msaa+ssaa",
                msaa:          this.#msaaEnabled,
                pixelRatio:    this.#pixelRatio,
                maxPixelRatio: this.#maxPixelRatio,
            };
        }

        fitContainer() {
            const parent = this.#canvas.parentElement;
            if (!parent) return this;
            const rect = parent.getBoundingClientRect();
            return this.resize(rect.width, rect.height);
        }

        constructor(name, opts = {}) {
            this.name = name || "canvas";
            const c = document.createElement("canvas");
            c.width  = 800;
            c.height = 600;
            c.style.background = "transparent";
            this.#canvas = c;

            const antialias = typeof opts.antialias === "boolean" ? opts.antialias : true;
            const alpha = typeof opts.alpha === "boolean" ? opts.alpha : true;
            const gl = c.getContext("webgl2", { alpha, antialias });
            if (!gl) throw new Error(`${TAGC3D} WebGL2 not supported`);
            this.#gl = gl;

            this.#maxPixelRatio = (typeof opts.maxPixelRatio === "number" && Number.isFinite(opts.maxPixelRatio))
                ? Math.max(1, opts.maxPixelRatio)
                : 2;
            const initialPR = opts.pixelRatio ?? (typeof window !== "undefined" ? (window.devicePixelRatio || 1) : 1);
            this.#pixelRatio = this.#clampPixelRatio(initialPR);
            this.#msaaEnabled = !!gl.getContextAttributes()?.antialias;

            gl.enable(gl.DEPTH_TEST);
            gl.enable(gl.CULL_FACE);
            gl.enable(gl.BLEND);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
            gl.clearColor(0, 0, 0, alpha ? 0 : 1);

            this.#applyViewportSize();
        }

        #clampPixelRatio(v) {
            const n = Number(v);
            if (!Number.isFinite(n) || n <= 0) return 1;
            return Math.min(Math.max(0.5, n), this.#maxPixelRatio);
        }

        #applyViewportSize() {
            const drawW = Math.max(1, Math.round(this.#logicalWidth  * this.#pixelRatio));
            const drawH = Math.max(1, Math.round(this.#logicalHeight * this.#pixelRatio));

            this.#canvas.style.width  = `${this.#logicalWidth}px`;
            this.#canvas.style.height = `${this.#logicalHeight}px`;

            if (this.#canvas.width  !== drawW) this.#canvas.width  = drawW;
            if (this.#canvas.height !== drawH) this.#canvas.height = drawH;

            this.#gl.viewport(0, 0, drawW, drawH);
        }

        mount(el) {
            if (el instanceof Element) el.appendChild(this.#canvas);
            return this;
        }
        unmount() {
            this.#canvas.parentElement?.removeChild(this.#canvas);
            return this;
        }
        resize(w, h) {
            this.#logicalWidth  = Math.max(1, Math.round(w));
            this.#logicalHeight = Math.max(1, Math.round(h));
            this.#applyViewportSize();
            return this;
        }

        resetViewport() {
            this.#gl.viewport(0, 0, this.#canvas.width, this.#canvas.height);
            return this;
        }
    }

    window.ZRender        = ZRender;
    window.ZShader        = ZShader;
    window.ZCanvas      = ZCanvas;

// Every thing below this line is highly specialized for 3D-object-driven rendering
// --------------------------------------------------------------------------------

    class ZCamera {
        position    = ZMath.V3();
        orientation = ZMath.Q.identity();

        near = 0.1; far = 1000;
        fov  = 45;  // degrees
        aspect = 1;

        orthographic = false;
        orthoSize    = 5;   // half-height

        get forward() { return ZMath.Q.transformV3(this.orientation, ZMath.V3.FORWARD); }
        get right()   { return ZMath.Q.transformV3(this.orientation, ZMath.V3.RIGHT);   }
        get up()      { return ZMath.Q.transformV3(this.orientation, ZMath.V3.UP);      }

        get view() {
            const target = ZMath.V3.add(this.position, this.forward);
            return ZMath.M4.lookAt(this.position, target, this.up);
        }

        get projection() {
            if (this.orthographic) {
                const h = this.orthoSize;
                const w = h * this.aspect;
                return ZMath.M4.ortho(-w, w, -h, h, this.near, this.far);
            }

            return ZMath.M4.perspective(this.fov * ZMath.DEG2RAD, this.aspect, this.near, this.far);
        }

        rotate(axis, angle) {
            const q = ZMath.Q.fromAxisAngle(axis, angle);
            // local-space: existing orientation first, then new rotation
            ZMath.Q.mul(this.orientation, q, this.orientation);
            ZMath.Q.norm(this.orientation, this.orientation);
            return this;
        }

        translate(offset) {
            const worldOffset = ZMath.Q.transformV3(this.orientation, offset);
            ZMath.V3.add(this.position, worldOffset, this.position);
            return this;
        }

        lookAt(target, up = null) {
            up ??= ZMath.V3.UP;

            const forward = ZMath.V3.norm(ZMath.V3.sub(target, this.position));
            const right   = ZMath.V3.norm(ZMath.V3.cross(up, forward));
            const camUp   = ZMath.V3.cross(forward, right);

            const m = ZMath.M4.identity();

            m[0] = right[0];   m[4] = camUp[0];   m[8]  = -forward[0];
            m[1] = right[1];   m[5] = camUp[1];   m[9]  = -forward[1];
            m[2] = right[2];   m[6] = camUp[2];   m[10] = -forward[2];

            ZMath.Q.fromM4(m, this.orientation);
            return this;
        }

        raygen(ndc) {
            const tan = Math.tan(this.fov * ZMath.DEG2RAD * 0.5);

            const x = ndc[0] * tan * this.aspect;
            const y = ndc[1] * tan;

            const dir = ZMath.V3.norm(ZMath.V3.set(x, y, -1));
            ZMath.Q.transformV3(this.orientation, dir, dir);

            return {
                origin    : ZMath.V3.copy(this.position),
                direction : dir
            };
        }
    }


    class EzMesh3D {
        constructor() {
            this.vertexBuffers = []; // [{ vbo, stride, vertexCount, attributes:[{name, size, type, normalized, offset}] }]

            this.ebo        = null;
            this.indexType  = 0;
            this.indexBytes = 0;
            this.indexCount = 0;

            this.submeshes = [];

            this.morphTargetCount = 0;
            this.morphTargetNames = null;

            this.ABmin = [ Infinity,  Infinity,  Infinity];
            this.ABmax = [-Infinity, -Infinity, -Infinity];
        }

        destroy(gl) {
            for (const vb of this.vertexBuffers) if (vb.vbo) gl.deleteBuffer(vb.vbo);
            if (this.ebo) gl.deleteBuffer(this.ebo);
            for (const sm of this.submeshes) {
                if (sm.morph) for (const t of sm.morph.channels.values()) gl.deleteTexture(t);
            }
            this.vertexBuffers = [];
            this.ebo = null;
            this.submeshes = [];
        }

        // Build a mesh from a description
        // opts:
        //   vertexBuffers?: [{ data, attributes: [{ name, size, type?, normalized?, offset? }], stride? }]
        //   vertices?:   Float32Array | TypedArray
        //   attributes?: [{ name, size, type?, normalized? }]
        //   indices?:   Uint16Array | Uint32Array
        //   submeshes?: [{
        //       indexOffset?, indexCount?, vertexOffset?, vertexCount?,
        //       materialKey?,
        //       ABmin?, ABmax?,
        //       morphTargets?: { [channelName]: Float32Array[] }   // each target = vec3[]
        //   }]
        //   morphTargetNames?: string[]
        static fromDesc(gl, opts = {}) {
            const mesh = new EzMesh3D();

            // -- Vertex buffers -----------------------------------------
            const vbDescs = (Array.isArray(opts.vertexBuffers) && opts.vertexBuffers.length)
                ? opts.vertexBuffers
                : (opts.vertices != null
                    ? [{ data: opts.vertices, attributes: opts.attributes ?? [{name:"a_position", size:3}, {name:"a_uv", size:2}], stride: opts.stride }]
                    : []);

            for (const vb of vbDescs) {
                const data = vb.data;
                if (!data) continue;
                const attrs = [];
                let off = 0;
                for (const a of (vb.attributes || [])) {
                    const o = a.offset != null ? a.offset : off;
                    attrs.push({
                        name:       a.name,
                        size:       a.size,
                        type:       a.type ?? gl.FLOAT,
                        normalized: !!a.normalized,
                        offset:     o,
                    });
                    off = o + a.size * 4;
                }
                const stride = vb.stride != null ? vb.stride : off;

                const vbo = gl.createBuffer();
                gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
                gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);

                mesh.vertexBuffers.push({
                    vbo, stride, attributes: attrs,
                    vertexCount: stride > 0 ? (data.byteLength / stride) | 0 : 0,
                });
            }

            // -- Indices ------------------------------------------------
            const indices = opts.indices;
            if (indices) {
                mesh.indexType  = indices instanceof Uint32Array ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT;
                mesh.indexBytes = indices instanceof Uint32Array ? 4 : 2;
                mesh.indexCount = indices.length;
                mesh.ebo = gl.createBuffer();
                gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, mesh.ebo);
                gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);
            }

            // -- Submeshes ----------------------------------------------
            const defaultVCount = mesh.vertexBuffers[0]?.vertexCount ?? 0;
            const subs = (Array.isArray(opts.submeshes) && opts.submeshes.length)
                ? opts.submeshes
                : (indices
                    ? [{ indexOffset: 0, indexCount: indices.length, vertexOffset: 0, vertexCount: defaultVCount }]
                    : [{ vertexOffset: 0, vertexCount: defaultVCount }]);

            for (const s of subs) {
                const sub = {
                    indexOffset:  s.indexOffset  ?? 0,
                    indexCount:   s.indexCount   ?? 0,
                    vertexOffset: s.vertexOffset ?? 0,
                    vertexCount:  s.vertexCount  ?? defaultVCount,
                    materialKey:  s.materialKey  ?? null,
                    ABmin: s.ABmin ? s.ABmin.slice() : [ Infinity,  Infinity,  Infinity],
                    ABmax: s.ABmax ? s.ABmax.slice() : [-Infinity, -Infinity, -Infinity],
                    morph: null,
                };

                // Per-submesh morph deltas - keyed by channel name; the
                // project resolves names to shader sampler bindings.
                if (s.morphTargets && _is.obj(s.morphTargets) && !Array.isArray(s.morphTargets)) {
                    const names = Object.keys(s.morphTargets);
                    let targetCount = 0;
                    for (const ch of names) {
                        const arr = s.morphTargets[ch];
                        if (Array.isArray(arr) && arr.length > targetCount) targetCount = arr.length;
                    }
                    const vCount = sub.vertexCount;
                    if (targetCount > 0 && vCount > 0) {
                        sub.morph = {
                            targetCount,
                            vertexBase:  sub.vertexOffset,
                            vertexCount: vCount,
                            channels:    new Map(),
                        };
                        for (const ch of names) {
                            const arr = s.morphTargets[ch];
                            if (!Array.isArray(arr) || !arr.length) continue;
                            // Pack as a (vCount × targetCount) RGB32F texture, with the
                            // shader fetching texel(t, vertexLocal). Inner loop = target
                            // index, outer = vertex - matches the existing rig shader.
                            const packed = new Float32Array(vCount * targetCount * 3);
                            for (let t = 0; t < targetCount; t++) {
                                const d = arr[t]; if (!d) continue;
                                for (let v = 0; v < vCount; v++) {
                                    const dst = (v * targetCount + t) * 3;
                                    packed[dst    ] = d[v*3    ];
                                    packed[dst + 1] = d[v*3 + 1];
                                    packed[dst + 2] = d[v*3 + 2];
                                }
                            }
                            sub.morph.channels.set(ch, ZRender.uploadTexture2D(
                                gl, null, gl.RGB32F, gl.RGB, gl.FLOAT,
                                targetCount, vCount, packed,
                            ));
                        }
                        if (targetCount > mesh.morphTargetCount) mesh.morphTargetCount = targetCount;
                    }
                }

                mesh.submeshes.push(sub);
                for (let k = 0; k < 3; k++) {
                    if (sub.ABmin[k] < mesh.ABmin[k]) mesh.ABmin[k] = sub.ABmin[k];
                    if (sub.ABmax[k] > mesh.ABmax[k]) mesh.ABmax[k] = sub.ABmax[k];
                }
            }

            if (Array.isArray(opts.morphTargetNames) && opts.morphTargetNames.length) {
                mesh.morphTargetNames = opts.morphTargetNames.slice(0, mesh.morphTargetCount);
                while (mesh.morphTargetNames.length < mesh.morphTargetCount)
                    mesh.morphTargetNames.push(`Target_${mesh.morphTargetNames.length}`);
            }

            gl.bindBuffer(gl.ARRAY_BUFFER, null);
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
            return mesh;
        }
    }

    class EzSkeleton3D {
        // bones: [{ parent: int, localBind: Mat4, inverseBind: Mat4, name: string }]
        bones = [];

        // Scratch buffers (allocated lazily in computePalette).
        #globalCurrent  = []; // Mat4[]
        #localScratch   = ZMath.M4();
        #skinnedScratch = ZMath.M4();

        // bonePoses: Mat4[] (length === bones.length). Returns a Float32Array of
        // n*16 floats (column-major mat4s) suitable for upload to the bone-palette
        // texture. The palette is freshly allocated each call (caller can keep it).
        computePalette(bonePoses) {
            const n = this.bones.length;
            const gc = this.#globalCurrent;
            if (gc.length !== n) {
                gc.length = 0;
                for (let i = 0; i < n; i++) gc.push(ZMath.M4());
            }
            const palette = new Float32Array(n * 16);
            const local = this.#localScratch, skinned = this.#skinnedScratch;
            for (let i = 0; i < n; i++) {
                const b = this.bones[i];
                ZMath.M4.mul(b.localBind, bonePoses[i], local);
                if (b.parent < 0) gc[i].set(local);
                else              ZMath.M4.mul(gc[b.parent], local, gc[i]);
                ZMath.M4.mul(gc[i], b.inverseBind, skinned);
                palette.set(skinned, i * 16);
            }
            return palette;
        }

        // skeleton: { bones: [{ parent?, localBind?: Mat4 | { position?, rotation?, euler?, scale? },
        //                       inverseBind?: Mat4, name? }] }
        static fromDesc(key, skeleton) {
            if (!skeleton || !Array.isArray(skeleton.bones) || skeleton.bones.length === 0) return null;
            const bones = [], globalBind = []; // globalBind: Mat4[]
            for (let i = 0; i < skeleton.bones.length; i++) {
                const b = skeleton.bones[i];
                const parent = b.parent ?? -1;
                if (parent >= i)
                    return _c.warn(`[EzSkeleton3D]`, `"${key}": bone ${i} parent must be < self`) || null;

                const localBind = ZMath.M4();
                resolveTransform(localBind, b.localBind ?? null);

                const gb = ZMath.M4();
                if (parent < 0) gb.set(localBind);
                else            ZMath.M4.mul(globalBind[parent], localBind, gb);
                globalBind[i] = gb;

                let inverseBind;
                if (b.inverseBind && (ArrayBuffer.isView(b.inverseBind) || Array.isArray(b.inverseBind)) && b.inverseBind.length >= 16) {
                    inverseBind = ZMath.M4();
                    inverseBind.set(b.inverseBind);
                } else {
                    inverseBind = ZMath.M4();
                    if (!ZMath.M4.invert(gb, inverseBind)) ZMath.M4.identity(inverseBind);
                }

                bones.push({ parent, localBind, inverseBind, name: typeof b.name === "string" ? b.name : `Bone_${i}` });
            }
            const skel = new EzSkeleton3D();
            skel.bones = bones;
            return skel;
        }
    }

    window.EzMesh3D        = EzMesh3D;
    window.EzSkeleton3D    = EzSkeleton3D;
    window.ZCamera      = ZCamera;

})();
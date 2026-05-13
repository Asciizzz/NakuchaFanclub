/*
ZCanvas
By Asciiz

Holy crap guys I actually made a proper 3D html webgl renderer instead of using canvas2d lmao

Contains
    ZRender     static, dimension-agnostic GL helpers
    ZBuffer     WebGL-backed structured buffer container
    ZShader     low-level shader compile + render-state base
    ZCanvas     thin wrapper around <canvas> + WebGL2 context
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

    class ZRender {
        static #BLEND_ENUM_BY_NAME = {
            ZERO: 0,
            ONE: 1,
            SRC_ALPHA: 0x0302,
            ONE_MINUS_SRC_ALPHA: 0x0303,
            DST_ALPHA: 0x0304,
            ONE_MINUS_DST_ALPHA: 0x0305,
            SRC_COLOR: 0x0300,
            ONE_MINUS_SRC_COLOR: 0x0301,
            DST_COLOR: 0x0306,
            ONE_MINUS_DST_COLOR: 0x0307,
            CONSTANT_COLOR: 0x8001,
            ONE_MINUS_CONSTANT_COLOR: 0x8002,
            CONSTANT_ALPHA: 0x8003,
            ONE_MINUS_CONSTANT_ALPHA: 0x8004,
            SRC_ALPHA_SATURATE: 0x0308,
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

        /**
         * Bind a program fast. Tiny helper so callsite stay clean.
         */
        static bind(gl, program) {
            gl.useProgram(program);
        }

        /**
         * Apply render state from a plain cfg object.
         * Pass only thing you wanna change.
         */
        static setState(gl, cfg) {
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
                    case 'none': gl.disable(gl.CULL_FACE); break;
                    case 'front': gl.enable(gl.CULL_FACE); gl.cullFace(gl.FRONT); break;
                    default: gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); break;
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
                        case 'color': mask |= gl.COLOR_BUFFER_BIT; break;
                        case 'depth': mask |= gl.DEPTH_BUFFER_BIT; break;
                        case 'stencil': mask |= gl.STENCIL_BUFFER_BIT; break;
                    }
                }
                if (mask) gl.clear(mask);
            }
        }

        /**
         * Reset common GL state back to engine default.
         */
        static restoreDefaultState(gl) {
            gl.depthMask(true);
            gl.enable(gl.DEPTH_TEST);
            gl.enable(gl.BLEND);
            gl.enable(gl.CULL_FACE);
            gl.cullFace(gl.BACK);
            gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        }

        /**
         * Bind VAO, run fn, unbind after.
         */
        static withVAO(gl, vao, fn) {
            gl.bindVertexArray(vao);
            try { fn(); }
            finally { gl.bindVertexArray(null); }
        }


        /**
         * Upload growable VBO data.
         * Reuse old alloc when possible, grow if needed.
         */
        static uploadVBO(gl, vbo, data, usage) {
            const need = data.byteLength;
            const cap = vbo._ezCapacity | 0;
            gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
            if (need > 0 && need <= cap) {
                gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
            } else {
                const grow = Math.ceil(cap * 1.5);
                const newCap = Math.max(need, grow);
                gl.bufferData(gl.ARRAY_BUFFER, newCap, usage ?? gl.DYNAMIC_DRAW);
                if (need > 0) gl.bufferSubData(gl.ARRAY_BUFFER, 0, data);
                vbo._ezCapacity = newCap;
            }
        }

        /**
         * Generic buffer upload helper.
         * If byteOffset > 0 we do sub upload, else full upload.
         */
        static uploadBuffer(gl, target, buffer, data, usage, byteOffset = 0) {
            if (!buffer || !data) return buffer;
            gl.bindBuffer(target, buffer);
            if (byteOffset > 0) {
                gl.bufferSubData(target, byteOffset, data);
                return buffer;
            }
            gl.bufferData(target, data, usage ?? gl.STATIC_DRAW);
            return buffer;
        }

        /**
         * Bind or unbind a buffer on a target.
         */
        static bindBuffer(gl, target, buffer) {
            gl.bindBuffer(target, buffer ?? null);
            return buffer;
        }

        /**
         * Push constant attrib value for disabled attrib slot.
         */
        static setConstAttrs(gl, list) {
            for (const a of list) {
                const v = a.value ?? a.default ?? [0, 0, 0, 0];
                gl.vertexAttrib4f(a.loc, v[0] ?? 0, v[1] ?? 0, v[2] ?? 0, v[3] ?? 0);
            }
        }

        /**
         * Wire one vertex attrib from buffer.
         * Works for regular attrib and instanced attrib (divisor).
         */
        static wireAttr(gl, { buffer, loc, size, type, normalized, stride, offset, divisor, enabled }) {
            if (loc == null || loc === -1) return;
            gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
            if (enabled !== false) gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, size, type ?? gl.FLOAT, !!normalized, stride ?? 0, offset ?? 0);
            if (divisor) gl.vertexAttribDivisor(loc, divisor);
        }

        /**
         * Bind tex to unit and set sampler uniform.
         */
        static bindSampler(gl, loc, unit, tex, target) {
            if (loc == null) return;
            gl.activeTexture(gl.TEXTURE0 + unit);
            gl.bindTexture(target ?? gl.TEXTURE_2D, tex);
            gl.uniform1i(loc, unit);
        }

        /**
         * Create + init a 2D texture from pixel data or image source.
         */
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
            else gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, format, type, data);

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
        /**
         * Upload raw texel data into a 2D texture.
         * If tex missing we create one.
         */
        static uploadTexture2D(gl, existing, internalFmt, fmt, type, w, h, data, unit = null) {
            const tex = existing ?? gl.createTexture();
            const explicit = unit != null;
            const prevActive = explicit ? 0 : gl.getParameter(gl.ACTIVE_TEXTURE);
            gl.activeTexture(gl.TEXTURE0 + (explicit ? unit : ZRender.SCRATCH_TEX_UNIT));
            gl.bindTexture(gl.TEXTURE_2D, tex);
            if (!existing) {
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            }
            gl.texImage2D(gl.TEXTURE_2D, 0, internalFmt, w, h, 0, fmt, type, data);
            if (!explicit) gl.activeTexture(prevActive);
            return tex;
        }

        /**
         * Create framebuffer render target with optional color/depth tex.
         */
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
            if (status !== gl.FRAMEBUFFER_COMPLETE) _c.warn("[ZRender]", "framebuffer incomplete:", status);

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

        /**
         * Resize an existing render target tex storage.
         */
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

        /**
         * Bind render target, run fn, restore prev framebuffer state.
         */
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

        /**
         * Delete fbo + attached tex from a render target object.
         */
        static destroyRenderTarget(gl, target) {
            if (!target) return;
            if (target.colorTex) gl.deleteTexture(target.colorTex);
            if (target.depthTex) gl.deleteTexture(target.depthTex);
            if (target.fbo) gl.deleteFramebuffer(target.fbo);
            target.colorTex = null;
            target.depthTex = null;
            target.fbo = null;
        }

        /**
         * Draw helper for indexed/non-indexed instancing.
         */
        static drawInstanced(gl, drawCfg, instanceCount) {
            const mode = drawCfg.mode ?? gl.TRIANGLES;
            if (drawCfg.indexed) {
                gl.drawElementsInstanced(mode, drawCfg.indexCount, drawCfg.indexType, drawCfg.indexOffset, instanceCount);
            } else {
                gl.drawArraysInstanced(mode, drawCfg.vertexOffset, drawCfg.vertexCount, instanceCount);
            }
        }


        /**
         * Pack one instance struct into flat float buffer.
         */
        static packInstanceRow(arr, offFloats, data, layout) {
            for (const e of layout.entries) {
                const src = data[e.name];
                if (src) arr.set(src, offFloats + (e.byteOffset >> 2));
            }
        }

        /**
         * Pack many instance struct into one Float32Array.
         */
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
        program = null;
        other = {};   // free whatever things (includes renderCfg, onbind, custom data)

        _compiled = false;
        get compiled() { return this._compiled; }
        #id = null;
        get id() { return this.#id; }

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

        get versionText() { return this.#spec.version; }

        static BLEND = {
            ZERO: 0,
            ONE: 1,
            SRC_ALPHA: 0x0302,
            ONE_MINUS_SRC_ALPHA: 0x0303,
            DST_ALPHA: 0x0304,
            ONE_MINUS_DST_ALPHA: 0x0305,
            SRC_COLOR: 0x0300,
            ONE_MINUS_SRC_COLOR: 0x0301,
            DST_COLOR: 0x0306,
            ONE_MINUS_DST_COLOR: 0x0307,
            CONSTANT_COLOR: 0x8001,
            ONE_MINUS_CONSTANT_COLOR: 0x8002,
            CONSTANT_ALPHA: 0x8003,
            ONE_MINUS_CONSTANT_ALPHA: 0x8004,
            SRC_ALPHA_SATURATE: 0x0308,
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

        #resolveStages(options, fallback = [0, 1]) {
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

        /**
         * Read current builder spec (cloned plain object).
         */
        read() {
            return {
                version: this.#spec.version,
                outputName: this.#spec.outputName,
                links: this.#spec.links.map(decl => ({ ...decl })),
                stages: this.#spec.passes.map(stage => ({
                    inputs: stage.inputs.map(decl => ({ ...decl })),
                    outputs: stage.outputs.map(decl => ({ ...decl })),
                    uniforms: stage.uniforms.map(decl => ({ ...decl })),
                    methods: stage.methods.map(method => ({ ...method })),
                    precision: { ...stage.precision },
                    main: stage.main,
                })),
            };
        }

        #hasStageConfig(spec) {
            return (
                spec.precision != null ||
                spec.input != null ||
                spec.output != null ||
                spec.uniform != null ||
                spec.method != null ||
                spec.main != null ||
                Array.isArray(spec.inputs) ||
                Array.isArray(spec.outputs) ||
                Array.isArray(spec.uniforms) ||
                Array.isArray(spec.methods)
            );
        }

        #applyRootWrite(spec) {
            if (spec.version != null) {
                if (!_is.str(spec.version)) throw new Error('[ZShader] version must be a string');
                this.#spec.version = spec.version.trim();
            }
            if (spec.outputName != null) {
                if (!_is.str(spec.outputName)) throw new Error('[ZShader] outputName must be a string');
                this.#spec.outputName = spec.outputName.trim();
            }
            if (spec.link != null) this.#spec.links.push(this.#normalizeDecl('link', spec.link));
            if (Array.isArray(spec.links)) {
                for (const linkSpec of spec.links) this.#spec.links.push(this.#normalizeDecl('link', linkSpec));
            }
        }

        #writeStagePrecision(pass, spec) {
            if (spec.precision == null) return;
            if (_is.obj(spec.precision)) {
                for (const [type, value] of Object.entries(spec.precision)) {
                    if (_is.str(type) && _is.str(value)) pass.precision[type] = value;
                }
                return;
            }
            if (_is.str(spec.precisionType) && _is.str(spec.precision)) {
                pass.precision[spec.precisionType] = spec.precision;
                return;
            }
            throw new Error('[ZShader] precision must be { type: value }');
        }

        #pushStageDecls(pass, spec) {
            if (spec.input != null) pass.inputs.push(this.#normalizeDecl('input', spec.input));
            if (Array.isArray(spec.inputs)) {
                for (const item of spec.inputs) pass.inputs.push(this.#normalizeDecl('input', item));
            }
            if (spec.output != null) pass.outputs.push(this.#normalizeDecl('output', spec.output));
            if (Array.isArray(spec.outputs)) {
                for (const item of spec.outputs) pass.outputs.push(this.#normalizeDecl('output', item));
            }
            if (spec.uniform != null) pass.uniforms.push(this.#normalizeDecl('uniform', spec.uniform));
            if (Array.isArray(spec.uniforms)) {
                for (const item of spec.uniforms) pass.uniforms.push(this.#normalizeDecl('uniform', item));
            }
            if (spec.method != null) pass.methods.push(this.#normalizeMethod(spec.method));
            if (Array.isArray(spec.methods)) {
                for (const item of spec.methods) pass.methods.push(this.#normalizeMethod(item));
            }
            if (spec.main != null) pass.main = String(spec.main);
        }

        #applyStageWrite(spec) {
            if (!this.#hasStageConfig(spec)) return;
            if (spec.stage == null && spec.pass == null) {
                throw new Error('[ZShader] write() requires stage/pass when writing stage fields');
            }
            const stages = this.#resolveStages({ stage: spec.stage ?? spec.pass });
            for (const stage of stages) {
                const pass = this.#spec.passes[stage];
                this.#writeStagePrecision(pass, spec);
                this.#pushStageDecls(pass, spec);
            }
        }

        /**
         * Merge spec into shader builder state.
         * This is the main entrypoint for declarative shader setup.
         */
        write(spec = {}) {
            if (!_is.obj(spec)) throw new Error('[ZShader] write() expects an object');
            this.#applyRootWrite(spec);
            this.#applyStageWrite(spec);
            if (spec.custom != null) this.custom(spec.custom);
            if (_is.obj(spec.customs)) this.customs(spec.customs);
            return this;
        }

        /**
         * Store free custom data on shader.other.
         */
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

        /**
         * Batch version of custom().
         */
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

        /**
         * Build GLSL source from current builder state.
         */
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

        #compileFromBuilt(gl, built) {
            this.program = this.#createProgram(gl, built.primary, built.secondary);
            if (!this.program) throw new Error('[ZShader] GL program compilation failed');
            this.#id = ZShader.#hashSourcePair(built.primary, built.secondary);
            this.#refreshReflection(gl);
            this._compiled = true;
            return this;
        }

        #compileFromSources(gl, vertSrc, fragSrc) {
            this.program = this.#createProgram(gl, vertSrc, fragSrc);
            if (!this.program) throw new Error("[ZShader] GL program compilation failed");
            this.#id = ZShader.#hashSourcePair(String(vertSrc ?? ""), String(fragSrc ?? ""));
            this.#refreshReflection(gl);
            this._compiled = true;
            return this;
        }

        /**
         * Compile shader.
         * Usage:
         * 1 arg -> compile built spec using that gl
         * 3 arg -> compile raw vert/frag source
         */
        compile(vertSrc, fragSrc, gl) {
            if (arguments.length === 1) {
                gl = vertSrc;
                const built = this.build();
                return this.#compileFromBuilt(gl, built);
            }
            return this.#compileFromSources(gl, vertSrc, fragSrc);
        }

        static #hashSourcePair(a, b) {
            const s = `${a}\n//---\n${b}`;
            let h1 = 0x811c9dc5;
            let h2 = 0x9e3779b9;
            for (let i = 0; i < s.length; i++) {
                const c = s.charCodeAt(i);
                h1 ^= c;
                h1 = Math.imul(h1, 0x01000193);
                h2 ^= c + (h2 << 6) + (h2 >> 2);
                h2 |= 0;
            }
            return `zs_${(h1 >>> 0).toString(16)}_${(h2 >>> 0).toString(16)}`;
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

            this.vertexInputs = stage0.inputs.map(resolveAttr);
            this.vertexOutputs = stage0.outputs.map(resolveUniform);
            this.vertexUniforms = stage0.uniforms.map(resolveUniform);
            this.fragmentInputs = stage1.inputs.map(resolveUniform);
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

        /**
         * Fast lookup for attrib location by name.
         */
        getInputLocation(name) {
            return this.attributeLocations.get(name) ?? -1;
        }

        /**
         * Fast lookup for uniform location by name.
         */
        getUniformLocation(name) {
            return this.uniformLocations.get(name) ?? null;
        }

        static #UNI = {
            mat4: (gl, loc, v) => gl.uniformMatrix4fv(loc, false, v),
            mat3: (gl, loc, v) => gl.uniformMatrix3fv(loc, false, v),
            vec4: (gl, loc, v) => gl.uniform4fv(loc, v),
            vec3: (gl, loc, v) => gl.uniform3fv(loc, v),
            vec2: (gl, loc, v) => gl.uniform2fv(loc, v),
            float: (gl, loc, v) => gl.uniform1f(loc, v),
            int: (gl, loc, v) => gl.uniform1i(loc, v),
            bool: (gl, loc, v) => gl.uniform1i(loc, v ? 1 : 0),
        };

        /**
         * Set one uniform using reflected type info.
         */
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

        /**
         * Set many uniforms in one call.
         */
        setUniforms(gl, list) {
            for (const { name, value } of list) {
                this.setUniform(gl, name, value);
            }
        }

        /**
         * Bind this program on current GL context.
         */
        bind(gl) {
            ZRender.bind(gl, this.program);
            return this;
        }

        /**
         * Apply shader-owned render cfg (if any).
         */
        applyRenderState(gl) { ZRender.setState(gl, this.other.renderCfg); return this; }
        /**
         * Reset render state back to engine default.
         */
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
            const vshader = this.#compileShader(gl, gl.VERTEX_SHADER, vertSrc);
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

    class ZBuffer {
        #gl;          // WebGLRenderingContext
        #handle;      // WebGLBuffer (opaque GPU handle)
        #target;      // binding point (ARRAY_BUFFER, ELEMENT_ARRAY_BUFFER…)
        #usage;       // driver hint (STATIC_DRAW, DYNAMIC_DRAW…)
        #byteLength;  // allocated byte size on GPU (0 = empty)
        #warnedAttribApi = false;

        /**
         * Create a GPU buffer wrapper.
         * Keep this class storage-focused, no mesh semantic here.
         *
         * @param {WebGLRenderingContext} gl
         * @param {GLenum} target
         * @param {GLenum} usage
         */
        constructor(gl, target, usage) {
            this.#gl = gl;
            this.#target = target ?? gl.ARRAY_BUFFER;
            this.#usage = usage ?? gl.STATIC_DRAW;
            this.#handle = gl.createBuffer();
            this.#byteLength = 0;
            if (!this.#handle) throw new Error('ZBuffer: createBuffer() failed');
        }

        get byteLength() { return this.#byteLength; }
        get target() { return this.#target; }
        get usage() { return this.#usage; }
        get handle() { return this.#handle; } // escape hatch
        get alive() { return this.#handle !== null; }

        /**
         * Change default usage hint for next alloc/upload.
         */
        setUsage(usage) {
            if (typeof usage === "number") this.#usage = usage;
            return this;
        }

        /**
         * Bind this buffer on its target.
         */
        bind() {
            this.#gl.bindBuffer(this.#target, this.#handle);
            return this;
        }

        /**
         * Unbind current buffer from its target.
         */
        unbind() {
            this.#gl.bindBuffer(this.#target, null);
            return this;
        }

        /**
         * Delete GPU buffer handle.
         */
        delete() {
            if (!this.#handle) return;
            this.#gl.deleteBuffer(this.#handle);
            this.#handle = null;
            this.#byteLength = 0;
        }

        /**
         * Full upload / re-upload.
         * data can be typed array, arraybuffer, or byte size.
         *
         * @param {TypedArray|ArrayBuffer|number} dataOrByteLength
         * @param {GLenum=} usageOverride
         */
        upload(dataOrByteLength, usageOverride = undefined) {
            this.bind();
            const usage = usageOverride ?? this.#usage;
            this.#gl.bufferData(this.#target, dataOrByteLength, usage);
            this.#byteLength = ZBuffer.#resolveByteLength(dataOrByteLength);
            return this;
        }

        /**
         * Partial upload into existing storage.
         *
         * @param {TypedArray|DataView|ArrayBuffer} data
         * @param {number} byteOffset
         */
        uploadSub(data, byteOffset = 0) {
            this.bind();
            this.#gl.bufferSubData(this.#target, byteOffset, data);
            const written = (data?.byteLength ?? 0) + byteOffset;
            if (written > this.#byteLength) this.#byteLength = written;
            return this;
        }

        /**
         * Allocate empty GPU storage.
         * Fill later using uploadSub.
         *
         * @param {number} byteLength
         * @param {GLenum=} usageOverride
         */
        allocate(byteLength, usageOverride = undefined) {
            this.bind();
            const usage = usageOverride ?? this.#usage;
            this.#gl.bufferData(this.#target, byteLength, usage);
            this.#byteLength = Math.max(0, Number(byteLength) || 0);
            return this;
        }

        /**
         * Orphan old storage and allocate fresh one.
         * Handy for streaming to avoid stall.
         *
         * @param {number=} byteLength
         */
        orphan(byteLength = undefined) {
            const size = byteLength ?? this.#byteLength;
            return this.allocate(size);
        }

        /**
         * Legacy compat path.
         * Prefer mesh-driven VAO wiring.
         */
        attrib(loc, size, type, normalize = false, stride = 0, offset = 0) {
            if (!this.#warnedAttribApi) {
                this.#warnedAttribApi = true;
                _c.warn("[ZBuffer]", "attrib()/divisor() are legacy. Prefer ZMesh.createVAO() wiring.");
            }
            this.bind();
            this.#gl.vertexAttribPointer(loc, size, type, normalize, stride, offset);
            this.#gl.enableVertexAttribArray(loc);
            return this;
        }

        /**
         * Legacy compat path for instanced divisor.
         * Prefer mesh-driven VAO wiring.
         */
        divisor(loc, d = 1) {
            if (!this.#warnedAttribApi) {
                this.#warnedAttribApi = true;
                _c.warn("[ZBuffer]", "attrib()/divisor() are legacy. Prefer ZMesh.createVAO() wiring.");
            }
            const gl = this.#gl;
            if (gl.vertexAttribDivisor) gl.vertexAttribDivisor(loc, d);
            else {
                const ext = gl.getExtension('ANGLE_instanced_arrays');
                if (ext) ext.vertexAttribDivisorANGLE(loc, d);
            }
            return this;
        }

        static #resolveByteLength(v) {
            if (typeof v === "number") return Math.max(0, v | 0);
            if (v && typeof v.byteLength === "number") return v.byteLength;
            throw new Error("[ZBuffer] upload() requires byteLength-capable data or explicit byte count");
        }
    }

    class ZCanvas {
        name = null;
        #canvas = null;
        #gl = null;

        get canvas() { return this.#canvas; }
        get gl() { return this.#gl; }

        #logicalWidth = 800;
        #logicalHeight = 600;
        #pixelRatio = 1;
        #maxPixelRatio = 2;
        #msaaEnabled = false;

        /**
         * Runtime canvas info in both logical px and draw px.
         */
        get info() {
            return {
                width: this.#canvas.width,
                height: this.#canvas.height,
                logicalWidth: this.#logicalWidth,
                logicalHeight: this.#logicalHeight,
                aspectRatio: this.#logicalWidth / Math.max(1e-6, this.#logicalHeight),
                pixelRatio: this.#pixelRatio,
            };
        }

        /**
         * Set pixel ratio used for draw buffer sizing.
         */
        setPixelRatio(ratio) {
            this.#pixelRatio = this.#clampPixelRatio(ratio);
            this.#applyViewportSize();
            return this.#pixelRatio;
        }

        /**
         * Quick AA mode info snapshot.
         */
        aaInfo() {
            return {
                mode: "msaa+ssaa",
                msaa: this.#msaaEnabled,
                pixelRatio: this.#pixelRatio,
                maxPixelRatio: this.#maxPixelRatio,
            };
        }

        /**
         * Resize to parent element rect.
         */
        fitContainer() {
            const parent = this.#canvas.parentElement;
            if (!parent) return this;
            const rect = parent.getBoundingClientRect();
            return this.resize(rect.width, rect.height);
        }

        /**
         * Build a canvas + webgl2 context wrapper.
         */
        constructor(name, opts = {}) {
            this.name = name || "canvas";
            const c = document.createElement("canvas");
            c.width = 800;
            c.height = 600;
            c.style.background = "transparent";
            this.#canvas = c;

            const antialias = typeof opts.antialias === "boolean" ? opts.antialias : true;
            const alpha = typeof opts.alpha === "boolean" ? opts.alpha : true;
            const gl = c.getContext("webgl2", { alpha, antialias });
            if (!gl) throw new Error(`[ZCanvas] WebGL2 not supported`);
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
            const drawW = Math.max(1, Math.round(this.#logicalWidth * this.#pixelRatio));
            const drawH = Math.max(1, Math.round(this.#logicalHeight * this.#pixelRatio));

            this.#canvas.style.width = `${this.#logicalWidth}px`;
            this.#canvas.style.height = `${this.#logicalHeight}px`;

            if (this.#canvas.width !== drawW) this.#canvas.width = drawW;
            if (this.#canvas.height !== drawH) this.#canvas.height = drawH;

            this.#gl.viewport(0, 0, drawW, drawH);
        }

        /**
         * Attach canvas into DOM element.
         */
        mount(el) {
            if (el instanceof Element) el.appendChild(this.#canvas);
            return this;
        }
        /**
         * Detach canvas from current parent if mounted.
         */
        unmount() {
            this.#canvas.parentElement?.removeChild(this.#canvas);
            return this;
        }
        /**
         * Resize logical canvas size (draw size follow pixel ratio).
         */
        resize(w, h) {
            this.#logicalWidth = Math.max(1, Math.round(w));
            this.#logicalHeight = Math.max(1, Math.round(h));
            this.#applyViewportSize();
            return this;
        }

        /**
         * Reset viewport to full draw buffer size.
         */
        resetViewport() {
            this.#gl.viewport(0, 0, this.#canvas.width, this.#canvas.height);
            return this;
        }
    }

    class ZCamera {
        position = ZMath.V3();
        orientation = ZMath.Q.identity();

        near = 0.1; far = 1000;
        fov = 45;  // degrees
        aspect = 1;

        orthographic = false;
        orthoSize = 5;   // half-height

        get forward() { return ZMath.Q.transformV3(this.orientation, ZMath.V3.FORWARD); }
        get right() { return ZMath.Q.transformV3(this.orientation, ZMath.V3.RIGHT); }
        get up() { return ZMath.Q.transformV3(this.orientation, ZMath.V3.UP); }

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
            const right = ZMath.V3.norm(ZMath.V3.cross(up, forward));
            const camUp = ZMath.V3.cross(forward, right);

            const m = ZMath.M4.identity();

            m[0] = right[0]; m[4] = camUp[0]; m[8] = -forward[0];
            m[1] = right[1]; m[5] = camUp[1]; m[9] = -forward[1];
            m[2] = right[2]; m[6] = camUp[2]; m[10] = -forward[2];

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
                origin: ZMath.V3.copy(this.position),
                direction: dir
            };
        }
    }

    window.ZRender = ZRender;
    window.ZShader = ZShader;
    window.ZBuffer = ZBuffer;
    window.ZCanvas = ZCanvas;
    window.ZCamera = ZCamera;

})();


/* ZRShader
By Asciiz

WebGPU render shader + pipeline wrapper.
*/

(function () {
    if (!window.AzWGPU?.AzShader) throw new Error("[ZRShader] AzWGPU.AzShader is required");

    const {
        AzShader,
        AzPipeline,
        AzBindGroup,
    } = window.AzWGPU;

    class ZRShader {
        module = null;
        pipeline = null;
        other = {};

        #desc = null;

        constructor(desc = {}) {
            this.#desc = { ...desc };
            if (!this.#desc.code) throw new Error("[ZRShader] desc.code is required");
            this.other = { ...(desc.other ?? {}) };
        }

        get desc() { return { ...this.#desc }; }
        get compiled() { return !!(this.module && this.pipeline); }

        compile(device, pipelineOverrides = {}) {
            if (!device) throw new Error("[ZRShader] compile() requires a GPUDevice");

            this.module = AzShader.create(device, {
                code: this.#desc.code,
                label: this.#desc.moduleLabel ?? this.#desc.label ?? "ZRShader.Module",
            });

            const vertex = {
                module: this.module,
                entryPoint: this.#desc.vertexEntry ?? "vs_main",
                ...(this.#desc.vertex ?? {}),
                ...(pipelineOverrides.vertex ?? {}),
            };
            const fragment = {
                module: this.module,
                entryPoint: this.#desc.fragmentEntry ?? "fs_main",
                ...(this.#desc.fragment ?? {}),
                ...(pipelineOverrides.fragment ?? {}),
            };

            const descriptor = {
                label: this.#desc.pipelineLabel ?? this.#desc.label ?? "ZRShader.Pipeline",
                layout: this.#desc.layout ?? pipelineOverrides.layout ?? "auto",
                vertex,
                fragment,
                primitive: {
                    topology: "triangle-list",
                    cullMode: "back",
                    ...(this.#desc.primitive ?? {}),
                    ...(pipelineOverrides.primitive ?? {}),
                },
            };
            if (this.#desc.depthStencil || pipelineOverrides.depthStencil) {
                descriptor.depthStencil = {
                    ...(this.#desc.depthStencil ?? {}),
                    ...(pipelineOverrides.depthStencil ?? {}),
                };
            }
            if (this.#desc.multisample || pipelineOverrides.multisample) {
                descriptor.multisample = {
                    ...(this.#desc.multisample ?? {}),
                    ...(pipelineOverrides.multisample ?? {}),
                };
            }

            if (!Array.isArray(fragment.targets) || fragment.targets.length === 0) {
                throw new Error("[ZRShader] fragment.targets is required for render pipeline");
            }

            this.pipeline = AzPipeline.createRender(device, descriptor);
            return this;
        }

        getBindGroupLayout(index = 0) {
            if (!this.pipeline) throw new Error("[ZRShader] getBindGroupLayout() requires compile()");
            return this.pipeline.getBindGroupLayout(Number(index) | 0);
        }

        createBindGroup(device, index, entries, label = "ZRShader.BindGroup") {
            if (!device) throw new Error("[ZRShader] createBindGroup() requires a GPUDevice");
            if (!Array.isArray(entries)) throw new Error("[ZRShader] createBindGroup() requires entries[]");
            return AzBindGroup.create(device, {
                label,
                layout: this.getBindGroupLayout(index),
                entries,
            });
        }

        static create(device, desc = {}, pipelineOverrides = {}) {
            return new ZRShader(desc).compile(device, pipelineOverrides);
        }
    }

    window.ZRShader = ZRShader;
})();

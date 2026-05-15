/* ZCShader
By Asciiz

WebGPU compute shader + pipeline wrapper.
*/

(function () {
    if (!window.AzWGPU?.AzShader) throw new Error("[ZCShader] AzWGPU.AzShader is required");

    const {
        AzShader,
        AzPipeline,
        AzBindGroup,
    } = window.AzWGPU;

    class ZCShader {
        module = null;
        pipeline = null;
        other = {};

        #desc = null;

        constructor(desc = {}) {
            this.#desc = { ...desc };
            if (!this.#desc.code) throw new Error("[ZCShader] desc.code is required");
            this.other = { ...(desc.other ?? {}) };
        }

        get desc() { return { ...this.#desc }; }
        get compiled() { return !!(this.module && this.pipeline); }

        compile(device, pipelineOverrides = {}) {
            if (!device) throw new Error("[ZCShader] compile() requires a GPUDevice");

            this.module = AzShader.create(device, {
                code: this.#desc.code,
                label: this.#desc.moduleLabel ?? this.#desc.label ?? "ZCShader.Module",
            });

            const descriptor = {
                label: this.#desc.pipelineLabel ?? this.#desc.label ?? "ZCShader.Pipeline",
                layout: this.#desc.layout ?? pipelineOverrides.layout ?? "auto",
                compute: {
                    module: this.module,
                    entryPoint: this.#desc.entryPoint ?? "cs_main",
                    ...(this.#desc.compute ?? {}),
                    ...(pipelineOverrides.compute ?? {}),
                },
            };

            this.pipeline = AzPipeline.createCompute(device, descriptor);
            return this;
        }

        getBindGroupLayout(index = 0) {
            if (!this.pipeline) throw new Error("[ZCShader] getBindGroupLayout() requires compile()");
            return this.pipeline.getBindGroupLayout(Number(index) | 0);
        }

        createBindGroup(device, index, entries, label = "ZCShader.BindGroup") {
            if (!device) throw new Error("[ZCShader] createBindGroup() requires a GPUDevice");
            if (!Array.isArray(entries)) throw new Error("[ZCShader] createBindGroup() requires entries[]");
            return AzBindGroup.create(device, {
                label,
                layout: this.getBindGroupLayout(index),
                entries,
            });
        }

        static create(device, desc = {}, pipelineOverrides = {}) {
            return new ZCShader(desc).compile(device, pipelineOverrides);
        }
    }

    window.ZCShader = ZCShader;
})();


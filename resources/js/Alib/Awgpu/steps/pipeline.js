import { Afstep } from "../../Aflow.js";

/**
 * Sets the active pipeline for the current render or compute pass
 *
 * @param {GPURenderPipeline|GPUComputePipeline} pipeline - The pipeline to activate
 */
export class UsePipeline extends Afstep {
	constructor(pipeline) {
		super();
		this.pipeline = pipeline ?? null;
	}

	exec({ ctx, graph, diag } = {}) {
		if (!ctx.pass || !this.pipeline) return;
		ctx.pass.setPipeline(this.pipeline);
		ctx.pipeline = this.pipeline;
	}
}


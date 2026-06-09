import { Afstep } from "../../Aflow.js";

export class UsePipeline extends Afstep {
	constructor(pipeline) {
		super();
		this.pipeline = pipeline ?? null;
	}

	exec({ ctx, graph, link } = {}) {
		if (!ctx.pass || !this.pipeline) return;
		ctx.pass.setPipeline(this.pipeline);
		ctx.pipeline = this.pipeline;
	}
}


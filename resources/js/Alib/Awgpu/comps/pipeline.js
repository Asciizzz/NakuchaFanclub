import { Afcmd } from "../../Aflow.js";

export class UsePipeline extends Afcmd {
	constructor(pipeline) {
		super();
		this.pipeline = pipeline ?? null;
	}

	exec({ state, graph, link } = {}) {
		if (!state.pass || !this.pipeline) return;
		state.pass.setPipeline(this.pipeline);
		state.pipeline = this.pipeline;
	}
}


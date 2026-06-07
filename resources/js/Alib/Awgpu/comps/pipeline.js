import { AfCmd } from "../../Aflow.js";

export class UsePipeline extends AfCmd {
	pipeline = null;

	constructor(pipeline, data = {}) {
		super(data);
		this.pipeline = pipeline ?? null;
	}

	exec({ state, graph, link } = {}) {
		if (!state.pass || !this.pipeline) return;
		state.pass.setPipeline(this.pipeline);
		state.pipeline = this.pipeline;
	}
}


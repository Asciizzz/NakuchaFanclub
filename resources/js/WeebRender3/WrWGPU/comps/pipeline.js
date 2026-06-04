import { WrComponent } from "../../WrCtx.js";

export class UsePipeline extends WrComponent {
	pipeline = null;

	constructor(pipeline, options = {}) {
		super(options);
		this.pipeline = pipeline ?? null;
	}

	exec(state) {
		if (!state.pass || !this.pipeline) return;
		state.pass.setPipeline(this.pipeline);
		state.pipeline = this.pipeline;
	}
}


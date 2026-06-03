import { WrComponent } from "../../WrCtx/component.js";

export class UsePipeline extends WrComponent {
	pipeline = null;

	constructor(pipeline, options = {}) {
		super(options);
		this.pipeline = pipeline ?? null;
	}

	exec(run) {
		if (!run.pass || !this.pipeline) return;
		run.pass.setPipeline(this.pipeline);
		run.pipeline = this.pipeline;
	}
}

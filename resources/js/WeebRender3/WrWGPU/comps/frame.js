import { WrComponent } from "../../WrCtx/component.js";

export class BeginFrame extends WrComponent {
	label = "Wr3Frame";

	constructor(options = {}) {
		super(options);
		this.label = options.label ?? "Wr3Frame";
	}

	exec(run) {
		if (run.encoder) return;
		run.encoder = run.backend.createEncoder(this.label);
	}
}

export class EndFrame extends WrComponent {
	exec(run) {
		if (run.pass) {
			run.pass.end();
			run.pass = null;
			run.passKind = null;
		}
		if (run.encoder && !run.ended) {
			run.backend.submit(run.encoder);
			run.ended = true;
		}
	}
}

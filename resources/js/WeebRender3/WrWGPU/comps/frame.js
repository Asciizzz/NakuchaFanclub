import { WrComponent } from "../../WrCtx.js";

export class BeginFrame extends WrComponent {
	label = "Wr3Frame";

	constructor(options = {}) {
		super(options);
		this.label = options.label ?? "Wr3Frame";
	}

	exec(state) {
		if (state.encoder) return;
		state.encoder = state.backend.createEncoder(this.label);
		state.ended = false;
	}
}

export class EndFrame extends WrComponent {
	exec(state) {
		if (state.encoder && !state.ended) {
			state.backend.submit(state.encoder);
			state.ended = true;
		}
	}
}


import { Afcmd } from "../../Aflow.js";

export class BeginFrame extends Afcmd {
	label = "Wr3Frame";

	constructor(data = {}) {
		super(data);
		this.label = data.label ?? "Wr3Frame";
	}

	exec({ state, graph, link } = {}) {
		if (state.encoder) return;
		state.encoder = state.backend.createEncoder(this.label);
		state.ended = false;
	}
}

export class EndFrame extends Afcmd {
	exec({ state, graph, link } = {}) {
		if (state.encoder && !state.ended) {
			state.backend.submit(state.encoder);
			state.ended = true;
		}
	}
}


import { Afcmd } from "../../Aflow.js";

export class BeginFrame extends Afcmd {
	constructor(data = {}) {
		super(data);
	}

	exec({ state } = {}) {
		// Reset all per-frame mutable state, gl side needs no "encoder" - just clean slate
		state.ended = false;
		state.program = null;
		state.vao = null;
		state.framebuffer = null;
		state.buffers.vertex.clear();
		state.buffers.index = null;
		state.textures.clear();
	}
}

export class EndFrame extends Afcmd {
	exec({ state } = {}) {
		if (!state.gl || state.ended) return;
		state.gl.flush();
		state.ended = true;
	}
}

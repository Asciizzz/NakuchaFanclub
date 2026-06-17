import { Afstep } from "../../Aflow.js";

export class BeginFrame extends Afstep {
	constructor() {
		super();
	}

	exec({ ctx, graph, diag } = {}) {
		// Reset all per-frame mutable state, gl side needs no "encoder" - just clean slate
		ctx.ended = false;
		ctx.program = null;
		ctx.vao = null;
		ctx.framebuffer = null;
		ctx.buffers.vertex.clear();
		ctx.buffers.index = null;
		ctx.textures.clear();
	}
}

export class EndFrame extends Afstep {
	exec({ ctx, graph, diag } = {}) {
		if (!ctx.gl || ctx.ended) return;
		ctx.gl.flush();
		ctx.ended = true;
	}
}

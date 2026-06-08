import { Afcmd } from "../../Aflow.js";

// UseProgram: equivalent of UsePipeline. Binds a compiled WebGLProgram.
export class UseProgram extends Afcmd {
	program = null;

	constructor(program, data = {}) {
		super();
		this.program = program ?? null;
	}

	exec({ state } = {}) {
		if (!state.gl || state.passKind !== "render" || !this.program) return;
		state.gl.useProgram(this.program);
		state.program = this.program;
	}
}

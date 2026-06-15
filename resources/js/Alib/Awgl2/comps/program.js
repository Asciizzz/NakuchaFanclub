import { Afstep } from "../../Aflow.js";

// UseProgram: equivalent of UsePipeline. Binds a compiled WebGLProgram.
export class UseProgram extends Afstep {
	program = null;

	constructor(program, data = {}) {
		super();
		this.program = program ?? null;
	}

	exec({ ctx, graph, diag } = {}) {
		if (!ctx.gl || ctx.passKind !== "render" || !this.program) return;
		ctx.gl.useProgram(this.program);
		ctx.program = this.program;
	}
}

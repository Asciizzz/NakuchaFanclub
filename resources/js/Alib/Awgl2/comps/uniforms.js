import { Afstep } from "../../Aflow.js";

// SetUniforms: uploads uniform values to the active program.
// Equivalent of Awgpu's SetBindGroups, but for the non-texture uniform side.
//
// entries: [{ name, type, value, ?program }]
//   name    - uniform name string
//   type    - one of: "1i" "1f" "2f" "3f" "4f" "1iv" "1fv" "2fv" "3fv" "4fv"
//             "mat2" "mat3" "mat4"
//   value   - matching JS primitive / array / Float32Array
//   program - override which program to look the location up on (defaults to ctx.program)
export class SetUniforms extends Afstep {
	entries = [];

	constructor(entries = [], data = {}) {
		super();
		this.entries = Array.isArray(entries) ? entries.slice() : [];
	}

	exec({ ctx, graph, diag } = {}) {
		if (!ctx.gl || ctx.passKind !== "render") return;
		const gl = ctx.gl;

		for (const entry of this.entries) {
			const prog = entry.program ?? ctx.program;
			if (!prog || !entry.name) continue;

			const loc = gl.getUniformLocation(prog, entry.name);
			if (loc == null) continue;

			const v = entry.value;
			switch (entry.type) {
				case "1i":    gl.uniform1i(loc, v); break;
				case "1f":    gl.uniform1f(loc, v); break;
				case "2f":    gl.uniform2f(loc, v[0], v[1]); break;
				case "3f":    gl.uniform3f(loc, v[0], v[1], v[2]); break;
				case "4f":    gl.uniform4f(loc, v[0], v[1], v[2], v[3]); break;
				case "1iv":   gl.uniform1iv(loc, v); break;
				case "1fv":   gl.uniform1fv(loc, v); break;
				case "2fv":   gl.uniform2fv(loc, v); break;
				case "3fv":   gl.uniform3fv(loc, v); break;
				case "4fv":   gl.uniform4fv(loc, v); break;
				case "mat2":  gl.uniformMatrix2fv(loc, entry.transpose ?? false, v); break;
				case "mat3":  gl.uniformMatrix3fv(loc, entry.transpose ?? false, v); break;
				case "mat4":  gl.uniformMatrix4fv(loc, entry.transpose ?? false, v); break;
				default: break;
			}
		}
	}
}

import { Afstep } from "../../Aflow.js";

// SetTextures: equivalent of SetBindGroups for the texture side of things.
// Activates one or more texture units and binds a WebGLTexture to each.
//
// entries: [{ unit, texture, ?target, ?uniform, ?program }]
//   unit    - texture unit index (gl.TEXTURE0 + unit)
//   texture - WebGLTexture
//   target  - gl.TEXTURE_2D (default), gl.TEXTURE_CUBE_MAP, gl.TEXTURE_2D_ARRAY, etc.
//   uniform - optional name of the sampler uniform; if provided the location is looked
//             up on program (ctx.program) and the unit index is written automatically
export class SetTextures extends Afstep {
	entries = [];

	constructor(entries = [], data = {}) {
		super();
		this.entries = Array.isArray(entries) ? entries.slice() : [];
	}

	exec({ ctx, graph, diag } = {}) {
		if (!ctx.gl || ctx.passKind !== "render") return;
		const gl = ctx.gl;

		for (const entry of this.entries) {
			const texture = entry?.texture ?? null;
			if (!texture) continue;

			const unit = Math.max(0, Number(entry.unit ?? 0) | 0);
			const target = entry.target ?? gl.TEXTURE_2D;

			gl.activeTexture(gl.TEXTURE0 + unit);
			gl.bindTexture(target, texture);
			ctx.textures.set(unit, { texture, target });

			// Optionally wire the sampler uniform so callers don't have to do it themselves
			if (entry.uniform && ctx.program) {
				const prog = entry.program ?? ctx.program;
				const loc = gl.getUniformLocation(prog, entry.uniform);
				if (loc != null) gl.uniform1i(loc, unit);
			}
		}
	}
}

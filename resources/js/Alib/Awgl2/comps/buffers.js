import { Afstep } from "../../Aflow.js";

function uint(value, fallback = 0) {
	return Math.max(0, Number(value ?? fallback) | 0);
}

// SetBuffers: binds a VAO (required) plus optional raw VBO/EBO overrides.
// In WebGL2 the VAO encodes all attribute pointers, so normally you just
// bind the VAO and draw. The optional vertex/index entries let you swap
// individual buffers without creating a new VAO.
export class SetBuffers extends Afstep {
	vao = null;
	vertex = [];  // [{ slot, buffer, ?offset }] - optional overrides
	index = null; // { buffer, type } type = gl.UNSIGNED_SHORT | gl.UNSIGNED_INT

	constructor(data = {}) {
		super();
		this.vao = data.vao ?? null;
		const verts = data.vertex ?? data.vertices;
		this.vertex = Array.isArray(verts) ? verts.slice() : (verts ? [verts] : []);
		this.index = data.index ?? null;
	}

	exec({ ctx, graph, diag } = {}) {
		if (!ctx.gl || ctx.passKind !== "render") return;
		const gl = ctx.gl;

		if (this.vao) {
			gl.bindVertexArray(this.vao);
			ctx.vao = this.vao;
		}

		for (const entry of this.vertex) {
			const buf = entry?.buffer ?? null;
			if (!buf) continue;
			gl.bindBuffer(gl.ARRAY_BUFFER, buf);
			ctx.buffers.vertex.set(uint(entry.slot), buf);
		}

		if (this.index?.buffer) {
			const type = this.index.type ?? gl.UNSIGNED_SHORT;
			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.index.buffer);
			ctx.buffers.index = { buffer: this.index.buffer, type };
		}
	}
}

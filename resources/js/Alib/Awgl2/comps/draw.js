import { Afstep } from "../../Aflow.js";

function uint(value, fallback = 0) {
	return Math.max(0, Number(value ?? fallback) | 0);
}

// Draw: gl.drawArrays - non-indexed vertex drawing
export class Draw extends Afstep {
	mode = null;        // gl.TRIANGLES / gl.LINES / gl.POINTS etc.; null = gl.TRIANGLES
	first = 0;
	count = 0;
	instanceCount = 0; // 0 = non-instanced

	constructor(data = {}) {
		super();
		this.mode = data.mode ?? null;
		this.first = uint(data.first ?? data.firstVertex);
		this.count = uint(data.count ?? data.vertexCount);
		this.instanceCount = uint(data.instanceCount);
	}

	exec({ ctx, graph, diag } = {}) {
		if (!ctx.gl || ctx.passKind !== "render" || !ctx.program) return;
		const gl = ctx.gl;
		const mode = this.mode ?? gl.TRIANGLES;
		if (this.instanceCount > 0) {
			gl.drawArraysInstanced(mode, this.first, this.count, this.instanceCount);
		} else {
			gl.drawArrays(mode, this.first, this.count);
		}
	}
}

// DrawIndexed: gl.drawElements - indexed drawing
export class DrawIndexed extends Afstep {
	mode = null;
	count = 0;
	type = null;        // gl.UNSIGNED_SHORT / gl.UNSIGNED_INT; null = auto from state
	offset = 0;         // byte offset into the index buffer
	instanceCount = 0; // 0 = non-instanced

	constructor(data = {}) {
		super();
		this.mode = data.mode ?? null;
		this.count = uint(data.count ?? data.indexCount);
		this.type = data.type ?? null;
		this.offset = uint(data.offset);
		this.instanceCount = uint(data.instanceCount);
	}

	exec({ ctx, graph, diag } = {}) {
		if (!ctx.gl || ctx.passKind !== "render" || !ctx.program) return;
		const gl = ctx.gl;
		const mode = this.mode ?? gl.TRIANGLES;
		const type = this.type ?? ctx.buffers.index?.type ?? gl.UNSIGNED_SHORT;
		if (this.instanceCount > 0) {
			gl.drawElementsInstanced(mode, this.count, type, this.offset, this.instanceCount);
		} else {
			gl.drawElements(mode, this.count, type, this.offset);
		}
	}
}

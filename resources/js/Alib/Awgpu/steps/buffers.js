import { Afstep } from "../../Aflow.js";

function list(value) {
	if (Array.isArray(value)) return value;
	if (value == null) return [];
	return [value];
}

function uint(value, fallback = 0) {
	return Math.max(0, Number(value ?? fallback) | 0);
}

/**
 * Binds vertex, index, and indirect buffers for the active render pass.
 *
 * @param {Object} data
 * @param {Array<{slot?: number, buffer: GPUBuffer, offset?: number, size?: number}>|Object} [data.vertex]
 * @param {{buffer: GPUBuffer, format?: "uint16"|"uint32", offset?: number, size?: number}} [data.index]
 * @param {{buffer: GPUBuffer, offset?: number}} [data.indirect]
 */
export class SetBuffers extends Afstep {
	vertex = [];
	index = null;
	indirect = null;

	constructor(data = {}) {
		super();
		this.vertex = list(data.vertex).slice();
		this.index = data.index ?? null;
		this.indirect = data.indirect ?? null;
	}

	exec({ ctx, graph, diag } = {}) {
		if (!ctx.pass || ctx.passKind !== "render") return;
		this.setVertexBuffers(ctx);
		this.setIndexBuffer(ctx);
		this.setIndirectBuffer(ctx);
	}

	setVertexBuffers(ctx) {
		for (const entry of this.vertex) {
			const slot = uint(entry?.slot);
			const buffer = entry?.buffer ?? null;
			if (!buffer) continue;
			const offset = uint(entry.offset);
			if (entry.size == null) ctx.pass.setVertexBuffer(slot, buffer, offset);
			else ctx.pass.setVertexBuffer(slot, buffer, offset, uint(entry.size));
			ctx.buffers.vertex.set(slot, { buffer, offset, size: entry.size ?? null });
		}
	}

	setIndexBuffer(ctx) {
		if (this.index?.buffer) {
			const offset = uint(this.index.offset);
			const format = this.index.format ?? "uint32";
			if (this.index.size == null) ctx.pass.setIndexBuffer(this.index.buffer, format, offset);
			else ctx.pass.setIndexBuffer(this.index.buffer, format, offset, uint(this.index.size));
			ctx.buffers.index = {
				buffer: this.index.buffer,
				format,
				offset,
				size: this.index.size ?? null,
			};
		}
	}

	setIndirectBuffer(ctx) {
		if (this.indirect?.buffer) {
			ctx.buffers.indirect = {
				buffer: this.indirect.buffer,
				offset: uint(this.indirect.offset),
			};
		}
	}
}


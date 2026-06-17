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
 * Sets vertex, index, and indirect buffers on the active render pass
 *
 * @param {Object} data - Configuration object
 * @param {Array<Object>|Object} [data.vertex] - Vertex buffer(s) to bind
 * @param {number} [data.vertex[].slot] - Slot index for the vertex buffer (default: 0)
 * @param {GPUBuffer} [data.vertex[].buffer] - The vertex buffer
 * @param {number} [data.vertex[].offset] - Byte offset in the buffer (default: 0)
 * @param {number} [data.vertex[].size] - Optional size limit for the bound range
 * @param {Object} [data.index] - Index buffer configuration
 * @param {GPUBuffer} [data.index.buffer] - The index buffer
 * @param {string} [data.index.format] - Index format: "uint16" or "uint32" (default: "uint32")
 * @param {number} [data.index.offset] - Byte offset in the buffer (default: 0)
 * @param {number} [data.index.size] - Optional size limit for the bound range
 * @param {Object} [data.indirect] - Indirect buffer configuration
 * @param {GPUBuffer} [data.indirect.buffer] - The indirect buffer
 * @param {number} [data.indirect.offset] - Byte offset in the buffer (default: 0)
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


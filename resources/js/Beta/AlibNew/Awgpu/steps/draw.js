import { Afstep } from "../../Aflow.js";

/**
 * Draws vertices without an index buffer
 *
 * @param {Object} data - Configuration object
 * @param {number} [data.vertexCount] - Number of vertices to draw (default: 0)
 * @param {number} [data.instanceCount] - Number of instances to draw (default: 1, min: 1)
 * @param {number} [data.firstVertex] - Index of the first vertex (default: 0)
 * @param {number} [data.firstInstance] - Index of the first instance (default: 0)
 */
export class Draw extends Afstep {
	vertexCount = 0;
	instanceCount = 1;
	firstVertex = 0;
	firstInstance = 0;

	constructor(data = {}) {
		super();
		this.vertexCount = Math.max(0, Number(data.vertexCount ?? 0) | 0);
		this.instanceCount = Math.max(1, Number(data.instanceCount ?? 1) | 0);
		this.firstVertex = Math.max(0, Number(data.firstVertex ?? 0) | 0);
		this.firstInstance = Math.max(0, Number(data.firstInstance ?? 0) | 0);
	}

	exec({ ctx, graph, diag } = {}) {
		if (!ctx.pass || ctx.passKind !== "render") return;
		if (!ctx.pipeline) return;
		ctx.pass.draw(this.vertexCount, this.instanceCount, this.firstVertex, this.firstInstance);
	}
}

/**
 * Draws indexed vertices using an index buffer
 *
 * @param {Object} data - Configuration object
 * @param {number} [data.indexCount] - Number of indices to draw (default: 0)
 * @param {number} [data.instanceCount] - Number of instances to draw (default: 1, min: 1)
 * @param {number} [data.firstIndex] - Index of the first index in the index buffer (default: 0)
 * @param {number} [data.baseVertex] - Vertex offset added to each index (default: 0)
 * @param {number} [data.firstInstance] - Index of the first instance (default: 0)
 */
export class DrawIndexed extends Afstep {
	indexCount = 0;
	instanceCount = 1;
	firstIndex = 0;
	baseVertex = 0;
	firstInstance = 0;

	constructor(data = {}) {
		super();
		this.indexCount = Math.max(0, Number(data.indexCount ?? 0) | 0);
		this.instanceCount = Math.max(1, Number(data.instanceCount ?? 1) | 0);
		this.firstIndex = Math.max(0, Number(data.firstIndex ?? 0) | 0);
		this.baseVertex = Number(data.baseVertex ?? 0) | 0;
		this.firstInstance = Math.max(0, Number(data.firstInstance ?? 0) | 0);
	}

	exec({ ctx, graph, diag } = {}) {
		if (!ctx.pass || ctx.passKind !== "render") return;
		if (!ctx.pipeline) return;
		ctx.pass.drawIndexed(this.indexCount, this.instanceCount, this.firstIndex, this.baseVertex, this.firstInstance);
	}
}

/**
 * Draws vertices indirectly using arguments stored in a buffer
 *
 * @param {Object} data - Configuration object
 * @param {GPUBuffer} [data.buffer] - Buffer containing draw arguments; if not provided, uses the indirect buffer from SetBuffers
 * @param {number} [data.offset] - Byte offset in the buffer (default: 0)
 */
export class DrawIndirect extends Afstep {
	buffer = null;
	offset = 0;

	constructor(data = {}) {
		super();
		this.buffer = data.buffer ?? null;
		this.offset = Math.max(0, Number(data.offset ?? 0) | 0);
	}

	exec({ ctx, graph, diag } = {}) {
		if (!ctx.pass || ctx.passKind !== "render") return;
		if (!ctx.pipeline) return;
		const indirect = this.buffer ? { buffer: this.buffer, offset: this.offset } : ctx.buffers.indirect;
		if (!indirect?.buffer) return;
		ctx.pass.drawIndirect(indirect.buffer, indirect.offset ?? 0);
	}
}

/**
 * Draws indexed vertices indirectly using arguments stored in a buffer
 *
 * @param {Object} data - Configuration object
 * @param {GPUBuffer} [data.buffer] - Buffer containing draw indexed arguments; if not provided, uses the indirect buffer from SetBuffers
 * @param {number} [data.offset] - Byte offset in the buffer (default: 0)
 */
export class DrawIndexedIndirect extends Afstep {
	buffer = null;
	offset = 0;

	constructor(data = {}) {
		super();
		this.buffer = data.buffer ?? null;
		this.offset = Math.max(0, Number(data.offset ?? 0) | 0);
	}

	exec({ ctx, graph, diag } = {}) {
		if (!ctx.pass || ctx.passKind !== "render") return;
		if (!ctx.pipeline) return;
		const indirect = this.buffer ? { buffer: this.buffer, offset: this.offset } : ctx.buffers.indirect;
		if (!indirect?.buffer) return;
		ctx.pass.drawIndexedIndirect(indirect.buffer, indirect.offset ?? 0);
	}
}


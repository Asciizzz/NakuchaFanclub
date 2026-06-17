import { Afstep } from "../../Aflow.js";

function uint(value, fallback = 1) {
	return Math.max(1, Number(value ?? fallback) | 0);
}

/**
 * Dispatches compute workgroups
 *
 * @param {Object} data - Configuration object
 * @param {number} [data.x] - Number of workgroups in X dimension (default: 1, min: 1)
 * @param {number} [data.y] - Number of workgroups in Y dimension (default: 1, min: 1)
 * @param {number} [data.z] - Number of workgroups in Z dimension (default: 1, min: 1)
 */
export class Dispatch extends Afstep {
	x = 1;
	y = 1;
	z = 1;

	constructor(data = {}) {
		super();
		this.x = uint(data.x);
		this.y = uint(data.y);
		this.z = uint(data.z);
	}

	exec({ ctx, graph, diag } = {}) {
		if (!ctx.pass || ctx.passKind !== "compute") return;
		if (!ctx.pipeline) return;
		ctx.pass.dispatchWorkgroups(this.x, this.y, this.z);
	}
}

/**
 * Dispatches compute workgroups using indirect arguments from a buffer
 *
 * @param {Object} data - Configuration object
 * @param {GPUBuffer} data.buffer - Buffer containing dispatch arguments (3 uint32 values)
 * @param {number} [data.offset] - Byte offset in the buffer (default: 0)
 */
export class DispatchIndirect extends Afstep {
	buffer = null;
	offset = 0;

	constructor(data = {}) {
		super();
		this.buffer = data.buffer ?? null;
		this.offset = Math.max(0, Number(data.offset ?? 0) | 0);
	}

	exec({ ctx, graph, diag } = {}) {
		if (!ctx.pass || ctx.passKind !== "compute") return;
		if (!ctx.pipeline || !this.buffer) return;
		ctx.pass.dispatchWorkgroupsIndirect(this.buffer, this.offset);
	}
}


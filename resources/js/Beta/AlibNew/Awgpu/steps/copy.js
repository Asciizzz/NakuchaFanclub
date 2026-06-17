import { Afstep } from "../../Aflow.js";

function uint(value, fallback = 0) {
	return Math.max(0, Number(value ?? fallback) | 0);
}

function ensureEncoder(ctx, label = "AwgpuCopy") {
	if (ctx.encoder) return ctx.encoder;
	if (!ctx.device) return null;
	ctx.encoder = ctx.device.createCommandEncoder({ label });
	ctx.ended = false;
	return ctx.encoder;
}

/**
 * Copies data from a source buffer to a destination buffer
 *
 * @param {Object} data - Configuration object
 * @param {GPUBuffer} data.src - Source buffer
 * @param {GPUBuffer} data.dst - Destination buffer
 * @param {number} [data.srcOffset] - Byte offset in source buffer (default: 0)
 * @param {number} [data.dstOffset] - Byte offset in destination buffer (default: 0)
 * @param {number} data.size - Number of bytes to copy
 */
export class CopyBufferToBuffer extends Afstep {
	src = null;
	dst = null;
	srcOffset = 0;
	dstOffset = 0;
	size = 0;

	constructor(data = {}) {
		super();
		this.src = data.src ?? null;
		this.dst = data.dst ?? null;
		this.srcOffset = uint(data.srcOffset);
		this.dstOffset = uint(data.dstOffset);
		this.size = uint(data.size);
	}

	exec({ ctx, graph, diag } = {}) {
		if (ctx.pass || !this.src || !this.dst || this.size <= 0) return;
		const encoder = ensureEncoder(ctx);
		if (!encoder) return;
		encoder.copyBufferToBuffer(
			this.src,
			this.srcOffset,
			this.dst,
			this.dstOffset,
			this.size,
		);
	}
}

/**
 * Copies data from a buffer to a texture
 *
 * @param {Object} data - Configuration object
 * @param {GPUImageCopyBufferLike} data.src - Buffer copy source
 * @param {GPUImageCopyTextureTagged} data.dst - Texture copy destination
 * @param {GPUExtent3DStrict} data.size - Size of the region to copy
 */
export class CopyBufferToTexture extends Afstep {
	src = null;
	dst = null;
	size = null;

	constructor(data = {}) {
		super();
		this.src = data.src ?? null;
		this.dst = data.dst ?? null;
		this.size = data.size ?? null;
	}

	exec({ ctx, graph, diag } = {}) {
		if (ctx.pass || !this.src || !this.dst || !this.size) return;
		const encoder = ensureEncoder(ctx);
		if (!encoder) return;
		encoder.copyBufferToTexture(this.src, this.dst, this.size);
	}
}

/**
 * Copies data from a texture to a buffer
 *
 * @param {Object} data - Configuration object
 * @param {GPUImageCopyTextureTagged} data.src - Texture copy source
 * @param {GPUImageCopyBufferLike} data.dst - Buffer copy destination
 * @param {GPUExtent3DStrict} data.size - Size of the region to copy
 */
export class CopyTextureToBuffer extends Afstep {
	src = null;
	dst = null;
	size = null;

	constructor(data = {}) {
		super();
		this.src = data.src ?? null;
		this.dst = data.dst ?? null;
		this.size = data.size ?? null;
	}

	exec({ ctx, graph, diag } = {}) {
		if (ctx.pass || !this.src || !this.dst || !this.size) return;
		const encoder = ensureEncoder(ctx);
		if (!encoder) return;
		encoder.copyTextureToBuffer(this.src, this.dst, this.size);
	}
}

/**
 * Copies data from a texture to another texture
 *
 * @param {Object} data - Configuration object
 * @param {GPUImageCopyTextureTagged} data.src - Texture copy source
 * @param {GPUImageCopyTextureTagged} data.dst - Texture copy destination
 * @param {GPUExtent3DStrict} data.size - Size of the region to copy
 */
export class CopyTextureToTexture extends Afstep {
	src = null;
	dst = null;
	size = null;

	constructor(data = {}) {
		super();
		this.src = data.src ?? null;
		this.dst = data.dst ?? null;
		this.size = data.size ?? null;
	}

	exec({ ctx, graph, diag } = {}) {
		if (ctx.pass || !this.src || !this.dst || !this.size) return;
		const encoder = ensureEncoder(ctx);
		if (!encoder) return;
		encoder.copyTextureToTexture(this.src, this.dst, this.size);
	}
}

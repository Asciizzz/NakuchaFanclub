import { Afstep } from "../../Aflow.js";

function uint(value, fallback = 0) {
	return Math.max(0, Number(value ?? fallback) | 0);
}

function ensureEncoder(ctx, label = "AwgpuCopy") {
	if (ctx.encoder) return ctx.encoder;
	if (!ctx.backend) return null;
	ctx.encoder = ctx.backend.createEncoder(label);
	ctx.ended = false;
	return ctx.encoder;
}

export class CopyBufferToBuffer extends Afstep {
	source = null;
	destination = null;
	sourceOffset = 0;
	destinationOffset = 0;
	size = 0;

	constructor(data = {}) {
		super();
		this.source = data.source ?? data.sourceBuffer ?? null;
		this.destination = data.destination ?? data.destinationBuffer ?? null;
		this.sourceOffset = uint(data.sourceOffset);
		this.destinationOffset = uint(data.destinationOffset);
		this.size = uint(data.size);
	}

	exec({ ctx, graph, link } = {}) {
		if (ctx.pass || !this.source || !this.destination || this.size <= 0) return;
		const encoder = ensureEncoder(ctx);
		if (!encoder) return;
		encoder.copyBufferToBuffer(
			this.source,
			this.sourceOffset,
			this.destination,
			this.destinationOffset,
			this.size,
		);
	}
}

export class CopyBufferToTexture extends Afstep {
	source = null;
	destination = null;
	size = null;

	constructor(data = {}) {
		super();
		this.source = data.source ?? null;
		this.destination = data.destination ?? null;
		this.size = data.size ?? null;
	}

	exec({ ctx, graph, link } = {}) {
		if (ctx.pass || !this.source || !this.destination || !this.size) return;
		const encoder = ensureEncoder(ctx);
		if (!encoder) return;
		encoder.copyBufferToTexture(this.source, this.destination, this.size);
	}
}

export class CopyTextureToBuffer extends Afstep {
	source = null;
	destination = null;
	size = null;

	constructor(data = {}) {
		super();
		this.source = data.source ?? null;
		this.destination = data.destination ?? null;
		this.size = data.size ?? null;
	}

	exec({ ctx, graph, link } = {}) {
		if (ctx.pass || !this.source || !this.destination || !this.size) return;
		const encoder = ensureEncoder(ctx);
		if (!encoder) return;
		encoder.copyTextureToBuffer(this.source, this.destination, this.size);
	}
}

export class CopyTextureToTexture extends Afstep {
	source = null;
	destination = null;
	size = null;

	constructor(data = {}) {
		super();
		this.source = data.source ?? null;
		this.destination = data.destination ?? null;
		this.size = data.size ?? null;
	}

	exec({ ctx, graph, link } = {}) {
		if (ctx.pass || !this.source || !this.destination || !this.size) return;
		const encoder = ensureEncoder(ctx);
		if (!encoder) return;
		encoder.copyTextureToTexture(this.source, this.destination, this.size);
	}
}

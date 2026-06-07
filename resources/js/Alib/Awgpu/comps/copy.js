import { AfCmd } from "../../Aflow.js";

function uint(value, fallback = 0) {
	return Math.max(0, Number(value ?? fallback) | 0);
}

function ensureEncoder(state, label = "AwgpuCopy") {
	if (state.encoder) return state.encoder;
	if (!state.backend) return null;
	state.encoder = state.backend.createEncoder(label);
	state.ended = false;
	return state.encoder;
}

export class CopyBufferToBuffer extends AfCmd {
	source = null;
	destination = null;
	sourceOffset = 0;
	destinationOffset = 0;
	size = 0;

	constructor(data = {}) {
		super(data);
		this.source = data.source ?? data.sourceBuffer ?? null;
		this.destination = data.destination ?? data.destinationBuffer ?? null;
		this.sourceOffset = uint(data.sourceOffset);
		this.destinationOffset = uint(data.destinationOffset);
		this.size = uint(data.size);
	}

	exec({ state, graph, link } = {}) {
		if (state.pass || !this.source || !this.destination || this.size <= 0) return;
		const encoder = ensureEncoder(state);
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

export class CopyBufferToTexture extends AfCmd {
	source = null;
	destination = null;
	size = null;

	constructor(data = {}) {
		super(data);
		this.source = data.source ?? null;
		this.destination = data.destination ?? null;
		this.size = data.size ?? null;
	}

	exec({ state, graph, link } = {}) {
		if (state.pass || !this.source || !this.destination || !this.size) return;
		const encoder = ensureEncoder(state);
		if (!encoder) return;
		encoder.copyBufferToTexture(this.source, this.destination, this.size);
	}
}

export class CopyTextureToBuffer extends AfCmd {
	source = null;
	destination = null;
	size = null;

	constructor(data = {}) {
		super(data);
		this.source = data.source ?? null;
		this.destination = data.destination ?? null;
		this.size = data.size ?? null;
	}

	exec({ state, graph, link } = {}) {
		if (state.pass || !this.source || !this.destination || !this.size) return;
		const encoder = ensureEncoder(state);
		if (!encoder) return;
		encoder.copyTextureToBuffer(this.source, this.destination, this.size);
	}
}

export class CopyTextureToTexture extends AfCmd {
	source = null;
	destination = null;
	size = null;

	constructor(data = {}) {
		super(data);
		this.source = data.source ?? null;
		this.destination = data.destination ?? null;
		this.size = data.size ?? null;
	}

	exec({ state, graph, link } = {}) {
		if (state.pass || !this.source || !this.destination || !this.size) return;
		const encoder = ensureEncoder(state);
		if (!encoder) return;
		encoder.copyTextureToTexture(this.source, this.destination, this.size);
	}
}

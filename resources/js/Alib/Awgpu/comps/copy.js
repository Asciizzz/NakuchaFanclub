import { Component } from "../../Aflow.js";

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

export class CopyBufferToBuffer extends Component {
	source = null;
	destination = null;
	sourceOffset = 0;
	destinationOffset = 0;
	size = 0;

	constructor(options = {}) {
		super(options);
		this.source = options.source ?? options.sourceBuffer ?? null;
		this.destination = options.destination ?? options.destinationBuffer ?? null;
		this.sourceOffset = uint(options.sourceOffset);
		this.destinationOffset = uint(options.destinationOffset);
		this.size = uint(options.size);
	}

	exec({ state } = {}) {
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

export class CopyBufferToTexture extends Component {
	source = null;
	destination = null;
	size = null;

	constructor(options = {}) {
		super(options);
		this.source = options.source ?? null;
		this.destination = options.destination ?? null;
		this.size = options.size ?? null;
	}

	exec({ state } = {}) {
		if (state.pass || !this.source || !this.destination || !this.size) return;
		const encoder = ensureEncoder(state);
		if (!encoder) return;
		encoder.copyBufferToTexture(this.source, this.destination, this.size);
	}
}

export class CopyTextureToBuffer extends Component {
	source = null;
	destination = null;
	size = null;

	constructor(options = {}) {
		super(options);
		this.source = options.source ?? null;
		this.destination = options.destination ?? null;
		this.size = options.size ?? null;
	}

	exec({ state } = {}) {
		if (state.pass || !this.source || !this.destination || !this.size) return;
		const encoder = ensureEncoder(state);
		if (!encoder) return;
		encoder.copyTextureToBuffer(this.source, this.destination, this.size);
	}
}

export class CopyTextureToTexture extends Component {
	source = null;
	destination = null;
	size = null;

	constructor(options = {}) {
		super(options);
		this.source = options.source ?? null;
		this.destination = options.destination ?? null;
		this.size = options.size ?? null;
	}

	exec({ state } = {}) {
		if (state.pass || !this.source || !this.destination || !this.size) return;
		const encoder = ensureEncoder(state);
		if (!encoder) return;
		encoder.copyTextureToTexture(this.source, this.destination, this.size);
	}
}

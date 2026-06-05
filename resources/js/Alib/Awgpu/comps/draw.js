import { Component } from "../../AwDAG.js";

export class Draw extends Component {
	vertexCount = 0;
	instanceCount = 1;
	firstVertex = 0;
	firstInstance = 0;

	constructor(options = {}) {
		super(options);
		this.vertexCount = Math.max(0, Number(options.vertexCount ?? 0) | 0);
		this.instanceCount = Math.max(1, Number(options.instanceCount ?? 1) | 0);
		this.firstVertex = Math.max(0, Number(options.firstVertex ?? 0) | 0);
		this.firstInstance = Math.max(0, Number(options.firstInstance ?? 0) | 0);
	}

	exec(state) {
		if (!state.pass || state.passKind !== "render") return;
		if (!state.pipeline) return;
		state.pass.draw(this.vertexCount, this.instanceCount, this.firstVertex, this.firstInstance);
	}
}

export class DrawIndexed extends Component {
	indexCount = 0;
	instanceCount = 1;
	firstIndex = 0;
	baseVertex = 0;
	firstInstance = 0;

	constructor(options = {}) {
		super(options);
		this.indexCount = Math.max(0, Number(options.indexCount ?? 0) | 0);
		this.instanceCount = Math.max(1, Number(options.instanceCount ?? 1) | 0);
		this.firstIndex = Math.max(0, Number(options.firstIndex ?? 0) | 0);
		this.baseVertex = Number(options.baseVertex ?? 0) | 0;
		this.firstInstance = Math.max(0, Number(options.firstInstance ?? 0) | 0);
	}

	exec(state) {
		if (!state.pass || state.passKind !== "render") return;
		if (!state.pipeline) return;
		state.pass.drawIndexed(this.indexCount, this.instanceCount, this.firstIndex, this.baseVertex, this.firstInstance);
	}
}

export class DrawIndirect extends Component {
	buffer = null;
	offset = 0;

	constructor(options = {}) {
		super(options);
		this.buffer = options.buffer ?? null;
		this.offset = Math.max(0, Number(options.offset ?? 0) | 0);
	}

	exec(state) {
		if (!state.pass || state.passKind !== "render") return;
		if (!state.pipeline) return;
		const indirect = this.buffer ? { buffer: this.buffer, offset: this.offset } : state.buffers.indirect;
		if (!indirect?.buffer) return;
		state.pass.drawIndirect(indirect.buffer, indirect.offset ?? 0);
	}
}

export class DrawIndexedIndirect extends Component {
	buffer = null;
	offset = 0;

	constructor(options = {}) {
		super(options);
		this.buffer = options.buffer ?? null;
		this.offset = Math.max(0, Number(options.offset ?? 0) | 0);
	}

	exec(state) {
		if (!state.pass || state.passKind !== "render") return;
		if (!state.pipeline) return;
		const indirect = this.buffer ? { buffer: this.buffer, offset: this.offset } : state.buffers.indirect;
		if (!indirect?.buffer) return;
		state.pass.drawIndexedIndirect(indirect.buffer, indirect.offset ?? 0);
	}
}



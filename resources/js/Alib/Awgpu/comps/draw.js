import { Afcmd } from "../../Aflow.js";

export class Draw extends Afcmd {
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

	exec({ state, graph, link } = {}) {
		if (!state.pass || state.passKind !== "render") return;
		if (!state.pipeline) return;
		state.pass.draw(this.vertexCount, this.instanceCount, this.firstVertex, this.firstInstance);
	}
}

export class DrawIndexed extends Afcmd {
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

	exec({ state, graph, link } = {}) {
		if (!state.pass || state.passKind !== "render") return;
		if (!state.pipeline) return;
		state.pass.drawIndexed(this.indexCount, this.instanceCount, this.firstIndex, this.baseVertex, this.firstInstance);
	}
}

export class DrawIndirect extends Afcmd {
	buffer = null;
	offset = 0;

	constructor(data = {}) {
		super();
		this.buffer = data.buffer ?? null;
		this.offset = Math.max(0, Number(data.offset ?? 0) | 0);
	}

	exec({ state, graph, link } = {}) {
		if (!state.pass || state.passKind !== "render") return;
		if (!state.pipeline) return;
		const indirect = this.buffer ? { buffer: this.buffer, offset: this.offset } : state.buffers.indirect;
		if (!indirect?.buffer) return;
		state.pass.drawIndirect(indirect.buffer, indirect.offset ?? 0);
	}
}

export class DrawIndexedIndirect extends Afcmd {
	buffer = null;
	offset = 0;

	constructor(data = {}) {
		super();
		this.buffer = data.buffer ?? null;
		this.offset = Math.max(0, Number(data.offset ?? 0) | 0);
	}

	exec({ state, graph, link } = {}) {
		if (!state.pass || state.passKind !== "render") return;
		if (!state.pipeline) return;
		const indirect = this.buffer ? { buffer: this.buffer, offset: this.offset } : state.buffers.indirect;
		if (!indirect?.buffer) return;
		state.pass.drawIndexedIndirect(indirect.buffer, indirect.offset ?? 0);
	}
}


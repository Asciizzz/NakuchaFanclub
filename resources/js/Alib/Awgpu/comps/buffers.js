import { Component } from "../../Aflow.js";

function list(value) {
	if (Array.isArray(value)) return value;
	if (value == null) return [];
	return [value];
}

function uint(value, fallback = 0) {
	return Math.max(0, Number(value ?? fallback) | 0);
}

export class SetBuffers extends Component {
	vertex = [];
	index = null;
	indirect = null;

	constructor(options = {}) {
		super(options);
		this.vertex = list(options.vertex ?? options.vertices).slice();
		this.index = options.index ?? null;
		this.indirect = options.indirect ?? null;
	}

	exec({ state } = {}) {
		if (!state.pass || state.passKind !== "render") return;
		this.setVertexBuffers(state);
		this.setIndexBuffer(state);
		this.setIndirectBuffer(state);
	}

	setVertexBuffers(state) {
		for (const entry of this.vertex) {
			const slot = uint(entry?.slot);
			const buffer = entry?.buffer ?? null;
			if (!buffer) continue;
			const offset = uint(entry.offset);
			if (entry.size == null) state.pass.setVertexBuffer(slot, buffer, offset);
			else state.pass.setVertexBuffer(slot, buffer, offset, uint(entry.size));
			state.buffers.vertex.set(slot, { buffer, offset, size: entry.size ?? null });
		}
	}

	setIndexBuffer(state) {
		if (this.index?.buffer) {
			const offset = uint(this.index.offset);
			const format = this.index.format ?? "uint32";
			if (this.index.size == null) state.pass.setIndexBuffer(this.index.buffer, format, offset);
			else state.pass.setIndexBuffer(this.index.buffer, format, offset, uint(this.index.size));
			state.buffers.index = {
				buffer: this.index.buffer,
				format,
				offset,
				size: this.index.size ?? null,
			};
		}
	}

	setIndirectBuffer(state) {
		if (this.indirect?.buffer) {
			state.buffers.indirect = {
				buffer: this.indirect.buffer,
				offset: uint(this.indirect.offset),
			};
		}
	}
}


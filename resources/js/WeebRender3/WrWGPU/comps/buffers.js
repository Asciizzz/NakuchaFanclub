import { WrComponent } from "../../WrCtx/component.js";

function list(value) {
	if (Array.isArray(value)) return value;
	if (value == null) return [];
	return [value];
}

function uint(value, fallback = 0) {
	return Math.max(0, Number(value ?? fallback) | 0);
}

export class SetBuffers extends WrComponent {
	vertex = [];
	index = null;
	indirect = null;

	constructor(options = {}) {
		super(options);
		this.vertex = list(options.vertex ?? options.vertices).slice();
		this.index = options.index ?? null;
		this.indirect = options.indirect ?? null;
	}

	exec(run) {
		if (!run.pass || run.passKind !== "render") {
			run.stats.skipped.noPass++;
			return;
		}
		this.setVertexBuffers(run);
		this.setIndexBuffer(run);
		this.setIndirectBuffer(run);
	}

	setVertexBuffers(run) {
		for (const entry of this.vertex) {
			const slot = uint(entry?.slot);
			const buffer = entry?.buffer ?? null;
			if (!buffer) continue;
			const offset = uint(entry.offset);
			if (entry.size == null) run.pass.setVertexBuffer(slot, buffer, offset);
			else run.pass.setVertexBuffer(slot, buffer, offset, uint(entry.size));
			run.buffers.vertex.set(slot, { buffer, offset, size: entry.size ?? null });
		}
	}

	setIndexBuffer(run) {
		if (this.index?.buffer) {
			const offset = uint(this.index.offset);
			const format = this.index.format ?? "uint32";
			if (this.index.size == null) run.pass.setIndexBuffer(this.index.buffer, format, offset);
			else run.pass.setIndexBuffer(this.index.buffer, format, offset, uint(this.index.size));
			run.buffers.index = {
				buffer: this.index.buffer,
				format,
				offset,
				size: this.index.size ?? null,
			};
		}
	}

	setIndirectBuffer(run) {
		if (this.indirect?.buffer) {
			run.buffers.indirect = {
				buffer: this.indirect.buffer,
				offset: uint(this.indirect.offset),
			};
		}
	}
}

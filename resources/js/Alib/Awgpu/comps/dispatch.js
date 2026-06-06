import { Component } from "../../Aflow.js";

function uint(value, fallback = 1) {
	return Math.max(1, Number(value ?? fallback) | 0);
}

export class Dispatch extends Component {
	x = 1;
	y = 1;
	z = 1;

	constructor(options = {}) {
		super(options);
		this.x = uint(options.x);
		this.y = uint(options.y);
		this.z = uint(options.z);
	}

	exec(state) {
		if (!state.pass || state.passKind !== "compute") return;
		if (!state.pipeline) return;
		state.pass.dispatchWorkgroups(this.x, this.y, this.z);
	}
}

export class DispatchIndirect extends Component {
	buffer = null;
	offset = 0;

	constructor(options = {}) {
		super(options);
		this.buffer = options.buffer ?? null;
		this.offset = Math.max(0, Number(options.offset ?? 0) | 0);
	}

	exec(state) {
		if (!state.pass || state.passKind !== "compute") return;
		if (!state.pipeline || !this.buffer) return;
		state.pass.dispatchWorkgroupsIndirect(this.buffer, this.offset);
	}
}



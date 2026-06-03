function resolveNode(from) {
	if (from && typeof from.walk === "function") return from;
	return null;
}

function makeRun(backend, options = {}) {
	return {
		backend,
		device: backend?.device ?? null,
		queue: backend?.queue ?? null,
		encoder: null,
		pass: null,
		passKind: null,
		pipeline: null,
		buffers: {
			vertex: new Map(),
			index: null,
			indirect: null,
		},
		bindGroups: new Map(),
		ended: false,
		options,
		stats: {
			nodes: 0,
			components: 0,
			draws: 0,
			dispatches: 0,
			skipped: {
				noBackend: 0,
				noNode: 0,
				noPass: 0,
				noPipeline: 0,
				noIndirectBuffer: 0,
			},
		},
	};
}

export class Runner {
	backend = null;

	constructor(options = {}) {
		this.backend = options.backend ?? null;
	}

	setBackend(backend) {
		this.backend = backend ?? null;
		return this;
	}

	run(from, options = {}) {
		const run = makeRun(options.backend ?? this.backend, options);
		if (!run.backend?.device) {
			run.stats.skipped.noBackend++;
			return run.stats;
		}
		const node = resolveNode(from);
		if (!node) {
			run.stats.skipped.noNode++;
			return run.stats;
		}

		for (const [current] of node.walk({
			mode: options.mode ?? "dfs_pre",
			includeFrom: options.includeFrom !== false,
		})) {
			run.stats.nodes++;
			for (const comp of current.components ?? []) {
				if (!comp || comp.enabled === false) continue;
				if (typeof comp.exec !== "function") continue;
				run.stats.components++;
				comp.exec(run, current);
			}
		}

		if (run.pass) {
			run.pass.end();
			run.pass = null;
			run.passKind = null;
		}
		if (run.encoder && !run.ended) {
			run.backend.submit(run.encoder);
			run.ended = true;
		}

		return run.stats;
	}
}

export default Runner;

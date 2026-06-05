import { builtInKeys, assertKeyName, findKeys } from "./keys.js";

function deviceOf(backend) {
	return backend?.device ?? backend ?? null;
}

function normalizeEntries(raw) {
	if (!raw || typeof raw !== "object") return [];
	if (raw instanceof Map) return Array.from(raw.entries());
	return Object.entries(raw);
}

export class ShaderModule {
	constructor(options = {}) {
		this.label = String(options.label ?? "");
		this.backend = options.backend ?? null;
		this.module = options.module ?? null;
		this.source = String(options.source ?? "");
		this.resolvedSource = String(options.resolvedSource ?? "");
		this.vertex = options.vertex ?? {};
		this.bindings = options.bindings ?? {};
		this.keys = options.keys ?? {};
	}
}

export class ShaderBuilder {
	constructor(options = {}) {
		this.backend = options.backend ?? null;
		this.cfg = options.cfg ?? {};
		this.keys = new Map(builtInKeys());
		for (const [key, value] of normalizeEntries(options.keys)) this.key(key, value);
	}

	static create(options = {}) {
		const builder = new ShaderBuilder(options);
		return builder.create(options);
	}

	key(name, value) {
		assertKeyName(name);
		this.keys.set(String(name), value);
		return this;
	}

	create(options = {}) {
		const backend = options.backend ?? this.backend;
		const device = deviceOf(backend);
		if (!device) throw new Error("[WrGPU.ShaderBuilder] backend or device is required");

		const source = String(options.source ?? "");
		if (!source) throw new Error("[WrGPU.ShaderBuilder] source is required");

		const cfg = {
			...this.cfg,
			...(options.cfg ?? {}),
		};
		const keys = new Map(this.keys);
		for (const [key, value] of normalizeEntries(options.keys)) {
			assertKeyName(key);
			keys.set(String(key), value);
		}

		const meta = {
			bindings: {},
		};
		const ctx = {
			backend,
			device,
			cfg,
			meta,
			builder: this,
		};
		const resolvedSource = this.resolve(source, keys, ctx);
		const module = device.createShaderModule({
			label: options.label ?? "WrGPUShaderModule",
			code: resolvedSource,
		});

		return new ShaderModule({
			label: options.label,
			backend,
			module,
			source,
			resolvedSource,
			vertex: options.vertex ?? {},
			bindings: meta.bindings,
			keys: Object.fromEntries(keys),
		});
	}

	resolve(source, keys, ctx) {
		let out = String(source ?? "");
		for (const key of findKeys(out)) {
			if (!keys.has(key)) continue;
			const raw = keys.get(key);
			const value = typeof raw === "function" ? raw(ctx) : raw;
			if (typeof value !== "string") {
				throw new Error(`[WrGPU.ShaderBuilder] key ${key} must resolve to a string`);
			}
			out = out.split(key).join(value);
		}

		const unresolved = findKeys(out);
		if (unresolved.length > 0) {
			throw new Error(`[WrGPU.ShaderBuilder] unresolved keys: ${unresolved.join(", ")}`);
		}
		return out;
	}
}

export default ShaderBuilder;

function deviceOf(backend) {
	return backend?.device ?? backend ?? null;
}

function validSlot(slot) {
	return typeof slot === "string" && slot.length >= 2 && slot.startsWith("$") && slot.endsWith("$");
}

function findSlots(source) {
	return Array.from(new Set(String(source ?? "").match(/\$[^\s$]+\$/g) ?? []));
}

export class ShaderModule {
	constructor(options = {}) {
		this.label = String(options.label ?? "");
		this.backend = options.backend ?? null;
		this.module = options.module ?? null;
		this.raw = String(options.raw ?? "");
		this.compiled = String(options.compiled ?? "");
		this.meta = options.meta ?? {};
	}
}

export class ShaderDoc {
	constructor(raw = "", options = {}) {
		this.raw = String(raw ?? "");
		this.backend = options.backend ?? null;
		this.replacements = [];
		this.meta = options.meta ?? {};
		this.compiled = "";
		this.module = null;
	}

	setRaw(raw) {
		this.raw = String(raw ?? "");
		return this;
	}

	replace(slot, value) {
		if (!validSlot(slot)) throw new Error(`[WrGPU.ShaderDoc] invalid slot "${slot}"`);
		const current = this.#replacement(slot);
		if (current) {
			current.values = [String(value ?? "")];
		} else {
			this.replacements.push({ slot, values: [String(value ?? "")] });
		}
		return this;
	}

	append(slot, value) {
		if (!validSlot(slot)) throw new Error(`[WrGPU.ShaderDoc] invalid slot "${slot}"`);
		const current = this.#replacement(slot);
		if (current) {
			current.values.push(String(value ?? ""));
		} else {
			this.replacements.push({ slot, values: [String(value ?? "")] });
		}
		return this;
	}

	has(slot) {
		return !!this.#replacement(slot);
	}

	compile(raw = this.raw) {
		let out = String(raw ?? "");
		for (const item of this.replacements) {
			out = out.split(item.slot).join(item.values.join("\n"));
		}
		const unresolved = findSlots(out);
		if (unresolved.length > 0) {
			throw new Error(`[WrGPU.ShaderDoc] unresolved slots: ${unresolved.join(", ")}`);
		}
		this.compiled = out;
		return out;
	}

	createModule(options = {}) {
		const backend = options.backend ?? this.backend;
		const device = deviceOf(backend);
		if (!device) throw new Error("[WrGPU.ShaderDoc] backend or device is required");
		const compiled = this.compile();
		const module = device.createShaderModule({
			label: options.label ?? "WrGPUShaderModule",
			code: compiled,
		});
		this.module = module;
		return new ShaderModule({
			label: options.label,
			backend,
			module,
			raw: this.raw,
			compiled,
			meta: this.meta,
		});
	}

	#replacement(slot) {
		return this.replacements.find((item) => item.slot === slot) ?? null;
	}
}

export default ShaderDoc;

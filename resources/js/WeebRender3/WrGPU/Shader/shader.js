import { Adoc } from "../../../Alib/Adoc.js";

function deviceOf(backend) {
	return backend?.device ?? backend ?? null;
}

export class Shader {
	constructor(src = "", options = {}) {
		this.doc = options.doc instanceof Adoc ? options.doc : new Adoc(src ?? options.src ?? "");
		this.backend = options.backend ?? null;
		this.module = options.module ?? null;
		this.label = String(options.label ?? "");
		this.meta = options.meta ?? {};
	}

	get src() { return this.doc.src; }
	set src(value) { this.doc.setSrc(value); }

	get dst() { return this.doc.dst; }
	set dst(value) { this.doc.dst = Adoc.str(value); }

	get instructions() { return this.doc.instructions; }

	setSrc(src) {
		this.doc.setSrc(src);
		return this;
	}

	addInstruction(instruction) {
		this.doc.addInstruction(instruction);
		return this;
	}

	addInstructions(instructions = []) {
		this.doc.addInstructions(instructions);
		return this;
	}

	clearInstructions() {
		this.doc.clearInstructions();
		return this;
	}

	replace(key, value, rules = null) {
		this.addInstruction({
			key,
			value,
			rules: rules ?? {
				matchMode: Adoc.CASE_SENSITIVE,
				replaceMode: Adoc.REPLACE_ALL,
			},
		});
		return this;
	}

	execute(src = this.src, writeSrc = true) {
		return this.doc.execute(src, writeSrc);
	}

	createModule(options = {}) {
		const backend = options.backend ?? this.backend;
		const device = deviceOf(backend);
		if (!device) throw new Error("[WrGPU.Shader] backend or device is required");
		this.label = String(options.label ?? this.label ?? "WrGPUShaderModule");
		this.backend = backend;
		this.module = device.createShaderModule({
			label: this.label,
			code: this.execute(options.src ?? this.src, options.writeSrc ?? true),
		});
		return this;
	}
}

export default Shader;


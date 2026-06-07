/* Adoc
By Asciiz

Small string document compiler with staged replacement instructions

It exist because I don't have all fcking day writing regexes
Also cuz I literally don't know how to write regexes without googling
*/

export class Adoc {
	static CASE_SENSITIVE = "caseSensitive";
	static CASE_INSENSITIVE = "caseInsensitive";
	static REGEX = "regex";

	static REPLACE_FIRST = "first";
	static REPLACE_ALL = "all";

	static str(value) {
		return String(value ?? "");
	}

	static escapeRegex(value) {
		return Adoc.str(value).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
	}

	static flags(rules = {}) {
		const replaceMode = rules.replaceMode ?? Adoc.REPLACE_ALL;
		const matchMode = rules.matchMode ?? Adoc.CASE_SENSITIVE;
		return [
			replaceMode === Adoc.REPLACE_ALL ? "g" : "",
			matchMode === Adoc.CASE_INSENSITIVE ? "i" : "",
		].join("");
	}

	static regex(instruction) {
		if (instruction.regex instanceof RegExp) return instruction.regex;
		const key = instruction.regex ?? instruction.key;
		const regexSrc = instruction.regex || instruction.rules?.matchMode === Adoc.REGEX
			? Adoc.str(key)
			: Adoc.escapeRegex(key);
		return new RegExp(regexSrc, Adoc.flags(instruction.rules));
	}

	static write(value, dst = null) {
		const out = Adoc.str(value);
		if (dst && typeof dst === "object") dst.value = out;
		return out;
	}

	static replace(src, instruction, dst = null) {
		return Adoc.write(
			Adoc.str(src).replace(Adoc.regex(instruction), Adoc.str(instruction.value)),
			dst,
		);
	}

	static compile(src, instructions = [], dst = null) {
		let out = Adoc.str(src);
		for (const instruction of instructions) out = Adoc.replace(out, instruction);
		return Adoc.write(out, dst);
	}

	constructor(src = "") {
		this.src = Adoc.str(src);
		this.dst = this.src;
		this.instructions = [];
	}

	setSrc(src) {
		this.src = Adoc.str(src);
		return this;
	}

	clearInstructions() {
		this.instructions.length = 0;
		return this;
	}

	addInstruction(instruction) {
		this.instructions.push(instruction);
		return instruction;
	}

	addInstructions(instructions = []) {
		for (const instruction of instructions) this.addInstruction(instruction);
		return this;
	}

	execute(src = this.src, writeSrc = true) {
		this.src = Adoc.str(src);
		this.dst = Adoc.compile(this.src, this.instructions);
		if (writeSrc) this.src = this.dst;
		this.clearInstructions();
		return this.dst;
	}
}

export default Adoc;

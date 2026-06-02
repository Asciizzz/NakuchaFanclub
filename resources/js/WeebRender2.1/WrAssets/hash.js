export function wrHashText(value) {
	const text = String(value ?? "");
	let hash = 2166136261;
	for (let i = 0; i < text.length; i += 1) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(36);
}

export function wrHashValue(value) {
	if (value == null) return "null";
	if (ArrayBuffer.isView(value)) {
		const len = value.length ?? 0;
		const sample = [];
		const step = Math.max(1, Math.floor(len / 16));
		for (let i = 0; i < len && sample.length < 16; i += step) sample.push(value[i]);
		if (len > 0) sample.push(value[len - 1]);
		return `${value.constructor.name}:${len}:${value.byteLength}:${wrHashText(sample.join(","))}`;
	}
	if (value instanceof ArrayBuffer) return `ArrayBuffer:${value.byteLength}`;
	if (Array.isArray(value)) return `[${value.map((item) => wrHashValue(item)).join(",")}]`;
	if (typeof value === "object") {
		const out = [];
		for (const key of Object.keys(value).sort()) {
			if (key === "runtime" || key === "ref" || key === "backend") continue;
			out.push(`${key}:${wrHashValue(value[key])}`);
		}
		return `{${out.join(",")}}`;
	}
	return String(value);
}

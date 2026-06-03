/*
WrStore (Storage)
By Asciiz

Lightweight id-object store
Made to be inherited from
*/

function asId(value) {
	const id = String(value ?? "").trim();
	return id ? id : null;
}

export class WrStore {
	#map = new Map();
	#seed = 1;
	#prefix = "item_";
	#version = 0;

	constructor(options = {}) {
		this.#prefix = String(options?.prefix ?? "item_");
	}
	configure(options = {}) {
		if (options.prefix !== undefined) this.#prefix = String(options.prefix);
	}

	get map() { return this.#map; }
	get version() { return this.#version; }
	get size() { return this.#map.size; }

	add(value) {
		const id = this.nextId();
		this.#map.set(id, value);
		this.#version++;
		return id;
	}

	get(id) {
		const key = asId(id);
		if (!key) return null;
		return this.#map.get(key) ?? null;
	}

	remove(id) {
		const key = asId(id);
		if (!key) return false;
		const ok = this.#map.delete(key);
		if (ok) this.#version++;
		return ok;
	}

	has(id) {
		const key = asId(id);
		if (!key) return false;
		return this.#map.has(key);
	}

	clear() {
		if (this.#map.size <= 0) return 0;
		const removed = this.#map.size;
		this.#map.clear();
		this.#version++;
		return removed;
	}

	nextId() {
		let id = "";
		do {
			id = `${this.#prefix}${this.#seed++}`;
		} while (this.#map.has(id));
		return id;
	}
}

if (typeof window !== "undefined") {
	window.WrStore = WrStore;
}

export default WrStore;

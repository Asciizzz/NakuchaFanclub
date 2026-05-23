import AzStore from "../../AzLib/AzStore.js";
import { WrShader } from "../WrShader/WrShader.js";

function asId(value) {
	if (value == null) return null;
	const id = String(value).trim();
	return id || null;
}

export class WrShaderStore extends AzStore {
	#world = null;

	constructor(world, options = {}) {
		super(options);
		this.#world = world ?? null;
	}

	get world() {
		return this.#world;
	}

	add(shader) {
		const value = shader instanceof WrShader ? shader : new WrShader(shader ?? {});
		const explicitId = asId(value.id);
		if (explicitId && !this.has(explicitId)) {
			super.add(value);
			const autoId = Array.from(this.map.keys()).pop();
			if (autoId && autoId !== explicitId) this.map.delete(autoId);
			this.map.set(explicitId, value);
			value.id = explicitId;
			this.buildBackendVariants(value);
			return explicitId;
		}

		const id = super.add(value);
		value.id = id;
		this.buildBackendVariants(value);
		return id;
	}

	remove(id) {
		const shader = super.get(id);
		if (!shader) return false;
		this.dropBackendVariants(shader);
		return super.remove(id);
	}

	rebuildBackendVariants() {
		for (const shader of this.map.values()) this.buildBackendVariants(shader);
	}

	buildBackendVariants(shader) {
		const backend = this.#world?.backend ?? null;
		if (!backend || !shader || typeof shader.buildBackend !== "function") return null;
		return shader.buildBackend(backend, { createPipeline: true });
	}

	dropBackendVariants(shader) {
		if (shader && typeof shader.dropBackend === "function") shader.dropBackend();
	}
}

if (typeof window !== "undefined") {
	window.WrShaderStore = WrShaderStore;
}

export default WrShaderStore;

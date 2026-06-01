import AzStore from "../../AzLib/AzStore.js";
import { WrShaderOBJ } from "../WrAssets/ShaderObj.js";

function asId(value) {
	if (value == null) return null;
	const id = String(value).trim();
	return id || null;
}

export class WrShaderOBJStore extends AzStore {
	#backendCache = new Map();

	add(shader) {
		const value = shader instanceof WrShaderOBJ ? shader : WrShaderOBJ.from(shader ?? {});
		const explicitId = asId(value.id);
		if (explicitId && !this.has(explicitId)) {
			super.add(value);
			const autoId = Array.from(this.map.keys()).pop();
			if (autoId && autoId !== explicitId) this.map.delete(autoId);
			this.map.set(explicitId, value);
			value.id = explicitId;
			this.#deleteCachedShader(explicitId);
			return explicitId;
		}

		const id = super.add(value);
		value.id = id;
		this.#deleteCachedShader(id);
		return id;
	}

	createGpu(backend, id, options = {}) {
		if (!backend) return null;
		const key = asId(id);
		if (!key) return null;
		const shader = this.get(key);
		if (!shader || typeof shader.buildBackend !== "function") return null;

		const cache = this.#getBackendCache(backend, true);
		const cached = cache.get(key);
		if (cached) return cached;

		const hasSameBackendVariant = shader.backend?.kind === backend.kind && (
			(backend.kind === "webgpu" && !!shader.backend.pipeline) ||
			(backend.kind === "webgl2" && !!shader.backend.program)
		);
		const built = hasSameBackendVariant
			? shader.backend
			: shader.buildBackend(backend, options);
		if (!built) return null;

		cache.set(key, built);
		return built;
	}

	rebuildBackendVariants(backend = null, options = {}) {
		const out = [];
		if (!backend) return out;
		const cache = this.#getBackendCache(backend, true);
		cache.clear();
		for (const [id, shader] of this.map.entries()) {
			if (!shader || typeof shader.buildBackend !== "function") continue;
			const built = shader.buildBackend(backend, options);
			if (built) cache.set(id, built);
			out.push({ id, built });
		}
		return out;
	}

	remove(id) {
		const key = asId(id);
		if (!key) return false;
		this.#deleteCachedShader(key);
		return super.remove(key);
	}

	#getBackendCache(backend, create) {
		let cache = this.#backendCache.get(backend);
		if (cache || !create) return cache ?? null;
		cache = new Map();
		this.#backendCache.set(backend, cache);
		return cache;
	}

	#deleteCachedShader(id) {
		for (const cache of this.#backendCache.values()) cache.delete(id);
	}
}

if (typeof window !== "undefined") {
	window.WrShaderOBJStore21 = WrShaderOBJStore;
}

export default WrShaderOBJStore;

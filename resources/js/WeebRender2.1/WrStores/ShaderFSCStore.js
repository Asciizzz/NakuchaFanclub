import AzStore from "../../AzLib/AzStore.js";
import { WrShaderFSC } from "../WrAssets/ShaderFSC.js";

function asId(value) {
	if (value && typeof value === "object") return asId(value.ref?.id ?? value.id);
	if (value == null) return null;
	const id = String(value).trim();
	return id || null;
}

function stampRef(store, asset, id) {
	asset.id = id;
	asset.ref = { stores: store.stores ?? null, store, id };
	return asset;
}

export class WrShaderFSCStore extends AzStore {
	#backendCache = new Map();

	add(shader) {
		const value = shader instanceof WrShaderFSC ? shader : WrShaderFSC.from(shader ?? {});
		const explicitId = asId(value.id);
		if (explicitId && !this.has(explicitId)) {
			super.add(value);
			const autoId = Array.from(this.map.keys()).pop();
			if (autoId && autoId !== explicitId) this.map.delete(autoId);
			this.map.set(explicitId, value);
			stampRef(this, value, explicitId);
			this.#deleteCachedShader(explicitId);
			return value;
		}

		const id = super.add(value);
		stampRef(this, value, id);
		this.#deleteCachedShader(id);
		return value;
	}

	createGpu(backend, assetRef, options = {}) {
		if (!backend) return null;
		const key = asId(assetRef);
		if (!key) return null;
		const shader = assetRef && typeof assetRef === "object" ? assetRef : this.get(key);
		if (!shader || typeof shader.buildBackend !== "function") return null;

		const cache = this.#getBackendCache(backend, true);
		const cacheKey = [
			key,
			`samples:${Math.max(1, Number(options.sampleCount ?? 1) || 1)}`,
			`depth:${options.useDepth ? "1" : "0"}`,
		].join("|");
		const cached = cache.get(cacheKey);
		if (cached) return cached;

		const built = shader.buildBackend(backend, options);
		if (!built) return null;

		cache.set(cacheKey, built);
		return built;
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
	window.WrShaderFSCStore21 = WrShaderFSCStore;
}

export default WrShaderFSCStore;

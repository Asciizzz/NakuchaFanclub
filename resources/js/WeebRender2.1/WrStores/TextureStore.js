import AzStore from "../../AzLib/AzStore.js";
import { WrTexture } from "../WrAssets/Texture.js";
import AzWGPU from "../../AzLib/AzWGPU.js";

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

function alignTo256(n) {
	return Math.ceil(n / 256) * 256;
}

export class WrTextureStore extends AzStore {
	#gpuByBackend = new Map();

	add(texture) {
		const value = texture instanceof WrTexture ? texture : WrTexture.from(texture ?? {});
		const explicitId = asId(value.id);
		if (explicitId && !this.has(explicitId)) {
			super.add(value);
			const autoId = Array.from(this.map.keys()).pop();
			if (autoId && autoId !== explicitId) this.map.delete(autoId);
			this.map.set(explicitId, value);
			return stampRef(this, value, explicitId);
		}

		const id = super.add(value);
		return stampRef(this, value, id);
	}

	remove(id) {
		const key = asId(id);
		if (!key) return false;
		for (const [backend, cache] of this.#gpuByBackend.entries()) {
			const item = cache.get(key);
			if (!item) continue;
			this.#destroyGpuTexture(backend, item);
			cache.delete(key);
		}
		return super.remove(key);
	}

	createGpu(backend, assetRef) {
		const key = asId(assetRef);
		if (!backend || !key) return null;
		const texture = assetRef && typeof assetRef === "object" ? assetRef : this.get(key);
		if (!texture) return null;

		const cache = this.#getBackendCache(backend, true);
		const cached = cache.get(key);
		if (cached) return cached;

		let out = null;
		if (backend.kind === "webgpu") out = this.#createGpuWgpu(backend, texture, key);
		else if (backend.kind === "webgl2") out = this.#createGpuWgl2(backend, texture);
		if (!out) return null;

		cache.set(key, out);
		return out;
	}

	releaseGpu(backend, id) {
		if (!backend) return false;
		const key = asId(id);
		if (!key) return false;
		const cache = this.#getBackendCache(backend, false);
		if (!cache) return false;
		const item = cache.get(key);
		if (!item) return false;
		this.#destroyGpuTexture(backend, item);
		cache.delete(key);
		return true;
	}

	clearGpu(backend = null) {
		if (backend) {
			const cache = this.#getBackendCache(backend, false);
			if (!cache) return 0;
			let count = 0;
			for (const item of cache.values()) {
				this.#destroyGpuTexture(backend, item);
				count += 1;
			}
			cache.clear();
			return count;
		}

		let count = 0;
		for (const [refBackend, cache] of this.#gpuByBackend.entries()) {
			for (const item of cache.values()) {
				this.#destroyGpuTexture(refBackend, item);
				count += 1;
			}
			cache.clear();
		}
		return count;
	}

	#createGpuWgpu(backend, texture, textureId) {
		const width = Math.max(1, Number(texture.width ?? texture.source?.width ?? 1) | 0);
		const height = Math.max(1, Number(texture.height ?? texture.source?.height ?? 1) | 0);
		const gpuTexture = backend.createTexture2D({
			label: `Wr21Tex:${textureId}`,
			width,
			height,
			format: texture.format ?? "rgba8unorm",
		});
		if (!gpuTexture) return null;

		const source = texture.source ?? null;
		if (ArrayBuffer.isView(source)) {
			const bytesPerPixel = Math.max(1, Number(texture.bytesPerPixel ?? 4) | 0);
			const rowBytes = width * bytesPerPixel;
			const bytesPerRow = alignTo256(rowBytes);
			if (bytesPerRow === rowBytes) {
				backend.writeTexture(
					gpuTexture,
					source,
					{ offset: 0, bytesPerRow, rowsPerImage: height },
					{ width, height, depthOrArrayLayers: 1 },
				);
			} else {
				const srcBytes = new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
				const padded = new Uint8Array(bytesPerRow * height);
				for (let y = 0; y < height; y += 1) {
					const srcOffset = y * rowBytes;
					const dstOffset = y * bytesPerRow;
					padded.set(srcBytes.subarray(srcOffset, srcOffset + rowBytes), dstOffset);
				}
				backend.writeTexture(
					gpuTexture,
					padded,
					{ offset: 0, bytesPerRow, rowsPerImage: height },
					{ width, height, depthOrArrayLayers: 1 },
				);
			}
		} else if (source && backend.device?.queue?.copyExternalImageToTexture) {
			AzWGPU.Texture.writeExternal(backend.device, gpuTexture, source, {
				width,
				height,
				flipY: false,
			});
		}

		const view = gpuTexture.createView();
		const sampler = backend.createSampler({
			minFilter: texture.sampler?.minFilter ?? "linear",
			magFilter: texture.sampler?.magFilter ?? "linear",
			mipmapFilter: texture.sampler?.mipmapFilter ?? "linear",
			addressModeU: texture.sampler?.wrapU ?? "clamp-to-edge",
			addressModeV: texture.sampler?.wrapV ?? "clamp-to-edge",
		});
		return { kind: "webgpu", texture: gpuTexture, view, sampler };
	}

	#createGpuWgl2(backend, texture) {
		const gl = backend.gl ?? null;
		if (!gl) return null;
		const width = Math.max(1, Number(texture.width ?? texture.source?.width ?? 1) | 0);
		const height = Math.max(1, Number(texture.height ?? texture.source?.height ?? 1) | 0);
		const wrapU = texture.sampler?.wrapU === "repeat" ? gl.REPEAT : gl.CLAMP_TO_EDGE;
		const wrapV = texture.sampler?.wrapV === "repeat" ? gl.REPEAT : gl.CLAMP_TO_EDGE;

		const tex = backend.createTexture2D({
			width,
			height,
			wrapS: wrapU,
			wrapT: wrapV,
			minFilter: gl.LINEAR,
			magFilter: gl.LINEAR,
		});
		if (!tex) return null;

		const source = texture.source ?? null;
		if (source) {
			if (ArrayBuffer.isView(source)) {
				backend.writeTexture2D(tex, source, { width, height, format: gl.RGBA, type: gl.UNSIGNED_BYTE });
			} else {
				backend.writeTexture2D(tex, source, { format: gl.RGBA, type: gl.UNSIGNED_BYTE });
			}
		}

		return { kind: "webgl2", texture: tex };
	}

	#destroyGpuTexture(backend, resource) {
		if (!resource) return;
		if (resource.kind === "webgpu") {
			resource.texture?.destroy?.();
			return;
		}
		if (resource.kind === "webgl2") {
			const gl = backend?.gl ?? null;
			if (!gl) return;
			if (resource.texture) gl.deleteTexture(resource.texture);
		}
	}

	#getBackendCache(backend, create) {
		const cache = this.#gpuByBackend.get(backend);
		if (cache || !create) return cache ?? null;
		const next = new Map();
		this.#gpuByBackend.set(backend, next);
		return next;
	}
}

if (typeof window !== "undefined") {
	window.WrTextureStore21 = WrTextureStore;
}

export default WrTextureStore;

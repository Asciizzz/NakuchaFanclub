import AzStore from "../../AzLib/AzStore.js";
import { WrMesh } from "../WrAssets/Mesh.js";

const WR_GPU_BUFFER_USAGE = Object.freeze({
	COPY_DST: globalThis.GPUBufferUsage?.COPY_DST ?? 0x8,
	VERTEX: globalThis.GPUBufferUsage?.VERTEX ?? 0x20,
	INDEX: globalThis.GPUBufferUsage?.INDEX ?? 0x10,
});

function asId(value) {
	if (value == null) return null;
	const id = String(value).trim();
	return id || null;
}

function alignTo4(n) {
	return Math.ceil(n / 4) * 4;
}

function padTo4Bytes(data) {
	if (!data) return data;
	if (ArrayBuffer.isView(data)) {
		const byteLength = data.byteLength;
		const byteOffset = data.byteOffset ?? 0;
		if ((byteLength % 4) === 0 && (byteOffset % 4) === 0) return data;
		const padded = new Uint8Array(alignTo4(byteLength));
		padded.set(new Uint8Array(data.buffer, data.byteOffset, data.byteLength), 0);
		return padded;
	}
	if (data instanceof ArrayBuffer) {
		const byteLength = data.byteLength;
		if ((byteLength % 4) === 0) return data;
		const padded = new Uint8Array(alignTo4(byteLength));
		padded.set(new Uint8Array(data), 0);
		return padded;
	}
	return data;
}

export class WrMeshStore extends AzStore {
	#gpuByBackend = new Map();

	add(mesh) {
		const value = mesh instanceof WrMesh ? mesh : WrMesh.from(mesh ?? {});
		const explicitId = asId(value.id);
		if (explicitId && !this.has(explicitId)) {
			super.add(value);
			const autoId = Array.from(this.map.keys()).pop();
			if (autoId && autoId !== explicitId) this.map.delete(autoId);
			this.map.set(explicitId, value);
			value.id = explicitId;
			return explicitId;
		}

		const id = super.add(value);
		value.id = id;
		return id;
	}

	remove(id) {
		const key = asId(id);
		if (!key) return false;
		for (const [backend, cache] of this.#iterateGpuCaches()) {
			void backend;
			const item = cache.get(key);
			if (!item) continue;
			this.#destroyGpuMesh(item);
			cache.delete(key);
		}
		return super.remove(key);
	}

	createGpu(backend, id, options = {}) {
		const key = asId(id);
		if (!backend || !key) return null;
		const mesh = this.get(key);
		if (!mesh) return null;

		const morphTargetIndex = Math.max(0, Number(options.morphTargetIndex ?? 0) | 0);
		const cache = this.#getBackendCache(backend, true);
		const cacheKey = `${key}|morph:${morphTargetIndex}`;
		const cached = cache.get(cacheKey);
		if (cached) return cached;

		const packed = mesh.packSubmeshes({ morphTargetIndex });
		if (!Array.isArray(packed) || packed.length <= 0) return null;

		let out = null;
		if (backend.kind === "webgpu") out = this.#createGpuWgpu(backend, packed, key);
		else if (backend.kind === "webgl2") out = this.#createGpuWgl2(backend, packed, key);
		if (!out) return null;

		cache.set(cacheKey, out);
		return out;
	}

	releaseGpu(backend, id, options = {}) {
		if (!backend) return false;
		const key = asId(id);
		if (!key) return false;
		const morphTargetIndex = Math.max(0, Number(options.morphTargetIndex ?? 0) | 0);
		const cache = this.#getBackendCache(backend, false);
		if (!cache) return false;
		const cacheKey = `${key}|morph:${morphTargetIndex}`;
		const item = cache.get(cacheKey);
		if (!item) return false;
		this.#destroyGpuMesh(item, backend);
		cache.delete(cacheKey);
		return true;
	}

	clearGpu(backend = null) {
		if (backend) {
			const cache = this.#getBackendCache(backend, false);
			if (!cache) return 0;
			let count = 0;
			for (const item of cache.values()) {
				this.#destroyGpuMesh(item, backend);
				count += 1;
			}
			cache.clear();
			return count;
		}

		let count = 0;
		for (const [refBackend, cache] of this.#iterateGpuCaches()) {
			for (const item of cache.values()) {
				this.#destroyGpuMesh(item, refBackend);
				count += 1;
			}
			cache.clear();
		}
		return count;
	}

	#createGpuWgpu(backend, packed, meshId) {
		const submeshes = [];
		for (const item of packed) {
			const vertexBuffer = backend.createBuffer({
				label: `Wr21VB:${meshId}`,
				size: alignTo4(item.vertexData.byteLength),
				usage: WR_GPU_BUFFER_USAGE.VERTEX | WR_GPU_BUFFER_USAGE.COPY_DST,
			});
			const indexBuffer = backend.createBuffer({
				label: `Wr21IB:${meshId}`,
				size: alignTo4(item.indexData.byteLength),
				usage: WR_GPU_BUFFER_USAGE.INDEX | WR_GPU_BUFFER_USAGE.COPY_DST,
			});
			backend.writeBuffer(vertexBuffer, padTo4Bytes(item.vertexData), 0);
			backend.writeBuffer(indexBuffer, padTo4Bytes(item.indexData), 0);
			submeshes.push({
				vertexBuffer,
				indexBuffer,
				indexFormat: item.indexFormat,
				indexCount: item.indexCount,
				layout: item.layout,
			});
		}
		return { kind: "webgpu", submeshes };
	}

	#createGpuWgl2(backend, packed) {
		const gl = backend.gl ?? null;
		if (!gl) return null;
		const submeshes = [];
		for (const item of packed) {
			const vbo = gl.createBuffer();
			const ibo = gl.createBuffer();
			gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
			gl.bufferData(gl.ARRAY_BUFFER, item.vertexData, gl.STATIC_DRAW);
			gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, ibo);
			gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, item.indexData, gl.STATIC_DRAW);
			submeshes.push({
				vbo,
				ibo,
				indexCount: item.indexCount,
				indexType: item.indexFormat === "uint32" ? gl.UNSIGNED_INT : gl.UNSIGNED_SHORT,
				layout: item.layout,
			});
		}
		gl.bindBuffer(gl.ARRAY_BUFFER, null);
		gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, null);
		return { kind: "webgl2", submeshes };
	}

	#destroyGpuMesh(resource, backend = null) {
		if (!resource || !Array.isArray(resource.submeshes)) return;
		if (resource.kind === "webgpu") {
			for (const submesh of resource.submeshes) {
				submesh.vertexBuffer?.destroy?.();
				submesh.indexBuffer?.destroy?.();
			}
			return;
		}
		if (resource.kind === "webgl2") {
			const gl = backend?.gl ?? null;
			if (!gl) return;
			for (const submesh of resource.submeshes) {
				if (submesh.vbo) gl.deleteBuffer(submesh.vbo);
				if (submesh.ibo) gl.deleteBuffer(submesh.ibo);
			}
		}
	}

	#getBackendCache(backend, create) {
		const cache = this.#gpuByBackend.get(backend);
		if (cache || !create) return cache ?? null;
		const next = new Map();
		this.#gpuByBackend.set(backend, next);
		return next;
	}

	*#iterateGpuCaches() {
		yield* this.#gpuByBackend.entries();
	}
}

if (typeof window !== "undefined") {
	window.WrMeshStore21 = WrMeshStore;
}

export default WrMeshStore;

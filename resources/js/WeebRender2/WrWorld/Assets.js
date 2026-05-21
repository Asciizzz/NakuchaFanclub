import AzStore from "../../AzLib/AzStore.js";

export class WrMeshStore extends AzStore {
	#world = null;

	constructor(world, options = {}) {
		super(options);
		this.#world = world ?? null;
	}

	get world() {
		return this.#world;
	}

	add(mesh) {
		this.uploadToBackend(mesh);
		return super.add(mesh);
	}

	remove(id) {
		const mesh = super.get(id);
		if (mesh == null) return false;
		this.releaseFromBackend(mesh);
		return super.remove(id);
	}

	uploadToBackend(_mesh) {
		// TODO WR2 mesh transform path
	}

	releaseFromBackend(_mesh) {
		// TODO WR2 mesh transform path
	}
}

export class WrTextureStore extends AzStore {
	#world = null;

	constructor(world, options = {}) {
		super(options);
		this.#world = world ?? null;
	}

	get world() {
		return this.#world;
	}

	add(texture) {
		this.uploadToBackend(texture);
		return super.add(texture);
	}

	remove(id) {
		const texture = super.get(id);
		if (texture == null) return false;
		this.releaseFromBackend(texture);
		return super.remove(id);
	}

	uploadToBackend(_texture) {
		// TODO WR2 texture transform path
	}

	releaseFromBackend(_texture) {
		// TODO WR2 texture transform path
	}
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
		this.buildBackendVariants(shader);
		return super.add(shader);
	}

	remove(id) {
		const shader = super.get(id);
		if (shader == null) return false;
		this.dropBackendVariants(shader);
		return super.remove(id);
	}

	buildBackendVariants(_shader) {
		// TODO WR2 shader transform path
	}

	dropBackendVariants(_shader) {
		// TODO WR2 shader transform path
	}
}

export class WrSkeletonStore extends AzStore {
	#world = null;

	constructor(world, options = {}) {
		super(options);
		this.#world = world ?? null;
	}

	get world() {
		return this.#world;
	}

	add(skeleton) {
		return super.add(skeleton);
	}
}

if (typeof window !== "undefined") {
	window.WrMeshStore = WrMeshStore;
	window.WrTextureStore = WrTextureStore;
	window.WrShaderStore = WrShaderStore;
	window.WrSkeletonStore = WrSkeletonStore;
}

export default {
	WrMeshStore,
	WrTextureStore,
	WrShaderStore,
	WrSkeletonStore,
};

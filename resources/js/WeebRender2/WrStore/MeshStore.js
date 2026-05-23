import AzStore from "../../AzLib/AzStore.js";
import { WrMesh } from "../WrAssets/Mesh.js";

function asId(value) {
	if (value == null) return null;
	const id = String(value).trim();
	return id || null;
}

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
		const value = mesh instanceof WrMesh ? mesh : new WrMesh(mesh ?? {});
		const explicitId = asId(value.id);
		if (explicitId && !this.has(explicitId)) {
			super.add(value);
			const autoId = Array.from(this.map.keys()).pop();
			if (autoId && autoId !== explicitId) this.map.delete(autoId);
			this.map.set(explicitId, value);
			value.id = explicitId;
			this.uploadToBackend(value);
			return explicitId;
		}

		const id = super.add(value);
		value.id = id;
		this.uploadToBackend(value);
		return id;
	}

	remove(id) {
		const mesh = super.get(id);
		if (!mesh) return false;
		this.releaseFromBackend(mesh);
		return super.remove(id);
	}

	uploadToBackend(_mesh) {
		void _mesh;
	}

	releaseFromBackend(_mesh) {
		void _mesh;
	}
}

if (typeof window !== "undefined") {
	window.WrMeshStore = WrMeshStore;
}

export default WrMeshStore;

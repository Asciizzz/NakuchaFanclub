import { WrMeshStore } from "./MeshStore.js";
import { WrTextureStore } from "./TextureStore.js";
import { WrSkeletonStore } from "./SkeletonStore.js";
import { WrShaderOBJStore } from "./ShaderStore.js";
import { WrRenderPassStore } from "./RenderPassStore.js";

export class WrStores {
	constructor(options = {}) {
		const src = options && typeof options === "object" ? options : {};
		this.meshes = new WrMeshStore({ prefix: src.meshPrefix ?? "mesh_" });
		this.textures = new WrTextureStore({ prefix: src.texturePrefix ?? "tex_" });
		this.skeletons = new WrSkeletonStore({ prefix: src.skeletonPrefix ?? "skel_" });
		this.shaderOBJs = new WrShaderOBJStore({ prefix: src.shaderOBJPrefix ?? src.shaderPrefix ?? "shaderOBJ_" });
		this.renderPasses = new WrRenderPassStore({ prefix: src.renderPassPrefix ?? "pass_" });
	}

	clear() {
		const removed = {
			meshes: this.meshes.clear(),
			textures: this.textures.clear(),
			skeletons: this.skeletons.clear(),
			shaderOBJs: this.shaderOBJs.clear(),
			renderPasses: this.renderPasses.clear(),
		};
		return removed;
	}

	clearGpu(backend = null) {
		return {
			meshes: this.meshes.clearGpu(backend),
			textures: this.textures.clearGpu(backend),
			skeletons: 0,
			shaderOBJs: 0,
		};
	}
}

if (typeof window !== "undefined") {
	window.WrStores21 = WrStores;
}

export default WrStores;

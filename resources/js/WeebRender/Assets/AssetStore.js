import { WrAssetKind, wrCloneData, wrEnsureId } from "./AssetTypes.js";

export class WrAssetStore {
    constructor() {
        this.textures = new Map();
        this.materials = new Map();
        this.meshes = new Map();
        this.skeletons = new Map();
        this.scenes = new Map();
        this.shaders = new Map();
    }

    addTexture(texture) { return this.#upsert(this.textures, WrAssetKind.Texture, texture); }
    addMaterial(material) { return this.#upsert(this.materials, WrAssetKind.Material, material); }
    addMesh(mesh) { return this.#upsert(this.meshes, WrAssetKind.Mesh, mesh); }
    addSkeleton(skeleton) { return this.#upsert(this.skeletons, WrAssetKind.Skeleton, skeleton); }
    addScene(scene) { return this.#upsert(this.scenes, WrAssetKind.Scene, scene); }
    addShader(shader) { return this.#upsert(this.shaders, WrAssetKind.Shader, shader); }

    getTexture(id) { return this.textures.get(String(id)) ?? null; }
    getMaterial(id) { return this.materials.get(String(id)) ?? null; }
    getMesh(id) { return this.meshes.get(String(id)) ?? null; }
    getSkeleton(id) { return this.skeletons.get(String(id)) ?? null; }
    getScene(id) { return this.scenes.get(String(id)) ?? null; }
    getShader(id) { return this.shaders.get(String(id)) ?? null; }

    listScenes() { return Array.from(this.scenes.values()); }

    addFromLoader(payload) {
        if (!payload || typeof payload !== "object") {
            throw new TypeError("[WrAssetStore] payload object is required");
        }

        for (const texture of Object.values(payload.textures ?? {})) this.addTexture(texture);
        for (const material of Object.values(payload.materials ?? {})) this.addMaterial(material);
        for (const skeleton of Object.values(payload.skeletons ?? {})) this.addSkeleton(skeleton);
        for (const mesh of Object.values(payload.meshes ?? {})) this.addMesh(mesh);

        if (!payload.scene) throw new Error("[WrAssetStore] payload.scene is required");
        return this.addScene(payload.scene);
    }

    #upsert(map, kind, value) {
        if (!value || typeof value !== "object") {
            throw new TypeError(`[WrAssetStore] ${kind} must be an object`);
        }

        const next = wrCloneData(value);
        const id = wrEnsureId(kind, next.id, map.size);
        next.id = id;
        map.set(id, next);
        return id;
    }
}

export default WrAssetStore;

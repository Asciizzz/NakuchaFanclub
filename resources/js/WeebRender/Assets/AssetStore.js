import { WrAssetKind, wrCloneData, wrEnsureId } from "./AssetTypes.js";

/**
 * CPU-side asset registry for textures, materials, meshes, skeletons, and shaders.
 */
export class WrAssetStore {
    /**
     * Create an empty asset store.
     */
    constructor() {
        this.textures = new Map();
        this.materials = new Map();
        this.meshes = new Map();
        this.skeletons = new Map();
        this.shaders = new Map();
    }

    /**
     * Add or replace a texture asset.
     * @param {object} texture texture asset payload
     * @returns {string}
     */
    addTexture(texture) { return this.#upsert(this.textures, WrAssetKind.Texture, texture); }
    /**
     * Add or replace a material asset.
     * @param {object} material material asset payload
     * @returns {string}
     */
    addMaterial(material) { return this.#upsert(this.materials, WrAssetKind.Material, material); }
    /**
     * Add or replace a mesh asset.
     * @param {object} mesh mesh asset payload
     * @returns {string}
     */
    addMesh(mesh) { return this.#upsert(this.meshes, WrAssetKind.Mesh, mesh); }
    /**
     * Add or replace a skeleton asset.
     * @param {object} skeleton skeleton asset payload
     * @returns {string}
     */
    addSkeleton(skeleton) { return this.#upsert(this.skeletons, WrAssetKind.Skeleton, skeleton); }
    /**
     * Add or replace a shader asset.
     * @param {object} shader shader asset payload
     * @returns {string}
     */
    addShader(shader) { return this.#upsert(this.shaders, WrAssetKind.Shader, shader); }

    /**
     * Get a texture asset by id.
     * @param {string} id texture id
     * @returns {object|null}
     */
    getTexture(id) { return this.textures.get(String(id)) ?? null; }
    /**
     * Get a material asset by id.
     * @param {string} id material id
     * @returns {object|null}
     */
    getMaterial(id) { return this.materials.get(String(id)) ?? null; }
    /**
     * Get a mesh asset by id.
     * @param {string} id mesh id
     * @returns {object|null}
     */
    getMesh(id) { return this.meshes.get(String(id)) ?? null; }
    /**
     * Get a skeleton asset by id.
     * @param {string} id skeleton id
     * @returns {object|null}
     */
    getSkeleton(id) { return this.skeletons.get(String(id)) ?? null; }
    /**
     * Get a shader asset by id.
     * @param {string} id shader id
     * @returns {object|null}
     */
    getShader(id) { return this.shaders.get(String(id)) ?? null; }

    /**
     * Ingest loader payload into store and return detached scene data.
     * Scene data is cloned and not tracked by this store.
     * @param {object} payload loader payload
     * @returns {object}
     */
    addFromLoader(payload) {
        if (!payload || typeof payload !== "object") {
            throw new TypeError("[WrAssetStore] payload object is required");
        }

        for (const texture of Object.values(payload.textures ?? {})) this.addTexture(texture);
        for (const material of Object.values(payload.materials ?? {})) this.addMaterial(material);
        for (const skeleton of Object.values(payload.skeletons ?? {})) this.addSkeleton(skeleton);
        for (const mesh of Object.values(payload.meshes ?? {})) this.addMesh(mesh);

        if (!payload.scene) throw new Error("[WrAssetStore] payload.scene is required");
        const scene = wrCloneData(payload.scene);
        scene.id = wrEnsureId(WrAssetKind.Scene, scene.id, 0);
        return scene;
    }

    /**
     * Internal upsert helper used by add* methods.
     * @param {Map<string, object>} map target registry map
     * @param {string} kind asset kind prefix
     * @param {object} value source payload
     * @returns {string}
     */
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

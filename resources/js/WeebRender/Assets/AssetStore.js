import { WrAssetKind, wrCloneData, wrEnsureId } from "./AssetTypes.js";

/**
 * Resolve integer-like index from number or numeric string.
 * @param {any} value source value
 * @returns {number}
 */
function wrReadIndex(value) {
    if (typeof value === "number" && Number.isFinite(value)) return value | 0;
    if (typeof value === "string" && /^\s*-?\d+\s*$/.test(value)) return Number(value) | 0;
    return -1;
}

/**
 * Build case-insensitive name lookup map.
 * @param {string[]} names ordered names
 * @returns {Map<string, number>}
 */
function wrBuildNameIndexMap(names) {
    const map = new Map();
    for (let i = 0; i < names.length; i++) {
        const name = String(names[i] ?? "");
        if (!name) continue;
        if (!map.has(name)) map.set(name, i);
        const lower = name.toLowerCase();
        if (!map.has(lower)) map.set(lower, i);
    }
    return map;
}

/**
 * Resolve mesh morph target count from known mesh fields.
 * @param {object} mesh mesh asset payload
 * @returns {number}
 */
function wrResolveMeshMorphTargetCount(mesh) {
    if (!mesh || typeof mesh !== "object") return 0;
    let count = Math.max(0, Number(mesh.morphTargetCount ?? 0) | 0);
    if (Array.isArray(mesh.morphTargetNames)) count = Math.max(count, mesh.morphTargetNames.length);
    if (ArrayBuffer.isView(mesh.defaultMorphWeights) || Array.isArray(mesh.defaultMorphWeights)) {
        count = Math.max(count, mesh.defaultMorphWeights.length);
    }
    for (const submesh of Array.isArray(mesh.submeshes) ? mesh.submeshes : []) {
        count = Math.max(count, Math.max(0, Number(submesh?.morph?.targetCount ?? 0) | 0));
    }
    return count;
}

/**
 * Prepare mesh morph caches used by runtime component resolvers.
 * @param {object} mesh mesh asset payload
 * @returns {object}
 */
function wrHydrateMeshMorphCache(mesh) {
    if (!mesh || typeof mesh !== "object") return mesh;
    const count = wrResolveMeshMorphTargetCount(mesh);
    const sourceNames = Array.isArray(mesh.morphTargetNames) ? mesh.morphTargetNames : [];
    const names = new Array(count);
    for (let i = 0; i < count; i++) {
        const raw = sourceNames[i];
        const next = String(raw ?? "").trim();
        names[i] = next || `Target_${i}`;
    }
    mesh.morphTargetCount = count;
    mesh.morphTargetNames = names;
    mesh.morphTargetMap = wrBuildNameIndexMap(names);
    return mesh;
}

/**
 * Prepare skeleton bone name cache used by runtime component resolvers.
 * @param {object} skeleton skeleton asset payload
 * @returns {object}
 */
function wrHydrateSkeletonCache(skeleton) {
    if (!skeleton || typeof skeleton !== "object") return skeleton;
    const bones = Array.isArray(skeleton.bones) ? skeleton.bones : [];
    const names = new Array(bones.length);
    for (let i = 0; i < bones.length; i++) {
        const bone = bones[i];
        const raw = String(bone?.name ?? "").trim();
        const name = raw || `Bone_${i}`;
        names[i] = name;
        if (bone && typeof bone === "object" && !raw) bone.name = name;
    }
    skeleton.map = wrBuildNameIndexMap(names);
    return skeleton;
}

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
     * Resolve morph target index on one mesh by index or name.
     * @param {string} meshID mesh asset id
     * @param {string|number} indexOrName morph reference
     * @returns {number}
     */
    resolveMeshMorphIndex(meshID, indexOrName) {
        const mesh = this.getMesh(meshID);
        if (!mesh) return -1;

        const idx = wrReadIndex(indexOrName);
        if (idx >= 0) {
            return idx < Math.max(0, Number(mesh.morphTargetCount ?? 0) | 0) ? idx : -1;
        }

        if (typeof indexOrName !== "string") return -1;
        const name = indexOrName.trim();
        if (!name) return -1;

        const map = mesh.morphTargetMap instanceof Map
            ? mesh.morphTargetMap
            : wrHydrateMeshMorphCache(mesh).morphTargetMap;
        const exact = map?.get(name);
        if (exact != null) return Number(exact) | 0;
        const lower = map?.get(name.toLowerCase());
        return lower == null ? -1 : (Number(lower) | 0);
    }

    /**
     * Resolve skeleton bone index by index or name.
     * @param {string} skeletonID skeleton asset id
     * @param {string|number} indexOrName bone reference
     * @returns {number}
     */
    resolveSkeletonBoneIndex(skeletonID, indexOrName) {
        const skeleton = this.getSkeleton(skeletonID);
        if (!skeleton) return -1;

        const idx = wrReadIndex(indexOrName);
        if (idx >= 0) return idx;

        if (typeof indexOrName !== "string") return -1;
        const name = indexOrName.trim();
        if (!name) return -1;

        const map = skeleton.map instanceof Map
            ? skeleton.map
            : wrHydrateSkeletonCache(skeleton).map;
        const exact = map?.get(name);
        if (exact != null) return Number(exact) | 0;
        const lower = map?.get(name.toLowerCase());
        return lower == null ? -1 : (Number(lower) | 0);
    }

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
        if (kind === WrAssetKind.Mesh) wrHydrateMeshMorphCache(next);
        if (kind === WrAssetKind.Skeleton) wrHydrateSkeletonCache(next);
        map.set(id, next);
        return id;
    }
}

export default WrAssetStore;

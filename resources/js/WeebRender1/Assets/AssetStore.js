import { WrMesh } from "./Mesh.js";
import { WrSkeleton } from "./Skeleton.js";

export const AssetKind = Object.freeze({
    Texture: "texture",
    Material: "material",
    Mesh: "mesh",
    Skeleton: "skeleton",
    Scene: "scene",
    Shader: "shader",
});

export const WrAssetKind = AssetKind;

function cloneData(value) {
    if (value == null) return value;
    if (ArrayBuffer.isView(value)) return new value.constructor(value);
    if (Array.isArray(value)) return value.map((it) => cloneData(it));
    if (typeof value === "object") {
        const proto = Object.getPrototypeOf(value);
        const isPlainObject = proto === Object.prototype || proto === null;
        if (!isPlainObject) return value;
        const out = {};
        for (const [key, next] of Object.entries(value)) out[key] = cloneData(next);
        return out;
    }
    return value;
}

function ensureId(prefix, rawId, fallbackIndex = 0) {
    const value = String(rawId ?? "").trim();
    if (value.length > 0) return value;
    return `${prefix}_${Number(fallbackIndex) | 0}`;
}

export class WrAssetStore {
    constructor() {
        this.textures = new Map();
        this.materials = new Map();
        this.meshes = new Map();
        this.skeletons = new Map();
        this.shaders = new Map();
    }

    addTexture(texture) { return this.#upsert(this.textures, AssetKind.Texture, texture); }
    addMaterial(material) { return this.#upsert(this.materials, AssetKind.Material, material); }
    addMesh(mesh) { return this.#upsert(this.meshes, AssetKind.Mesh, mesh); }
    addSkeleton(skeleton) { return this.#upsert(this.skeletons, AssetKind.Skeleton, skeleton); }
    addShader(shader) { return this.#upsert(this.shaders, AssetKind.Shader, shader); }

    getTexture(id) { return this.textures.get(String(id)) ?? null; }
    getMaterial(id) { return this.materials.get(String(id)) ?? null; }
    getMesh(id) { return this.meshes.get(String(id)) ?? null; }
    getSkeleton(id) { return this.skeletons.get(String(id)) ?? null; }
    getShader(id) { return this.shaders.get(String(id)) ?? null; }

    resolveMeshMorphIndex(meshID, indexOrName) {
        return this.getMesh(meshID)?.resolveMorphIndex?.(indexOrName) ?? -1;
    }

    resolveSkeletonBoneIndex(skeletonID, indexOrName) {
        return this.getSkeleton(skeletonID)?.resolveBoneIndex?.(indexOrName) ?? -1;
    }

    addFromLoader(payload) {
        if (!payload || typeof payload !== "object") {
            throw new TypeError("[WrAssetStore] payload object is required");
        }

        for (const texture of Object.values(payload.textures ?? {})) this.addTexture(texture);
        for (const material of Object.values(payload.materials ?? {})) this.addMaterial(material);
        for (const skeleton of Object.values(payload.skeletons ?? {})) this.addSkeleton(skeleton);
        for (const mesh of Object.values(payload.meshes ?? {})) this.addMesh(mesh);

        if (!payload.scene) throw new Error("[WrAssetStore] payload.scene is required");
        const scene = WrAssetStore.cloneData(payload.scene);
        scene.id = WrAssetStore.ensureId(AssetKind.Scene, scene.id, 0);
        return scene;
    }

    #upsert(map, kind, value) {
        if (!value || typeof value !== "object") {
            throw new TypeError(`[WrAssetStore] ${kind} must be an object`);
        }

        if (kind === AssetKind.Mesh) {
            const mesh = WrMesh.from(value);
            mesh.id = WrAssetStore.ensureId(kind, mesh.id, map.size);
            mesh.rebuildMorphCache();
            map.set(mesh.id, mesh);
            return mesh.id;
        }
        if (kind === AssetKind.Skeleton) {
            const skeleton = WrSkeleton.from(value);
            skeleton.id = WrAssetStore.ensureId(kind, skeleton.id, map.size);
            skeleton.rebuildBoneCache();
            map.set(skeleton.id, skeleton);
            return skeleton.id;
        }

        const next = WrAssetStore.cloneData(value);
        const id = WrAssetStore.ensureId(kind, next.id, map.size);
        next.id = id;
        map.set(id, next);
        return id;
    }

    static cloneData(value) {
        return cloneData(value);
    }

    static ensureId(prefix, rawId, fallbackIndex = 0) {
        return ensureId(prefix, rawId, fallbackIndex);
    }
}

export default WrAssetStore;

import AzStore from "../../AzLib/AzStore.js";
import { WrMesh } from "../WrAssets/Mesh.js";
import { WrTexture } from "../WrAssets/Texture.js";
import { WrShader } from "../WrShader/WrShader.js";
import { WrSkeleton } from "../WrAssets/Skeleton.js";

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
        const value = texture instanceof WrTexture ? texture : new WrTexture(texture ?? {});
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
        const texture = super.get(id);
        if (!texture) return false;
        this.releaseFromBackend(texture);
        return super.remove(id);
    }

    uploadToBackend(_texture) {
        void _texture;
    }

    releaseFromBackend(_texture) {
        void _texture;
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
        const value = shader instanceof WrShader ? shader : new WrShader(shader ?? {});
        const explicitId = asId(value.id);
        if (explicitId && !this.has(explicitId)) {
            super.add(value);
            const autoId = Array.from(this.map.keys()).pop();
            if (autoId && autoId !== explicitId) this.map.delete(autoId);
            this.map.set(explicitId, value);
            value.id = explicitId;
            this.buildBackendVariants(value);
            return explicitId;
        }

        const id = super.add(value);
        value.id = id;
        this.buildBackendVariants(value);
        return id;
    }

    remove(id) {
        const shader = super.get(id);
        if (!shader) return false;
        this.dropBackendVariants(shader);
        return super.remove(id);
    }

    rebuildBackendVariants() {
        for (const shader of this.map.values()) this.buildBackendVariants(shader);
    }

    buildBackendVariants(shader) {
        const backend = this.#world?.backend ?? null;
        if (!backend || !shader || typeof shader.buildBackend !== "function") return null;
        return shader.buildBackend(backend, { createPipeline: true });
    }

    dropBackendVariants(shader) {
        if (shader && typeof shader.dropBackend === "function") shader.dropBackend();
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
        const value = skeleton instanceof WrSkeleton ? skeleton : new WrSkeleton(skeleton ?? {});
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

    resolveBoneIndex(id, indexOrName) {
        const skeleton = super.get(id);
        if (!skeleton || typeof skeleton.resolveBoneIndex !== "function") return -1;
        return skeleton.resolveBoneIndex(indexOrName);
    }
}


if (typeof window !== "undefined") {
    window.WrMeshStore = WrMeshStore;
    window.WrTextureStore = WrTextureStore;
    window.WrShaderStore = WrShaderStore;
    window.WrSkeletonStore = WrSkeletonStore;
}

export default { WrMeshStore, WrTextureStore, WrShaderStore, WrSkeletonStore };
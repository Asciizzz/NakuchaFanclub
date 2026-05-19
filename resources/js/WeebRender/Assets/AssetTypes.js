export const WrAssetKind = Object.freeze({
    Texture: "texture",
    Material: "material",
    Mesh: "mesh",
    Skeleton: "skeleton",
    Scene: "scene",
    Shader: "shader",
});

/**
 * Clone data recursively for plain objects, arrays, and typed arrays.
 * Non-plain object references are returned as-is.
 * @param {any} value input value
 * @returns {any}
 */
export function wrCloneData(value) {
    if (value == null) return value;
    if (ArrayBuffer.isView(value)) return new value.constructor(value);
    if (Array.isArray(value)) return value.map((it) => wrCloneData(it));
    if (typeof value === "object") {
        const proto = Object.getPrototypeOf(value);
        const isPlainObject = proto === Object.prototype || proto === null;
        if (!isPlainObject) return value;
        const out = {};
        for (const [key, next] of Object.entries(value)) out[key] = wrCloneData(next);
        return out;
    }
    return value;
}

/**
 * Resolve a stable asset id from a preferred id or fallback index.
 * @param {string} prefix id prefix
 * @param {string|null|undefined} rawId preferred id
 * @param {number} [fallbackIndex=0] fallback numeric suffix
 * @returns {string}
 */
export function wrEnsureId(prefix, rawId, fallbackIndex = 0) {
    const value = String(rawId ?? "").trim();
    if (value.length > 0) return value;
    return `${prefix}_${Number(fallbackIndex) | 0}`;
}

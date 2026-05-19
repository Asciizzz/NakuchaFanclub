import { wrValidateTemplateKeys } from "./ShaderTemplate.js";

export const WR_VERTEX_ABI_VERSION = 1;

export const WR_VERTEX_LAYOUT_V1 = Object.freeze({
    stride: 76,
    attributes: Object.freeze([
        Object.freeze({ semantic: "position", location: 0, format: "float32x3", offset: 0 }),
        Object.freeze({ semantic: "normal", location: 1, format: "float32x3", offset: 12 }),
        Object.freeze({ semantic: "uv", location: 2, format: "float32x2", offset: 24 }),
        Object.freeze({ semantic: "boneID", location: 3, format: "float32x4", offset: 32 }),
        Object.freeze({ semantic: "boneWeight", location: 4, format: "float32x4", offset: 48 }),
        Object.freeze({ semantic: "morphPos", location: 5, format: "float32x3", offset: 64 }),
    ]),
});

const WR_FORMAT_SIZE = Object.freeze({
    float32: 4,
    float32x2: 8,
    float32x3: 12,
    float32x4: 16,
    uint32: 4,
    uint32x2: 8,
    uint32x3: 12,
    uint32x4: 16,
    sint32: 4,
    sint32x2: 8,
    sint32x3: 12,
    sint32x4: 16,
});

/**
 * Assert non-empty string value.
 * @param {any} value input value
 * @param {string} name parameter name
 * @returns {void}
 */
function wrAssertString(value, name) {
    if (typeof value !== "string" || value.trim().length === 0) {
        throw new TypeError(`[WrShaderAbi] ${name} must be a non-empty string`);
    }
}

/**
 * Check WGSL function entrypoint presence.
 * @param {string} source WGSL source
 * @param {string} entryName function name
 * @returns {boolean}
 */
function wrHasWgslEntry(source, entryName) {
    return new RegExp(`\\bfn\\s+${entryName}\\s*\\(`).test(source);
}

/**
 * Check GLSL main() entry presence.
 * @param {string} source GLSL source
 * @returns {boolean}
 */
function wrHasGlslMain(source) {
    return /\bvoid\s+main\s*\(/.test(source);
}

/**
 * Check WGSL vertex output has builtin(position).
 * @param {string} source WGSL source
 * @returns {boolean}
 */
function wrHasWgslVertexPositionBuiltin(source) {
    return /@builtin\s*\(\s*position\s*\)/.test(source);
}

/**
 * Check WGSL fragment output has @location(0).
 * @param {string} source WGSL source
 * @returns {boolean}
 */
function wrHasWgslFragmentColorLocation(source) {
    return /@location\s*\(\s*0\s*\)/.test(source);
}

/**
 * Resolve byte size for one vertex attribute format.
 * @param {string} format format key
 * @returns {number}
 */
export function wrSizeOfFormat(format) {
    const size = WR_FORMAT_SIZE[String(format)];
    if (!size) throw new Error(`[WrShaderAbi] unsupported vertex format "${format}"`);
    return size;
}

/**
 * Normalize and validate vertex layout object.
 * @param {object|null|undefined} layout layout input
 * @returns {{stride:number,attributes:object[]}}
 */
export function wrNormalizeVertexLayout(layout) {
    const src = layout ?? WR_VERTEX_LAYOUT_V1;
    const stride = Number(src.stride);
    if (!Number.isFinite(stride) || stride <= 0) {
        throw new Error("[WrShaderAbi] vertex stride must be a positive number");
    }

    if (!Array.isArray(src.attributes) || src.attributes.length <= 0) {
        throw new Error("[WrShaderAbi] vertex attributes array is required");
    }

    const bySemantic = new Set();
    const byLocation = new Set();
    const attributes = src.attributes.map((attr, index) => {
        if (!attr || typeof attr !== "object") {
            throw new Error(`[WrShaderAbi] attribute at index ${index} must be an object`);
        }
        wrAssertString(attr.semantic, `attribute[${index}].semantic`);
        const semantic = attr.semantic.trim();
        const location = Number(attr.location);
        const offset = Number(attr.offset);
        const format = String(attr.format ?? "").trim();
        const size = wrSizeOfFormat(format);

        if (!Number.isInteger(location) || location < 0) {
            throw new Error(`[WrShaderAbi] attribute "${semantic}" has invalid location`);
        }
        if (!Number.isInteger(offset) || offset < 0) {
            throw new Error(`[WrShaderAbi] attribute "${semantic}" has invalid offset`);
        }
        if ((offset + size) > stride) {
            throw new Error(`[WrShaderAbi] attribute "${semantic}" exceeds stride ${stride}`);
        }
        if (bySemantic.has(semantic)) {
            throw new Error(`[WrShaderAbi] duplicate semantic "${semantic}"`);
        }
        if (byLocation.has(location)) {
            throw new Error(`[WrShaderAbi] duplicate location "${location}"`);
        }

        bySemantic.add(semantic);
        byLocation.add(location);
        return { semantic, location, format, offset, size };
    });

    return {
        stride,
        attributes,
    };
}

/**
 * Compare expected and provided vertex signatures.
 * @param {object} expectedLayout expected layout
 * @param {object} providedLayout provided layout
 * @returns {object}
 */
export function wrCompareVertexSignatures(expectedLayout, providedLayout) {
    const expected = wrNormalizeVertexLayout(expectedLayout);
    const provided = wrNormalizeVertexLayout(providedLayout);

    if (expected.stride !== provided.stride) {
        return {
            ok: false,
            reason: "stride mismatch",
            expected: { stride: expected.stride },
            provided: { stride: provided.stride },
        };
    }

    const bySemantic = new Map(provided.attributes.map((attr) => [attr.semantic, attr]));
    for (const attr of expected.attributes) {
        const has = bySemantic.get(attr.semantic);
        if (!has) {
            return { ok: false, reason: `missing attr ${attr.semantic}`, expected: attr, provided: null };
        }
        if (has.location !== attr.location) {
            return { ok: false, reason: `location mismatch ${attr.semantic}`, expected: attr, provided: has };
        }
        if (has.offset !== attr.offset) {
            return { ok: false, reason: `offset mismatch ${attr.semantic}`, expected: attr, provided: has };
        }
        if (has.format !== attr.format) {
            return { ok: false, reason: `format mismatch ${attr.semantic}`, expected: attr, provided: has };
        }
    }

    return { ok: true, reason: "ok", expected, provided };
}

/**
 * Validate dual-language shader definition and normalize ABI shape.
 * @param {object} shaderDesc shader definition
 * @returns {object}
 */
export function wrValidateShaderDefinition(shaderDesc) {
    if (!shaderDesc || typeof shaderDesc !== "object") {
        throw new TypeError("[WrShaderAbi] shader definition object is required");
    }

    const vertex = shaderDesc.vertex ?? {};
    const fragment = shaderDesc.fragment ?? {};
    wrAssertString(vertex.wgsl, "vertex.wgsl");
    wrAssertString(vertex.glsl, "vertex.glsl");
    wrAssertString(fragment.wgsl, "fragment.wgsl");
    wrAssertString(fragment.glsl, "fragment.glsl");

    if (!wrHasWgslEntry(vertex.wgsl, "wr_vs_main")) {
        throw new Error("[WrShaderAbi] WGSL vertex must contain entrypoint fn wr_vs_main(...)");
    }
    if (!wrHasWgslEntry(fragment.wgsl, "wr_fs_main")) {
        throw new Error("[WrShaderAbi] WGSL fragment must contain entrypoint fn wr_fs_main(...)");
    }
    if (!wrHasWgslVertexPositionBuiltin(vertex.wgsl)) {
        throw new Error("[WrShaderAbi] WGSL vertex must declare @builtin(position) in vertex output");
    }
    if (!wrHasWgslFragmentColorLocation(fragment.wgsl)) {
        throw new Error("[WrShaderAbi] WGSL fragment must declare @location(0) in fragment output");
    }
    if (!wrHasGlslMain(vertex.glsl)) {
        throw new Error("[WrShaderAbi] GLSL vertex must contain void main()");
    }
    if (!wrHasGlslMain(fragment.glsl)) {
        throw new Error("[WrShaderAbi] GLSL fragment must contain void main()");
    }

    wrValidateTemplateKeys(vertex.wgsl, "vertex");
    wrValidateTemplateKeys(vertex.glsl, "vertex");
    wrValidateTemplateKeys(fragment.wgsl, "fragment");
    wrValidateTemplateKeys(fragment.glsl, "fragment");

    const vertexAbiVersion = Number(shaderDesc.vertexAbiVersion ?? WR_VERTEX_ABI_VERSION);
    if (vertexAbiVersion !== WR_VERTEX_ABI_VERSION) {
        throw new Error(`[WrShaderAbi] unsupported vertexAbiVersion "${vertexAbiVersion}"`);
    }

    const vertexLayout = wrNormalizeVertexLayout(shaderDesc.vertexLayout ?? WR_VERTEX_LAYOUT_V1);

    return {
        ...shaderDesc,
        vertexAbiVersion,
        vertexLayout,
        vertex: {
            ...vertex,
            wgsl: String(vertex.wgsl),
            glsl: String(vertex.glsl),
        },
        fragment: {
            ...fragment,
            wgsl: String(fragment.wgsl),
            glsl: String(fragment.glsl),
        },
    };
}

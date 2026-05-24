export const WR_SHADER_KEYS = Object.freeze([
    "$POSITION$",
    "$NORMAL$",
    "$UV$",
    "$TANGENT$",
    "$BONE_ID$",
    "$BONE_WEIGHT$",
    "$MORPH_POS$",
    "$MORPH_WEIGHT$",
    "$INST_MODEL$",
    "$INST_DATA0$",
    "$INST_DATA1$",
    "$INST_DATA2$",
    "$INST_DATA3$",
    "$VIEW$",
    "$PROJECTION$",
    "$TIME$",
    "$DELTA_TIME$",
    "$SKIN_PALETTE$",
    "$VTX_FLAGS$",
    "$SKIN_ENABLED$",
    "$HAS_MORPH$",
    "$HAS_UV$",
    "$HAS_NORMAL$",
    "$HAS_COLOR$",
    "$HAS_BONE$",
    "$HAS_TANGENT$",
    "$MORPH_HAS_POS$",
    "$MORPH_HAS_NORMAL$",
    "$MORPH_HAS_TANGENT$",
    "$ALBEDO_TEX$",
    "$ALBEDO_COLOR$",
    "$OUT_COLOR$",
]);

const WR_KEY_SET = new Set(WR_SHADER_KEYS);

const WR_STAGE_KEYS = Object.freeze({
    vertex: new Set([
        "$POSITION$",
        "$NORMAL$",
        "$UV$",
        "$TANGENT$",
        "$BONE_ID$",
        "$BONE_WEIGHT$",
        "$MORPH_POS$",
        "$MORPH_WEIGHT$",
        "$INST_MODEL$",
        "$INST_DATA0$",
        "$INST_DATA1$",
        "$INST_DATA2$",
        "$INST_DATA3$",
        "$VIEW$",
        "$PROJECTION$",
        "$TIME$",
        "$DELTA_TIME$",
        "$SKIN_PALETTE$",
        "$VTX_FLAGS$",
        "$SKIN_ENABLED$",
        "$HAS_MORPH$",
        "$HAS_UV$",
        "$HAS_NORMAL$",
        "$HAS_COLOR$",
        "$HAS_BONE$",
        "$HAS_TANGENT$",
        "$MORPH_HAS_POS$",
        "$MORPH_HAS_NORMAL$",
        "$MORPH_HAS_TANGENT$",
    ]),
    fragment: new Set([
        "$UV$",
        "$ALBEDO_TEX$",
        "$ALBEDO_COLOR$",
        "$OUT_COLOR$",
        "$VTX_FLAGS$",
        "$SKIN_ENABLED$",
        "$HAS_MORPH$",
        "$HAS_UV$",
        "$HAS_NORMAL$",
        "$HAS_COLOR$",
        "$HAS_BONE$",
        "$HAS_TANGENT$",
        "$MORPH_HAS_POS$",
        "$MORPH_HAS_NORMAL$",
        "$MORPH_HAS_TANGENT$",
        "$TIME$",
        "$DELTA_TIME$",
    ]),
});

/**
 * Extract distinct template keys from source text
 * @param {string} source shader source
 * @returns {string[]}
 */
export function wrExtractTemplateKeys(source) {
    const text = String(source ?? "");
    const found = text.match(/\$[A-Z0-9_]+\$/g) ?? [];
    return Array.from(new Set(found));
}

/**
 * Validate template keys against stage key allowlist
 * @param {string} source shader source
 * @param {"vertex"|"fragment"} stage stage name
 * @returns {string[]}
 */
export function wrValidateTemplateKeys(source, stage) {
    const stageName = String(stage ?? "").toLowerCase();
    const allowed = WR_STAGE_KEYS[stageName];
    if (!allowed) throw new Error(`[WrShaderTemplate] unknown stage "${stage}"`);

    const found = wrExtractTemplateKeys(source);
    for (const key of found) {
        if (!WR_KEY_SET.has(key)) {
            throw new Error(`[WrShaderTemplate] unknown key "${key}"`);
        }
        if (!allowed.has(key)) {
            throw new Error(`[WrShaderTemplate] key "${key}" is not valid in ${stageName} stage`);
        }
    }
    return found;
}

/**
 * Replace template keys with stage-specific replacements
 * @param {string} source shader source
 * @param {"vertex"|"fragment"} stage stage name
 * @param {object} keyMap replacement map
 * @returns {string}
 */
export function wrReplaceTemplateKeys(source, stage, keyMap) {
    const text = String(source ?? "");
    const stageName = String(stage ?? "").toLowerCase();
    const found = wrValidateTemplateKeys(text, stageName);
    let out = text;

    for (const key of found) {
        if (!Object.prototype.hasOwnProperty.call(keyMap ?? {}, key)) {
            throw new Error(`[WrShaderTemplate] missing replacement for "${key}" in ${stage} stage`);
        }
        const rawReplacement = keyMap[key];
        let replacementValue = rawReplacement;
        if (rawReplacement && typeof rawReplacement === "object" && !Array.isArray(rawReplacement)) {
            replacementValue = rawReplacement[stageName] ?? rawReplacement.default ?? null;
        }
        if (replacementValue == null) {
            throw new Error(`[WrShaderTemplate] missing stage replacement for "${key}" in ${stage} stage`);
        }
        const replacement = String(replacementValue);
        out = out.split(key).join(replacement);
    }
    return out;
}

/**
 * Default WGSL replacement map for non-template mode
 * @returns {object}
 */
export function wrDefaultKeyMapWgsl() {
    return {
        "$POSITION$": "input.position",
        "$NORMAL$": "input.normal",
        "$UV$": { vertex: "input.uv", fragment: "input.uv" },
        "$TANGENT$": "vec4f(1.0, 0.0, 0.0, 1.0)",
        "$BONE_ID$": "input.boneID",
        "$BONE_WEIGHT$": "input.boneWeight",
        "$MORPH_POS$": "input.morphPos",
        "$MORPH_WEIGHT$": "objectUBO.extras.x",
        "$INST_MODEL$": "objectUBO.model",
        "$INST_DATA0$": "objectUBO.instData0",
        "$INST_DATA1$": "objectUBO.instData1",
        "$INST_DATA2$": "objectUBO.instData2",
        "$INST_DATA3$": "objectUBO.instData3",
        "$VIEW$": "sceneUBO.viewProj",
        "$PROJECTION$": "mat4x4f(1.0)",
        "$TIME$": "sceneUBO.time.x",
        "$DELTA_TIME$": "sceneUBO.time.y",
        "$SKIN_PALETTE$": "objectUBO.skinPalette",
        "$VTX_FLAGS$": "objectUBO.vtxFlags0",
        "$SKIN_ENABLED$": "(objectUBO.vtxFlags0.x > 0.5)",
        "$HAS_MORPH$": "(objectUBO.vtxFlags0.y > 0.5)",
        "$HAS_UV$": "(objectUBO.vtxFlags0.z > 0.5)",
        "$HAS_NORMAL$": "(objectUBO.vtxFlags0.w > 0.5)",
        "$HAS_COLOR$": "(objectUBO.vtxFlags1.x > 0.5)",
        "$HAS_BONE$": "(objectUBO.vtxFlags1.y > 0.5)",
        "$HAS_TANGENT$": "(objectUBO.vtxFlags1.z > 0.5)",
        "$MORPH_HAS_POS$": "(objectUBO.vtxFlags1.w > 0.5)",
        "$MORPH_HAS_NORMAL$": "(objectUBO.extras.y > 0.5)",
        "$MORPH_HAS_TANGENT$": "(objectUBO.extras.z > 0.5)",
        "$ALBEDO_TEX$": "albedoTex",
        "$ALBEDO_COLOR$": "objectUBO.albedoColor",
        "$OUT_COLOR$": "outputColor",
    };
}

/**
 * Default GLSL replacement map for non-template mode
 * @returns {object}
 */
export function wrDefaultKeyMapGlsl() {
    return {
        "$POSITION$": "a_position",
        "$NORMAL$": "a_normal",
        "$UV$": { vertex: "a_uv", fragment: "v_uv" },
        "$TANGENT$": "vec4(1.0, 0.0, 0.0, 1.0)",
        "$BONE_ID$": "a_boneID",
        "$BONE_WEIGHT$": "a_boneWeight",
        "$MORPH_POS$": "a_morphPos",
        "$MORPH_WEIGHT$": "u_extras.x",
        "$INST_MODEL$": "u_model",
        "$INST_DATA0$": "u_instData0",
        "$INST_DATA1$": "u_instData1",
        "$INST_DATA2$": "u_instData2",
        "$INST_DATA3$": "u_instData3",
        "$VIEW$": "u_viewProj",
        "$PROJECTION$": "mat4(1.0)",
        "$TIME$": "u_time.x",
        "$DELTA_TIME$": "u_time.y",
        "$SKIN_PALETTE$": "u_skinPalette",
        "$VTX_FLAGS$": "u_vtxFlags0",
        "$SKIN_ENABLED$": "(u_vtxFlags0.x > 0.5)",
        "$HAS_MORPH$": "(u_vtxFlags0.y > 0.5)",
        "$HAS_UV$": "(u_vtxFlags0.z > 0.5)",
        "$HAS_NORMAL$": "(u_vtxFlags0.w > 0.5)",
        "$HAS_COLOR$": "(u_vtxFlags1.x > 0.5)",
        "$HAS_BONE$": "(u_vtxFlags1.y > 0.5)",
        "$HAS_TANGENT$": "(u_vtxFlags1.z > 0.5)",
        "$MORPH_HAS_POS$": "(u_vtxFlags1.w > 0.5)",
        "$MORPH_HAS_NORMAL$": "(u_extras.y > 0.5)",
        "$MORPH_HAS_TANGENT$": "(u_extras.z > 0.5)",
        "$ALBEDO_TEX$": "u_albedoTex",
        "$ALBEDO_COLOR$": "u_albedoColor",
        "$OUT_COLOR$": "fragColor",
    };
}

/**
 * Template-mode WGSL replacement map
 * @returns {object}
 */
export function wrTemplateKeyMapWgsl() {
    return {
        "$POSITION$": "wr_position",
        "$NORMAL$": "wr_normal",
        "$UV$": "wr_uv",
        "$TANGENT$": "wr_tangent",
        "$BONE_ID$": "wr_boneID",
        "$BONE_WEIGHT$": "wr_boneWeight",
        "$MORPH_POS$": "wr_morphPos",
        "$MORPH_WEIGHT$": "objectUBO.extras.x",
        "$INST_MODEL$": "objectUBO.model",
        "$INST_DATA0$": "objectUBO.instData0",
        "$INST_DATA1$": "objectUBO.instData1",
        "$INST_DATA2$": "objectUBO.instData2",
        "$INST_DATA3$": "objectUBO.instData3",
        "$VIEW$": "sceneUBO.viewProj",
        "$PROJECTION$": "mat4x4f(1.0)",
        "$TIME$": "sceneUBO.time.x",
        "$DELTA_TIME$": "sceneUBO.time.y",
        "$SKIN_PALETTE$": "objectUBO.skinPalette",
        "$VTX_FLAGS$": "objectUBO.vtxFlags0",
        "$SKIN_ENABLED$": "(objectUBO.vtxFlags0.x > 0.5)",
        "$HAS_MORPH$": "(objectUBO.vtxFlags0.y > 0.5)",
        "$HAS_UV$": "(objectUBO.vtxFlags0.z > 0.5)",
        "$HAS_NORMAL$": "(objectUBO.vtxFlags0.w > 0.5)",
        "$HAS_COLOR$": "(objectUBO.vtxFlags1.x > 0.5)",
        "$HAS_BONE$": "(objectUBO.vtxFlags1.y > 0.5)",
        "$HAS_TANGENT$": "(objectUBO.vtxFlags1.z > 0.5)",
        "$MORPH_HAS_POS$": "(objectUBO.vtxFlags1.w > 0.5)",
        "$MORPH_HAS_NORMAL$": "(objectUBO.extras.y > 0.5)",
        "$MORPH_HAS_TANGENT$": "(objectUBO.extras.z > 0.5)",
        "$ALBEDO_TEX$": "albedoTex",
        "$ALBEDO_COLOR$": "objectUBO.albedoColor",
        "$OUT_COLOR$": "outputColor",
    };
}

/**
 * Template-mode GLSL replacement map
 * @returns {object}
 */
export function wrTemplateKeyMapGlsl() {
    return {
        "$POSITION$": "wr_position",
        "$NORMAL$": "wr_normal",
        "$UV$": "wr_uv",
        "$TANGENT$": "wr_tangent",
        "$BONE_ID$": "wr_boneID",
        "$BONE_WEIGHT$": "wr_boneWeight",
        "$MORPH_POS$": "wr_morphPos",
        "$MORPH_WEIGHT$": "u_extras.x",
        "$INST_MODEL$": "u_model",
        "$INST_DATA0$": "u_instData0",
        "$INST_DATA1$": "u_instData1",
        "$INST_DATA2$": "u_instData2",
        "$INST_DATA3$": "u_instData3",
        "$VIEW$": "u_viewProj",
        "$PROJECTION$": "mat4(1.0)",
        "$TIME$": "u_time.x",
        "$DELTA_TIME$": "u_time.y",
        "$SKIN_PALETTE$": "u_skinPalette",
        "$VTX_FLAGS$": "u_vtxFlags0",
        "$SKIN_ENABLED$": "(u_vtxFlags0.x > 0.5)",
        "$HAS_MORPH$": "(u_vtxFlags0.y > 0.5)",
        "$HAS_UV$": "(u_vtxFlags0.z > 0.5)",
        "$HAS_NORMAL$": "(u_vtxFlags0.w > 0.5)",
        "$HAS_COLOR$": "(u_vtxFlags1.x > 0.5)",
        "$HAS_BONE$": "(u_vtxFlags1.y > 0.5)",
        "$HAS_TANGENT$": "(u_vtxFlags1.z > 0.5)",
        "$MORPH_HAS_POS$": "(u_vtxFlags1.w > 0.5)",
        "$MORPH_HAS_NORMAL$": "(u_extras.y > 0.5)",
        "$MORPH_HAS_TANGENT$": "(u_extras.z > 0.5)",
        "$ALBEDO_TEX$": "u_albedoTex",
        "$ALBEDO_COLOR$": "u_albedoColor",
        "$OUT_COLOR$": "outputColor",
    };
}


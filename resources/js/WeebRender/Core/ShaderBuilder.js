const WR_LINK_KEY_CAP = 8;
const WR_LINK_RESERVED = new Set([
    "input",
    "output",
    "outputColor",
    "wr_position",
    "wr_normal",
    "wr_uv",
    "wr_tangent",
    "wr_boneID",
    "wr_boneWeight",
    "wr_morphPos",
    "gl_Position",
    "fragColor",
]);

function wrLegacyLinkSlot(value) {
    if (typeof value === "number" && Number.isInteger(value)) return value;
    if (typeof value === "string") {
        const lowered = value.trim().toLowerCase();
        const match = lowered.match(/(\d+)$/);
        if (match) return Number(match[1]);
    }
    return -1;
}

function wrDefaultWgslTypeFromGlsl(glslType) {
    const t = String(glslType ?? "").trim();
    if (t === "float") return "f32";
    if (t === "int") return "i32";
    if (t === "uint") return "u32";
    if (t === "vec2") return "vec2f";
    if (t === "vec3") return "vec3f";
    if (t === "vec4") return "vec4f";
    if (t === "mat3") return "mat3x3f";
    if (t === "mat4") return "mat4x4f";
    return "vec4f";
}

function wrDefaultGlslTypeFromWgsl(wgslType) {
    const t = String(wgslType ?? "").trim();
    if (t === "f32") return "float";
    if (t === "i32") return "int";
    if (t === "u32") return "uint";
    if (t === "vec2f") return "vec2";
    if (t === "vec3f") return "vec3";
    if (t === "vec4f") return "vec4";
    if (t === "mat3x3f") return "mat3";
    if (t === "mat4x4f") return "mat4";
    return "vec4";
}

function wrDefaultLiteralWgsl(type) {
    const t = String(type ?? "").trim();
    if (t === "f32") return "0.0";
    if (t === "i32") return "0";
    if (t === "u32") return "0u";
    if (t === "vec2f") return "vec2f(0.0, 0.0)";
    if (t === "vec3f") return "vec3f(0.0, 0.0, 0.0)";
    if (t === "vec4f") return "vec4f(0.0, 0.0, 0.0, 0.0)";
    if (t === "mat3x3f") return "mat3x3f(0.0)";
    if (t === "mat4x4f") return "mat4x4f(0.0)";
    return "vec4f(0.0, 0.0, 0.0, 0.0)";
}

function wrDefaultLiteralGlsl(type) {
    const t = String(type ?? "").trim();
    if (t === "float") return "0.0";
    if (t === "int") return "0";
    if (t === "uint") return "0u";
    if (t === "vec2") return "vec2(0.0, 0.0)";
    if (t === "vec3") return "vec3(0.0, 0.0, 0.0)";
    if (t === "vec4") return "vec4(0.0, 0.0, 0.0, 0.0)";
    if (t === "mat3") return "mat3(1.0)";
    if (t === "mat4") return "mat4(1.0)";
    return "vec4(0.0, 0.0, 0.0, 0.0)";
}

function wrResolveLinkTypes(raw) {
    const typeSource = raw?.type;
    if (typeof typeSource === "string" && typeSource.trim().length > 0) {
        const text = typeSource.trim();
        if (text.endsWith("f") || text === "f32" || text === "i32" || text === "u32") {
            return {
                wgslType: text,
                glslType: wrDefaultGlslTypeFromWgsl(text),
            };
        }
        return {
            wgslType: wrDefaultWgslTypeFromGlsl(text),
            glslType: text,
        };
    }

    const wgslType = String(raw?.wgslType ?? raw?.type?.wgsl ?? "").trim();
    const glslType = String(raw?.glslType ?? raw?.type?.glsl ?? "").trim();
    if (wgslType && glslType) return { wgslType, glslType };
    if (wgslType) {
        return {
            wgslType,
            glslType: wrDefaultGlslTypeFromWgsl(wgslType),
        };
    }
    if (glslType) {
        return {
            wgslType: wrDefaultWgslTypeFromGlsl(glslType),
            glslType,
        };
    }

    return {
        wgslType: "vec4f",
        glslType: "vec4",
    };
}

function wrAssertLinkName(name) {
    const clean = String(name ?? "").trim();
    if (!clean) throw new Error("[WrShaderBuilder] link.name is required");
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(clean)) {
        throw new Error(`[WrShaderBuilder] invalid link.name "${clean}"`);
    }
    if (WR_LINK_RESERVED.has(clean)) {
        throw new Error(`[WrShaderBuilder] link.name "${clean}" is reserved`);
    }
    return clean;
}

function wrCollectLinks(shaderDesc = {}) {
    const rawList = [];
    if (shaderDesc.link != null) rawList.push(shaderDesc.link);
    if (Array.isArray(shaderDesc.links)) rawList.push(...shaderDesc.links);
    if (Array.isArray(shaderDesc.linkage)) rawList.push(...shaderDesc.linkage);

    const withOrder = rawList.map((raw, index) => {
        const source = (raw && typeof raw === "object") ? raw : { name: raw };
        const slot = wrLegacyLinkSlot(source.slot ?? source.index ?? source.link);
        const fallbackName = slot >= 0 ? `link${slot}` : `link${index}`;
        const name = wrAssertLinkName(source.name ?? fallbackName);
        const { wgslType, glslType } = wrResolveLinkTypes(source);
        const defaultWgsl = typeof source.defaultWgsl === "string" && source.defaultWgsl.trim().length > 0
            ? source.defaultWgsl.trim()
            : null;
        const defaultGlsl = typeof source.defaultGlsl === "string" && source.defaultGlsl.trim().length > 0
            ? source.defaultGlsl.trim()
            : null;

        return {
            name,
            slot,
            order: index,
            wgslType,
            glslType,
            defaultWgsl,
            defaultGlsl,
        };
    });

    withOrder.sort((a, b) => {
        const aSlot = a.slot >= 0 ? a.slot : Number.MAX_SAFE_INTEGER;
        const bSlot = b.slot >= 0 ? b.slot : Number.MAX_SAFE_INTEGER;
        if (aSlot !== bSlot) return aSlot - bSlot;
        return a.order - b.order;
    });

    const seen = new Set();
    const links = [];
    for (const link of withOrder) {
        if (seen.has(link.name)) {
            throw new Error(`[WrShaderBuilder] duplicate link.name "${link.name}"`);
        }
        seen.add(link.name);
        links.push({
            name: link.name,
            fieldName: `wr_link_${link.name}`,
            wgslType: link.wgslType,
            glslType: link.glslType,
            defaultWgsl: link.defaultWgsl ?? wrDefaultLiteralWgsl(link.wgslType),
            defaultGlsl: link.defaultGlsl ?? wrDefaultLiteralGlsl(link.glslType),
        });
    }
    return links;
}

function wrBuildLinkKeyMap(links) {
    const wgsl = {};
    const glsl = {};
    for (let i = 0; i < links.length && i < WR_LINK_KEY_CAP; i++) {
        const key = `$LINK${i}$`;
        const replacement = { vertex: links[i].name, fragment: links[i].name };
        wgsl[key] = replacement;
        glsl[key] = replacement;
    }
    return { wgsl, glsl };
}

function wrStageMain(stage, language, shaderDesc, defaultSource) {
    const byStage = shaderDesc?.[stage] ?? {};
    const camel = `${language}Main`;
    const upper = `${language.toUpperCase()}Main`;
    const stageValue = byStage[camel] ?? byStage[upper] ?? null;
    if (typeof stageValue === "string" && stageValue.trim().length > 0) return stageValue;

    const root = shaderDesc?.[`${stage}Main`] ?? null;
    if (typeof root === "string" && root.trim().length > 0) return root;
    if (root && typeof root === "object") {
        const value = root[language] ?? root[language.toUpperCase()] ?? null;
        if (typeof value === "string" && value.trim().length > 0) return value;
    }
    return defaultSource;
}

export function wrIsTemplateShaderDefinition(shaderDesc) {
    const mode = String(shaderDesc?.mode ?? "").toLowerCase();
    if (mode === "template") return true;
    if (typeof shaderDesc?.vertexMain === "string" || typeof shaderDesc?.fragmentMain === "string") return true;
    if (shaderDesc?.vertexMain && typeof shaderDesc.vertexMain === "object") return true;
    if (shaderDesc?.fragmentMain && typeof shaderDesc.fragmentMain === "object") return true;
    if (typeof shaderDesc?.vertex?.wgslMain === "string" || typeof shaderDesc?.vertex?.glslMain === "string") return true;
    if (typeof shaderDesc?.fragment?.wgslMain === "string" || typeof shaderDesc?.fragment?.glslMain === "string") return true;
    if (typeof shaderDesc?.vertex?.WGSLMain === "string" || typeof shaderDesc?.vertex?.GLSLMain === "string") return true;
    if (typeof shaderDesc?.fragment?.WGSLMain === "string" || typeof shaderDesc?.fragment?.GLSLMain === "string") return true;
    return false;
}

export function wrBuildTemplateShaderDefinition(shaderDesc = {}) {
    const vertexMainWgsl = wrStageMain(
        "vertex",
        "wgsl",
        shaderDesc,
        "output.position = sceneUBO.viewProj * objectUBO.model * vec4f($POSITION$, 1.0);"
    );
    const vertexMainGlsl = wrStageMain(
        "vertex",
        "glsl",
        shaderDesc,
        "gl_Position = u_viewProj * u_model * vec4($POSITION$, 1.0);"
    );
    const fragmentMainWgsl = wrStageMain(
        "fragment",
        "wgsl",
        shaderDesc,
        "$OUT_COLOR$ = textureSample($ALBEDO_TEX$, texSampler, $UV$) * $ALBEDO_COLOR$;"
    );
    const fragmentMainGlsl = wrStageMain(
        "fragment",
        "glsl",
        shaderDesc,
        "$OUT_COLOR$ = texture($ALBEDO_TEX$, $UV$) * $ALBEDO_COLOR$;"
    );

    const links = wrCollectLinks(shaderDesc);
    const linkWgslFields = links
        .map((link, index) => `    @location(${index + 1}) ${link.fieldName}: ${link.wgslType},`)
        .join("\n");
    const linkWgslInit = links
        .map((link) => `    var ${link.name}: ${link.wgslType} = ${link.defaultWgsl};`)
        .join("\n");
    const linkWgslWriteback = links
        .map((link) => `    output.${link.fieldName} = ${link.name};`)
        .join("\n");
    const linkWgslFragmentRead = links
        .map((link) => `    var ${link.name}: ${link.wgslType} = input.${link.fieldName};`)
        .join("\n");

    const linkGlslVertexDecl = links
        .map((link) => `out ${link.glslType} ${link.fieldName};`)
        .join("\n");
    const linkGlslFragmentDecl = links
        .map((link) => `in ${link.glslType} ${link.fieldName};`)
        .join("\n");
    const linkGlslInit = links
        .map((link) => `    ${link.glslType} ${link.name} = ${link.defaultGlsl};`)
        .join("\n");
    const linkGlslWriteback = links
        .map((link) => `    ${link.fieldName} = ${link.name};`)
        .join("\n");
    const linkGlslFragmentRead = links
        .map((link) => `    ${link.glslType} ${link.name} = ${link.fieldName};`)
        .join("\n");

    const vertexWgsl = `
struct SceneUBO {
    viewProj: mat4x4f,
    cameraPos: vec4f,
}

struct ObjectUBO {
    model: mat4x4f,
    slot0: vec4f,
    albedoColor: vec4f,
    vtxFlags: vec4f,
    extras: vec4f,
    skinPalette: array<mat4x4f, 128>,
}

@group(0) @binding(0) var<uniform> sceneUBO: SceneUBO;
@group(1) @binding(0) var<uniform> objectUBO: ObjectUBO;

struct WrVertexIn {
    @location(0) position: vec3f,
    @location(1) normal: vec3f,
    @location(2) uv: vec2f,
    @location(3) boneID: vec4f,
    @location(4) boneWeight: vec4f,
    @location(5) morphPos: vec3f,
}

struct WrVertexOut {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
${linkWgslFields}
}

@vertex
fn wr_vs_main(input: WrVertexIn) -> WrVertexOut {
    var output: WrVertexOut;
    let wr_position = input.position;
    let wr_normal = input.normal;
    let wr_uv = input.uv;
    let wr_tangent = vec4f(1.0, 0.0, 0.0, 1.0);
    let wr_boneID = input.boneID;
    let wr_boneWeight = input.boneWeight;
    let wr_morphPos = input.morphPos;

    output.uv = wr_uv;
${linkWgslInit}
    output.position = sceneUBO.viewProj * objectUBO.model * vec4f(wr_position, 1.0);
${vertexMainWgsl}
${linkWgslWriteback}
    return output;
}
`;

    const fragmentWgsl = `
struct ObjectUBO {
    model: mat4x4f,
    slot0: vec4f,
    albedoColor: vec4f,
    vtxFlags: vec4f,
    extras: vec4f,
    skinPalette: array<mat4x4f, 128>,
}

@group(1) @binding(0) var<uniform> objectUBO: ObjectUBO;
@group(1) @binding(1) var texSampler: sampler;
@group(1) @binding(2) var albedoTex: texture_2d<f32>;

struct WrVertexOut {
    @builtin(position) position: vec4f,
    @location(0) uv: vec2f,
${linkWgslFields}
}

@fragment
fn wr_fs_main(input: WrVertexOut) -> @location(0) vec4f {
    let wr_uv = input.uv;
${linkWgslFragmentRead}
    var outputColor = textureSample(albedoTex, texSampler, wr_uv) * objectUBO.albedoColor;
${fragmentMainWgsl}
    return outputColor;
}
`;

    const vertexGlsl = `#version 300 es
precision highp float;

layout(location=0) in vec3 a_position;
layout(location=1) in vec3 a_normal;
layout(location=2) in vec2 a_uv;
layout(location=3) in vec4 a_boneID;
layout(location=4) in vec4 a_boneWeight;
layout(location=5) in vec3 a_morphPos;

uniform mat4 u_viewProj;
uniform mat4 u_model;
uniform vec4 u_slot0;
uniform vec4 u_albedoColor;
uniform vec4 u_vtxFlags;
uniform vec4 u_extras;
uniform mat4 u_skinPalette[128];

out vec2 v_uv;
${linkGlslVertexDecl}

void main() {
    vec3 wr_position = a_position;
    vec3 wr_normal = a_normal;
    vec2 wr_uv = a_uv;
    vec4 wr_tangent = vec4(1.0, 0.0, 0.0, 1.0);
    vec4 wr_boneID = a_boneID;
    vec4 wr_boneWeight = a_boneWeight;
    vec3 wr_morphPos = a_morphPos;

    v_uv = wr_uv;
${linkGlslInit}
    gl_Position = u_viewProj * u_model * vec4(wr_position, 1.0);
${vertexMainGlsl}
${linkGlslWriteback}
}
`;

    const fragmentGlsl = `#version 300 es
precision highp float;

in vec2 v_uv;
${linkGlslFragmentDecl}
layout(location=0) out vec4 fragColor;

uniform sampler2D u_albedoTex;
uniform vec4 u_albedoColor;
uniform vec4 u_vtxFlags;
uniform vec4 u_extras;
uniform mat4 u_skinPalette[128];

void main() {
    vec2 wr_uv = v_uv;
${linkGlslFragmentRead}
    vec4 outputColor = texture(u_albedoTex, wr_uv) * u_albedoColor;
${fragmentMainGlsl}
    fragColor = outputColor;
}
`;

    return {
        ...shaderDesc,
        mode: "template",
        links,
        linkage: links,
        linkKeyMap: wrBuildLinkKeyMap(links),
        vertex: {
            ...(shaderDesc.vertex ?? {}),
            wgsl: vertexWgsl,
            glsl: vertexGlsl,
        },
        fragment: {
            ...(shaderDesc.fragment ?? {}),
            wgsl: fragmentWgsl,
            glsl: fragmentGlsl,
        },
    };
}

export default wrBuildTemplateShaderDefinition;

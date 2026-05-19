function wrNumberOr(value, fallback = 0) {
    const n = Number(value);
    return Number.isFinite(n) ? n : fallback;
}

function wrClamp01(value, fallback = 0) {
    const n = wrNumberOr(value, fallback);
    if (n < 0) return 0;
    if (n > 1) return 1;
    return n;
}

function wrNormalizeDepthCompare(value) {
    const raw = String(value ?? "").trim().toLowerCase();
    if (raw === "never") return "never";
    if (raw === "less") return "less";
    if (raw === "equal") return "equal";
    if (raw === "lequal" || raw === "less-equal") return "less-equal";
    if (raw === "greater") return "greater";
    if (raw === "gequal" || raw === "greater-equal") return "greater-equal";
    if (raw === "not-equal" || raw === "notequal") return "not-equal";
    if (raw === "always") return "always";
    return "less";
}

function wrNormalizeCull(value) {
    const raw = String(value ?? "").trim().toLowerCase();
    if (raw === "front") return "front";
    if (raw === "none" || raw === "off" || raw === "disable" || raw === "disabled") return "none";
    return "back";
}

export const WR_DEFAULT_RENDER_CFG = Object.freeze({
    clearColor: Object.freeze([0, 0, 0, 0]),
    clearColorEnabled: true,
    clearDepth: 1,
    clearDepthEnabled: true,
    depthTest: true,
    depthWrite: true,
    depthCompare: "less",
    cull: "back",
    blend: false,
});

export function wrNormalizeClearColor(value, fallback = WR_DEFAULT_RENDER_CFG.clearColor) {
    const src = (ArrayBuffer.isView(value) || Array.isArray(value)) ? value : fallback;
    return [
        wrClamp01(src?.[0], fallback[0]),
        wrClamp01(src?.[1], fallback[1]),
        wrClamp01(src?.[2], fallback[2]),
        wrClamp01(src?.[3], fallback[3]),
    ];
}

export function wrNormalizeRenderCfg(renderCfg = null) {
    const src = (renderCfg && typeof renderCfg === "object") ? renderCfg : {};
    const clearColorEnabled = src.clearColor !== false;
    const clearDepthEnabled = src.clearDepth !== false;
    const clearColor = wrNormalizeClearColor(
        clearColorEnabled ? src.clearColor : null,
        WR_DEFAULT_RENDER_CFG.clearColor
    );
    const clearDepth = clearDepthEnabled
        ? wrClamp01(src.clearDepth, WR_DEFAULT_RENDER_CFG.clearDepth)
        : WR_DEFAULT_RENDER_CFG.clearDepth;
    const depthWriteSource = src.depthWrite ?? src.write;

    return {
        clearColor,
        clearColorEnabled,
        clearDepth,
        clearDepthEnabled,
        depthTest: src.depthTest == null ? WR_DEFAULT_RENDER_CFG.depthTest : !!src.depthTest,
        depthWrite: depthWriteSource == null ? WR_DEFAULT_RENDER_CFG.depthWrite : !!depthWriteSource,
        depthCompare: wrNormalizeDepthCompare(src.depthCompare ?? WR_DEFAULT_RENDER_CFG.depthCompare),
        cull: wrNormalizeCull(src.cull),
        blend: src.blend == null ? WR_DEFAULT_RENDER_CFG.blend : !!src.blend,
    };
}

export function wrRenderCfgKey(renderCfg = null) {
    const cfg = wrNormalizeRenderCfg(renderCfg);
    const clearColor = cfg.clearColor.map((n) => Number(n).toFixed(6)).join(",");
    return [
        `cc:${cfg.clearColorEnabled ? "1" : "0"}`,
        `cv:${clearColor}`,
        `cd:${cfg.clearDepthEnabled ? "1" : "0"}`,
        `dv:${Number(cfg.clearDepth).toFixed(6)}`,
        `dt:${cfg.depthTest ? "1" : "0"}`,
        `dw:${cfg.depthWrite ? "1" : "0"}`,
        `dc:${cfg.depthCompare}`,
        `cu:${cfg.cull}`,
        `bl:${cfg.blend ? "1" : "0"}`,
    ].join("|");
}

export default wrNormalizeRenderCfg;

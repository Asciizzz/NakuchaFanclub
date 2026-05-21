# WR1 Shader Flow Reference

## Scope

This document explains how WrShader works in WeebRender1 today:

- how shader definitions are registered
- how template mode expands into final WGSL/GLSL sources
- how key replacement is validated and resolved
- how `renderCfg` is normalized and baked into backend state
- how both backends consume the shader at runtime

Primary source files:

- `resources/js/WeebRender1/Core/World.js`
- `resources/js/WeebRender1/Core/ShaderBuilder.js`
- `resources/js/WeebRender1/Core/ShaderTemplate.js`
- `resources/js/WeebRender1/Core/ShaderAbi.js`
- `resources/js/WeebRender1/Core/RenderConfig.js`
- `resources/js/WeebRender1/Core/RenderQueue.js`
- `resources/js/WeebRender1/Backends/WGPUBackend.js`
- `resources/js/WeebRender1/Backends/WGLBackend.js`

## 1) Registration Entry and Data Path

Entry point is `WrWorld.registerShader(shaderId, shaderDesc, renderCfgInput)` in `Core/World.js`.

Registration pipeline:

1. Normalize `shaderId`
2. Detect mode:
   - template mode: `wrIsTemplateShaderDefinition(shaderDesc) === true`
   - direct mode: regular full shader sources already provided
3. Build template source if needed via `wrBuildTemplateShaderDefinition`
4. Validate via `wrValidateShaderDefinition`
5. Normalize `renderCfg` via `wrNormalizeRenderCfg`
6. Build key maps:
   - default map from template/non-template mode
   - merge `sourceDesc.linkKeyMap` (auto from links)
   - merge `shaderDesc.keyMap` (user override wins last)
7. Resolve final source strings using `wrReplaceTemplateKeys` for:
   - `vertex.wgsl`
   - `vertex.glsl`
   - `fragment.wgsl`
   - `fragment.glsl`
8. Store shader asset in `assets.addShader(...)`
9. If this is first shader, set `defaultShaderId` and `defaultRenderCfg`

Stored shader object includes:

- `id`
- `vertex` and `fragment` source blocks
- `vertexAbiVersion`
- `vertexLayout`
- `resolved` dual-language final strings
- `keyMap`
- `renderCfg`

## 2) Two Authoring Modes

### A. Direct mode

You provide full `vertex.wgsl/glsl` and `fragment.wgsl/glsl` yourself.
WR still validates ABI/entry requirements and still applies key replacement.

### B. Template mode

You provide `vertexMain` and `fragmentMain` snippets, and WR builds full wrappers.
Trigger conditions:

- `mode: "template"`
- or any of `vertexMain`, `fragmentMain`
- or any of `vertex.wgslMain`, `vertex.glslMain`, `fragment.wgslMain`, `fragment.glslMain`

Template mode gives fixed wrapper contracts:

- fixed vertex inputs (position/normal/uv/bone/morph)
- fixed UBO/uniform names and bindings
- fixed entry points (`wr_vs_main`, `wr_fs_main`)
- fixed fragment output slot contract

## 3) Template Keys and Stage Rules

`Core/ShaderTemplate.js` defines a fixed key set (`$POSITION$`, `$UV$`, `$INST_MODEL$`, `$ALBEDO_TEX$`, `$OUT_COLOR$`, `$LINK0$`..`$LINK7$`, etc)

Validation rules:

- only known keys are allowed
- keys are stage-restricted (vertex list vs fragment list)
- missing replacement for any used key throws immediately
- stage-specific replacement objects are supported:
  - `{ vertex: "...", fragment: "...", default: "..." }`

Important behavior:

- replacement is strict and explicit
- unknown token or missing token mapping is a hard error at registration time

## 4) Link System in Template Builder

`Core/ShaderBuilder.js` supports user link declarations through:

- `link`
- `links[]`
- `linkage[]`

Each link is normalized into:

- `name`
- `wgslType`
- `glslType`
- default literal value per language
- generated field name (`wr_link_<name>`)

Builder then injects link IO automatically:

- WGSL:
  - adds extra `@location(...)` fields in vertex output struct
  - allocates local link variables in vertex main
  - writes to output link fields
  - reads link fields in fragment main
- GLSL:
  - emits `out` vars in vertex stage
  - emits `in` vars in fragment stage
  - performs matching write/read glue

Compatibility path:

- builder also creates `linkKeyMap` for `$LINK0$`..`$LINK7$`
- that map is merged during registration so legacy link key usage still resolves

## 5) ABI and Validation Guarantees

`Core/ShaderAbi.js` enforces shader contracts before backend compile.

Dual-source requirements:

- `vertex.wgsl` required
- `vertex.glsl` required
- `fragment.wgsl` required
- `fragment.glsl` required

Entrypoint requirements:

- WGSL vertex must contain `fn wr_vs_main(...)`
- WGSL fragment must contain `fn wr_fs_main(...)`
- GLSL stages must both contain `void main()`

WGSL IO contract checks:

- vertex side must include `@builtin(position)` in its output path
- fragment side must include `@location(0)` on color output path

Vertex ABI:

- `WR_VERTEX_ABI_VERSION` must match expected version
- `vertexLayout` is normalized and validated:
  - positive stride
  - valid format set
  - unique semantics
  - unique locations
  - offset + format-size must fit in stride

Default WR1 layout v1:

- stride: `76`
- attributes:
  - `position` loc `0` format `float32x3` offset `0`
  - `normal` loc `1` format `float32x3` offset `12`
  - `uv` loc `2` format `float32x2` offset `24`
  - `boneID` loc `3` format `float32x4` offset `32`
  - `boneWeight` loc `4` format `float32x4` offset `48`
  - `morphPos` loc `5` format `float32x3` offset `64`

This validation is the main protection against data size/offset/layout mismatch.

## 6) Fixed Resource Layout Contract

Beyond vertex layout, template shaders in WR1 assume fixed resource slots.

WGSL wrapper contract:

- `@group(0) @binding(0)` scene UBO
- `@group(1) @binding(0)` object UBO
- `@group(1) @binding(1)` sampler
- `@group(1) @binding(2)` albedo texture

WGPU backend enforces this with explicit shared bind group layouts and one shared pipeline layout.
That means custom WGSL that changes groups/bindings is incompatible with WR1 backend expectations.

Uniform block byte expectations used by WGPU backend:

- scene UBO: `80` bytes
  - `viewProj`: 64 bytes
  - `cameraPos`: 16 bytes
- object UBO: `8320` bytes
  - `model`: 64 bytes
  - `slot0`: 16 bytes
  - `albedoColor`: 16 bytes
  - `vtxFlags`: 16 bytes
  - `extras`: 16 bytes
  - `skinPalette[128]`: 8192 bytes

Link IO location policy in template wrappers:

- `@location(0)` is reserved for UV in vertex output/fragment input path
- link fields start from `@location(1)` upward in declaration order

This fixed mapping is why link additions stay deterministic across both languages.

## 7) `renderCfg` Bake Model

`Core/RenderConfig.js` normalizes all render state fields into one canonical object:

- clear: `clearColor`, `clearColorEnabled`, `clearDepth`, `clearDepthEnabled`
- depth: `depthTest`, `depthWrite`, `depthCompare`
- raster: `cull`
- blend: `blend`

It also builds stable cache key string via `wrRenderCfgKey`.

Registration precedence for render config is:

- explicit `renderCfgInput` argument to `registerShader`
- else `shaderDesc.renderCfg`
- else `sourceDesc.renderCfg` (template-expanded desc)
- else normalized default config

Reason this model exists:

- WebGPU render state is pipeline-baked
- WebGL can toggle state dynamically
- WR1 forces both to use one normalized state object per shader/draw path so behavior stays aligned

## 8) Runtime Consumption Path

### Queue build

`Core/RenderQueue.js`:

- picks shader from mesh renderer (`shaderKeys[0]`) with world default fallback
- fetches `shaderAsset`
- takes `shaderAsset.renderCfg` if present, else world default
- injects this into each draw packet (`draw.renderCfg`)

### WebGPU backend

`Backends/WGPUBackend.js`:

- compiles shader modules from `shaderAsset.resolved.vertex/fragment.wgsl`
- builds pipeline cache key:
  - `shaderId|canvasFormat|wrRenderCfgKey(cfg)`
- creates pipeline with:
  - fixed entry points `wr_vs_main`, `wr_fs_main`
  - vertex buffer layout from `shaderAsset.vertexLayout`
  - `primitive.cullMode = cfg.cull`
  - optional blending from `cfg.blend`
  - optional depth state using `cfg.depthTest/depthWrite/depthCompare`
- uses explicit shared pipeline layout and shared bind group layouts

Result:

- render state is truly baked per pipeline variant
- changing config means a different cached pipeline instance

### WebGL backend

`Backends/WGLBackend.js`:

- compiles program from `shaderAsset.resolved.vertex/fragment.glsl`
- binds fixed attribute locations matching WR vertex ABI
- before each draw, applies normalized state via `#applyRenderState(cfg)`:
  - depth enable/disable
  - depth mask + depth func
  - cull mode
  - blend enable and factors
- uses `wrRenderCfgKey(cfg)` to skip redundant re-application

Result:

- not pipeline objects like WGPU, but same normalized state model and effective behavior

## 9) Practical Constraints in WR1 Shader Design

- Both WGSL and GLSL are mandatory
- Entry point names are fixed by contract
- Vertex layout must match expected ABI layout or registration/validation fails
- Template keys must be legal for stage and fully resolved
- Link fields are finite in compatibility map (`$LINK0$`..`$LINK7$`)
- Render state is shader/draw-config driven, not ad-hoc toggles from random render code

## 10) Detailed Flow Summary

```text
registerShader
  -> detect template vs direct mode
  -> template mode: build full WGSL/GLSL wrappers + links
  -> validate dual-language + entrypoints + WGSL IO + ABI layout
  -> normalize renderCfg
  -> compose keyMap (default + auto link + user override)
  -> replace keys into vertex/fragment WGSL+GLSL
  -> store final shader asset

render
  -> queue picks shader + shader renderCfg
  -> backend compiles/uses resolved source
  -> WGPU: pipeline cached by shaderId+format+renderCfgKey
  -> WGL: GL state applied from same normalized renderCfg
```

## 11) Short Summary

WR1 shader system is a strict dual-language contract with deterministic preprocessing:

- author either full sources or template snippets
- WR builds/validates final WGSL+GLSL with fixed ABI and entry contracts
- WR resolves template keys and link IO glue before runtime
- WR stores shader with normalized baked `renderCfg`
- render queue picks shader and passes baked config to backend
- WGPU bakes it into pipeline variants, WGL applies equivalent GL state

This is why WR1 can keep WebGPU/WebGL behavior aligned even though pipeline/state models differ

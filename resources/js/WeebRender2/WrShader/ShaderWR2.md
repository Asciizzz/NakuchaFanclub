# WR2 Shader Structure

## Goal

Define a shader structure that is world-specialized but backend-aligned

- no raw backend shader creation API exposed to user code
- user still writes shader logic (`methods` + `main`) by hand
- vertex input layout and material input contract stay fixed
- vertex-fragment transfer is explicit through links
- `renderCfg` is baked at shader/pipeline level for both backends

## Core Rule

`WrShader` is the owner of shader registration and backend-ready variant creation

- user provides structured shader descriptor
- `WrShader` validates, resolves, and stores backend-ready source
- backend decides how to compile/apply result

User code does not call raw WGPU/WGL2 shader creation directly

## Backend vs WrShader Boundary

Important distinction:

- `AzWBackend` backends are agnostic and independent
- `WrShader` backends are parity-constrained by WR2 rules

`AzWBackend` is free to expose backend-native capabilities:

- WGPU can support compute pipelines
- WGL2 can mutate many states at runtime
- WGPU uses shader module + pipeline objects
- WGL2 uses program-centric flow

`WrShader` does not mirror all backend-native freedom.
`WrShader` enforces one shared render subset so WR2 shader behavior is portable.

## WrShader Parity Restrictions

Within `WrShader`:

- no compute shader support
- render-only shader path (vertex + fragment)
- render state is baked from `renderCfg`
- no per-draw runtime enable/disable state mutation from `WrShader` API

Reason:

- WGL2 has no compute
- WGPU state is largely pipeline-baked
- WR2 wants deterministic cross-backend behavior from one shader asset

So:

- WGPU `WrShader` path intentionally does not expose compute
- WGL2 `WrShader` path intentionally does not expose loose runtime state toggles

## Folder Direction

Dedicated folder:

```text
WeebRender2/
  WrShader/
    WrShader.js
    ShaderTypes.js
    ShaderBuilder.js
    ShaderTemplateKeys.js
```

Exact file names can change, but shader responsibilities stay in `WrShader/`

## Descriptor Shape v2

New authoring shape is language-first

```js
{
  id: "wr-default",
  renderCfg: {
    topology: "triangle-list",
    frontFace: "ccw",
    depthTest: true,
    depthWrite: true,
    cull: "back",
    blend: false,
  },

  wgsl: {
    link: [
      { name: "out_uv", type: "vec2f" },
      { name: "out_normal", type: "vec3f" },
    ],
    vertex: {
      methods: [
        `fn apply_morph(p: vec3f, m: vec3f, w: f32) -> vec3f { return p + m * w; }`,
      ],
      main: `
        out_uv = $UV$;
        out_normal = $NORMAL$;
        var localPos = apply_morph($POSITION$, $MORPH_POS$, $MORPH_WEIGHT$);
        output.position = $VIEW$ * $INST_MODEL$ * vec4f(localPos, 1.0);
      `,
    },
    fragment: {
      methods: [],
      main: `
        $OUT_COLOR$ = textureSample($ALBEDO_TEX$, texSampler, out_uv) * $ALBEDO_COLOR$;
      `,
    },
  },

  glsl: {
    link: [
      { name: "out_uv", type: "vec2" },
      { name: "out_normal", type: "vec3" },
    ],
    vertex: {
      methods: [
        `vec3 apply_morph(vec3 p, vec3 m, float w) { return p + m * w; }`,
      ],
      main: `
        out_uv = $UV$;
        out_normal = $NORMAL$;
        vec3 localPos = apply_morph($POSITION$, $MORPH_POS$, $MORPH_WEIGHT$);
        gl_Position = $VIEW$ * $INST_MODEL$ * vec4(localPos, 1.0);
      `,
    },
    fragment: {
      methods: [],
      main: `
        $OUT_COLOR$ = texture($ALBEDO_TEX$, out_uv) * $ALBEDO_COLOR$;
      `,
    },
  },
}
```

Supported convenience input:

- `link` can be object or array
- internal normalization converts to ordered array

## Link Policy

Links are the only vertex-fragment data bridge

- no implicit fragment UV fallback
- no special case where `$UV$` in fragment auto works
- if fragment needs UV, user must link it

Example:

- vertex: `out_uv = $UV$`
- fragment: `texture(..., out_uv)`

This keeps behavior consistent and explicit across WGSL and GLSL

## Fixed Contracts

### Vertex layout

Still fixed by WR world shader ABI contract

- position
- normal
- uv
- bone ids
- bone weights
- morph position

Offsets/locations/stride are fixed and validated by shader registration

### Material/runtime inputs

Still fixed contract

- albedo texture and sampler
- albedo color
- view matrix/projection combo
- model matrix
- skin palette data
- vertex flags and extras slots

Keys remain template-based

- `$POSITION$`, `$NORMAL$`, `$UV$`, `$MORPH_POS$`, `$MORPH_WEIGHT$`
- `$BONE_ID$`, `$BONE_WEIGHT$`, `$SKIN_PALETTE$`
- `$VIEW$`, `$INST_MODEL$`
- `$ALBEDO_TEX$`, `$ALBEDO_COLOR$`, `$OUT_COLOR$`

## Build Pipeline

`WrShader.register(desc)` flow:

1. Normalize descriptor shape
2. Validate required fields:
   - `wgsl.vertex.main`
   - `wgsl.fragment.main`
   - `glsl.vertex.main`
   - `glsl.fragment.main`
3. Normalize and validate links per language
4. Build full stage wrappers from:
   - fixed input/output/uniform declarations
   - user `methods[]`
   - user `main`
5. Resolve template keys
6. Validate ABI/layout contract
7. Normalize and bake `renderCfg`
8. Store shader asset with resolved WGSL/GLSL variants

## Backend Handling

### WebGPU

- compile resolved WGSL
- build render pipeline from `renderCfg` + fixed layout + stage entry points
- pipeline key includes shader id + render target + `renderCfg` key
- baked fields include primitive/depth/blend/multisample/target formats

### WebGL2

- compile resolved GLSL
- build program variant metadata from same `renderCfg`
- apply equivalent state at bind/use time from baked config only
- cache applied config key to avoid redundant state calls

Even though mechanism differs, both follow one baked config source

## WrShader State Model

`renderCfg` is the single WR2 state source and maps to both backends:

- cull mode / front face
- blend on/off and blend factors
- depth test on/off
- depth write on/off
- depth compare
- color write mask

Pass-time values are not shader-owned:

- clear color/depth
- load/store ops
- attachment views

Those belong to backend pass begin, not shader registration.

Recommended split:

- `renderCfg` in `WrShader`: pipeline/program state only
- pass/frame options in world render flow: clear/load/store/attachments

## Why This Structure

Benefits:

- explicit linkage avoids hidden IO assumptions
- deterministic contract for both languages
- template keys stay powerful but controlled
- shader state is reproducible and cacheable
- world-specialized shader design is clearer than raw backend APIs

Tradeoff:

- slightly more verbose shader authoring
- but significantly fewer mismatch/debug edge cases

## Summary

WR2 shader design should move to:

- dedicated `WrShader/` module ownership
- language-first descriptor (`wgsl/glsl`) with:
  - `link`
  - `vertex.methods`, `vertex.main`
  - `fragment.methods`, `fragment.main`
- explicit link-driven vertex-fragment data flow
- fixed ABI/material contracts
- baked `renderCfg` shared by WGPU and WGL2 behavior

# WrMesh (WR2)

## Goal

`WrMesh` is WR2-specific and render-ready.
It is not agnostic like old AzMesh idea.

`WrMesh` knows fixed vertex channels used by WR2:

- Position
- Normal
- UV
- Tangent (`w` = handedness)
- Color
- BoneId
- BoneWeight

Optional channels are controlled by flags.

## Flags

Suggested bit flags:

- `WrMesh.Flags.Normal`
- `WrMesh.Flags.UV`
- `WrMesh.Flags.Tangent`
- `WrMesh.Flags.Color`
- `WrMesh.Flags.Bone`
- `WrMesh.Flags.MorphPos`
- `WrMesh.Flags.MorphNormal`
- `WrMesh.Flags.MorphTangent`

Rules:

- Position is always present
- `kBone` means both `BoneId` and `BoneWeight` are present
- Morph flags only mean morph deltas exist, they do not force any runtime behavior

## Data Shape Suggestion

`WrMesh` CPU-side shape:

```js
{
  id,
  flags,
  vertexCount,
  indexType, // "u16" | "u32"
  vertices: {
    position: Float32Array,
    normal: Float32Array | null,
    uv: Float32Array | null,
    tangent: Float32Array | null,
    color: Float32Array | null,
    boneId: Uint16Array | Uint8Array | null,
    boneWeight: Float32Array | null,
  },
  primitives: [
    {
      firstIndex,
      indexCount,
      baseVertex,
      material,
      morphBase,
      morphCount,
    }
  ],
  indices: Uint16Array | Uint32Array,
  morphDeltas: {
    position: Float32Array | null,
    normal: Float32Array | null,
    tangent: Float32Array | null,
  }
}
```

## Morph Organization

Target: mesh-level flat arrays, but primitive-owned data.

Suggested compromise:

- Keep one flat morph array per semantic (`position`, `normal`, `tangent`)
- Store primitive-local mapping via `morphBase` + `morphCount`
- Each primitive owns its morph target range by index window, not by nested object graphs

This keeps runtime packing simple and avoids per-primitive scattered allocations.

## Build and Runtime Flow

1. Loader/importer builds `WrMesh` CPU data with flags
2. Validation checks channel presence against flags
3. `WrMeshStore.add(mesh)` packs or normalizes arrays if needed
4. Backend-specific upload is done by WR2 store/runtime path
5. Draw uses primitive ranges (`firstIndex`, `indexCount`, `baseVertex`)
6. Morph runtime resolves deltas from flat arrays via primitive mapping

## Implemented API

`WrMesh` currently provides:

- `configure(options)`
- `hasFlag(flag)`
- `enableFlags(flags)`
- `disableFlags(flags)`
- `setVertices(vertices, vertexCount?)`
- `setIndices(indices, indexType?)`
- `setPrimitives(primitives)`
- `setMorphDeltas(morphDeltas)`
- `validate()`

## Backend Notes

`WrMesh` is one logical asset.
GPU resources are backend realization details.

- WGPU path can use separate or packed buffers as needed
- WGL2 path can use separate buffers/VAO metadata as needed

`WrMesh` does not own backend objects directly.
Store/runtime owns upload and lifecycle.

## What Stays Out of WrMesh

`WrMesh` should not include:

- world/node references
- shader creation logic
- skin runtime objects
- draw queue state

Those belong to `WrWorld`, `WrShader`, and runtime render systems.

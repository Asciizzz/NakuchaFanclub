# Compute Grass Field (WGPU) - Design Readme

## Scope
This test targets WebGPU only through AzWBackend/AzWGPU
No WebGL path
No world/scene framework dependency required

## Class Encapsulation
Use one class `GrassField`
- Backend is external and injected in constructor
- Frame/pass lifecycle is external and passed in by caller
- Pipelines, bind groups, buffers, and draw logic are internal
- The class can render inside an existing frame with other objects

Target shape
- `new GrassField({ backend, texture, fieldCfg, terrainCfg })`
- `update({ dt, time, wind })`
- `render({ pass, camera, renderCfg })`
- `renderTerrain({ pass, camera, renderCfg })`
- `setHeight(...)` / `setHeightRegion(...)` for dynamic terrain edits

This keeps integration simple while still supporting mixed scenes

## Concrete API Contract

### Class
`class GrassField`

### Constructor
`new GrassField(options)`

Required options
- `backend` AzWBackend WGPU backend instance
- `texture` grass albedo texture source or ready GPU texture handle
- `field` field config object
- `terrain` terrain config object

Suggested `field` config
- `countX` number of grass samples on x
- `countZ` number of grass samples on z
- `spacing` world spacing between grass roots
- `model` mat4 field transform
- `seed` deterministic random seed

Suggested `terrain` config
- `gridX` terrain vertex count x
- `gridZ` terrain vertex count z
- `cellSize` terrain grid spacing
- `heightScale` displacement scale
- `model` mat4 terrain transform

### Lifecycle Methods
- `async init()` create GPU resources, shaders, pipelines, bind groups
- `destroy()` release buffers, textures, samplers, pipelines owned by class

### Simulation Methods
- `update(params)` write frame uniforms only
- `encodeCompute(encoder, params)` encode compute passes into external command encoder

`params` fields
- `time` seconds
- `dt` seconds
- `windDir` vec2 or vec3
- `windStrength` float
- `gust` float

### Terrain Edit Methods
- `setHeight(x, z, h)` edit one height sample
- `setHeightRegion(rect, mode)` edit region
- `uploadHeightChanges(queue)` push modified height data to GPU

Terrain edits must trigger
- normal recompute dispatch
- optional grass base normal refresh dispatch

### Render Methods
- `renderTerrain(pass, params)` draw terrain in existing render pass
- `renderGrass(pass, params)` draw grass in existing render pass
- `render(pass, params)` optional convenience wrapper calling both

`params` fields
- `cameraView` mat4
- `cameraProj` mat4
- `cameraPos` vec3
- `renderCfg` optional overrides like blend/cull/depth settings when supported by owner

### External Integration Pattern
Caller owns frame/pass
1. Begin frame externally
2. Call `grassField.encodeCompute(encoder, frameParams)`
3. Begin render pass externally
4. Call `grassField.renderTerrain(pass, renderParams)`
5. Call `grassField.renderGrass(pass, renderParams)`
6. Render other systems before/after as needed
7. End pass and submit externally

## Goal
Render a large grass field using instanced billboard grass cards
Animate sway in compute shader by updating per-instance dynamic state directly on GPU
Keep CPU work minimal after initialization

## Visual Primitive
Each grass instance uses 2 intersecting quads (a plus shape)
- 8 vertices total per grass (4 vertices per quad)
- Shared index pattern per quad
- Both quads are vertical cards crossing around the local up axis

The texture is `grass.png` with alpha

## Field Transform Model
There is one uniform model matrix for the whole field
- Defines field world placement/orientation/scale
- Instance positions are local-to-field values (x,y,z)
- Final world position = field model * local instance position

This keeps field relocation cheap because all grass follows one transform

## Instance Data Philosophy
Instance data is not a full model matrix
Instance buffer stores compact construction/state data, for example
- static: local x,y,z, width scale, height scale, base yaw, phase seed, stiffness, bend limit
- dynamic: current bend angle or bend vector, angular velocity, optional turbulence accumulator
- terrain driven: sampled base normal or tilt basis derived from terrain map

Static values are mostly immutable
Dynamic values are updated in compute and written back into the same storage buffer

## GPU Data Layout Contract

### Frame Uniform
Single per-frame uniform struct
- `view` mat4
- `proj` mat4
- `viewProj` mat4
- `cameraPos` vec4
- `timeData` vec4 where `x=time`, `y=dt`
- `windData` vec4 where `xyz=dir`, `w=strength`
- `gustData` vec4

### Field Uniform
- `fieldModel` mat4
- `terrainModel` mat4
- `counts` vec4 (`countX`, `countZ`, `gridX`, `gridZ`)
- `scales` vec4 (`spacing`, `cellSize`, `heightScale`, reserved)

### Grass Instance Storage
Use WGSL-friendly 16-byte aligned fields
- `basePos_scaleW` vec4 (`x`,`y`,`z`,`scaleW`)
- `scaleH_seed_phase` vec4 (`scaleH`,`seed`,`phase`,`stiffness`)
- `state0` vec4 (`bendX`,`bendZ`,`angularVel`,`bendLimit`)
- `state1` vec4 (`yaw`,`yawVel`,`turbulence`,`reserved`)
- `terrainBasis0` vec4 (optional cached tangent)
- `terrainBasis1` vec4 (optional cached normal)

### Terrain Storage
- height map texture or storage buffer
- normal map texture or storage buffer
- optional tangent/binormal buffer if terrain shading requires it

## Bind Group Contract

Use stable groups for all pipelines
- `group(0)` frame uniform + common sampler state
- `group(1)` field uniform + terrain resources
- `group(2)` grass instance storage buffers
- `group(3)` material textures for grass/terrain

Compute and render pipelines should keep compatible group ordering to reduce rebinding cost

## Pipeline Contract

Internal pipelines owned by `GrassField`
- `cp_grass_state` compute: update sway state per instance
- `cp_terrain_normal` compute: rebuild terrain normals after height edits
- `cp_grass_terrain_align` compute optional: refresh per-instance terrain basis
- `rp_terrain` render: draw terrain from dynamic height/normal data
- `rp_grass` render: draw instanced crossed-billboards

Each pipeline may have multiple entry points in same module where convenient

## Why Compute
Without compute, CPU must update many instance values every frame and upload buffers repeatedly
With compute
- each grass instance updates itself in parallel
- only a small frame uniform is updated by CPU (time, dt, wind params)
- render pass reads already-updated instance state directly

This scales better as instance count rises

## Wind and Sway Math (Concept)
Treat each blade as a damped driven oscillator

Per instance
- natural frequency from seed/stiffness
- external force from wind sample
- damping to avoid endless jitter

Concept form
- acceleration = windForce - damping * velocity - spring * displacement
- velocity += acceleration * dt
- displacement += velocity * dt
- clamp displacement to bend limit

This gives continuous, organic sway and prevents unstable growth

## Wind Sampling
Wind should vary by space and time
Use instance local/world position plus time to sample a procedural field

Typical composition
- low-frequency directional wave for broad movement
- higher-frequency noise ripple for detail
- per-instance phase offset from seed to decorrelate nearby blades

Result is a target bend direction + amplitude per instance

## Terrain Pipeline (Bonus Requirement)
GrassField also owns a terrain render path
- Separate terrain shader entry point/pipeline
- Terrain height is dynamic and mutable
- Terrain normal must update when height changes

Two practical data paths
1. Height texture path
- Store height in a texture
- Terrain vertex stage samples displacement
- Normal comes from finite difference sampling of neighboring texels

2. Height buffer/grid path
- Store heights in storage buffer
- Compute updates both height and normal buffers
- Terrain vertex uses precomputed normal buffer

Either path is valid as long as grass base orientation reads updated normals

## Grass Orientation from Terrain
Grass root should align with terrain local normal, not just world up

Concept
1. Sample terrain normal at grass root xz
2. Build basis from that normal
3. Build crossed-card billboard in that basis
4. Apply sway on top of terrain-aligned basis

Result
- Grass follows slope
- Dynamic terrain edits naturally change grass standing direction

## Billboard Construction in Vertex Shader
For each instance
1. Start from card local vertex (quad coordinates)
2. Build two crossed card orientations around up axis (plus shape)
3. Apply width/height scaling
4. Apply bending transform (from dynamic state)
5. Offset by instance local position
6. Transform by field model matrix
7. Continue with camera view/projection

Important
- Bending should affect top more than bottom
- Use height factor (0 at root, 1 at tip) so root stays anchored

## Alpha and Visibility
Grass texture uses alpha cutout
Use alpha discard/clip threshold in fragment stage to remove transparent pixels

For a first pass
- keep depth test on
- culling may be disabled or tuned depending on card orientation artifacts

## Frame Flow
1. CPU writes frame uniform (time, dt, wind direction/strength, gust params)
2. Optional terrain compute updates height and normal resources
3. Grass compute dispatch updates per-instance dynamic sway state
4. Render terrain pipeline (same external pass)
5. Render grass pipeline (same external pass)

## Parallelism Benefit
If there are N blades
- CPU path does O(N) simulation + O(N) upload pressure
- compute path keeps O(N) simulation on GPU cores in parallel and near render data

The main CPU cost becomes command encoding and tiny uniform updates

## Render Coexistence
Because pass/frame is external
- caller can render sky/meshes/characters before or after GrassField
- GrassField only consumes the provided pass and issues its own draw calls
- no forced ownership of swapchain frame lifecycle

## Stability and Tuning Notes
- Clamp dt in shader-side logic assumptions to avoid blowups after frame spikes
- Keep damping > 0
- Clamp max bend angle/offset
- Prefer smooth gust transitions over hard jumps
- Random seeds should be deterministic for reproducible fields

## Suggested Incremental Milestones
1. Static field, no wind
2. Compute updates one scalar bend value
3. Add directional wind + per-instance phase
4. Add damping/spring oscillator
5. Add gust/noise layering
6. Stress test instance count and tune workgroup size

## Expected Result
A dense grass field where each blade sways with coherent wind flow plus local variation
Motion remains stable and natural while simulation cost stays GPU-bound and highly parallel

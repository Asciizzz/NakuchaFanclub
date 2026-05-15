# BzWGL

By Asciiz + future me who will probably forget why this existed

## Goal
Build a backend-agnostic-ish WebGL utility layer that mirrors the structure spirit of `AzWGPU`, but respects the actual WebGL rules and sharp corners

This is not a WebGPU emulator and not pretending to be one

## Why this exists
- We need a stable fallback path when WebGPU is missing, blocked, or annoying
- We want a shared rendering architecture that can feed ECS-style object rendering later
- We want wrappers that reduce repetitive GL boilerplate without hiding what GL is doing

## Scope
- Runtime setup for WebGL2 with WebGL1 fallback
- Shader/program creation and reflection helpers
- Buffers, textures, vertex arrays, framebuffers, render state wrappers
- Draw submission helpers, frame scope helper, simple draw batch runner
- Resource pool and timer utilities for profiling + allocation churn reduction

## Non-goals
- Full engine
- Scene graph
- Material graph wizardry
- Pretending WebGL has compute passes (it doesnt, and no amount of optimism will change that)

## Style and rules
- Keep `Bz` prefixes on classes and methods
- Keep JSDoc comments on public methods
- Fail fast with direct errors for bad inputs
- Favor explicit descriptor objects over deep magic
- Keep wrappers thin enough that raw GL is still visible and debuggable
- Prefer deterministic behavior over auto-correction
- Keep language human and slightly flawed, not polished corporate generated fog

## Architecture map

### BzContext
Owns context creation, resize/configure flow, loss/restored hooks, and runtime info

### BzExtensions
Handles extension discovery, caching, and required-extension checks

### BzLimits
Capability inspection and constraint validation for feature gates

### BzShader
Compiles shaders from descriptors, plus bulk cleanup

### BzProgram
Links programs and offers active uniform/attribute reflection

### BzBuffer
Creates and updates GL buffers with explicit target + usage control

### BzVertexArray
Abstracts VAO behavior across WebGL2 and OES fallback on WebGL1

### BzTexture
Texture creation/upload helpers for 2D and cube textures

### BzFramebuffer
Framebuffer helpers for attachments and status validation

### BzState
Common render state setup helpers (viewport, depth, blend, cull, flags)

### BzUniform
Uniform location cache and typed uniform uploads with light inference

### BzDraw
Draw call wrappers for arrays/elements and instanced paths

### BzFrame
Frame scope helper for begin/end style sequencing

### BzResourcePool
Reuse short-lived buffers/textures to reduce allocation churn

### BzBatch
Simple draw call list runner to keep ECS render submission clean

### BzTimer
GPU timer query support with CPU fallback when unsupported or disjoint

### BzFormat
Small defaults for texture and framebuffer descriptors

## ECS-facing guidance
- Treat draw submissions as plain data packets (`program`, `vao`, `uniforms`, `textures`, `draw`)
- Keep transform/material batching decisions outside BzWGL, this layer should execute not decide
- Use `BzBatch` to stage sorted draw calls and preserve deterministic ordering
- Use `BzLimits.require` once during boot to hard-fail unsupported render features
- Use `BzResourcePool` for per-frame transient allocations only, long-lived meshes/textures stay owned elsewhere

## Compatibility contract
- Runtime object shape should stay stable: `{ gl, canvas, version, isWebGL2, extensions, stateCache }`
- Public API must accept either runtime object or raw `WebGLRenderingContext` when practical
- WebGL2-first behavior is allowed, but every public feature should degrade or fail clearly on WebGL1

## Error handling contract
- Invalid inputs -> `TypeError`
- Compile/link/state capability failures -> `Error` with useful log context
- Missing extensions for required path -> `Error` with extension names included

## Future extension ideas
- MRT helpers for WebGL2 draw buffers
- Shader define macro compose utility
- Readback helpers for debug screenshots and picking
- Pipeline state object snapshot/replay helpers for ECS renderer cache layers

## Implementation checklist
- [x] Create `BzWGL.js` in `/resources/js/lib`
- [x] Provide top-of-file component index with method lists
- [x] Add JSDoc comments for public methods
- [x] Export `window.BzWGL` with all Bz classes
- [x] Keep wording human, imperfect, and occasionally dry

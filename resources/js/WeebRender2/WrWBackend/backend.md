# WrWBackend Philosophy

## Purpose

`WrWBackend` is backend infrastructure, not world/renderer domain logic

It must not know:

- world
- scene
- mesh
- material
- skeleton
- animation

It only knows GPU/device/context/resources/state/commands

## One Intent, Two Philosophies

WebGPU and webgl2 are intentionally different

- WebGPU is explicit and pipeline-oriented
- webgl2 is state-machine oriented and mutable at runtime

Trying to force both into identical method internals adds confusion

So the rule is:

- shared high-level intent
- backend-specific implementation details are allowed

## Allowed Backend-Specific APIs

Backend classes are allowed to expose exclusive methods if needed

Examples:

- `WGL2.applyRenderState(state)` style runtime toggles
- `WGPU.createRenderPipeline(...)` and `WGPU.createComputePipeline(...)`

This is valid because these are backend truths, not world truths

## Contract Boundary

`WrWorld` orchestrates traversal and decides what to draw

`WrWBackend` executes low-level render instructions

`WrShader` is responsible for mapping world shader abstractions into backend-specific shader/pipeline concepts

Backends should not be molded to world abstractions

## Current Structure

Single file backend module:

- `WrWBackend/WrWBackend.js`
  - `class Base`
  - `class WGPU extends Base`
  - `class WGL2 extends Base`
  - exported as `WrWBackend.Base`, `WrWBackend.WGPU`, `WrWBackend.WGL2`

This keeps usage ergonomic while preserving backend-specific freedom

## Design Guardrails

- Never add methods like `drawMesh`, `renderWorld`, `applySkeleton` to backends
- Keep backend inputs generic
- Keep world/domain translation outside of backends
- Prefer explicit handles and command-style render operations

export interface TransitionContext {
    readonly role: "entering" | "leaving";
    readonly other: Section;
    readonly progress: number; // 0.0 -> 1.0 linear normalized progress
    readonly duration: number; // ms
    readonly direction: 1 | -1; // +1 if moving right/forward, -1 if left/backward
}

export interface FrameContext {
    readonly time: number;
    readonly dt: number;
    readonly transition: TransitionContext | null; // null when IDLE
}

export interface Section {
    readonly id: string; // Unique Section ID, NOT domElement ID
    readonly domElement: HTMLElement | null;

    // 1. Instant Impulses (One-shot triggers at state boundaries)
    onEnterStart?(from: Section | null): void; // Triggered at p = 0 of entrance
    onEnterEnd?(from: Section | null): void;   // Triggered at p = 1 of entrance (settled)
    onLeaveStart?(to: Section): void;          // Triggered at p = 0 of departure
    onLeaveEnd?(to: Section): void;            // Triggered at p = 1 of departure (cleanup)

    // 2. Continuous Per-Frame Pipeline (Executed in strict order)
    // Phase 1: Logic, timelines, physics, skeletal armatures, writeBuffer
    onTick(ctx: FrameContext): void;

    // Phase 2: Layer 1 Back Canvas pass (background shaders, atmosphere)
    renderBack(pass: GPURenderPassEncoder, ctx: FrameContext): void;

    // Phase 3: Layer 3 Front Canvas pass (3D cutouts, front particles)
    renderFront?(pass: GPURenderPassEncoder, ctx: FrameContext): void;

    // Phase 4: Layer 2 DOM Middle Layer (transform, opacity)
    updateDom(ctx: FrameContext): void;
}

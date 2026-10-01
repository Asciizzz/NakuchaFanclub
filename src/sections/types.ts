import type { GPUManager } from "../core/gpu.js";

export interface TransitionContext {
    state: "IDLE" | "TRANSITIONING";
    from: Section | null;
    to: Section | null;
    duration: number;  // resolved window in ms
    elapsed: number;   // elapsed ms
    progress: number;  // 0.0 -> 1.0 linear normalized progress
    sharedContext: Record<string, unknown>;
}

export interface SectionRenderContext extends TransitionContext {
    time: number;
    dt: number;
    encoder: GPUCommandEncoder;
    gpu: GPUManager;
}

export interface Section {
    readonly id: string; // Section ID, NOT domElement ID.
    readonly name: string;
    readonly hasBottomBorder: boolean;
    readonly enterDuration: number;
    readonly domElement: HTMLElement | null;
    readonly gpu: GPUManager;

    getExitDurationFor?(target: Section): number | null;

    onEnter?(ctx: TransitionContext): void;
    onLeave?(ctx: TransitionContext): void;
    onTransitionTick?(ctx: TransitionContext): void;
    onEnterComplete?(ctx: TransitionContext): void;
    onLeaveComplete?(ctx: TransitionContext): void;

    // Direct render callback: section autonomously decides how to render to back and front canvases
    render(ctx: SectionRenderContext): void;
}

import { GPUManager } from "../../core/gpu.js";
import { Section, FrameContext } from "../types.js";
import { AnimeMVRenderer } from "./anime-mv.js";
import { GridPlatform } from "./grid-platform.js";
import {
    testBezierCurveTemp,
    sectionTransitionProgressTemp,
    testTransitionDistanceTemp,
} from "../../temp/index.js";

export class WelcomeSection implements Section {
    readonly id = "welcome";
    readonly domElement: HTMLElement | null;

    private _animeMV: AnimeMVRenderer;
    private _gridPlatform: GridPlatform;
    private _visualOffset = 0;
    private _visible = true;

    // Interactive mouse state with smooth spring-damping
    private _targetMouse: [number, number] = [0, 0];
    private _smoothMouse: [number, number] = [0, 0];
    private _mouseVel: [number, number] = [0, 0];

    constructor(gpu: GPUManager) {
        this.domElement = document.getElementById("welcome-view");
        this._animeMV = new AnimeMVRenderer(gpu);
        this._gridPlatform = new GridPlatform(gpu);

        window.addEventListener("pointermove", (e) => {
            const w = window.innerWidth || 1;
            const h = window.innerHeight || 1;
            this._targetMouse[0] = (e.clientX / w) * 2 - 1;
            this._targetMouse[1] = -((e.clientY / h) * 2 - 1);
        });
    }

    onEnterStart(_from: Section | null): void {
        this._visible = true;
        this._visualOffset = 0;
    }

    onEnterEnd(_from: Section | null): void {
        this._visible = true;
        this._visualOffset = 0;
    }

    onLeaveStart(_to: Section): void {}

    onLeaveEnd(_to: Section): void {
        this._visible = false;
        this._visualOffset = 0;
    }

    // Phase 1: Logic, timelines, and visual parameter simulation
    onTick(ctx: FrameContext): void {
        // Smoothly interpolate mouse coordinates and compute velocity
        const prevX = this._smoothMouse[0];
        const prevY = this._smoothMouse[1];
        const lerpFactor = Math.min(ctx.dt * 6.0, 1.0);
        this._smoothMouse[0] += (this._targetMouse[0] - this._smoothMouse[0]) * lerpFactor;
        this._smoothMouse[1] += (this._targetMouse[1] - this._smoothMouse[1]) * lerpFactor;
        this._mouseVel[0] = (this._smoothMouse[0] - prevX) / Math.max(0.001, ctx.dt);
        this._mouseVel[1] = (this._smoothMouse[1] - prevY) / Math.max(0.001, ctx.dt);

        if (!ctx.transition) {
            this._visualOffset = 0;
            this._visible = true;
            return;
        }

        const { role, progress, direction } = ctx.transition;
        const transT = sectionTransitionProgressTemp;
        const shiftDist = testTransitionDistanceTemp;
        const ease = testBezierCurveTemp(progress);

        if (role === "leaving") {
            if (progress >= transT) {
                this._visible = false;
                this._visualOffset = 0;
            } else {
                this._visible = true;
                this._visualOffset = direction * shiftDist * ease;
            }
        } else {
            if (progress < transT) {
                this._visible = false;
                this._visualOffset = 0;
            } else {
                this._visible = true;
                this._visualOffset = -direction * shiftDist * (1.0 - ease);
            }
        }
    }

    // Phase 2: Layer 1 Back Canvas Pass
    renderBack(pass: GPURenderPassEncoder, ctx: FrameContext): void {
        if (!this._visible) return;
        this._animeMV.render(
            ctx.time,
            this._visualOffset,
            this._smoothMouse,
            this._mouseVel,
            pass
        );
    }

    // Phase 3: Layer 3 Front Canvas Pass (Welcome MV Checkerboard Grid Framing)
    renderFront(pass: GPURenderPassEncoder, ctx: FrameContext): void {
        if (!this._visible) return;
        this._gridPlatform.render(ctx.time, ctx.dt, pass);
    }

    // Phase 4: Layer 2 DOM Middle Layer
    updateDom(ctx: FrameContext): void {
        if (!this.domElement) return;

        if (!ctx.transition) {
            this.domElement.classList.add("active");
            this.domElement.style.transform = "";
            return;
        }

        if (!this._visible) {
            this.domElement.classList.remove("active");
            this.domElement.style.transform = "";
        } else {
            this.domElement.classList.add("active");
            this.domElement.style.transform = `translateX(${this._visualOffset}px)`;
        }
    }
}

import { GPUManager } from "../../core/gpu.js";
import { Section, FrameContext } from "../types.js";
import {
    testBezierCurveTemp,
    sectionTransitionProgressTemp,
    testTransitionDistanceTemp,
} from "../../temp/index.js";

export class ScheduleSection implements Section {
    readonly id = "schedule";
    readonly domElement: HTMLElement | null;

    private _visualOffset = 0;
    private _visible = false;

    constructor(_gpu?: GPUManager) {
        this.domElement = document.getElementById("schedule-view");
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

    onTick(ctx: FrameContext): void {
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

    // Phase 2: Layer 1 Back Canvas pass (blank canvas, background remains clean chalk-white)
    renderBack(_pass: GPURenderPassEncoder, _ctx: FrameContext): void {}

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

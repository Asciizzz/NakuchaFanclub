import { GPUManager } from "../../core/gpu.js";
import { Section, SectionRenderContext, TransitionContext } from "../types.js";
import { AnimeMVRenderer } from "./anime-mv.js";
import { GridPlatform } from "../common/grid-platform.js";
import { cameraShiftEase } from "../common/easings.js";

const SECTION_ORDER = ["intro", "section-1", "section-2", "section-3"];
const SHIFT_DISTANCE = 140;

export class IntroSection implements Section {
    readonly id = "intro";
    readonly name = "INTRO";
    readonly hasBottomBorder = true;
    readonly enterDuration = 260;
    readonly domElement: HTMLElement | null;
    readonly gpu: GPUManager;

    private _animeMV: AnimeMVRenderer;
    private _gridPlatform: GridPlatform;

    constructor(gpu: GPUManager, gridPlatform: GridPlatform) {
        this.gpu = gpu;
        this.domElement = document.getElementById("intro-view");
        this._gridPlatform = gridPlatform;
        this._animeMV = new AnimeMVRenderer(gpu);
    }

    onEnter(_ctx: TransitionContext): void {
        this._gridPlatform.setBottomHidden(false);
    }

    onLeave(ctx: TransitionContext): void {
        if (ctx.to && !ctx.to.hasBottomBorder) {
            this._gridPlatform.setBottomHidden(true);
        }
    }

    onTransitionTick(ctx: TransitionContext): void {
        if (!this.domElement) return;

        const isLeaving = ctx.state === "TRANSITIONING" && ctx.from === this;
        const isEntering = ctx.state === "TRANSITIONING" && ctx.to === this;

        const transT = 0.20; 

        if (isLeaving) {
            if (ctx.progress >= transT) {
                this.domElement.classList.remove("active");
                this.domElement.style.transform = "";
            } else {
                const fromIdx = SECTION_ORDER.indexOf(this.id);
                const toIdx = ctx.to ? SECTION_ORDER.indexOf(ctx.to.id) : fromIdx;
                const dir = toIdx >= fromIdx ? 1 : -1;
                const t = Math.min(1.0, ctx.progress / transT);
                const offset = dir * SHIFT_DISTANCE * cameraShiftEase(t);
                this.domElement.classList.add("active");
                this.domElement.style.transform = `translateX(${offset}px)`;
            }
        } else if (isEntering) {
            if (ctx.progress < transT) {
                this.domElement.classList.remove("active");
                this.domElement.style.transform = "";
            } else {
                const fromIdx = ctx.from ? SECTION_ORDER.indexOf(ctx.from.id) : 0;
                const toIdx = SECTION_ORDER.indexOf(this.id);
                const dir = toIdx >= fromIdx ? 1 : -1;
                const t = Math.min(1.0, Math.max(0.0, (ctx.progress - transT) / (1.0 - transT)));
                const offset = -dir * SHIFT_DISTANCE * (1.0 - cameraShiftEase(t));
                this.domElement.classList.add("active");
                this.domElement.style.transform = `translateX(${offset}px)`;
            }
        }
    }

    onEnterComplete(_ctx: TransitionContext): void {
        if (this.domElement) {
            this.domElement.classList.add("active");
            this.domElement.style.transform = "";
        }
    }

    onLeaveComplete(_ctx: TransitionContext): void {
        if (this.domElement) {
            this.domElement.classList.remove("active");
            this.domElement.style.transform = "";
        }
    }

    render(ctx: SectionRenderContext): void {
        const isLeaving = ctx.state === "TRANSITIONING" && ctx.from === this;
        const isEntering = ctx.state === "TRANSITIONING" && ctx.to === this;

        // 70% Cutoff Rule:
        // Before 70%: Only From renders. At 70%: completely stop rendering From.
        if (isLeaving && ctx.progress >= 0.70) {
            return;
        }
        // At 70%: To starts rendering. Before 70%: To does not render.
        if (isEntering && ctx.progress < 0.70) {
            return;
        }

        let visualOffset = 0;
        if (isLeaving && ctx.to) {
            const fromIdx = SECTION_ORDER.indexOf(this.id);
            const toIdx = SECTION_ORDER.indexOf(ctx.to.id);
            const dir = toIdx >= fromIdx ? 1 : -1;
            const t = Math.min(1.0, ctx.progress / 0.70);
            visualOffset = dir * SHIFT_DISTANCE * cameraShiftEase(t);
        } else if (isEntering && ctx.from) {
            const fromIdx = SECTION_ORDER.indexOf(ctx.from.id);
            const toIdx = SECTION_ORDER.indexOf(this.id);
            const dir = toIdx >= fromIdx ? 1 : -1;
            const t = Math.min(1.0, Math.max(0.0, (ctx.progress - 0.70) / 0.30));
            visualOffset = -dir * SHIFT_DISTANCE * (1.0 - cameraShiftEase(t));
        }

        // 1. Back Canvas Pass (Chalk-white dominant anime MV stage with floating diamonds)
        const backView = this.gpu.backContext.getCurrentTexture().createView();
        const backPass = ctx.encoder.beginRenderPass({
            label: "Intro_BackPass",
            colorAttachments: [
                {
                    view: backView,
                    clearValue: { r: 0.99, g: 0.995, b: 1.0, a: 1.0 },
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
        });
        this._animeMV.render(ctx.time, visualOffset, backPass);
        backPass.end();

        // 2. Front Canvas Pass (Transparent glass overlay + top/bottom moving grid borders)
        const frontView = this.gpu.frontContext.getCurrentTexture().createView();
        const frontPass = ctx.encoder.beginRenderPass({
            label: "Intro_FrontPass",
            colorAttachments: [
                {
                    view: frontView,
                    clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
        });
        this._gridPlatform.render(ctx.time, ctx.dt, frontPass);
        frontPass.end();
    }
}

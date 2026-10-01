import { GPUManager } from "../../core/gpu.js";
import { Section, SectionRenderContext, TransitionContext } from "../types.js";
import { Section1AmbientRenderer } from "./ambient-hex.js";
import { GridPlatform } from "../common/grid-platform.js";
import { cameraShiftEase } from "../common/easings.js";

const SECTION_ORDER = ["intro", "section-1", "section-2", "section-3"];
const SHIFT_DISTANCE = 140;

export class Section1 implements Section {
    readonly id = "section-1";
    readonly name = "SECTION 1";
    readonly hasBottomBorder = false;
    readonly enterDuration = 260;
    readonly domElement: HTMLElement | null;
    readonly gpu: GPUManager;

    private _ambient: Section1AmbientRenderer;
    private _gridPlatform: GridPlatform;

    constructor(gpu: GPUManager, gridPlatform: GridPlatform) {
        this.gpu = gpu;
        this.domElement = document.getElementById("section1-view");
        this._gridPlatform = gridPlatform;
        this._ambient = new Section1AmbientRenderer(gpu);
    }

    onEnter(_ctx: TransitionContext): void {
        this._gridPlatform.setBottomHidden(true);
    }

    onLeave(ctx: TransitionContext): void {
        if (ctx.to && ctx.to.hasBottomBorder) {
            this._gridPlatform.setBottomHidden(false);
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
        if (isLeaving && ctx.progress >= 0.70) {
            return;
        }
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

        // 1. Back Canvas Pass (Mint / emerald honeycomb shapes on chalk-white)
        const backView = this.gpu.backContext.getCurrentTexture().createView();
        const backPass = ctx.encoder.beginRenderPass({
            label: "Section1_BackPass",
            colorAttachments: [
                {
                    view: backView,
                    clearValue: { r: 0.99, g: 1.0, b: 0.995, a: 1.0 },
                    loadOp: "clear",
                    storeOp: "store",
                },
            ],
        });
        this._ambient.render(ctx.time, visualOffset, backPass);
        backPass.end();

        // 2. Front Canvas Pass (Transparent overlay + top grid platform)
        const frontView = this.gpu.frontContext.getCurrentTexture().createView();
        const frontPass = ctx.encoder.beginRenderPass({
            label: "Section1_FrontPass",
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

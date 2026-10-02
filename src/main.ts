import { GPUManager } from "./core/gpu.js";
import { RenderLoop } from "./core/loop.js";
import { SectionTransitionManager } from "./sections/manager.js";
import { Section } from "./sections/types.js";
import { WelcomeSection } from "./sections/welcome/index.js";
import { WikiSection } from "./sections/wiki/index.js";
import { ScheduleSection } from "./sections/schedule/index.js";
import { MusicSection } from "./sections/music/index.js";
import { DiscographySection } from "./sections/discography/index.js";
import { SocialSection } from "./sections/social/index.js";

async function bootstrap() {
    const backCanvas = document.getElementById("back-canvas") as HTMLCanvasElement;
    const frontCanvas = document.getElementById("front-canvas") as HTMLCanvasElement;
    const headerBar = document.getElementById("header-bar");
    const navButtons = document.querySelectorAll<HTMLButtonElement>(".nav-wrap .nav-btn");

    if (!backCanvas || !frontCanvas) {
        throw new Error("Could not find back-canvas or front-canvas in the DOM.");
    }

    // 1. Initialize Unified WebGPU GPUManager (Single GPUDevice, Dual Canvases)
    let gpuManager: GPUManager | null = null;
    try {
        gpuManager = await GPUManager.create(backCanvas, frontCanvas);
    } catch (err) {
        console.warn("WebGPU initialization failed:", err);
    }

    if (gpuManager) {
        // 2. Autonomous Sections (6 Main Sections)
        const sections: Section[] = [
            new WelcomeSection(gpuManager),
            new WikiSection(gpuManager),
            new ScheduleSection(gpuManager),
            new MusicSection(gpuManager),
            new DiscographySection(gpuManager),
            new SocialSection(gpuManager),
        ];

        // 3. Section Transition Manager (pure transition controller for front, middle DOM, and back layers)
        const transitionManager = new SectionTransitionManager(sections);

        // 4. Header Bar Navigation & Dynamic Theme Controller (decoupled from SectionTransitionManager)
        function setHeaderStyleForSection(sectionId: string) {
            const targetBtn = Array.from(navButtons).find(btn => btn.getAttribute("data-target") === sectionId);
            if (targetBtn) {
                navButtons.forEach(btn => btn.classList.remove("active"));
                targetBtn.classList.add("active");
                const style = targetBtn.getAttribute("data-header-style");
                if (headerBar) {
                    if (style === "light") {
                        headerBar.classList.add("light-theme");
                    } else {
                        headerBar.classList.remove("light-theme");
                    }
                }
            }
        }

        function navigateTo(sectionId: string) {
            const res = transitionManager.transitionTo(sectionId);
            if (res.success) {
                setHeaderStyleForSection(sectionId);
            }
        }

        navButtons.forEach(btn => {
            btn.addEventListener("click", () => {
                const sectionId = btn.getAttribute("data-target");
                if (sectionId) {
                    navigateTo(sectionId);
                }
            });
        });

        document.addEventListener("click", (e) => {
            const target = (e.target as HTMLElement).closest("[data-jump-section]") as HTMLElement | null;
            if (target) {
                e.preventDefault();
                const sectionId = target.getAttribute("data-jump-section");
                if (sectionId) {
                    navigateTo(sectionId);
                }
            }
        });

        // 5. Unified Render Loop with Strict 4-Phase Pipeline:
        //    Phase 1: onTick (simulation/logic)
        //    Phase 2: renderBack (Layer 1 Back Canvas pass)
        //    Phase 3: renderFront (Layer 3 Front Canvas pass)
        //    Phase 4: updateDom (Layer 2 DOM Middle Layer batch)
        const loop = new RenderLoop(gpuManager);
        loop.onFrame((time, dt, encoder) => {
            transitionManager.update(dt);

            const isTrans = transitionManager.isTransitioning && transitionManager.fromSection && transitionManager.toSection;
            const fromSec = transitionManager.fromSection;
            const toSec = transitionManager.toSection;
            const curSec = transitionManager.currentSection;

            const fromCtx = isTrans ? transitionManager.getContextFor(fromSec, time, dt) : null;
            const toCtx = isTrans ? transitionManager.getContextFor(toSec, time, dt) : null;
            const idleCtx = !isTrans ? transitionManager.getContextFor(curSec, time, dt) : null;

            // ================= 1. PHASE 1: LOGIC / SIMULATION (onTick) =================
            if (isTrans && fromSec && toSec && fromCtx && toCtx) {
                fromSec.onTick(fromCtx);
                toSec.onTick(toCtx);
            } else if (curSec && idleCtx) {
                curSec.onTick(idleCtx);
            }

            // ================= 2. PHASE 2: LAYER 1 BACK CANVAS PASS (renderBack) =================
            const backView = gpuManager.backContext.getCurrentTexture().createView();
            const backPass = encoder.beginRenderPass({
                label: "BackCanvas_Pass",
                colorAttachments: [
                    {
                        view: backView,
                        clearValue: { r: 0.995, g: 0.995, b: 1.0, a: 1.0 },
                        loadOp: "clear",
                        storeOp: "store",
                    },
                ],
            });
            if (isTrans && fromSec && toSec && fromCtx && toCtx) {
                fromSec.renderBack(backPass, fromCtx);
                toSec.renderBack(backPass, toCtx);
            } else if (curSec && idleCtx) {
                curSec.renderBack(backPass, idleCtx);
            }
            backPass.end();

            // ================= 3. PHASE 3: LAYER 3 FRONT CANVAS PASS (renderFront) =================
            const frontView = gpuManager.frontContext.getCurrentTexture().createView();
            const frontPass = encoder.beginRenderPass({
                label: "FrontCanvas_Pass",
                colorAttachments: [
                    {
                        view: frontView,
                        clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 0.0 },
                        loadOp: "clear",
                        storeOp: "store",
                    },
                ],
            });
            if (isTrans && fromSec && toSec && fromCtx && toCtx) {
                fromSec.renderFront?.(frontPass, fromCtx);
                toSec.renderFront?.(frontPass, toCtx);
            } else if (curSec && idleCtx) {
                curSec.renderFront?.(frontPass, idleCtx);
            }
            frontPass.end();

            // ================= 4. PHASE 4: LAYER 2 DOM MIDDLE LAYER (updateDom) =================
            if (isTrans && fromSec && toSec && fromCtx && toCtx) {
                fromSec.updateDom(fromCtx);
                toSec.updateDom(toCtx);
            } else if (curSec && idleCtx) {
                curSec.updateDom(idleCtx);
            }
        });

        loop.start();
    }
}

// Bootstrap on DOM ready
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => bootstrap());
} else {
    bootstrap();
}

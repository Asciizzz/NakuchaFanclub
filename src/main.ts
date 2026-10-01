import { GPUManager } from "./core/gpu.js";
import { RenderLoop } from "./core/loop.js";
import { GridPlatform } from "./sections/common/grid-platform.js";
import { SectionTransitionManager } from "./sections/manager.js";
import { Section, SectionRenderContext } from "./sections/types.js";
import { IntroSection } from "./sections/intro/index.js";
import { Section1 } from "./sections/section1/index.js";
import { Section2 } from "./sections/section2/index.js";
import { Section3 } from "./sections/section3/index.js";

async function bootstrap() {
    const backCanvas = document.getElementById("back-canvas") as HTMLCanvasElement;
    const frontCanvas = document.getElementById("front-canvas") as HTMLCanvasElement;
    const headerBar = document.getElementById("header-bar");
    const footerBar = document.getElementById("footer-bar");
    const navLinks = document.querySelectorAll<HTMLAnchorElement>(".nav-wrap .nav-link");

    if (!backCanvas || !frontCanvas) {
        throw new Error("Could not find back-canvas or front-canvas in the DOM.");
    }
    if (!headerBar || !footerBar) {
        throw new Error("Could not find essential DOM framing elements.");
    }

    // 1. Initialize Unified WebGPU GPUManager (Single GPUDevice, Dual Canvases)
    let gpuManager: GPUManager | null = null;
    try {
        gpuManager = await GPUManager.create(backCanvas, frontCanvas);
    } catch (err) {
        console.warn("WebGPU initialization failed:", err);
    }

    if (gpuManager) {
        // 2. Shared WebGPU Border Grid Platform (Top + Bottom Borders)
        const gridPlatform = new GridPlatform(gpuManager);

        // 3. Autonomous Sections (each owns reference to gpu resources and its DOM view)
        const sections: Section[] = [
            new IntroSection(gpuManager, gridPlatform),
            new Section1(gpuManager, gridPlatform),
            new Section2(gpuManager, gridPlatform),
            new Section3(gpuManager, gridPlatform),
        ];

        // 4. Section Transition Manager (pure transition state machine, decoupled from GPU code)
        const transitionManager = new SectionTransitionManager(sections, {
            navLinks,
            footerBar,
        });

        // 5. Unified Render Loop with Concurrent Multi-Section Dispatch
        const loop = new RenderLoop(gpuManager);
        loop.onFrame((time, dt, encoder) => {
            transitionManager.update(dt);

            const tCtx = transitionManager.getTransitionContext();
            const renderCtx: SectionRenderContext = {
                time,
                dt,
                encoder,
                gpu: gpuManager,
                ...tCtx,
            };

            // CONCURRENT OVERLAP: If transitioning, both sections render on the exact same frame!
            if (transitionManager.state === "TRANSITIONING" && transitionManager.toSection && transitionManager.fromSection) {
                transitionManager.fromSection.render(renderCtx);
                transitionManager.toSection.render(renderCtx);
            } else {
                transitionManager.currentSection.render(renderCtx);
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

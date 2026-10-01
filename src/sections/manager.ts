import { Section, TransitionContext } from "./types.js";
import { EventBus } from "../core/events.js";

export interface TransitionManagerOptions {
    navLinks?: NodeListOf<HTMLAnchorElement>;
    footerBar?: HTMLElement | null;
    initialSharedContext?: Record<string, unknown>;
}

export class SectionTransitionManager {
    readonly sections: Map<string, Section> = new Map();
    readonly sectionsList: Section[] = [];
    readonly navLinks: NodeListOf<HTMLAnchorElement> | null;
    readonly footerBar: HTMLElement | null;

    currentSection: Section;
    fromSection: Section | null = null;
    toSection: Section | null = null;

    state: "IDLE" | "TRANSITIONING" = "IDLE";
    duration = 0;  // ms
    elapsed = 0;   // ms
    progress = 0.0; // 0.0 -> 1.0

    readonly sharedContext: Record<string, unknown>;

    constructor(sections: Section[], options: TransitionManagerOptions = {}) {
        this.sectionsList = [...sections];
        for (const sec of sections) {
            this.sections.set(sec.id, sec);
        }

        if (sections.length === 0) {
            throw new Error("SectionTransitionManager requires at least one section.");
        }

        this.currentSection = sections[0];
        this.navLinks = options.navLinks ?? null;
        this.footerBar = options.footerBar ?? null;
        this.sharedContext = {
            totalTransitions: 0,
            lastTransitionPair: null,
            ...options.initialSharedContext,
        };

        this._setupListeners();
        this._applyImmediate(this.currentSection);
    }

    private _setupListeners(): void {
        // 1. Header nav links
        if (this.navLinks) {
            this.navLinks.forEach((link) => {
                link.addEventListener("click", (e) => {
                    e.preventDefault();
                    const target = link.getAttribute("data-target");
                    if (target !== null) {
                        const idx = parseInt(target, 10);
                        if (this.sectionsList[idx]) {
                            this.transitionTo(this.sectionsList[idx].id);
                        }
                    }
                });
            });
        }

        // 2. In-section action jump buttons (data-jump-section="section-1")
        document.addEventListener("click", (e) => {
            const target = (e.target as HTMLElement).closest("[data-jump-section]") as HTMLElement | null;
            if (target) {
                e.preventDefault();
                const sectionId = target.getAttribute("data-jump-section");
                if (sectionId) {
                    this.transitionTo(sectionId);
                }
            }
        });
    }

    transitionTo(targetId: string): { success: boolean; reason?: string; duration?: number } {
        // Anti-spam guard: reject clicks while actively transitioning
        if (this.state === "TRANSITIONING") {
            return { success: false, reason: "locked" };
        }

        const target = this.sections.get(targetId);
        if (!target || target === this.currentSection) {
            return { success: false, reason: "same-or-invalid" };
        }

        this.fromSection = this.currentSection;
        this.toSection = target;
        this.state = "TRANSITIONING";
        this.elapsed = 0;
        this.progress = 0.0;

        // Entry-driven duration resolution with pair override support
        let resolvedDuration = target.enterDuration || 260;
        if (this.fromSection.getExitDurationFor) {
            const override = this.fromSection.getExitDurationFor(target);
            if (override != null) resolvedDuration = override;
        }
        this.duration = resolvedDuration;

        this.sharedContext.totalTransitions = ((this.sharedContext.totalTransitions as number) || 0) + 1;
        this.sharedContext.lastTransitionPair = `${this.fromSection.id} -> ${this.toSection.id}`;

        const ctx = this.getTransitionContext();

        // Lifecycle calls
        if (this.fromSection.onLeave) {
            this.fromSection.onLeave(ctx);
        }
        if (this.toSection.onEnter) {
            this.toSection.onEnter(ctx);
        }

        // Nav and footer updates
        this._updateNavLinks(target.id);
        this._updateFooterOcclusion(target.hasBottomBorder);

        EventBus.get().emit("section-change", {
            sectionId: target.id,
            isIntro: target.id === "intro",
            hasBottomBorder: target.hasBottomBorder,
            duration: this.duration,
        });

        return { success: true, duration: this.duration };
    }

    update(dt: number): void {
        if (this.state !== "TRANSITIONING") return;

        this.elapsed += dt * 1000;
        this.progress = Math.min(this.elapsed / Math.max(1, this.duration), 1.0);

        const ctx = this.getTransitionContext();

        if (this.fromSection?.onTransitionTick) {
            this.fromSection.onTransitionTick(ctx);
        }
        if (this.toSection?.onTransitionTick) {
            this.toSection.onTransitionTick(ctx);
        }

        if (this.progress >= 1.0) {
            if (this.fromSection?.onLeaveComplete) {
                this.fromSection.onLeaveComplete(ctx);
            }
            if (this.toSection?.onEnterComplete) {
                this.toSection.onEnterComplete(ctx);
            }

            if (this.toSection) {
                this.currentSection = this.toSection;
            }

            this.fromSection = null;
            this.toSection = null;
            this.state = "IDLE";
            this.progress = 0.0;
            this.elapsed = 0;
        }
    }

    getTransitionContext(): TransitionContext {
        return {
            state: this.state,
            from: this.fromSection,
            to: this.toSection,
            duration: this.duration,
            elapsed: this.elapsed,
            progress: this.progress,
            sharedContext: this.sharedContext,
        };
    }

    private _applyImmediate(sec: Section): void {
        for (const s of this.sectionsList) {
            if (s === sec) {
                s.domElement?.classList.add("active");
                if (s.domElement) s.domElement.style.transform = "";
            } else {
                s.domElement?.classList.remove("active");
                if (s.domElement) s.domElement.style.transform = "";
            }
        }
        this._updateNavLinks(sec.id);
        this._updateFooterOcclusion(sec.hasBottomBorder);
        sec.onEnter?.(this.getTransitionContext());
    }

    private _updateNavLinks(activeId: string): void {
        if (!this.navLinks) return;
        const activeIdx = this.sectionsList.findIndex((s) => s.id === activeId);

        this.navLinks.forEach((link) => {
            const target = link.getAttribute("data-target");
            if (target !== null && parseInt(target, 10) === activeIdx) {
                link.classList.add("active");
            } else {
                link.classList.remove("active");
            }
        });
    }

    private _updateFooterOcclusion(hasBottomBorder: boolean): void {
        if (!this.footerBar) return;
        if (hasBottomBorder) {
            this.footerBar.classList.remove("occluded");
        } else {
            this.footerBar.classList.add("occluded");
        }
    }
}

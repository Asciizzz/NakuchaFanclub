import { Section, FrameContext } from "./types.js";
import { testTransitionDurationTemp } from "../temp/index.js";

export class SectionTransitionManager {
    readonly sections: Map<string, Section> = new Map();
    readonly sectionsList: Section[] = [];

    currentSection: Section;
    fromSection: Section | null = null;
    toSection: Section | null = null;

    isTransitioning = false;
    direction: 1 | -1 = 1;
    duration = testTransitionDurationTemp;
    elapsed = 0;
    progress = 0.0;

    constructor(sections: Section[]) {
        this.sectionsList = [...sections];
        for (const sec of sections) {
            this.sections.set(sec.id, sec);
        }

        if (sections.length === 0) {
            throw new Error("SectionTransitionManager requires at least one section.");
        }

        this.currentSection = sections[0];
        this._applyImmediate(this.currentSection);
    }

    transitionTo(targetId: string): { success: boolean; reason?: string } {
        if (this.isTransitioning) {
            return { success: false, reason: "locked" };
        }

        const target = this.sections.get(targetId);
        if (!target || target === this.currentSection) {
            return { success: false, reason: "same-or-invalid" };
        }

        const fromIdx = this.sectionsList.indexOf(this.currentSection);
        const toIdx = this.sectionsList.indexOf(target);

        this.direction = toIdx >= fromIdx ? 1 : -1;
        this.fromSection = this.currentSection;
        this.toSection = target;
        this.isTransitioning = true;
        this.elapsed = 0;
        this.progress = 0.0;
        this.duration = testTransitionDurationTemp;

        // Fire discrete entrance and departure start hooks at p = 0
        this.fromSection.onLeaveStart?.(this.toSection);
        this.toSection.onEnterStart?.(this.fromSection);

        return { success: true };
    }

    update(dt: number): void {
        if (!this.isTransitioning) return;

        this.elapsed += dt * 1000;
        this.progress = Math.min(1.0, this.elapsed / Math.max(1, this.duration));

        if (this.progress >= 1.0) {
            const from = this.fromSection;
            const to = this.toSection!;

            // Fire discrete departure and entrance end hooks at p = 1
            from?.onLeaveEnd?.(to);
            to.onEnterEnd?.(from);

            if (from?.domElement) {
                from.domElement.classList.remove("active");
                from.domElement.style.transform = "";
            }
            if (to.domElement) {
                to.domElement.classList.add("active");
                to.domElement.style.transform = "";
            }

            this.currentSection = to;
            this.fromSection = null;
            this.toSection = null;
            this.isTransitioning = false;
            this.progress = 0.0;
            this.elapsed = 0;
        }
    }

    getContextFor(section: Section | null, time: number, dt: number): FrameContext {
        if (!this.isTransitioning || !this.fromSection || !this.toSection || !section) {
            return { time, dt, transition: null };
        }

        if (section === this.fromSection) {
            return {
                time,
                dt,
                transition: {
                    role: "leaving",
                    other: this.toSection,
                    progress: this.progress,
                    duration: this.duration,
                    direction: this.direction,
                },
            };
        }

        if (section === this.toSection) {
            return {
                time,
                dt,
                transition: {
                    role: "entering",
                    other: this.fromSection,
                    progress: this.progress,
                    duration: this.duration,
                    direction: this.direction,
                },
            };
        }

        return { time, dt, transition: null };
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
        sec.onEnterStart?.(null);
        sec.onEnterEnd?.(null);
    }
}

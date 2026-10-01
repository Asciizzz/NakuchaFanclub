/**
 * Section-driven easing functions library.
 * Easing is owned and customized by each section rather than hardcoded in the transition manager.
 */
export const Easings = {
    // Sharp anticipation wind-up before exit
    easeInBack: (t: number): number => {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return c3 * t * t * t - c1 * t * t;
    },
    // Snappy overshoot for crisp geometric entrance
    easeOutBack: (t: number): number => {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    },
    // Elastic spring bounce for responsive pop-in
    easeOutElastic: (t: number): number => {
        const c4 = (2 * Math.PI) / 3;
        if (t === 0) return 0;
        if (t === 1) return 1;
        return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * c4) + 1;
    },
    // Smooth cinematic curve
    easeInOutCubic: (t: number): number => {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    },
    // Fast exponential drop-off
    easeInExpo: (t: number): number => {
        return t === 0 ? 0 : Math.pow(2, 10 * t - 10);
    },
    // Smooth exponential deceleration
    easeOutExpo: (t: number): number => {
        return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    },
};

/**
 * Creates a cubic-bezier solver for control points (x1, y1, x2, y2).
 */
export function createCubicBezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
    return function solve(x: number): number {
        if (x <= 0) return 0;
        if (x >= 1) return 1;

        let t = x;
        let start = 0;
        let end = 1;

        // Binary bisection to solve for parameter t where sampleX(t) ~ x
        for (let i = 0; i < 12; i++) {
            const currentX = 3 * (1 - t) * (1 - t) * t * x1 + 3 * (1 - t) * t * t * x2 + t * t * t;
            if (Math.abs(currentX - x) < 0.0005) break;
            if (currentX < x) {
                start = t;
            } else {
                end = t;
            }
            t = (start + end) * 0.5;
        }

        // Evaluate y(t)
        return 3 * (1 - t) * (1 - t) * t * y1 + 3 * (1 - t) * t * t * y2 + t * t * t;
    };
}

// User specified cubic-bezier(.89, 0, .36, .99)
export const cameraShiftEase = createCubicBezier(.44,-0.5,0,1)
// export const cameraShiftEase = createCubicBezier(0, 0, 0, 0);


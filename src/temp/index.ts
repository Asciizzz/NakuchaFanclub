import { createCubicBezier } from "../sections/common/easings.js";

/**
 * Temporary test configuration.
 * Exists solely for rapid iteration.
 */

// Hardcoded test bezier curve temp
export const testBezierCurveTemp = createCubicBezier(1, 0, 0, 1.4);
// export const testBezierCurveTemp = function (t: number): number {
//     return t;
// };

// Progress cutoff (0.0 - 1.0) determining when From is hidden and To begins
export const sectionTransitionProgressTemp = 0.5;  

// Temporary test duration in ms
export const testTransitionDurationTemp = 500;

// Temporary test travel distance in pixels
export const testTransitionDistanceTemp = 140;


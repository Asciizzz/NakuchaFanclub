/* VsCamera
By Asciiz

2D camera for pan and zoom on a visual graph world
Provides world transform string for CSS application
*/

export class VsCamera {

    /** @param {{ x?: number, y?: number, zoom?: number, minZoom?: number, maxZoom?: number }} [options] */
    constructor({ x = 0, y = 0, zoom = 1, minZoom = 0.25, maxZoom = 2.5 } = {}) {
        this.x = x;
        this.y = y;
        this.zoom = zoom;
        this.minZoom = minZoom;
        this.maxZoom = maxZoom;
    }

    /** @param {number} dx @param {number} dy @returns {VsCamera} */
    panBy(dx, dy) {
        this.x += dx;
        this.y += dy;
        return this;
    }

    /**
     * Zoom toward/away from a screen point, keeping that point fixed in world space
     * @param {{ clientX: number, clientY: number, rect: DOMRect, delta: number }} params
     * @returns {VsCamera}
     */
    zoomAt({ clientX, clientY, rect, delta } = {}) {
        const oldZoom = this.zoom;
        const nextZoom = clamp(oldZoom * Math.exp(-delta * 0.001), this.minZoom, this.maxZoom);
        if (nextZoom === oldZoom) return this;

        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const localX  = clientX - rect.left;
        const localY  = clientY - rect.top;
        const worldX  = (localX - centerX - this.x) / oldZoom;
        const worldY  = (localY - centerY - this.y) / oldZoom;

        this.zoom = nextZoom;
        this.x = localX - centerX - worldX * nextZoom;
        this.y = localY - centerY - worldY * nextZoom;

        return this;
    }

    /** @returns {string} CSS transform value for the world layer */
    worldTransform() {
        return `translate(${this.x}px, ${this.y}px) scale(${this.zoom})`;
    }
}

function clamp(value, min, max) {
    return Math.max(min, Math.min(max, value));
}

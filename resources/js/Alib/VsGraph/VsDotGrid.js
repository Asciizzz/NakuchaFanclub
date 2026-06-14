/* VsDotGrid
By Asciiz

Dot-grid background layer. Extends Acanvas.
Mounts to a VsGraph's root with zIndex -1 and tracks its camera
to draw a CSS radial-gradient dot grid that pans and zooms.

Has zero knowledge of graph nodes, edges, or VsData.
*/

import { Acanvas } from "../Acanvas.js";

export class VsDotGrid extends Acanvas {

    constructor({
        dotSpacing  = 25,
        bigDotEvery = 4,
        bgColor     = "#17181b",
        dotColor    = "rgba(145, 154, 174, 0.42)",
        bigDotColor = "rgba(145, 154, 174, 0.20)",
    } = {}) {
        super();

        this.dotSpacing  = dotSpacing;
        this.bigDotEvery = bigDotEvery;
        this.bgColor     = bgColor;
        this.dotColor    = dotColor;
        this.bigDotColor = bigDotColor;

        this.camera = null;

        this.root = document.createElement("div");
        Object.assign(this.root.style, {
            position:      "absolute",
            inset:         "0",
            pointerEvents: "none",
            zIndex:        "-1",
        });
    }

    /**
     * Bind to a VsGraph - mount into its root behind the world layer.
     * @param {import("./VsGraph.js").VsGraph} vsgraph
     * @returns {this}
     */
    bindVsGraph(vsgraph) {
        this.camera = vsgraph.camera;
        this.mount(vsgraph.root);
        this.update();
        return this;
    }

    /** Redraw the dot grid based on current camera state */
    update() {
        if (!this.camera) return this;

        const minor = this.dotSpacing  * this.camera.zoom;
        const major = this.bigDotEvery * minor;

        const x = `calc(50% + ${this.camera.x}px)`;
        const y = `calc(50% + ${this.camera.y}px)`;

        this.root.style.backgroundColor = this.bgColor;
        this.root.style.backgroundImage = [
            `radial-gradient(circle, ${this.dotColor} 1px, transparent 1.5px)`,
            `radial-gradient(circle, ${this.bigDotColor} 1px, transparent 1.5px)`,
        ].join(", ");
        this.root.style.backgroundSize     = `${major}px ${major}px, ${minor}px ${minor}px`;
        this.root.style.backgroundPosition = `${x} ${y}, ${x} ${y}`;

        return this;
    }
}

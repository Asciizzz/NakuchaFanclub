/* Acanvas
By Asciiz

Lightweight agnostic "canvas" base class
Not really a <canvas> element more like a mountable root container

Is highly niche
*/

export class Acanvas {

    constructor() {
        this.root = null;
    }

    /**
     * @param {HTMLElement} target
     * @returns {this}
     */
    mount(target) {
        if (!target) throw new Error("Acanvas.mount: target is required");
        if (this.root) target.appendChild(this.root);

        return this;
    }

    /**
     * @returns {this}
     */
    unmount() {
        if (this.root && this.root.parentNode) {
            this.root.parentNode.removeChild(this.root);
        }

        return this;
    }
}

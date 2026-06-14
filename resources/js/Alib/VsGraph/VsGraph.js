/* VsGraph
By Asciiz

Visual graph renderer. Extends Acanvas for mount/unmount lifecycle.
Creates a pannable/zoomable world inside its root, and delegates all
rendering to VsData static methods on node/edge data.

VsGraph has zero understanding of what nodes or edges look like.
It only manages element lifecycle (create/remove) and camera transforms.
All visual styling, positioning, z-ordering, and content is the VsData subclass's job.
*/

import { Acanvas }  from "../Acanvas.js";
import { VsData }   from "./VsData.js";
import { VsCamera } from "./VsCamera.js";

export class VsGraph extends Acanvas {

    /**
     * @param {{
     *   mount:   HTMLElement,
     *   graph:   import("../Agraph.js").Agraph,
     *   camera?: VsCamera,
     *   ctx?:    object
     * }} options
     */
    constructor({ mount, graph, camera = new VsCamera(), ctx = {} } = {}) {
        super();

        if (!mount) throw new Error("VsGraph: mount is required");
        if (!graph) throw new Error("VsGraph: graph is required");

        this.graph  = graph;
        this.camera = camera;
        this.ctx    = ctx;

        // nodeId/edgeId -> { element, cache, DataClass }
        this._instances = new Map();

        this.world = null;

        this.#create();
        this.#bindInput();

        this.mount(mount);
    }

    render() {
        const { graph, ctx, _instances } = this;

        const alive = new Set();

        // Nodes
        for (const node of graph.getNodes()) {
            if (!(node.data instanceof VsData)) continue;

            const key = `n:${node.id}`;
            alive.add(key);

            const DataClass = node.data.constructor;

            if (!_instances.has(key)) {
                const { element, cache } = DataClass.createFn({ node, graph, vsgraph: this });
                this.world.appendChild(element);
                _instances.set(key, { element, cache, DataClass });
            }

            const inst = _instances.get(key);
            inst.DataClass.renderFn({ node, graph, element: inst.element, cache: inst.cache, ctx, vsgraph: this });
        }

        // Edges
        for (const edge of graph.getEdges()) {
            if (!(edge.data instanceof VsData)) continue;

            const key = `e:${edge.id}`;
            alive.add(key);

            const DataClass = edge.data.constructor;

            if (!_instances.has(key)) {
                const { element, cache } = DataClass.createFn({ edge, graph, vsgraph: this });
                this.world.appendChild(element);
                _instances.set(key, { element, cache, DataClass });
            }

            const inst = _instances.get(key);
            inst.DataClass.renderFn({ edge, graph, element: inst.element, cache: inst.cache, ctx, vsgraph: this });
        }

        // Remove elements for nodes/edges that no longer exist or lost their VsData
        for (const [key, inst] of _instances) {
            if (!alive.has(key)) {
                inst.element.remove();
                _instances.delete(key);
            }
        }

        // Apply camera
        this.world.style.transform = this.camera.worldTransform();

        return this;
    }

    #create() {
        this.root = document.createElement("div");
        this.world = document.createElement("div");

        Object.assign(this.root.style, {
            position: "absolute",
            inset: "0",
            overflow: "hidden",
            userSelect: "none",
            touchAction: "none",
            cursor: "grab",
        });

        Object.assign(this.world.style, {
            position: "absolute",
            left: "50%",
            top: "50%",
            width: "0",
            height: "0",
            transformOrigin: "0 0",
            willChange: "transform",
        });

        this.root.appendChild(this.world);
    }

    #bindInput() {
        let pan = null;

        this.root.addEventListener("pointerdown", event => {
            if (event.target !== this.root) return;

            pan = {
                pointerId: event.pointerId,
                x: event.clientX,
                y: event.clientY,
            };
            this.root.setPointerCapture(event.pointerId);
        });

        this.root.addEventListener("pointermove", event => {
            if (!pan || pan.pointerId !== event.pointerId) return;

            this.camera.panBy(event.clientX - pan.x, event.clientY - pan.y);
            pan.x = event.clientX;
            pan.y = event.clientY;
            this.render();
        });

        this.root.addEventListener("pointerup", event => {
            if (pan?.pointerId === event.pointerId) pan = null;
        });

        this.root.addEventListener("pointercancel", event => {
            if (pan?.pointerId === event.pointerId) pan = null;
        });

        this.root.addEventListener("wheel", event => {
            event.preventDefault();
            this.camera.zoomAt({
                clientX: event.clientX,
                clientY: event.clientY,
                rect: this.root.getBoundingClientRect(),
                delta: event.deltaY,
            });
            this.render();
        }, { passive: false });
    }
}

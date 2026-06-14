import { VsData } from "../VsData.js";

/**
 * Example node data with draggable positioning.
 *
 * Stores visual coordinates in `this.vsgraph = { x, y }`.
 * createFn builds a styled card and wires pointer drag.
 * renderFn positions the element and updates the label each frame.
 *
 * Expects ctx.vsgraph (the VsGraph instance) for zoom-aware dragging and re-render.
 */
export class ExampleNodeData extends VsData {

    constructor({ label = "", color = "#5b9fd6", vsgraph = {} } = {}) {
        super();
        this.label   = label;
        this.color   = color;
        this.vsgraph = { x: 0, y: 0, ...vsgraph };
    }

    static createFn({ node, graph, vsgraph }) {
        const { element, cache } = VsData.createFn({ node, graph, vsgraph });

        Object.assign(element.style, {
            position:     "absolute",
            left:         "0",
            top:          "0",
            padding:      "10px 18px",
            borderRadius: "6px",
            border:       `2px solid ${node.data.color}`,
            background:   "#1e1f23",
            color:        "#ddd",
            fontSize:     "13px",
            fontFamily:   "system-ui, sans-serif",
            cursor:       "grab",
            whiteSpace:   "nowrap",
            userSelect:   "none",
        });

        const title = document.createElement("span");
        element.appendChild(title);
        cache.title = title;

        // ---- drag ----

        let drag = null;

        element.addEventListener("pointerdown", e => {
            drag = { x: e.clientX, y: e.clientY };
            element.setPointerCapture(e.pointerId);
            element.style.cursor = "grabbing";
            e.stopPropagation();
        });

        element.addEventListener("pointermove", e => {
            if (!drag) return;
            const zoom = cache.vsgraph?.camera?.zoom ?? 1;
            node.data.vsgraph.x += (e.clientX - drag.x) / zoom;
            node.data.vsgraph.y += (e.clientY - drag.y) / zoom;
            drag.x = e.clientX;
            drag.y = e.clientY;
            cache.vsgraph?.render();
        });

        element.addEventListener("pointerup", () => {
            drag = null;
            element.style.cursor = "grab";
        });

        element.addEventListener("pointercancel", () => {
            drag = null;
            element.style.cursor = "grab";
        });

        return { element, cache };
    }

    static renderFn({ node, element, graph, vsgraph, cache, ctx }) {
        // Store vsgraph ref from ctx so drag handlers can trigger render & read zoom
        cache.vsgraph = ctx?.vsgraph ?? null;

        const { x, y } = node.data.vsgraph;
        element.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;

        cache.title.textContent = node.data.label;
    }
}

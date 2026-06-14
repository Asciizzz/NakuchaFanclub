/* VsData
By Asciiz

Base class for self-rendering graph data
*/

export class VsData {

    /**
     * Called once when VsGraph first encounters this data
     * Returns an element to mount into the world and an optional cache for DOM refs
     *
     * Default creates a bare div with an empty cache
     * Subclasses can call { element, cache } = super.createFn(...) and build on top
     *
     * @param {{ node?: import("../Agraph.js").Anode, edge?: import("../Agraph.js").Aedge, graph: import("../Agraph.js").Agraph }} params
     * @returns {{ element: HTMLElement, cache: object }}
     */
    static createFn({ node, edge, graph }) {
        const element = document.createElement("div");
        return { element, cache: {} };
    }

    /**
     * Called every render frame
     * Use this to update styles, content, and positioning based on current data and ctx
     *
     * @param {{ node?: import("../Agraph.js").Anode, edge?: import("../Agraph.js").Aedge, graph: import("../Agraph.js").Agraph, element: HTMLElement, cache: object, ctx: object }} params
     */
    static renderFn({ node, edge, graph, element, cache, ctx }) {
    }
}

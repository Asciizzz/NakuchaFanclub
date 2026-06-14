/* VsData
By Asciiz

Base class for self-rendering graph data
*/

export class VsData {
    /**
     * @param {{
     * node?: import("../Agraph.js").Anode,
     * edge?: import("../Agraph.js").Aedge,
     * graph: import("../Agraph.js").Agraph,
     * vsgraph: import("./VsGraph.js")
     * }} params
     * @returns {{ element: HTMLElement, cache: object }}
     */
    static createFn({ node, edge, graph, vsgraph } = {}) {
        const element = document.createElement("div");
        return { element, cache: {} };
    }

    /**
     *
     * @param {{
     * node?: import("../Agraph.js").Anode,
     * edge?: import("../Agraph.js").Aedge,
     * graph: import("../Agraph.js").Agraph,
     * vsgraph: import("./VsGraph.js"),
     * element: HTMLElement,
     * cache: object,
     * ctx: object
     * }} params
     */
    static renderFn({ node, edge, element, graph, vsgraph , cache, ctx } = {}) {}
}

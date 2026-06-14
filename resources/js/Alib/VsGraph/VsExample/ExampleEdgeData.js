import { VsData } from "../VsData.js";

/**
 * Example edge data rendered as an SVG line with arrowhead.
 *
 * Reads source/destination node positions from node.data.vsgraph to draw the edge.
 * The SVG element sits at world origin (0,0) with overflow visible,
 * so line coordinates map directly to world-space positions.
 */
export class ExampleEdgeData extends VsData {

    constructor({ color = "#555", width = 1.5 } = {}) {
        super();
        this.color = color;
        this.width = width;
    }

    static createFn({ edge, graph }) {
        const ns = "http://www.w3.org/2000/svg";

        const svg = document.createElementNS(ns, "svg");
        Object.assign(svg.style, {
            position:      "absolute",
            left:          "0",
            top:           "0",
            width:         "0",
            height:        "0",
            overflow:      "visible",
            pointerEvents: "none",
        });

        // Arrowhead marker
        const defs   = document.createElementNS(ns, "defs");
        const marker = document.createElementNS(ns, "marker");
        const markerId = `arrow-${edge.id}`;
        marker.setAttribute("id",           markerId);
        marker.setAttribute("viewBox",      "0 0 10 10");
        marker.setAttribute("refX",         "10");
        marker.setAttribute("refY",         "5");
        marker.setAttribute("markerWidth",  "8");
        marker.setAttribute("markerHeight", "8");
        marker.setAttribute("orient",       "auto-start-reverse");

        const arrow = document.createElementNS(ns, "path");
        arrow.setAttribute("d", "M 0 0 L 10 5 L 0 10 z");
        arrow.setAttribute("fill", edge.data.color);

        marker.appendChild(arrow);
        defs.appendChild(marker);
        svg.appendChild(defs);

        // Main line
        const line = document.createElementNS(ns, "line");
        line.setAttribute("stroke",     edge.data.color);
        line.setAttribute("stroke-width", String(edge.data.width));
        line.setAttribute("marker-end", `url(#${markerId})`);
        svg.appendChild(line);

        svg.style.zIndex = "-1"; // Ensure edges are behind nodes

        return { element: svg, cache: { line, arrow } };
    }

    static renderFn({ edge, graph, element, cache, ctx }) {
        const src = graph.getNode(edge.srcId);
        const dst = graph.getNode(edge.dstId);
        if (!src || !dst) return;

        const sx = src.data.vsgraph?.x ?? 0;
        const sy = src.data.vsgraph?.y ?? 0;
        const dx = dst.data.vsgraph?.x ?? 0;
        const dy = dst.data.vsgraph?.y ?? 0;

        cache.line.setAttribute("x1", sx);
        cache.line.setAttribute("y1", sy);
        cache.line.setAttribute("x2", dx);
        cache.line.setAttribute("y2", dy);

        // Update arrow color to match edge data (in case it changes)
        cache.arrow.setAttribute("fill", edge.data.color);
        cache.line.setAttribute("stroke", edge.data.color);
        cache.line.setAttribute("stroke-width", String(edge.data.width));
    }
}

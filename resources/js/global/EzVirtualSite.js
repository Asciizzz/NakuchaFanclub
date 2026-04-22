/*
EzVirtualSite
By Asciiz

# Lightweight virtual multi-page runtime using iframe rendering.

# What tf is this
    + Converts structured JSON into isolated iframe-based pages
    + Each page renders into its own iframe
    + Focused on rendering + data management (no heavy editor logic)

# Stuff to be aware of
    + pages: map of iframe elements (id -> iframe)
    + activePage: current visible page id
    + data: project JSON (pages, nodes, assets)
    + host: container element
    + no implicit auto-reload on mutation

# Functions and stuff

    ## Pages and data related
        init({ host, dataJSON, interactions=false })
        getActivePageId()
        getDataJSON()
        listPages()
        getPage(id)

    ## Page states
        load(pageId)
        changePage(pageId)
        syncPages()

    ## Page functions
        addPage({ title, slug })
        removePage(pageId)
        updatePage(pageId, updates)

    ## Node operations
        addNode(nodeData)           -> adds node and return its id
        writeNode(nodeId, nodeData) -> nodeData = { attrs, text, graph }
        readNode(nodeId)            -> returns a node object {
                                        id, tag, parent, children, attrs, text, graph 
                                    }
        reparentNode(childId, newParentId)
        deleteNode(nodeId)

    ## Helper functions
    static makeObjectFromJSON(path)

# Data rules:
    + page ids: p<counter>
    + node ids: n<counter>
    + page/node counter will always increment by 1 for new page/node
        + I believe 2^53 pages/nodes should be sufficient
    + nodes form a tree (go back to comp-sci nerd)
    + _prefixed attrs are engine-reserved, not HTML attributes
*/

(function(){

const isObj = v => v && typeof v === "object";
const isStr = v => typeof v === "string" && v.trim();

class EzVirtualSite {
    #pages = {}; // id -> iframe
    #active = null; // ID
    #data = null; // JSON
    #host = null; // container element

    static clone(v){
        return typeof structuredClone === "function"
            ? structuredClone(v)
            : JSON.parse(JSON.stringify(v));
    }

    init(cfg={}){
        if(!(cfg.host instanceof Element)) throw new Error("Invalid host");

        this.#host = cfg.host;
        this.#data = isObj(cfg.dataJSON)
            ? EzVirtualSite.clone(cfg.dataJSON)
            : this.#emptyData();

        this.#buildFrames();

        const start = this.#data.pages.page_start || this.#firstPage();
        if(start) this.changePage(start);

        return this;
    }

    /* ---------- Core ---------- */

    load(pageId){
        const page = this.getPage(pageId);
        const iframe = this.#pages[`ez-${pageId}`];
        if(!page || !iframe) return false;

        const doc = iframe.contentDocument;
        if(!doc) return false;

        doc.open();
        doc.write("<!DOCTYPE html><html><head></head><body></body></html>");
        doc.close();

        this.#renderPage(doc, page);
        return true;
    }
    reload(pageId){
        load(pageId || this.#active);
    } // Alias for load

    changePage(id){
        if(!this.getPage(id)) return false;

        const next = this.#pages[`ez-${id}`];
        if(!next) return false;

        this.load(id);

        if(this.#active){
            const prev = this.#pages[`ez-${this.#active}`];
            if(prev) prev.style.display = "none";
        }

        next.style.display = "block";
        this.#active = id;
        this.#data.pages.page_start = id;
        return true;
    }

    listPages(){
        return Object.entries(this.#data.pages.page_data).map(([id, p])=>({
            id,
            title: p.title,
            slug: p.slug
        }));
    }

    addPage({ title, slug }){
        const id = `p${this.#data.pages.page_counter++}`;
        this.#data.pages.page_data[id] = {
            title: isStr(title) ? title : "New Page",
            slug: isStr(slug) ? slug : `new-page-${id}`,
            node_root: "n0"
        };
        return id;
    }

    removePage(id){
        if(!this.getPage(id)) return false;
        delete this.#data.pages.page_data[id];
        const iframe = this.#pages[`ez-${id}`];

        if(iframe){
            iframe.remove();
            delete this.#pages[`ez-${id}`];
        }

        if(this.#active === id){
            const next = this.#firstPage();

            if(next) this.changePage(next);
            else     this.#active = null;
        }
        return true;
    }

    getPage(id){ return this.#data.pages.page_data[id] || null; }

    getActiveID(){ return this.#active; }
    getActivePage(){ return this.getPage(this.#active); }

    /* ---------- Node Ops ---------- */

    addNode(data={}){
        const page = this.getPage(this.#active);
        if(!page) return null;

        const parent = data.parent || page.node_root;
        if(!page.nodes[parent]) return null;

        const id = this.#nextNodeId(page);

        page.nodes[id] = {
            tag: data.tag || "div",
            parent,
            attrs: data.attrs,
            text: data.text,
            graph: data.graph || null
        };

        (page.nodes[parent].children ||= []).push(id);
        return id;
    }

    readNode(id){
        const pageId = this.#active;
        const page = this.getPage(pageId);
        if(!page) return null;

        const n = page.nodes[id];
        if(!n) return null;

        return {
            page_id: pageId,
            node_id: id,
            tag: n.tag,
            parent: n.parent,
            children: n.children || [],
            text: n.text || null,
            attrs: n.attrs || null,
            graph: n.graph || null
        };
    }

    writeNode(id, { attrs, text, graph }){
        const page = this.getPage(this.#active);
        if(!page) return false;

        const node = page.nodes[id];
        if(!node) return false;

        if (attrs !== undefined) node.attrs = attrs;
        if (text  !== undefined) node.text  = text;
        if (graph !== undefined) node.graph = graph;
        return true;
    }

    reparentNode(childId, newParentId) {
        const page = this.getPage(this.#active);
        if (!page) return false;
        const nodes = page.nodes;

        const child = nodes[childId];
        const newParent = nodes[newParentId];

        if (!child || !newParent) return false;

        // Prevent moving root
        if (childId === page.node_root) return false;

        const oldParentId = child.parent;
        const oldParent = nodes[oldParentId];
        if (!oldParent) return false;

        // Prevent cycles
        let current = newParentId;
        while (current) {
            if (current === childId) return false;
            current = nodes[current]?.parent;
        }

        // Remove from old parent
        oldParent.children = (oldParent.children || []).filter(cid => cid !== childId);
        // Add to new parent
        (newParent.children ||= []).push(childId);
        // Update parent ref
        child.parent = newParentId;

        return true;
    }

    deleteNode(id, reparentChildren = false) {
        const page = this.getPage(this.#active);
        if (!page) return false;
        const nodes = page.nodes;

        const node = nodes[id];
        if (!node) return false;

        // Prevent deleting root
        if (id === page.node_root) return false;

        const parent = nodes[node.parent];
        if (!parent) return false;

        const children = node.children || [];

        if (reparentChildren) {
            // Move children to rescue parent
            parent.children = parent.children.filter(cid => cid !== id);

            for (const childId of children) {
                reparentNode(childId, parent.id);
            }
        } else {
            // Recursive delete
            const walkDelete = (nid) => {
                const n = nodes[nid];
                if (!n) return;

                (n.children || []).forEach(walkDelete);
                delete nodes[nid];
            };

            walkDelete(id);

            // Remove reference from parent
            parent.children = parent.children.filter(cid => cid !== id);
        }

        // Finally delete the node itself
        delete nodes[id];

        return true;
    }

    /* ---------- Rendering ---------- */

    #renderPage(doc, page){
        doc.title = page.title;

        this.#renderNodes(doc, page);
        this.#injectCSS(doc, page);
        this.#injectJS(doc, page);
    }

    #renderNodes(doc, page){
        const nodes = page.nodes;

        const build = (id)=>{
            const n = nodes[id];
            if(!n) return null;

            const el = id===page.node_root
                ? doc.body
                : doc.createElement(n.tag || "div");

            this.#applyAttrs(el, n.attrs);
            el.dataset.vsNodeId = id;

            if(n.text && !(n.children?.length)){
                el.textContent = n.text;
            }

            (n.children||[]).forEach(cid=>{
                const c = build(cid);
                if(c && c!==doc.body) el.appendChild(c);
            });

            return el;
        };

        build(page.node_root);
    }

    /* ---------- Assets ---------- */

    #injectCSS(doc, page){
        (page.include?.css || []).forEach(name=>{
            const asset = this.#data.stylesheets[name];
            if(!asset) return;

            const style = doc.createElement("style");
            style.textContent = typeof asset === "string"
                ? asset
                : this.#compileCSS(asset);

            doc.head.appendChild(style);
        });
    }

    #injectJS(doc, page){
        (page.include?.js || []).forEach(name=>{
            const txt = this.#data.scripts[name];
            if(!txt) return;

            const s = doc.createElement("script");
            s.textContent = txt;
            doc.body.appendChild(s);
        });
    }

    #compileCSS(obj){
        return Object.entries(obj).map(([sel, rules])=>{
            const body = Object.entries(rules)
                .map(([k,v])=>`${this.#kebab(k)}:${v}`)
                .join(";");
            return `${sel}{${body}}`;
        }).join("");
    }

    #kebab(str){
        return str.replace(/[A-Z]/g,m=>"-"+m.toLowerCase());
    }

    #applyAttrs(el, attrs={}){
        for(const [k,v] of Object.entries(attrs||{})){
            if(k === "_href_id"){
                el.dataset.hrefId = v;
                if(el.tagName === "A"){
                    const p = this.getPage(v);
                    if(p) el.href = "/"+p.slug;
                }
                continue;
            }
            if(k.startsWith("_")) continue;
            el.setAttribute(k,v);
        }
    }

    /* ---------- Utils ---------- */

    #nextNodeId(page){
        let i = page.node_counter || 0;
        while(page.nodes[`n${i}`]) i++;
        page.node_counter = i+1;
        return `n${i}`;
    }

    #buildFrames(){
        this.#pages = {};
        this.#host.replaceChildren();

        for(const id of Object.keys(this.#data.pages.page_data)){
            const f = document.createElement("iframe");
            f.id = `ez-${id}`;
            f.style.cssText = "width:100%;height:100%;border:0;display:none;";
            this.#host.appendChild(f);
            this.#pages[f.id] = f;
        }
    }

    #firstPage(){
        return Object.keys(this.#data.pages.page_data)[0] || null;
    }

    #emptyData(){
        return {
            pages:{
                page_start:"p0",
                page_counter:1,
                page_data:{
                    p0:{
                        title:"New Page",
                        slug:"new-page",
                        node_root:"n0",
                        node_counter:1,
                        nodes:{ n0:{ tag:"body", parent:null, children:[] } },
                        include:{css:[],js:[]}
                    }
                }
            },
            stylesheets:{},
            scripts:{}
        };
    }
}

window.EzVirtualSite = EzVirtualSite;

})();

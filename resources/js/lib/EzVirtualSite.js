/*
EzVirtualSite
By Asciiz

# Cool virtual site thingy that do things and stuff


# Constructor:
    new EzVirtualSite(name)         creates iframe id="ez-virtualsite-host-<name>", ready immediately

# Host / container: the iframe element/the container (that contain the iframe)
    getHost()                       returns the iframe element
    mount(containerEl)            appends iframe into a container
    unmount()                       removes iframe from its current parent

# Data (json)
    setData(dataObject)             replaces #data, iframe untouched until reload policies run
    setGlobalStyle(s)               replaces #glbstyle, iframe untouched until reloadStyles()
    getData()

# Page API:
    getPageData(id?)                getActiveID()
    changePage(id)                  full reload (nodes + styles + scripts)
    listPages()
    addPage({title, slug})          -> id
    removePage(id)
    updatePage(id, {title?, slug?})

# Reload policies
    reloadNodes()                   re-renders DOM from #data nodes of active page
    reloadStyles()                  re-renders styles from #data stylesheets + active page includes
    reloadScripts()                 rebuilds #live.events/actions, fix #live.variables, re-fires onload
    reload()                        all of the aboves

# Node API (operates on active page, call reloadNodes() to reflect):
    addNode({tag, parent?, attrs?, text?, graph?})   -> id
    readNode(id)                    -> {page_id, node_id, tag, parent, children, attrs, text, graph}
    writeNode(id, {attrs?, text?, graph?})
    reparentNode(childId, newParentId)
    deleteNode(id, reparentChildren=false)

# Stylesheet API (call reloadStyles() to reflect):
    listStylesheets()               getStylesheet(name)
    setStylesheet(name, cssData)    removeStylesheet(name)

# Includes API (call appropriate reload to reflect):
    getPageIncludes(id?)
    addPageInclude(type, name, id?)
    removePageInclude(type, name, id?)

# Script API (call reloadScripts() to reflect):
    addScript(name, scriptData)     removeScript(name)     getScript(name)

# Script data shape:
    {
        variables: { key: value, ... },
        actions:   { name: "code string - has access to `variables` and `event`" },
        events:    { type: [{ selector, action }, ...] }
    }

# Live layer (#live) - persists until explicit reload:
    variables   reconciled on reloadScripts()
    actions     rebuilt from JSON on reloadScripts()
    events      rebuilt from JSON on reloadScripts()
    docTypes    Set of event types with a listener on doc  - never re-added
    winTypes    Set of event types with a listener on win  - never re-added

# Notes:

## Important
    Document can only exist after mounting
        - Flow: buildFrame -> mount -> writeFrame
    Many operations are happening on the #active page
        - Node or reload operations are working with the active page
    Data layer and live layer are separated, live layer will only be updated via reload policies
        - It means you have to reload() in order for the #data to apply to the live iframe
    Reload are splits, this allows external systems to call only what's needed
        - For example: a css editor only need to call reloadStyles() instead of reloading the entire iframe
    Listeners attach once per event type and are never removed or re-added
        - Upon reload, events that are unused will still have their listeners
    Most modification happens on a select few elements instead of the entire iframe's document
        - ez-virtualsite-{style, global-style, main, script}
        - You can change the #vskey if you'd like

## Cool

    Global style:
        - Is applied to every page, and overrides all their styles if there's a conflict
        - Can be especially useful for external systems that want to inject custom styles without modifying the data layer
        - For example:
            Hovering over an element in a web editor will give it a red outline
                <iframe-selector> { outline: 1px solid red !important; }
        - "!important" is optional since global style is loaded after page styles (giving it higher priority)

*/

(function () {

    const isObj       = v => v !== null && typeof v === "object";
    const isStr       = v => typeof v === "string" && v.trim() !== "";
    const clone       = v => typeof structuredClone === "function" ? structuredClone(v) : JSON.parse(JSON.stringify(v));
    const filterKids  = (arr, id) => (arr || []).filter(c => c !== id);

    class EzVirtualSite {

        #host   = null;
        #data   = null;
        #active = null;
        #glbstyle = "";
        #name = null;

        // Live content layer - persists until explicit reload policies
        #live = {
            variables: {},          // mutable script state
            actions:   {},          // name -> code string
            events:    {},          // type -> [{selector, action}, ...]
            docTypes:  new Set(),   // event types already listening on doc
            winTypes:  new Set(),   // event types already listening on win
        };

        /* -- constructor -- */

        constructor(name) {
            this.#name = name || `vs${Math.floor(Math.random() * 10000)}`;
        }

        #doc() { return this.#host?.contentDocument || null; }
        #win() { return this.#host?.contentWindow   || null; }
        #vskey(k) { return `ez-virtualsite-${k}`; }
        #vselement(k) { return this.#doc()?.getElementById(this.#vskey(k)) || null; }

        // buildFrame -> mount(element) -> writeFrame

        getHost()   { return this.#host; }

        mount(el) { if (el instanceof Element) el.appendChild(this.#host); return this; }
        buildFrame() {
            const iframe = document.createElement("iframe");
            iframe.id = `ez-virtualsite-host-${this.#name}`;
            iframe.style.cssText = "width:100%;height:100%;border:0;";

            // Remove all default right-click context menu to avoid interference
            iframe.addEventListener("load", () => {
                const doc = this.#doc();
                if (doc) doc.addEventListener("contextmenu", e => e.preventDefault());
            });

            this.#host = iframe;
            return this;
        }
        writeFrame() {
            const doc = this.#doc();
            doc.open();
            doc.write(`<!DOCTYPE html>
                <html>
                    <head>
                        <style id="${this.#vskey("style")}"></style>
                        <style id="${this.#vskey("global-style")}"></style>
                    </head>
                    <body id="${this.#vskey("main")}"></body>
                </html>`);
            doc.close();
            return this;
        }

        setData(d) {
            if (!isObj(d)) return null;
            this.#data = clone(d);
            this.#data.pages ||= { page_start: null, page_counter: 0, page_data: {} };
            this.#data.stylesheets ||= {};
            this.#data.scripts     ||= {};

            const pages = this.#data.pages;
            this.#active = (pages.page_start && this.#pageData(pages.page_start))
                ? pages.page_start
                : this.#firstPage();
            return this;
        }

        getData() { return this.#data ? clone(this.#data) : null; }

        // Useful for external systems that want custom style and stuff
        setGlobalStyle(s) {
            this.#glbstyle = s instanceof HTMLStyleElement ? s.textContent || "" : (typeof s === "string" ? s : "");
            return this;
        }


        getActiveID()                  { return this.#active; }
        getPageData(id = this.#active) { return this.#pageData(id); }

        changePage(id = this.#active) {
            if (!this.#pageData(id)) return false;
            this.#active = this.#data.pages.page_start = id;
            this.reload();
            this.#emit("ezvs:page-selected", { pageId: id });
            this.#emitPagesChanged();
            return true;
        }

        listPages() {
            return Object.entries(this.#data.pages.page_data)
                .map(([id, p]) => ({ id, title: p.title, slug: p.slug }));
        }

        addPage({ title, slug } = {}) {
            const id = `p${this.#data.pages.page_counter++}`;
            this.#data.pages.page_data[id] = {
                title: isStr(title) ? title : "New Page",
                slug:  isStr(slug)  ? slug  : `new-page-${id}`,
                node_counter: 0, nodes: {}, include: { css: [], js: [] }
            };
            this.#emitPagesChanged();
            return id;
        }

        removePage(id) {
            if (!this.#pageData(id)) return false;
            delete this.#data.pages.page_data[id];
            if (this.#active === id) {
                const next = this.#firstPage();
                if (next) this.changePage(next);
                else this.#active = null;
            }
            this.#emitPagesChanged();
            return true;
        }

        updatePage(id, u = {}) {
            const p = this.#pageData(id); if (!p) return false;
            if ("title" in u) p.title = isStr(u.title) ? u.title : "New Page";
            if ("slug"  in u) p.slug  = isStr(u.slug)  ? u.slug  : p.slug;
            this.#emitPagesChanged();
            return true;
        }


        addNode(d = {}) {
            const page = this.#pageData(this.#active); if (!page) return null;
            const parent = isStr(d.parent) ? d.parent : null;
            if (parent && !page.nodes[parent]) return null;
            const id = this.#nextNodeId(page);
            page.nodes[id] = {
                tag:   d.tag || "div", parent,
                attrs: isObj(d.attrs)           ? clone(d.attrs) : undefined,
                text:  typeof d.text === "string" ? d.text       : undefined,
                graph: d.graph || null
            };
            if (parent) (page.nodes[parent].children ||= []).push(id);
            return id;
        }

        readNode(id) {
            const page = this.#pageData(this.#active); if (!page) return null;
            const node = page.nodes[id];               if (!node) return null;
            return { 
                page_id: this.#active,
                node_id: id,
                tag: node.tag,
                parent: node.parent,
                children: node.children || [],
                text:  node.text ?? null,
                attrs: node.attrs ?? null,
                graph: node.graph ?? null
            };
        }

        writeNode(id, { attrs, text, graph } = {}) {
            const page = this.#pageData(this.#active); if (!page) return false;
            const node  = page.nodes[id];              if (!node) return false;

            if (attrs !== undefined) node.attrs = attrs;
            if (text  !== undefined) node.text  = text;
            if (graph !== undefined) node.graph = graph;
            return true;
        }

        reparentNode(childId, newParentId) {
            const page = this.#pageData(this.#active);
            if (!page) return false;

            const { nodes } = page;
            const child = nodes[childId], pid = isStr(newParentId) ? newParentId : null, np = pid ? nodes[pid] : null;
            if (!child || (pid && !np)) return false;
            for (let c = pid; c; c = nodes[c]?.parent) if (c === childId) return false;
            const op = child.parent ? nodes[child.parent] : null;
            if (op) op.children = filterKids(op.children, childId);
            if (np) (np.children ||= []).push(childId);
            child.parent = pid;
            return true;
        }

        deleteNode(id, reparentChildren = false) {
            const page = this.#pageData(this.#active); if (!page) return false;
            const { nodes } = page;
            const node = nodes[id]; if (!node) return false;
            const parent   = node.parent ? nodes[node.parent] : null;
            const children = node.children || [];
            if (reparentChildren) {
                if (parent) parent.children = filterKids(parent.children, id);
                for (const cid of children) {
                    const child = nodes[cid]; if (!child) continue;
                    child.parent = node.parent ?? null;
                    if (parent) (parent.children ||= []).push(cid);
                }
            } else {
                const cascade = nid => { const n = nodes[nid]; if (!n) return; (n.children || []).forEach(cascade); delete nodes[nid]; };
                cascade(id);
                if (parent) parent.children = filterKids(parent.children, id);
            }
            delete nodes[id];
            return true;
        }


        getPageIncludes(id = this.#active) {
            const page = this.#pageData(id); if (!page) return null;
            return clone(this.#inc(page));
        }

        addPageInclude(type, name, id = this.#active) {
            const page = this.#pageData(id);
            if (!page || !isStr(name) || (type !== "css" && type !== "js")) return false;
            const list = this.#inc(page)[type];
            if (list.includes(name)) return true;
            list.push(name);
            return true;
        }

        removePageInclude(type, name, id = this.#active) {
            const page = this.#pageData(id);
            if (!page || !isStr(name) || (type !== "css" && type !== "js")) return false;
            const inc  = this.#inc(page);
            const next = inc[type].filter(n => n !== name);
            if (next.length === inc[type].length) return true;
            inc[type] = next;
            return true;
        }

        listStylesheets()  { return Object.keys(this.#data.stylesheets || {}); }
        listScripts()      { return Object.keys(this.#data.scripts     || {}); }


        getStylesheet(name) {
            if (!isStr(name)) return null;
            const d = this.#data.stylesheets?.[name];
            return d === undefined ? null : clone(d);
        }

        setStylesheet(name, cssData) {
            if (!isStr(name) || (!isObj(cssData) && typeof cssData !== "string")) return false;
            this.#data.stylesheets[name] = clone(cssData);
            return true;
        }

        removeStylesheet(name) {
            if (!isStr(name) || !this.#data.stylesheets?.[name]) return false;
            delete this.#data.stylesheets[name];
            for (const page of Object.values(this.#data.pages.page_data || {}))
                this.#inc(page).css = this.#inc(page).css.filter(n => n !== name);
            return true;
        }


        addScript(name, data) {
            if (!isStr(name) || !isObj(data)) return false;
            this.#data.scripts[name] = clone(data);
            return true;
        }

        removeScript(name) {
            if (!this.#data.scripts[name]) return false;
            delete this.#data.scripts[name]; return true;
        }

        getScript(name) { return this.#data.scripts[name] ? clone(this.#data.scripts[name]) : null; }


        reload() {
            this.reloadNodes();
            this.reloadStyles();
            this.reloadScripts();
            return this;
        }

        reloadNodes() {
            const page = this.#pageData(this.#active), doc = this.#doc();
            if (!page || !doc) return this;
            const mount = this.#vselement("main");
            if (!mount) return this;
            mount.replaceChildren();
            const { nodes } = page, cache = new Map(), visiting = new Set();
            const build = id => {
                if (cache.has(id))    return cache.get(id);
                if (visiting.has(id)) return null;
                const n = nodes[id]; if (!n) return null;
                visiting.add(id);
                const el = doc.createElement(n.tag || "div");
                this.#applyAttrs(el, n.attrs);
                el.dataset.vsNodeId = id;
                if (typeof n.text === "string") el.appendChild(doc.createTextNode(n.text));
                (n.children || []).forEach(cid => { const c = build(cid); if (c) el.appendChild(c); });
                visiting.delete(id); cache.set(id, el); return el;
            };
            Object.keys(nodes)
                .filter(id => { const pid = nodes[id]?.parent; return !isStr(pid) || !nodes[pid]; })
                .forEach(rid => { const el = build(rid); if (el) mount.appendChild(el); });
            return this;
        }

        reloadStyles() {
            const page = this.#pageData(this.#active), doc = this.#doc();
            if (!page || !doc) return this;

            this.#styleEl(doc, this.#vskey("style")).textContent = (page.include?.css || [])
                .map(n => { const a = this.#data.stylesheets?.[n]; return a ?
                    `/* ${n} */\n${typeof a === "string" ? a : this.#css(a)}` : ""; })
                .filter(Boolean).join("\n\n");

            // Global style overrides page styles if there's a conflict
            this.#styleEl(doc, this.#vskey("global-style")).textContent = this.#glbstyle;
            return this;
        }

        reloadScripts() {
            const page = this.#pageData(this.#active);
            const doc  = this.#doc(), win = this.#win();
            if (!page || !doc || !win) return this;

            // Merge all included scripts from #data into expected state
            const expected = { variables: {}, actions: {}, events: {} };
            for (const name of (page.include?.js || [])) {
                const s = this.#data.scripts?.[name]; if (!isObj(s)) continue;
                Object.assign(expected.variables, s.variables || {});
                Object.assign(expected.actions,   s.actions   || {});
                for (const [type, bindings] of Object.entries(s.events || {}))
                    (expected.events[type] ||= []).push(...bindings);
            }

            // Reconcile #live.variables:
            //   - slime orphaned keys
            //   - type mismatch (JSON wins)
            //   - missing keys (JSON initializes)
            //   - same type + already exists -> live value wins
            for (const k in this.#live.variables)
                if (!(k in expected.variables)) delete this.#live.variables[k];

            for (const k in expected.variables) {
                const exists = k in this.#live.variables;
                const mismatch = exists && typeof this.#live.variables[k] !== typeof expected.variables[k];
                if (!exists || mismatch) this.#live.variables[k] = expected.variables[k];
            }

            // Rebuild actions and events from JSON (always fresh)
            this.#live.actions = expected.actions;
            this.#live.events  = expected.events;

            // Attach listeners once per type - never re-added
            for (const [type, bindings] of Object.entries(this.#live.events)) {
                if (type === "onload") {
                    bindings.filter(b => b.selector === "window")
                            .forEach(b => this.#exec(b.action, new Event("load")));
                    continue;
                }
                if (!this.#live.docTypes.has(type)) {
                    doc.addEventListener(type, e => this.#fire(doc, type, e));
                    this.#live.docTypes.add(type);
                }
                if (bindings.some(b => b.selector === "window") && !this.#live.winTypes.has(type)) {
                    win.addEventListener(type, e => this.#fire(null, type, e));
                    this.#live.winTypes.add(type);
                }
            }

            return this;
        }

        #exec(name, event) {
            const code = this.#live.actions[name]; if (typeof code !== "string") return;
            try { new Function("variables", "event", code)(this.#live.variables, event); }
            catch (e) { console.warn(`[EzVirtualSite] action "${name}" threw:`, e); }
        }

        #fire(doc, type, event) {
            for (const bindings of Object.values(this.#live.events[type] ? [this.#live.events[type]] : [])) {
                for (const b of bindings) {
                    if (!doc) { if (b.selector === "window") this.#exec(b.action, event); }
                    else {
                        if (b.selector === "window") continue;
                        try {
                            for (const el of doc.querySelectorAll(b.selector))
                                if (el === event.target || el.contains(event.target)) this.#exec(b.action, event);
                        } catch (_) {}
                    }
                }
            }
        }


        #emit(name, detail = {}) { document.dispatchEvent(new CustomEvent(name, { detail })); }
        #emitPagesChanged()      { this.#emit("ezvs:pages-changed", { pages: this.listPages(), currentPageId: this.#active }); }

        #pageData(id) { return this.#data?.pages.page_data[id] || null; }
        #firstPage()  { return Object.keys(this.#data?.pages.page_data || {})[0] || null; }

        #inc(page) {
            const inc = page.include ||= {};
            inc.css ||= []; inc.js ||= [];
            return inc;
        }

        #applyAttrs(el, attrs) {
            for (const [k, v] of Object.entries(attrs || {})) {
                if (k === "_href_id") {
                    el.dataset.hrefId = v;
                    if (el.tagName === "A") { const p = this.#pageData(v); if (p) el.href = "/" + p.slug; }
                } else if (!k.startsWith("_")) { el.setAttribute(k, v); }
            }
        }

        #css(obj) {
            return Object.entries(obj).map(([sel, rules]) =>
                `${sel}{${Object.entries(rules).map(([k, v]) =>
                    `${k.replace(/[A-Z]/g, m => "-" + m.toLowerCase())}:${v}`).join(";")}}`
            ).join("");
        }

        #styleEl(doc, id) {
            let el = doc.getElementById(id);
            if (!el) { 
                el = doc.createElement("style"); 
                el.id = id;
                (doc.head || doc.documentElement).appendChild(el);
            }
            return el;
        }

        #nextNodeId(page) {
            let i = page.node_counter || 0;
            while (page.nodes[`n${i}`]) i++;
            page.node_counter = i + 1;
            return `n${i}`;
        }

        #emptyData() {
            return { pages: { page_start: "p0", page_counter: 1, page_data: {
                p0: { title: "New Page", slug: "new-page", node_counter: 0, nodes: {}, include: { css: [], js: [] } }
            }}, stylesheets: {}, scripts: {} };
        }
    }

    window.EzVirtualSite = EzVirtualSite;

})();

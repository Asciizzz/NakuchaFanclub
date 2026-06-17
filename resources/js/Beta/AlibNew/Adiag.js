export class Adiag {
    results = [];

    static TYPE_OK = "ok";
    static TYPE_ERR = "err";
    static TYPE_WARN = "warn";
    static TYPE_INFO = "info";

    ok(args) { this.#add(Adiag.TYPE_OK, args); }
    err(args) { this.#add(Adiag.TYPE_ERR, args); }
    warn(args) { this.#add(Adiag.TYPE_WARN, args); }
    info(args) { this.#add(Adiag.TYPE_INFO, args); }

    #add(type, { code = "", raw = "", data = null } = {}) {
        this.results.push({ type, code, raw, data });

        // Shouldn't happen but just in case
        if (this.results.length > 1000) {
            this.results.shift();
        }
    }

    allOk() { return this.results.every(result => result.type === Adiag.TYPE_OK); }
    findOk() { return this.results.filter(result => result.type === Adiag.TYPE_OK); }

    hasErrs() { return this.results.some(result => result.type === Adiag.TYPE_ERR); }
    findErrs() { return this.results.filter(result => result.type === Adiag.TYPE_ERR); }

    hasWarns() { return this.results.some(result => result.type === Adiag.TYPE_WARN); }
    findWarns() { return this.results.filter(result => result.type === Adiag.TYPE_WARN); }

    hasInfos() { return this.results.some(result => result.type === Adiag.TYPE_INFO); }
    findInfos() { return this.results.filter(result => result.type === Adiag.TYPE_INFO); }

    /*
    Replace all $key$ with data.key in the message.
    Support dot nesting: $key.subkey$ -> data.key.subkey
    */
    static compileMsg(raw = "", data = {}) {
        if (typeof raw !== "string" || raw.length === 0) return raw;
        if (data == null || typeof data !== "object") return raw;

        return raw.replace(/\$([A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*)\$/g, (match, path) => {
            if (data == null || typeof data !== "object") return match;

            let value = data;
            for (const key of path.split(".")) {
                if (value == null || typeof value !== "object" || !(key in value)) return match;
                value = value[key];
            }

            if (value instanceof Ares) return value.msg;
            if (value instanceof Error) return value.message;
            if (typeof value === "string") return value;
            if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") return String(value);
            if (value == null) return String(value);
            if (typeof value === "function") return value.name ? `[Function ${value.name}]` : "[Function]";

            try {
                return JSON.stringify(value);
            } catch {
                return String(value);
            }
        });
    }

    static resultToMsg(result) {
        return Adiag.compileMsg(result.raw, result.data);
    }
}
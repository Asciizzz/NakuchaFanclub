/* Ares
By Asciiz

Base result structure with dedicated result subclasses

*/

export class Ares {
    constructor({
        value = undefined,
        src = "",
        code = "",
        raw = "",
        data = null,
    } = {}) {
        this.value = value;
        this.src   = src;
        this.code  = code;
        this.raw   = raw;
        this.data  = data;
    }

    get kind() { return "res"; }

    get ok() { return !(this instanceof Aerr); }
    get err() { return this instanceof Aerr; }

    get isOk() { return this instanceof Aok; }
    get isErr() { return this instanceof Aerr; }
    get isWarn() { return this instanceof Awarn; }
    get isInfo() { return this instanceof Ainfo; }

    get msg() {
        return Ares.compileMsg(this.raw, this.data);
    }

    unwrap() {
        return this.value;
    }

    wrap({ src = "", code = "", raw = "$error$", data = null } = {}) {
        const baseData = data && typeof data === "object" ? data : {};
        return new Aerr({
            src,
            code,
            raw,
            data: { ...baseData, error: this },
        });
    }

    toJSON() {
        return {
            kind: this.kind,
            ok: this.ok,
            src: this.src,
            code: this.code,
            raw: this.raw,
            msg: this.msg,
            data: this.data,
        };
    }

    static ok(value = null, options = {}) {
        return new Aok(value, options);
    }

    static err(options = {}) {
        return new Aerr(options);
    }

    static warn(value = null, options = {}) {
        return new Awarn(value, options);
    }

    static info(value = null, options = {}) {
        return new Ainfo(value, options);
    }

    /**
     * Compile a raw $key$ template using values from data
     * Dot paths are supported, such as $edge.srcId$
     * Missing keys are preserved as-is
     *
     * @param {string} raw
     * @param {object|null} data
     * @returns {string}
     */
    static compileMsg(raw = "", data = null) {
        if (typeof raw !== "string" || raw.length === 0) return raw;

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
}

export class Aok extends Ares {
    constructor(value = null, options = {}) {
        super({ ...options, value });
    }

    get kind() { return "ok"; }
}

export class Aerr extends Ares {
    constructor(options = {}) {
        super(options);
    }

    get kind() { return "err"; }
    get ok() { return false; }

    unwrap() {
        throw this.toError();
    }

    toError() {
        const text = `[${this.src || "Ares"}]<${this.code || "ERR"}> ${this.msg}`;
        const err = new Error(text);

        err.name  = this.code || "AresError";
        err.src   = this.src;
        err.code  = this.code;
        err.raw   = this.raw;
        err.data  = this.data;
        err.ares  = this;

        return err;
    }

    throw() {
        throw this.toError();
    }
}

export class Awarn extends Ares {
    constructor(value = null, options = {}) {
        super({ ...options, value });
    }

    get kind() { return "warn"; }

    log() {
        console.warn(this.msg, this);
        return this;
    }
}

export class Ainfo extends Ares {
    constructor(value = null, options = {}) {
        super({ ...options, value });
    }

    get kind() { return "info"; }

    log() {
        console.info(this.msg, this);
        return this;
    }
}

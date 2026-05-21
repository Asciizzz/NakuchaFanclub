import WrWorld from "./World.js";

/**
 * Compatibility alias for world-centric API.
 * WrAsset now behaves exactly like WrWorld.
 */
export class WrAsset extends WrWorld {
    /**
     * Create a world-backed asset context.
     * @param {object} [options={}] initialization options
     */
    constructor(options = {}) {
        super(options);
    }
}

export default WrAsset;

export class WrComponent {
	node = null;
	enabled = true;

	constructor(options = {}) {
		this.enabled = options?.enabled !== false;
	}

	exec(_run, _node) {}

	destroy() {}
}

export default WrComponent;

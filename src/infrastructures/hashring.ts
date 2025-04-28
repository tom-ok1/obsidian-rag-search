export class HashRing<TNode extends string = string> {
	private readonly replicas: number;
	/** Sorted ring of virtual nodes */
	private ring: Array<{ hash: number; node: TNode }> = [];
	private nodes = new Set<TNode>();

	constructor(opts: { replicas?: number } = {}) {
		this.replicas = opts.replicas ?? 100;
	}

	static fnv1a(str: string): number {
		let h = 0x811c9dc5; // offset basis
		for (let i = 0; i < str.length; i++) {
			h ^= str.charCodeAt(i);
			h = Math.imul(h, 0x01000193) >>> 0; // 32-bit unsigned multiply
		}
		// 32-bit hash mixing
		h = (h + (h << 13)) >>> 0;
		h ^= h >>> 7;
		h = (h + (h << 3)) >>> 0;
		h ^= h >>> 17;
		h = (h + (h << 5)) >>> 0;
		return h >>> 0;
	}

	diffMovedIds(newNumShards: number, allIds: string[]) {
		const oldRing = this;
		const newRing = new HashRing<string>();
		for (let i = 0; i < newNumShards; i++) {
			newRing.addNode(i.toString());
		}

		const moved: { id: string; from: string; to: string }[] = [];

		for (const id of allIds) {
			const from = oldRing.getNode(id);
			const to = newRing.getNode(id);
			if (from !== to) {
				moved.push({ id, from, to });
			}
		}

		return moved;
	}

	addNode(nodeId: TNode): void {
		if (this.nodes.has(nodeId)) return;
		for (let i = 0; i < this.replicas; i++) {
			const hash = HashRing.fnv1a(`${nodeId}:${i}`);
			this.insert({ hash, node: nodeId });
		}
		this.nodes.add(nodeId);
	}

	removeNode(nodeId: TNode): void {
		if (!this.nodes.delete(nodeId)) return;
		this.ring = this.ring.filter((vn) => vn.node !== nodeId);
	}

	getNode(key: string): TNode {
		if (this.ring.length === 0) throw new Error("Hash ring is empty");
		const h = HashRing.fnv1a(key);

		let lo = 0,
			hi = this.ring.length;
		while (lo < hi) {
			const mid = (lo + hi) >>> 1;
			if (h < this.ring[mid].hash) hi = mid;
			else lo = mid + 1;
		}
		return this.ring[lo % this.ring.length].node;
	}

	private insert(vn: { hash: number; node: TNode }): void {
		let lo = 0,
			hi = this.ring.length;
		while (lo < hi) {
			const mid = (lo + hi) >>> 1;
			if (this.ring[mid].hash < vn.hash) lo = mid + 1;
			else hi = mid;
		}
		this.ring.splice(lo, 0, vn);
	}
}

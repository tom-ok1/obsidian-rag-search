export class LRU<K, V> {
	constructor(private readonly max: number) {}
	private map = new Map<K, V>();

	get(key: K) {
		const item = this.map.get(key);
		if (item === undefined) return undefined;

		this.map.delete(key);
		this.map.set(key, item);
		return item;
	}

	/**
	 * @param onEvict - Callback function to be called when an item is evicted
	 */
	set<T>(key: K, val: V, onEvict: (k: K, v: V) => T) {
		if (this.map.has(key)) this.map.delete(key);
		this.map.set(key, val);
		if (this.map.size > this.max) {
			const oldestKey = this.map.keys().next().value as K;
			const oldestVal = this.map.get(oldestKey)!;
			this.map.delete(oldestKey);
			return onEvict(oldestKey, oldestVal);
		}
	}

	has(key: K) {
		return this.map.has(key);
	}

	values() {
		return this.map.values();
	}

	get length() {
		return this.map.size;
	}

	/**
	 * Clears all items from the cache
	 */
	clear() {
		this.map.clear();
	}
}

import {
	Orama,
	AnySchema,
	create,
	getByID,
	insert,
	remove,
} from "@orama/orama";
import { persist, restore } from "@orama/plugin-data-persistence";
import { HashRing } from "../utils/hashring.js";
import { LRU } from "../utils/LRU.js";
import { createTokenizer } from "@orama/tokenizers/japanese";
import { stopwords as japaneseStopwords } from "@orama/stopwords/japanese";
import { DataAdapter, normalizePath } from "obsidian";

/**
 * @param id - Shard ID 1-indexed
 */
export const storeFilename = (id: number) => `vectorstore-${id}`;

/**
 * ShardManager manages the storage, retrieval, and rebalancing of database shards
 */
export class ShardManager<T extends AnySchema> {
	private cache: LRU<number, Orama<T>>;
	private ring: HashRing;
	private language: string = "english";

	private constructor(
		private readonly file: DataAdapter,
		private readonly dirPath: string,
		private readonly schema: T,
		private numOfShardsValue: number,
		cacheSize: number = 3
	) {
		this.cache = new LRU<number, Orama<T>>(cacheSize);
		this.ring = new HashRing();

		// Initialize HashRing with nodes
		for (let i = 0; i < numOfShardsValue; i++) {
			this.ring.addNode(this.nodeName(i));
		}
	}

	private static async create<S extends AnySchema>(
		file: DataAdapter,
		dirPath: string,
		schema: S,
		language: string,
		cacheSize: number = 3
	): Promise<ShardManager<S>> {
		const defaultShards = 1;
		const manager = new ShardManager(
			file,
			dirPath,
			schema,
			defaultShards,
			cacheSize
		);
		manager.language = language;
		await manager.createShards();
		return manager;
	}

	private static async load<S extends AnySchema>(
		file: DataAdapter,
		dirPath: string,
		schema: S,
		cacheSize: number = 3
	): Promise<ShardManager<S>> {
		const detectedShards = await ShardManager.detectShardCount(
			file,
			dirPath
		);
		const manager = new ShardManager(
			file,
			dirPath,
			schema,
			detectedShards,
			cacheSize
		);
		await manager.loadShards();
		return manager;
	}

	private static async detectShardCount(
		file: DataAdapter,
		dirPath: string
	): Promise<number> {
		let shardCount = 0;
		let shardIdx = 1; // Shard IDs are 1-indexed in filenames
		let fileExists = true;

		while (fileExists) {
			const filePath = normalizePath(
				dirPath + "/" + storeFilename(shardIdx)
			);
			fileExists = await file.exists(filePath);
			if (fileExists) {
				shardCount++;
				shardIdx++;
			}
		}

		return Math.max(1, shardCount);
	}

	static async init<S extends AnySchema>(
		file: DataAdapter,
		dirPath: string,
		schema: S,
		language: string = "english"
	): Promise<ShardManager<S>> {
		const isExists = await file.exists(dirPath);
		if (isExists) {
			const manager = await ShardManager.load(file, dirPath, schema);
			manager.language = language;
			return manager;
		} else {
			return ShardManager.create(file, dirPath, schema, language);
		}
	}

	async getShard(idx: number): Promise<Orama<T>> {
		const inCache = this.cache.get(idx);
		if (inCache) return inCache;

		const filePath = this.shardPath(idx);
		const data = await this.file.readBinary(filePath);
		const bufferData = Buffer.from(data);
		const db = await restore<Orama<T>>("binary", bufferData);
		db.schema = this.schema;
		await this.setShard(db, idx);
		return db;
	}

	private async setShard(db: Orama<T>, shardIndex: number): Promise<void> {
		return this.cache.set(shardIndex, db, async (k, evictedDb) => {
			await this.persistShard(evictedDb, k);
		});
	}

	async persistShard(db: Orama<T>, shardIndex: number): Promise<void> {
		const data = await persist(db, "binary");
		const shardPath = this.shardPath(shardIndex);

		await this.file.writeBinary(shardPath, Buffer.from(data));
	}

	private async createShards(): Promise<void> {
		for (let i = 0; i < this.numOfShards; i++) {
			const db = this.createBasedOnLangage();

			// No need to add node here, already done in constructor
			await this.setShard(db, i);
			await this.persistShard(db, i);
		}
	}

	private async loadShards(): Promise<void> {
		for (let i = 0; i < this.numOfShards; i++) {
			const filePath = this.shardPath(i);
			// Skip missing shards
			const fileExists = await this.file.exists(filePath);
			if (!fileExists) {
				console.warn(`Shard ${i + 1} not found at ${filePath}`);
				continue;
			}

			const data = await this.file.readBinary(filePath);
			const bufferData = Buffer.from(data);
			const db = await restore<Orama<T>>("binary", bufferData);
			db.schema = this.schema;

			// No need to add node here, already done in constructor
			await this.setShard(db, i);
			await this.persistShard(db, i);
		}
	}

	private static readonly MAX_SHARD_SIZE_MB: number = 500;
	private static readonly MIN_SHARD_SIZE_MB: number = 100;
	private static readonly MIN_SHARDS: number = 2;
	private static readonly MAX_SHARDS: number = 32;

	/**
	 * Automatically rebalances shards based on their size
	 * - If shards exceed MAX_SHARD_SIZE_MB, scales out (doubles shards)
	 * - If shards are smaller than MIN_SHARD_SIZE_MB and there are many shards, scales in (halves shards)
	 * - Maintains at least MIN_SHARDS and at most MAX_SHARDS
	 */
	async autoRebalance(): Promise<void> {
		// Check the current size of each shard
		let totalSize = 0;
		let existingShardCount = 0;

		for (let i = 0; i < this.numOfShards; i++) {
			const shardPath = this.shardPath(i);
			const exists = await this.file.exists(shardPath);

			if (exists) {
				existingShardCount++;
				const stats = await this.file.stat(shardPath);
				const size = stats?.size ?? 0;
				totalSize += size;
			}
		}

		if (existingShardCount === 0) {
			return;
		}

		const avgShardSizeMB = totalSize / existingShardCount / (1024 * 1024);

		let newNumShards = this.numOfShards;

		// Scale out if shards are too large
		if (avgShardSizeMB > ShardManager.MAX_SHARD_SIZE_MB) {
			newNumShards = Math.min(
				ShardManager.MAX_SHARDS,
				this.numOfShards * 2
			);
		}
		// Scale in if shards are too small and we have enough shards
		else if (
			avgShardSizeMB < ShardManager.MIN_SHARD_SIZE_MB &&
			this.numOfShards > ShardManager.MIN_SHARDS
		) {
			newNumShards = Math.max(
				ShardManager.MIN_SHARDS,
				Math.floor(this.numOfShards / 2)
			);
		}

		// Only rebalance if the number of shards would change
		if (newNumShards !== this.numOfShards) {
			await this.rebalance(newNumShards);
		}
	}

	async rebalance(newNumShards: number): Promise<void> {
		const currentNumShards = this.numOfShards;
		if (newNumShards === currentNumShards) return;

		// Get all IDs from current shards
		let allIds: string[] = [];
		for (let i = 0; i < currentNumShards; i++) {
			const db = await this.getShard(i);
			const ids = db.data.docs.sharedInternalDocumentStore.internalIdToId;
			allIds = allIds.concat(ids);
		}

		// Create a new hash ring
		const newRing = new HashRing<string>({
			replicas: this.ring.replicasCount,
		});
		for (let i = 0; i < newNumShards; i++) {
			newRing.addNode(this.nodeName(i));
		}

		// Expand the hash ring if shards are added
		if (newNumShards > currentNumShards) {
			for (let i = this.cache.length; i < newNumShards; i++) {
				const db = this.createBasedOnLangage();
				this.setShard(db, i);
			}
		}

		// Create new databases for the new shards if expanding
		if (newNumShards > currentNumShards) {
			for (let i = 0; i < newNumShards; i++) {
				if (i >= currentNumShards) {
					const db = this.createBasedOnLangage();
					await this.setShard(db, i);
					await this.persistShard(db, i);
				}
			}
		}

		// Relocate documents
		const moved = this.ring.diffMovedIds(newNumShards, allIds);
		for (const { id, from, to } of moved) {
			await this.moveDocument(id, parseInt(from, 10), parseInt(to, 10));
		}

		// Make shards permanent - persist all shards that are currently in the cache
		const persistPromises = [];
		for (let i = 0; i < newNumShards; i++) {
			const shard = this.cache.get(i);
			if (shard) {
				persistPromises.push(this.persistShard(shard, i));
			}
		}
		await Promise.all(persistPromises);

		// Remove old shards if the number of shards is reduced
		if (newNumShards < currentNumShards) {
			for (let i = newNumShards; i < currentNumShards; i++) {
				const file = this.shardPath(i);
				if (await this.file.exists(file)) {
					await this.file.remove(file);
				}
			}
		}

		// Update the hash ring and shard count
		this.ring = newRing;
		this.numOfShardsValue = newNumShards;

		// Create a new LRU cache with the new size
		const newCache = new LRU<number, Orama<T>>(newNumShards);
		// Copy over existing items from the old cache
		for (let i = 0; i < newNumShards; i++) {
			const shard = this.cache.get(i);
			if (shard) {
				newCache.set(i, shard, async (k, evictedDb) => {
					this.persistShard(evictedDb, k);
				});
			}
		}
		this.cache = newCache;
	}

	// currently only supports Japanese
	private createBasedOnLangage() {
		const components =
			this.language === "japanese"
				? {
						tokenizer: createTokenizer({
							stopWords: japaneseStopwords,
							language: "japanese",
						}),
				  }
				: undefined;
		const db = create({
			schema: this.schema,
			components,
		});
		db.schema = this.schema;
		return db;
	}

	private async moveDocument(
		id: string,
		fromIdx: number,
		toIdx: number
	): Promise<void> {
		const fromDb = await this.getShard(parseInt(fromIdx.toString(), 10));
		const toDb = await this.getShard(parseInt(toIdx.toString(), 10));
		const doc = getByID(fromDb, id);
		doc && insert(toDb, doc);
		remove(fromDb, id);
	}

	getNode(id: string): string {
		return this.ring.getNode(id);
	}

	private nodeName(i: number | string): string {
		return i.toString();
	}

	private shardPath(idx: number): string {
		return normalizePath(this.dirPath + "/" + storeFilename(idx + 1));
	}

	async reset(): Promise<void> {
		// Delete all existing shard files
		for (let i = 0; i < this.numOfShards; i++) {
			const filePath = this.shardPath(i);
			if (await this.file.exists(filePath)) {
				await this.file.remove(filePath);
			}
		}

		// Reset
		this.numOfShardsValue = 1;
		this.ring = new HashRing();
		this.ring.addNode(this.nodeName(0));
		this.cache.clear();

		// Create a new empty shard
		const db = this.createBasedOnLangage();
		await this.setShard(db, 0);
		await this.persistShard(db, 0);
	}

	get numOfShards(): number {
		return this.numOfShardsValue;
	}
}

import { FileAdapter } from "../utils/fileAdapter.js";
import {
	create,
	Orama,
	AnySchema,
	PartialSchemaDeep,
	TypedDocument,
	search,
	WhereCondition,
	Result,
	Schema,
	getByID,
	insert,
	remove,
	MODE_VECTOR_SEARCH,
	updateMultiple,
} from "@orama/orama";
import { HashRing } from "./hashring.js";
import { createTokenizer } from "@orama/tokenizers/japanese";
import { stopwords as japaneseStopwords } from "@orama/stopwords/japanese";
import { MaxMarginalRelevanceSearchOptions } from "@langchain/core/vectorstores";
import { persist, restore } from "@orama/plugin-data-persistence";
import { LRU } from "./LRU.js";

/**
 * OramaDbConfig defines the configuration for a partitioned Orama database
 * @param dirPath - Directory path to store the database files
 * @param numOfShards - Number of shards to create for the database
 * @param schema - Schema definition for the database
 */
interface OramaDbConfig<T extends AnySchema> {
	dirPath: string;
	numOfShards: number;
	schema: T;
}

export const storeFilename = (id: number) => `vectorstore-${id}`;

/**
 * OramaDb manages partitioned Orama databases
 */
export class OramaDb<T extends AnySchema> {
	private shardCache = new LRU<number, Orama<T>>(3);
	private config: OramaDbConfig<T>;
	private readonly defaultId = "default";

	private constructor(
		private readonly fileAdapter: FileAdapter,
		config: OramaDbConfig<T>,
		private hashRing: HashRing
	) {
		this.config = config;
		this.hashRing = hashRing;
	}

	private async persistShard(db: Orama<T>, shardIndex: number) {
		const data = await persist(db, "binary");

		await this.fileAdapter.write(
			storeFilename(shardIndex + 1),
			this.config.dirPath,
			Buffer.from(data)
		);
	}

	private async getShard(idx: number): Promise<Orama<T>> {
		const inCache = this.shardCache.get(idx);
		if (inCache) return inCache;
		const filePath = this.fileAdapter.join(
			this.config.dirPath,
			storeFilename(idx + 1)
		);
		const data = await this.fileAdapter.read(filePath);
		const bufferData =
			data instanceof ArrayBuffer ? Buffer.from(data) : data;
		const db = await restore<Orama<T>>("binary", bufferData);
		db.schema = this.config.schema;
		await this.setShard(db, idx);
		return db;
	}

	private async setShard(db: Orama<T>, shardIndex: number) {
		return this.shardCache.set(shardIndex, db, async (k, evictedDb) => {
			await this.persistShard(evictedDb, k);
		});
	}

	static async create<T extends AnySchema>(
		fileAdapter: FileAdapter,
		config: OramaDbConfig<T>,
		hashRing: HashRing,
		language = "english"
	) {
		const oramaDb = new OramaDb(fileAdapter, config, hashRing);

		for (let i = 0; i < config.numOfShards; i++) {
			const db =
				language === "japanese"
					? oramaDb.createWithTokenizer(config.schema)
					: create({ schema: config.schema, language });

			oramaDb.hashRing.addNode(oramaDb.nodeName(i));
			await oramaDb.setShard(db, i);
			await oramaDb.persistShard(db, i);
		}

		return oramaDb;
	}

	static async load<T extends AnySchema>(
		fileAdapter: FileAdapter,
		config: OramaDbConfig<T>,
		hashRing: HashRing
	) {
		const oramaDb = new OramaDb(fileAdapter, config, hashRing);

		for (let i = 0; i < config.numOfShards; i++) {
			const filePath = oramaDb.shardPath(i);
			// Skip missing shards
			const fileExists = await fileAdapter.exists(filePath);
			if (!fileExists) {
				console.warn(`Shard ${i + 1} not found at ${filePath}`);
				continue;
			}

			const data = await fileAdapter.read(filePath);
			const bufferData =
				data instanceof ArrayBuffer ? Buffer.from(data) : data;
			const db = await restore<Orama<T>>("binary", bufferData);
			db.schema = config.schema;

			oramaDb.hashRing.addNode(oramaDb.nodeName(i));
			await oramaDb.setShard(db, i);
			await oramaDb.persistShard(db, i);
		}

		return oramaDb;
	}

	// currently only supports Japanese
	private createWithTokenizer(schema: T) {
		const db = create({
			schema,
			components: {
				tokenizer: createTokenizer({
					stopWords: japaneseStopwords,
					language: "japanese",
				}),
			},
		});
		// Ensure the schema is attached to the database instance
		db.schema = schema;
		return db;
	}

	/**
	 *  Save all documents, if existing documents are passed, they will be updated
	 *  if new documents are passed, they will be inserted
	 */
	async saveMany<Doc extends PartialSchemaDeep<TypedDocument<Orama<T>>>>(
		documents: Doc[]
	): Promise<void> {
		if (!documents || documents.length === 0) {
			return;
		}

		const docsByPartition: Record<string, Doc[]> = {};
		// Initialize arrays for all possible shard keys
		for (let i = 0; i < this.config.numOfShards; i++) {
			docsByPartition[this.nodeName(i)] = [];
		}
		// Add default bucket
		docsByPartition[this.defaultId] = [];

		for (const doc of documents) {
			if (!doc.id) {
				docsByPartition[this.defaultId].push(doc);
				continue;
			}
			const shardKey = this.hashRing.getNode(String(doc.id));
			// Ensure the shardKey exists in docsByPartition
			if (!docsByPartition[shardKey]) {
				docsByPartition[shardKey] = [];
			}
			docsByPartition[shardKey].push(doc);
		}

		const insertPromises = Object.entries(docsByPartition).map(
			async ([shardKey, docs]) => {
				if (docs.length === 0) return;

				const shardIdx = parseInt(shardKey, 10);
				const shard = await this.getShard(shardIdx);

				const { internalIdToId } =
					shard.data.docs.sharedInternalDocumentStore;
				const docIds = docs
					.map(({ id }) => String(id))
					.filter((id) => id !== undefined);

				const existingDocIds = docIds.filter((id) =>
					internalIdToId.includes(id)
				);
				updateMultiple(shard, existingDocIds, docs);
				await this.persistShard(shard, shardIdx);
			}
		);

		await Promise.all(insertPromises);
	}

	async search(
		query: number[],
		options: MaxMarginalRelevanceSearchOptions<WhereCondition<T>>
	): Promise<Result<Schema<T>>[]> {
		if (this.shardCache.length === 0) {
			console.warn("No shards found");
			return [];
		}

		const { filter, k, fetchK, lambda } = options;
		let results: Result<Schema<T>>[] = [];
		for (let i = 0; i < this.config.numOfShards; i++) {
			const shard = await this.getShard(i);

			const res = await search(shard, {
				mode: MODE_VECTOR_SEARCH,
				vector: { value: query, property: "embedding" },
				where: filter,
				limit: fetchK,
				offset: 0,
				similarity: lambda ?? 0.6,
			});
			results = results.concat(res.hits);
		}

		return results.sort((a, b) => b.score - a.score).slice(0, k);
	}

	async rebalance(newNumShards: number): Promise<void> {
		if (newNumShards === this.config.numOfShards) return;

		let allIds: string[] = [];
		for (let i = 0; i < this.config.numOfShards; i++) {
			const db = await this.getShard(i);
			const ids = db.data.docs.sharedInternalDocumentStore.internalIdToId;
			allIds = allIds.concat(ids);
		}

		// create a new hash ring
		const newRing = new HashRing<string>({
			replicas: this.hashRing.replicasCount,
		});
		for (let i = 0; i < newNumShards; i++) {
			newRing.addNode(this.nodeName(i));
		}

		// expand the hash ring if shards are added
		if (newNumShards > this.config.numOfShards) {
			for (let i = this.shardCache.length; i < newNumShards; i++) {
				const db = create({ schema: this.config.schema });
				this.setShard(db, i);
			}
		}

		// relocate documents
		// Create new databases for the new shards if expanding
		if (newNumShards > this.config.numOfShards) {
			for (let i = 0; i < newNumShards; i++) {
				if (i >= this.config.numOfShards) {
					// TODO: should consider the language
					const db = create({ schema: this.config.schema });
					await this.setShard(db, i);
					await this.persistShard(db, i);
				}
			}
		}

		const moved = this.hashRing.diffMovedIds(newNumShards, allIds);
		for (const { id, from, to } of moved) {
			try {
				const fromDb = await this.getShard(parseInt(from, 10));
				const toDb = await this.getShard(parseInt(to, 10));
				const doc = getByID(fromDb, id);
				doc && insert(toDb, doc);
				remove(fromDb, id);
			} catch (error) {
				console.error(
					`Error moving document ${id} from ${from} to ${to}:`,
					error
				);
			}
		}

		// make shards permanent - persist all shards that are currently in the cache
		const persistPromises = [];
		for (let i = 0; i < newNumShards; i++) {
			const shard = this.shardCache.get(i);
			if (shard) {
				persistPromises.push(this.persistShard(shard, i));
			}
		}
		await Promise.all(persistPromises);

		// remove old shards if the number of shards is reduced
		if (newNumShards < this.config.numOfShards) {
			for (let i = newNumShards; i < this.config.numOfShards; i++) {
				const file = this.shardPath(i);
				if (await this.fileAdapter.exists(file)) {
					await this.fileAdapter.delete(file);
				}
			}
		}

		// update the hash ring and config
		this.config.numOfShards = newNumShards;
		this.hashRing = newRing;

		// Create a new LRU cache with the new size
		const newCache = new LRU<number, Orama<T>>(newNumShards);
		// Copy over existing items from the old cache
		for (let i = 0; i < newNumShards; i++) {
			const shard = this.shardCache.get(i);
			if (shard) {
				newCache.set(i, shard, async (k, evictedDb) => {
					this.persistShard(evictedDb, k);
				});
			}
		}
		this.shardCache = newCache;
	}

	private nodeName(i: number | string): string {
		return i.toString();
	}

	private shardPath(idx: number): string {
		return this.fileAdapter.join(
			this.config.dirPath,
			storeFilename(idx + 1)
		);
	}
}

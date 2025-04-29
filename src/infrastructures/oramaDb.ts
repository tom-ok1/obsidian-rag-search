import { FileAdapter } from "../adapters/fileAdapter";
import {
	create,
	load,
	Orama,
	save,
	AnySchema,
	insertMultiple,
	PartialSchemaDeep,
	TypedDocument,
	search,
	WhereCondition,
	Result,
	Schema,
	getByID,
	insert,
	remove,
	Results,
} from "@orama/orama";
import { storeFilename } from "./vectorStore";
import { HashRing } from "./hashring";

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

/**
 * OramaDb manages partitioned Orama databases
 */
export class OramaDb<T extends AnySchema> {
	private shards: Orama<T>[] = [];
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

	private async saveShard(db: Orama<T>, shardIndex: number) {
		const rawdata = save(db);

		const jsonData = JSON.stringify(
			{ ...rawdata, schema: db.schema },
			null,
			2
		);

		await this.fileAdapter.write(
			storeFilename(shardIndex + 1),
			this.config.dirPath,
			jsonData
		);
	}

	static async create<T extends AnySchema>(
		fileAdapter: FileAdapter,
		config: OramaDbConfig<T>,
		hashRing: HashRing
	) {
		const oramaDb = new OramaDb(fileAdapter, config, hashRing);

		for (let i = 0; i < config.numOfShards; i++) {
			const db = create({ schema: config.schema });
			oramaDb.shards.push(db);
			oramaDb.hashRing.addNode(oramaDb.nodeName(i));
			await oramaDb.saveShard(db, i);
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

			const rawdata = await fileAdapter.read(filePath);
			const parsedData = JSON.parse(rawdata);

			const db = create({ schema: config.schema });
			load(db, parsedData);

			oramaDb.shards.push(db);
		}

		return oramaDb;
	}

	async insertMany<Doc extends PartialSchemaDeep<TypedDocument<Orama<T>>>>(
		documents: Doc[]
	): Promise<void> {
		if (!documents || documents.length === 0) {
			return;
		}

		const docsByPartition: Record<string, Doc[]> = {
			[this.defaultId]: [],
		};
		for (let i = 0; i < this.config.numOfShards; i++) {
			docsByPartition[this.nodeName(i)] = [];
		}

		for (const doc of documents) {
			if (!doc.id) {
				docsByPartition[this.defaultId].push(doc);
				continue;
			}
			const shardKey = this.hashRing.getNode(String(doc.id));
			docsByPartition[shardKey].push(doc);
		}

		const insertPromises = Object.entries(docsByPartition).map(
			async ([shardKey, docs]) => {
				if (docs.length === 0) return;

				const shardIdx = parseInt(shardKey, 10);
				const shard = this.shards[shardIdx];

				insertMultiple(shard, docs);
				await this.saveShard(shard, shardIdx);
			}
		);

		await Promise.all(insertPromises);
	}

	async search(
		query: number[],
		k: number,
		filter?: WhereCondition<T>
	): Promise<Result<Schema<T>>[]> {
		if (this.shards.length === 0) {
			return [];
		}

		// Search each shard
		return this.shards
			.map((shard) => {
				return search(shard, {
					mode: "vector",
					vector: { value: query, property: "embedding" },
					limit: k, // Request k results from each shard
					where: filter,
				});
			})
			.flatMap((result: Results<Schema<T>>) => result.hits)
			.sort((a, b) => b.score - a.score)
			.slice(0, k);
	}

	async rebalance(newNumShards: number, allIds: string[]): Promise<void> {
		if (newNumShards === this.config.numOfShards) return;

		// create a new hash ring
		const newRing = new HashRing<string>({
			replicas: this.hashRing.replicasCount,
		});
		for (let i = 0; i < newNumShards; i++) {
			newRing.addNode(this.nodeName(i));
		}

		// expand the hash ring if shards are added
		if (newNumShards > this.shards.length) {
			for (let i = this.shards.length; i < newNumShards; i++) {
				const db = create({ schema: this.config.schema });
				this.shards.push(db);
			}
		}

		// relocate documents
		const moved = this.hashRing.diffMovedIds(newNumShards, allIds);
		for (const { id, from, to } of moved) {
			const fromDb = this.shards[parseInt(from, 10)];
			const toDb = this.shards[parseInt(to, 10)];
			const doc = getByID(fromDb, id);
			doc && insert(toDb, doc);
			remove(fromDb, id);
		}

		// make shards permanent
		await Promise.all(
			this.shards.map((db, idx) => this.saveShard(db, idx))
		);

		// remove old shards if the number of shards is reduced
		if (newNumShards < this.config.numOfShards) {
			for (let i = newNumShards; i < this.config.numOfShards; i++) {
				const file = this.shardPath(i);
				if (await this.fileAdapter.exists(file)) {
					await this.fileAdapter.delete(file);
				}
			}
			this.shards.length = newNumShards;
		}

		// update the hash ring and config
		this.config.numOfShards = newNumShards;
		this.hashRing = newRing;
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

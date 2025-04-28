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
		private readonly hashRing: HashRing
	) {
		this.config = config;
		this.hashRing = hashRing;
	}

	static async create<T extends AnySchema>(
		fileAdapter: FileAdapter,
		config: OramaDbConfig<T>,
		hashRing: HashRing
	) {
		const oramaDb = new OramaDb(fileAdapter, config, hashRing);

		for (let i = 0; i < config.numOfShards; i++) {
			const db = await create({ schema: config.schema });
			oramaDb.shards.push(db);
			oramaDb.hashRing.addNode(i.toString());
			await oramaDb.saveShard(db, i + 1);
		}

		return oramaDb;
	}

	private async saveShard(db: Orama<T>, shardIndex: number) {
		const rawdata = await save(db);

		const jsonData = JSON.stringify(
			{ ...rawdata, schema: db.schema },
			null,
			2
		);

		await this.fileAdapter.write(
			storeFilename(shardIndex),
			this.config.dirPath,
			jsonData
		);
	}

	static async load<T extends AnySchema>(
		fileAdapter: FileAdapter,
		config: OramaDbConfig<T>,
		hashRing: HashRing
	) {
		const oramaDb = new OramaDb(fileAdapter, config, hashRing);

		for (let i = 1; i <= config.numOfShards; i++) {
			const filePath = fileAdapter.join(config.dirPath, storeFilename(i));

			// Skip missing shards
			const fileExists = await fileAdapter.exists(filePath);
			if (!fileExists) {
				console.warn(`Shard ${i} not found at ${filePath}`);
				continue;
			}

			const rawdata = await fileAdapter.read(filePath);
			const parsedData = JSON.parse(rawdata);

			const db = await create({ schema: config.schema });
			await load(db, parsedData);

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

		const docsByPartition: Record<string, Doc[]> = {};

		for (let i = 0; i < this.config.numOfShards; i++) {
			docsByPartition[i.toString()] = [];
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

				await insertMultiple(shard, docs);
				await this.saveShard(shard, shardIdx + 1);
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
		const searchPromises = this.shards.map(async (shard) => {
			return await search(shard, {
				mode: "vector",
				vector: { value: query, property: "embedding" },
				limit: k, // Request k results from each shard
				where: filter,
			});
		});

		const searchResults = await Promise.all(searchPromises);
		return searchResults
			.flatMap((result) => result.hits)
			.sort((a, b) => b.score - a.score)
			.slice(0, k);
	}
}

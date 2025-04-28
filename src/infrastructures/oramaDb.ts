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
} from "@orama/orama";
import { storeFilename } from "./oramaStore";

export function getPartitionIndex(id: string, numOfShards: number): number {
	if (!id || numOfShards <= 1) {
		return 0;
	}

	const hash = Array.from(id).reduce((acc, char) => {
		return ((acc << 5) - acc + char.charCodeAt(0)) | 0;
	}, 0);

	return Math.abs(hash) % numOfShards;
}

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

	private constructor(
		private readonly fileAdapter: FileAdapter,
		config: OramaDbConfig<T>
	) {
		this.config = config;
	}

	static async create<T extends AnySchema>(
		fileAdapter: FileAdapter,
		config: OramaDbConfig<T>
	) {
		const oramaDb = new OramaDb(fileAdapter, config);

		for (let i = 0; i < config.numOfShards; i++) {
			const db = await create({ schema: config.schema });
			oramaDb.shards.push(db);

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
		config: OramaDbConfig<T>
	) {
		const oramaDb = new OramaDb(fileAdapter, config);

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

		const docsByPartition: Record<number, Doc[]> = {};

		for (let i = 0; i < this.config.numOfShards; i++) {
			docsByPartition[i] = [];
		}

		// Group documents by their partition index
		documents.reduce((partitions, doc) => {
			const partitionIdx = doc.id
				? getPartitionIndex(String(doc.id), this.config.numOfShards)
				: 0; // Default to partition 0 for documents without IDs
			partitions[partitionIdx].push(doc);
			return partitions;
		}, docsByPartition);

		const insertPromises = Object.entries(docsByPartition).map(
			async ([partitionIdx, docs]) => {
				if (docs.length === 0) return;

				const shardIdx = parseInt(partitionIdx);
				const shard = this.shards[shardIdx];

				await insertMultiple(shard, docs);
				await this.saveShard(shard, shardIdx + 1);
			}
		);

		await Promise.all(insertPromises);
	}
}

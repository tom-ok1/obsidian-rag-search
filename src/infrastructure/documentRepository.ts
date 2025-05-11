import { FileAdapter } from "../utils/fileAdapter.js";
import {
	Orama,
	AnySchema,
	PartialSchemaDeep,
	TypedDocument,
	search,
	WhereCondition,
	Result,
	Schema,
	MODE_VECTOR_SEARCH,
	updateMultiple,
} from "@orama/orama";
import { MaxMarginalRelevanceSearchOptions } from "@langchain/core/vectorstores";
import { ShardManager } from "./shardManager.js";

/**
 * OramaDbConfig defines the configuration for a partitioned Orama database
 * @param dirPath - Directory path to store the database files
 * @param schema - Schema definition for the database
 */
interface DbConfig<T extends AnySchema> {
	dirPath: string;
	schema: T;
}

/**
 * DocumentRepository manages partitioned Orama databases
 */
export class DocumentRepository<T extends AnySchema> {
	private shardMgr: ShardManager<T>;

	private constructor(shardMgr: ShardManager<T>) {
		this.shardMgr = shardMgr;
	}

	static async init<T extends AnySchema>(
		fileAdapter: FileAdapter,
		config: DbConfig<T>,
		language = "english"
	) {
		const shardMgr = await ShardManager.init(
			fileAdapter,
			config.dirPath,
			config.schema,
			language
		);
		return new DocumentRepository<T>(shardMgr);
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
		for (let i = 0; i < this.shardMgr.numOfShards; i++) {
			docsByPartition[i.toString()] = [];
		}

		for (const doc of documents) {
			if (doc.id === undefined) continue;

			const shardKey = this.shardMgr.getNode(String(doc.id));
			if (!docsByPartition[shardKey]) {
				docsByPartition[shardKey] = [];
			}
			docsByPartition[shardKey].push(doc);
		}

		const insertPromises = Object.entries(docsByPartition).map(
			async ([shardKey, docs]) => {
				if (docs.length === 0) return;

				const shardIdx = parseInt(shardKey, 10);
				const shard = await this.shardMgr.getShard(shardIdx);

				const { internalIdToId } =
					shard.data.docs.sharedInternalDocumentStore;
				const docIds = docs
					.map(({ id }) => String(id))
					.filter((id) => id !== undefined);

				const existingDocIds = docIds.filter((id) =>
					internalIdToId.includes(id)
				);
				updateMultiple(shard, existingDocIds, docs);
				await this.shardMgr.persistShard(shard, shardIdx);
			}
		);

		await Promise.all(insertPromises);
	}

	async search(
		query: number[],
		options: MaxMarginalRelevanceSearchOptions<WhereCondition<T>>
	): Promise<Result<Schema<T>>[]> {
		const { filter, k, fetchK, lambda } = options;
		let results: Result<Schema<T>>[] = [];

		for (let i = 0; i < this.shardMgr.numOfShards; i++) {
			const shard = await this.shardMgr.getShard(i);

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

	async rebalance(): Promise<void> {
		await this.shardMgr.autoRebalance();
	}
}

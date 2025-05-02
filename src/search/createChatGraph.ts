import { VectorStore } from "@langchain/core/vectorstores";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { z } from "zod";
import { Annotation, StateGraph } from "@langchain/langgraph";
import { Document } from "@langchain/core/documents";
import { pull } from "langchain/hub";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { MdDocMetadata } from "./markdownProcessor";

export function createChatGraph(
	vectorStore: VectorStore,
	model: BaseChatModel,
	k: number = 10
) {
	// 1. Define the state schema
	const searchSchema = z.object({
		query: z
			.string()
			.describe(
				"Search query: rewrite the user's natural-language request into a concise, keyword-focused query suitable for a vector database."
			),
		searchType: z
			.enum(["similarity", "mmr"])
			.default("similarity")
			.describe(
				"Search mode: 'similarity' for basic similarity search, 'mmr' for Maximal Marginal Relevance search balancing relevance and diversity."
			),
		k: z
			.number()
			.min(1)
			.max(40)
			.default(4)
			.describe("Number of documents to return (1–40). Default is 4."),
		fetchK: z
			.number()
			.min(1)
			.max(100)
			.optional()
			.describe(
				"For MMR: number of documents to fetch before re-ranking. Optional."
			),
		lambda: z
			.number()
			.min(0)
			.max(1)
			.optional()
			.describe(
				"MMR diversity parameter (0 = maximum diversity, 1 = minimum diversity). Optional."
			),
		filter: z
			.record(z.any())
			.optional()
			.describe("Optional metadata filter to apply before searching."),
	});

	const evalSchema = z.object({
		isEnough: z
			.boolean()
			.describe(
				"Whether the current set of documents sufficiently answers the user's question."
			),
		nextParams: searchSchema
			.optional()
			.describe(
				"If not enough, the LLM’s suggested updated search parameters for the next retrieval round."
			),
	});

	const stateAnnotation = Annotation.Root({
		question: Annotation<string>,
		search: Annotation<z.infer<typeof searchSchema>>,
		context: Annotation<Document<MdDocMetadata>[]>,
		answer: Annotation<{
			content: string;
			reference: Document<MdDocMetadata>[];
		}>,
		isEnough: Annotation<boolean>,
	});

	const inputStateAnnotation = Annotation.Root({
		question: Annotation<string>,
	});

	// 2. Define workflow functions
	async function analyzeQuery(state: typeof inputStateAnnotation.State) {
		const structuredLlm = model.withStructuredOutput(searchSchema);
		const result = await structuredLlm.invoke(state.question);
		return { search: result };
	}

	async function retrieveData(state: typeof stateAnnotation.State) {
		const { search } = state;

		// MMR search
		if (
			search.searchType === "mmr" &&
			vectorStore.maxMarginalRelevanceSearch
		) {
			const retrievedDocs = await vectorStore.maxMarginalRelevanceSearch(
				search.query,
				{
					k: search.k,
					fetchK: search.fetchK ?? search.k * 4,
					lambda: search.lambda ?? 0.3,
					filter: search.filter,
				},
				undefined
			);
			return { context: retrievedDocs };
		}

		// Similarity search
		const retrievedDocs = await vectorStore.similaritySearch(
			search.query,
			search.k,
			search.filter
		);

		return { context: retrievedDocs };
	}

	async function evaluateContext(state: typeof stateAnnotation.State) {
		const evalPrompt = ChatPromptTemplate.fromMessages([
			[
				"system",
				"You are an assistant that evaluates whether the retrieved documents adequately cover the user's question. " +
					"Please respond strictly in JSON following the provided schema.",
			],
			[
				"user",
				[
					"User question:\n",
					"{query}\n\n",
					"Retrieved documents (each separated by a blank line):\n",
					"{docs}",
				].join(""),
			],
		]);
		const structuredLlm = model.withStructuredOutput(evalSchema);
		const docText = state.context.map((d) => d.pageContent).join("\n\n");
		const messages = await evalPrompt.invoke({
			query: state.question,
			docs: docText,
		});

		const result = await structuredLlm.invoke(messages);
		return result.isEnough
			? { isEnough: true }
			: { isEnough: false, search: result.nextParams };
	}

	async function generateAnswer(state: typeof stateAnnotation.State) {
		const docsContent = state.context
			.map((doc) => doc.pageContent)
			.join("\n");
		const promptTemplate = await pull<ChatPromptTemplate>("rlm/rag-prompt");

		const messages = await promptTemplate.invoke({
			question: state.question,
			context: docsContent,
		});
		const response = await model.invoke(messages);
		return {
			answer: { content: response.content, reference: state.context },
		};
	}

	// 3. Create the state graph
	const graph = new StateGraph(stateAnnotation)
		.addNode("analyzeQuery", analyzeQuery)
		.addNode("retrieveData", retrieveData)
		.addNode("evaluateContext", evaluateContext)
		.addNode("generateAnswer", generateAnswer)
		.addEdge("__start__", "analyzeQuery")
		.addEdge("analyzeQuery", "retrieveData")
		.addEdge("retrieveData", "evaluateContext")
		.addConditionalEdges("evaluateContext", (s) =>
			s.isEnough ? "generateAnswer" : "retrieveData"
		)
		.addEdge("generateAnswer", "__end__")
		.compile();

	return graph;
}

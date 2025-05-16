import { VectorStore } from "@langchain/core/vectorstores";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { z } from "zod";
import { Annotation, StateGraph } from "@langchain/langgraph";
import { Document } from "@langchain/core/documents";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { MdDocMetadata } from "./markdownProcessor.js";
import { IterableReadableStream } from "@langchain/core/utils/stream";
import { AIMessageChunk } from "@langchain/core/messages";
import { ChatHistory } from "./chatHistory.js";
import { BaseLanguageModelInput } from "@langchain/core/language_models/base";

export type ChatMessage = { role: "user" | "assistant"; content: string };

export interface GraphDependencies {
	vectorStore: VectorStore;
	model: BaseChatModel;
}

const searchSchema = z.object({
	query: z
		.string()
		.describe(
			"Search query: rewrite the user's natural-language request into a concise, keyword-focused sentense suitable for a vector database. Make sure to use the same language as the original question."
		),
	searchType: z
		.enum(["similarity", "mmr"])
		.nullable()
		.describe(
			"Search mode: 'similarity' for basic similarity search, 'mmr' for more advanced search using max marginal relevance, which allows for more diverse results."
		),
	k: z.number().describe("Number of documents to return (1-40)."),
	fetchK: z
		.number()
		.nullable()
		.optional()
		.describe(
			"For MMR: number of documents to fetch before re-ranking (1-100). Only needed for MMR search."
		),
	lambda: z
		.number()
		.nullable()
		.optional()
		.describe(
			"For MMR: diversity parameter (0 = maximum diversity, 1 = minimum diversity). Only needed for MMR search. Default is 0.6."
		),
});

const evalSchema = z.object({
	isEnough: z
		.boolean()
		.describe(
			"Whether the current set of documents sufficiently answers the user's question."
		),
	nextParams: searchSchema
		.nullable()
		.optional()
		.describe(
			"If not enough, the LLM's suggested updated search parameters for the next retrieval round."
		),
});

const PROMPT_ANALYSE = ChatPromptTemplate.fromMessages([
	[
		"system",
		"Extract an optimal vector search query. Respond ONLY JSON. Use the same language as the question.",
	],
	[
		"user",
		[
			"### Conversation so far\n",
			"{history}\n\n",
			"### Latest question\n",
			"{question}",
		].join(""),
	],
]);

const PROMPT_EVAL = ChatPromptTemplate.fromMessages([
	[
		"system",
		"You are an assistant that evaluates whether the retrieved documents adequately cover the user's question. If there are not enough documents, suggest new search parameters to improve the results. Please respond strictly in JSON following the provided schema.",
	],
	[
		"user",
		[
			"User question:\n",
			"{query}\n\n",
			"Retrieved documents (each separated by a blank line):\n",
			"{docs}\n\n",
			"Previous search parameters:\n",
			"{search}\n\n",
		].join(""),
	],
]);

const PROMPT_RAG = ChatPromptTemplate.fromMessages([
	[
		"system",
		"You are a helpful assistant. Please answer the question with the same language as the question. If the context is not enough, apologise and ask the user to rephrase.",
	],
	[
		"user",
		[
			"### Conversation so far\n{history}\n\n",
			"### Question\n{question}\n\n",
			"### Context\n{context}",
		].join(""),
	],
]);

const RootAnnotation = Annotation.Root({
	question: Annotation<string>,
	search: Annotation<z.infer<typeof searchSchema>>, // current search params
	context: Annotation<Document<MdDocMetadata>[]>, // retrieved docs
	answer: Annotation<{ stream: IterableReadableStream<AIMessageChunk> }>,
	history: Annotation<ChatHistory>,
	isEnough: Annotation<boolean>,
});

export type GraphState = typeof RootAnnotation.State;

function makeAnalyseQueryNode(deps: GraphDependencies) {
	return async (state: GraphState) => {
		const { model } = deps;
		const messages = await PROMPT_ANALYSE.invoke({
			question: state.question,
			history: state.history.formatHistoryText(),
		});

		const result = await callWithStructuredOutput(
			model,
			searchSchema,
			messages
		);

		return { search: result };
	};
}

function makeRetrieveNode(deps: GraphDependencies) {
	return async (state: GraphState) => {
		const { vectorStore } = deps;
		const { search } = state;

		if (!search) throw new Error("Search parameters missing");

		// Decide which vector store function to call.
		const docs =
			search.searchType === "mmr" &&
			vectorStore.maxMarginalRelevanceSearch
				? await vectorStore.maxMarginalRelevanceSearch(
						search.query,
						{
							k: search.k,
							fetchK: search.fetchK ?? search.k * 4,
							lambda: search.lambda ?? 0.6,
						},
						undefined
				  )
				: await vectorStore.similaritySearch(search.query, search.k);

		return { context: docs };
	};
}

function makeEvaluateNode(deps: GraphDependencies) {
	let attempts = 0;
	const MAX_RETRIES = 3;
	return async (state: GraphState) => {
		const { model } = deps;

		if (attempts >= MAX_RETRIES) return { isEnough: true };
		attempts += 1;

		const docText = state.context.map((d) => d.pageContent).join("\n\n");
		const messages = await PROMPT_EVAL.invoke({
			query: state.question,
			docs: docText,
			search: state.search,
		});

		const result = await callWithStructuredOutput(
			model,
			evalSchema,
			messages
		);
		return result.isEnough
			? { isEnough: true }
			: { isEnough: false, search: result.nextParams ?? state.search };
	};
}

function makeGenerateAnswerNode(deps: GraphDependencies) {
	return async (state: GraphState) => {
		const { model } = deps;
		const docsContent = state.context.map((d) => d.pageContent).join("\n");

		const messages = await PROMPT_RAG.invoke({
			question: state.question,
			context: docsContent,
			history: state.history.formatHistoryText(),
		});

		return {
			answer: { stream: await model.stream(messages) },
		};
	};
}

export function createChatGraph(deps: GraphDependencies) {
	const graph = new StateGraph(RootAnnotation)
		.addNode("analyseQuery", makeAnalyseQueryNode(deps))
		.addNode("retrieveData", makeRetrieveNode(deps))
		.addNode("evaluateContext", makeEvaluateNode(deps))
		.addNode("generateAnswer", makeGenerateAnswerNode(deps))
		.addEdge("__start__", "analyseQuery")
		.addEdge("analyseQuery", "retrieveData")
		.addEdge("retrieveData", "evaluateContext")
		.addConditionalEdges("evaluateContext", (s) =>
			s.isEnough ? "generateAnswer" : "retrieveData"
		)
		.addEdge("generateAnswer", "__end__")
		.compile();

	return graph;
}

export async function callWithStructuredOutput<T extends Record<string, any>>(
	model: BaseChatModel,
	schema: z.ZodSchema<T>,
	input: BaseLanguageModelInput
): Promise<T> {
	const structured = model.withStructuredOutput(schema);
	let prompt: BaseLanguageModelInput = input;

	for (let i = 0; i < 3; i++) {
		try {
			return await structured.invoke(prompt);
		} catch (err) {
			if (i === 2) throw err;

			const additionalPrompt = {
				role: "system",
				content:
					"Previous response was not valid JSON. Respond in valid JSON only.",
			};

			if (Array.isArray(prompt)) {
				prompt = [additionalPrompt, ...prompt];
			} else if (typeof prompt === "object") {
				prompt = [additionalPrompt, ...prompt.toChatMessages()];
			} else {
				prompt = [additionalPrompt, prompt];
			}
		}
	}
	throw new Error("Unreachable");
}

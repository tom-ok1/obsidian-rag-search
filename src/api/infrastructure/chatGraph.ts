import { VectorStore } from "@langchain/core/vectorstores";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { z } from "zod";
import { Annotation, StateGraph } from "@langchain/langgraph";
import { Document } from "@langchain/core/documents";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { MdDocMetadata } from "./markdownProcessor.js";
import { IterableReadableStream } from "@langchain/core/utils/stream";
import { AIMessageChunk } from "@langchain/core/messages";
import { BaseLanguageModelInput } from "@langchain/core/language_models/base";

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
	history: Annotation<string>,
});

type GraphState = typeof RootAnnotation.State;

function makeAnalyseQueryNode(deps: GraphDependencies) {
	return async (state: GraphState) => {
		const { model } = deps;
		const messages = await PROMPT_ANALYSE.invoke({
			question: state.question,
			history: state.history,
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
	const RETRIEVAL_K = 8;
	return async (state: GraphState) => {
		const { vectorStore } = deps;
		const { search } = state;

		if (!search) throw new Error("Search parameters missing");

		// Decide which vector store function to call.
		const docs = await vectorStore.similaritySearch(
			search.query,
			RETRIEVAL_K
		);

		return { context: docs };
	};
}

function makeGenerateAnswerNode(deps: GraphDependencies) {
	return async (state: GraphState) => {
		const { model } = deps;
		const docsContent = state.context.map((d) => d.pageContent).join("\n");

		const messages = await PROMPT_RAG.invoke({
			question: state.question,
			context: docsContent,
			history: state.history,
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
		.addNode("generateAnswer", makeGenerateAnswerNode(deps))
		.addEdge("__start__", "analyseQuery")
		.addEdge("analyseQuery", "retrieveData")
		.addEdge("retrieveData", "generateAnswer")
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

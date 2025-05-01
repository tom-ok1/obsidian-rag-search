import { VectorStore } from "@langchain/core/vectorstores";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { z } from "zod";
import { Annotation, StateGraph } from "@langchain/langgraph";
import { Document } from "@langchain/core/documents";
import { BaseLanguageModelInput } from "@langchain/core/language_models/base";
import { pull } from "langchain/hub";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { MdDocMetadata } from "./markdownProcessor";

export function createChatGraph(
	vectorStore: VectorStore,
	model: BaseChatModel,
	k: number = 10
) {
	// 1. Define the schema
	const searchSchema = z.object({
		query: z
			.string()
			.describe(
				'Search query, Rewrite the following natural‐language user request as a concise, keyword‐focused search query suitable for a vector database. Remove any filler words (e.g. "let me know," "how to," etc.) and retain only the core topic terms.'
			),
	});
	const stateAnnotation = Annotation.Root({
		question: Annotation<BaseLanguageModelInput>,
		search: Annotation<z.infer<typeof searchSchema>>,
		context: Annotation<Document<MdDocMetadata>[]>,
		answer: Annotation<{ content: string; reference: Document[] }>,
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
		const retrievedDocs = await vectorStore.similaritySearch(
			state.search.query,
			k
		);
		return { context: retrievedDocs };
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
		return { answer: response.content, reference: state.context };
	}

	// 3. Create the state graph
	const graph = new StateGraph(stateAnnotation)
		.addNode("analyzeQuery", analyzeQuery)
		.addNode("retrieveData", retrieveData)
		.addNode("generateAnswer", generateAnswer)
		.addEdge("__start__", "analyzeQuery")
		.addEdge("analyzeQuery", "retrieveData")
		.addEdge("retrieveData", "generateAnswer")
		.addEdge("generateAnswer", "__end__")
		.compile();

	return graph;
}

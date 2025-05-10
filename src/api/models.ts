import { ChatVertexAI, VertexAIEmbeddings } from "@langchain/google-vertexai";
import { GoogleAuthOptions } from "google-auth-library/build/src/auth/googleauth.js";
import {
	GoogleAbstractedClient,
	GoogleBaseLLMInput,
	GoogleConnectionParams,
} from "@langchain/google-common";
import { GAuthClient } from "./auth.js";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { EmbeddingsInterface } from "@langchain/core/embeddings";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";

export enum EmbeddingModelProviders {
	OPENAI = "OPENAI",
	VERTEXAI = "VERTEXAI",
}

export enum ChatModelProviders {
	OPENAI = "OPENAI",
	GOOGLE = "GOOGLE",
	ANTHROPIC = "ANTHROPIC",
	VERTEXAI = "VERTEXAI",
}

class ObsidianVertexAIEmbeddings extends VertexAIEmbeddings {
	buildAbstractedClient(
		fields?: GoogleConnectionParams<GoogleAuthOptions>
	): GoogleAbstractedClient {
		const authClient = new GAuthClient(fields);
		return authClient;
	}
}

class ObsidianChatVertexAI extends ChatVertexAI {
	buildAbstractedClient(
		fields: GoogleBaseLLMInput<GoogleAuthOptions> | undefined
	): GoogleAbstractedClient {
		const authClient = new GAuthClient(fields);
		return authClient;
	}
}

export function getChatModel(
	provider: ChatModelProviders,
	chatModelName: string,
	apiKeys: { [K in ChatModelProviders]?: string | undefined },
	googleProjectId?: string
): BaseChatModel {
	switch (provider) {
		case ChatModelProviders.VERTEXAI:
			return new ObsidianChatVertexAI({
				model: chatModelName,
				streaming: true,
				streamUsage: false,
				authOptions: {
					projectId: googleProjectId,
				},
			});
		case ChatModelProviders.OPENAI:
			return new ChatOpenAI({
				model: chatModelName,
				streaming: true,
				apiKey: apiKeys.OPENAI,
			});
		case ChatModelProviders.ANTHROPIC:
			return new ChatAnthropic({
				model: chatModelName,
				streaming: true,
				apiKey: apiKeys.ANTHROPIC,
			});
		case ChatModelProviders.GOOGLE:
			return new ChatGoogleGenerativeAI({
				model: chatModelName,
				streaming: true,
				apiKey: apiKeys.GOOGLE,
			});
		default:
			throw new Error(`Unsupported chat model provider: ${provider}`);
	}
}

export function getEmbeddingModel(
	provider: EmbeddingModelProviders,
	embeddingModelName: string,
	googleProjectId?: string,
	apiKey?: string
): EmbeddingsInterface {
	switch (provider) {
		case EmbeddingModelProviders.VERTEXAI:
			return new ObsidianVertexAIEmbeddings({
				model: embeddingModelName,
				authOptions: {
					projectId: googleProjectId,
				},
			});
		case EmbeddingModelProviders.OPENAI:
			return new OpenAIEmbeddings({
				model: embeddingModelName,
				apiKey,
			});
	}
}

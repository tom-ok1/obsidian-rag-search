import { ChatVertexAI, VertexAIEmbeddings } from "@langchain/google-vertexai";
import { GoogleAuthOptions } from "google-auth-library/build/src/auth/googleauth.js";
import {
	GoogleAbstractedClient,
	GoogleBaseLLMInput,
	GoogleConnectionParams,
} from "@langchain/google-common";
import { GAuthClient } from "./auth.js";

export class ObsidianVertexAIEmbeddings extends VertexAIEmbeddings {
	buildAbstractedClient(
		fields?: GoogleConnectionParams<GoogleAuthOptions>
	): GoogleAbstractedClient {
		const authClient = new GAuthClient(fields);
		return authClient;
	}
}

export class ObsidianChatVertexAI extends ChatVertexAI {
	buildAbstractedClient(
		fields: GoogleBaseLLMInput<GoogleAuthOptions> | undefined
	): GoogleAbstractedClient {
		const authClient = new GAuthClient(fields);
		return authClient;
	}
}

import { ChatHistory } from "./chatHistory.js";

describe("ChatHistory", () => {
	test("should initialize with empty history", () => {
		const history = new ChatHistory();
		expect(history.getMessages()).toHaveLength(0);
	});

	test("should add a message to history", () => {
		const history = new ChatHistory();
		const message = { role: "user", content: "Hello" } as const;

		history.addMessage(message);

		expect(history.getMessages()).toHaveLength(1);
		expect(history.getMessages()[0]).toEqual(message);
	});

	test("should store multiple messages in order", () => {
		const history = new ChatHistory();
		const message1 = { role: "user", content: "Hello" } as const;
		const message2 = {
			role: "assistant",
			content: "How can I help?",
		} as const;

		history.addMessage(message1);
		history.addMessage(message2);

		expect(history.getMessages()).toHaveLength(2);
		expect(history.getMessages()[0]).toEqual(message1);
		expect(history.getMessages()[1]).toEqual(message2);
	});

	test("should format empty history as empty string", () => {
		const history = new ChatHistory();
		expect(history.formatHistoryText()).toBe("");
	});

	test("should format single message correctly", () => {
		const history = new ChatHistory();
		history.addMessage({ role: "user", content: "Hello" });

		expect(history.formatHistoryText()).toBe("user: Hello");
	});

	test("should format multiple messages with newlines", () => {
		const history = new ChatHistory();
		history.addMessage({ role: "user", content: "I have a question" });
		history.addMessage({ role: "assistant", content: "Go ahead" });

		const expected = "user: I have a question\nassistant: Go ahead";
		expect(history.formatHistoryText()).toBe(expected);
	});

	test("should clear all messages", () => {
		const history = new ChatHistory();
		history.addMessage({ role: "user", content: "Test" });

		expect(history.getMessages()).toHaveLength(1);

		history.clear();

		expect(history.getMessages()).toHaveLength(0);
	});
});

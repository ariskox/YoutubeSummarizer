import { Summary, Transcript } from "../shared/types.js";
import { logger } from "../shared/logger.js";
import { Summarizer } from "./CopilotSummarizer.js";

export class OllamaSummarizer implements Summarizer {
  constructor(
    private readonly model: string,
    private readonly endpoint: string = "http://localhost:11434"
  ) {}

  async summarize(transcript: Transcript, options: { maxTokens?: number } = {}): Promise<Summary> {
    const maxTokens = options.maxTokens ?? 512;
    logger.info(`Summarizing transcript using Ollama model ${this.model}`);

    const response = await fetch(`${this.endpoint}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        prompt: `Summarize this transcript into concise bullet points:\n\n${transcript.text}\n\nKeep it under ${maxTokens} tokens.`,
        stream: false,
      }),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Ollama API error: ${response.status} ${body}`);
    }

    const json = (await response.json()) as { response?: string };
    const content = json.response?.trim();
    if (!content) {
      throw new Error("Ollama returned an empty summary");
    }

    return { text: content, model: this.model };
  }
}

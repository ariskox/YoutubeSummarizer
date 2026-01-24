import { Summary, SummaryVerbosity, Transcript } from "../shared/types.js";
import { logger } from "../shared/logger.js";
import { Summarizer } from "./Summarizer.js";

export class OllamaSummarizer implements Summarizer {
  constructor(
    private readonly model: string,
    private readonly endpoint: string = "http://localhost:11434",
    private readonly modelChecker?: (model: string, endpoint: string) => Promise<void>
  ) {}

  async summarize(transcript: Transcript, options: { maxTokens?: number; verbosity?: SummaryVerbosity } = {}): Promise<Summary> {
    const maxTokens = options.maxTokens ?? 512;
    const verbosity = options.verbosity ?? "standard";
    logger.info(`Summarizing transcript using Ollama model ${this.model} (${verbosity})`);

    if (this.modelChecker) {
      await this.modelChecker(this.model, this.endpoint);
    }

    const style = (() => {
      if (verbosity === "concise") return "Summarize in 3-5 bullet points.";
      if (verbosity === "detailed") return "Summarize in 8-12 bullet points with specifics.";
      return "Summarize in 5-8 bullet points with key takeaways.";
    })();

    const response = await fetch(`${this.endpoint}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model,
        prompt: `${style}\n\nTranscript:\n${transcript.text}\n\nKeep it under ${maxTokens} tokens.`,
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

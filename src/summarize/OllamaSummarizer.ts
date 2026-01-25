import { Summary, SummaryFormat, SummaryVerbosity, Transcript } from "../shared/types.js";
import { logger } from "../shared/logger.js";
import { buildSummaryPrompt } from "./SummaryPrompt.js";
import { Summarizer, normalizeSummaryOptions, SummaryRequestOptions } from "./Summarizer.js";

export class OllamaSummarizer implements Summarizer {
  constructor(
    private readonly model: string,
    private readonly endpoint: string = "http://localhost:11434",
    private readonly modelChecker?: (model: string, endpoint: string) => Promise<void>
  ) {}

  async summarize(
    transcript: Transcript,
    options?: SummaryRequestOptions
  ): Promise<Summary> {
    const { maxTokens, verbosity, summaryFormat } = normalizeSummaryOptions(options);
    logger.info(`Summarizing transcript using Ollama model ${this.model} (${verbosity})`);

    if (this.modelChecker) {
      await this.modelChecker(this.model, this.endpoint);
    }

    const style = buildSummaryPrompt(verbosity, summaryFormat);

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

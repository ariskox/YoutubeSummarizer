import { Summary, SummaryFormat, SummaryVerbosity, Transcript } from "../shared/types.js";
import { getLogLevel, logger } from "../shared/logger.js";
import { createHttpDebugger } from "../shared/httpDebug.js";
import { buildSummaryPrompt } from "./SummaryPrompt.js";
import { Summarizer, normalizeSummaryOptions, SummaryRequestOptions } from "./Summarizer.js";

export class OllamaSummarizer implements Summarizer {
  constructor(
    private readonly model: string,
    private readonly endpoint: string = "http://localhost:11434",
    private readonly modelChecker?: (model: string, endpoint: string) => Promise<void>
  ) {
    this.debug = createHttpDebugger(getLogLevel() === "debug");
  }

  private readonly debug;

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

    const url = `${this.endpoint}/api/generate`;
    const requestBody = {
      model: this.model,
      prompt: `${style}\n\nTranscript:\n${transcript.text}\n\nKeep it under ${maxTokens} tokens.`,
      stream: false,
    };

    this.debug.request("ollama", {
      url,
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: requestBody,
    });

    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(requestBody),
    });

    const raw = await response.text();

    this.debug.response("ollama", {
      status: response.status,
      headers: response.headers,
      body: raw,
    });

    if (!response.ok) {
      throw new Error(`Ollama API error: ${response.status} ${raw}`);
    }

    let json: { response?: string };
    try {
      json = JSON.parse(raw) as { response?: string };
    } catch {
      throw new Error(`Ollama API error: ${response.status} ${raw}`);
    }
    const content = json.response?.trim();
    if (!content) {
      throw new Error("Ollama returned an empty summary");
    }

    return { text: content, model: this.model };
  }
}

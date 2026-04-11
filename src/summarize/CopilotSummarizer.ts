import { Summary, Transcript } from "../shared/types.js";
import { getLogLevel, logger } from "../shared/logger.js";
import { createHttpDebugger } from "../shared/httpDebug.js";
import { buildSummaryPrompt } from "./SummaryPrompt.js";
import { Summarizer, normalizeSummaryOptions, SummaryRequestOptions } from "./Summarizer.js";

export class CopilotSummarizer implements Summarizer {
  constructor(
    private readonly apiKey: string,
    private readonly model: string,
    private readonly endpoint: string = "https://api.individual.githubcopilot.com"
  ) {
    this.debug = createHttpDebugger(getLogLevel() === "debug");
  }

  private readonly debug;

  async summarize(
    transcript: Transcript,
    options?: SummaryRequestOptions
  ): Promise<Summary> {
    const { verbosity, summaryFormat } = normalizeSummaryOptions(options);
    const maxCompletionTokens = options?.maxCompletionTokens ?? 1536;
    logger.info(`Summarizing transcript using GitHub Copilot model ${this.model} (${verbosity})`);

    const style = buildSummaryPrompt(verbosity, summaryFormat);

    const payload = {
      model: this.model,
      messages: [
        {
          role: "system",
          content: `${style} Keep neutral tone.`,
        },
        {
          role: "user",
          content: transcript.text,
        },
      ],
      max_completion_tokens: maxCompletionTokens,
      temperature: 0.2,
    };

    const url = `${this.endpoint}/chat/completions`;

    this.debug.request("copilot", {
      url,
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: payload,
    });

    const response = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    const raw = await response.text();

    this.debug.response("copilot", {
      status: response.status,
      headers: response.headers,
      body: raw,
    });

    if (!response.ok) {
      throw new Error(`GitHub Copilot API error: ${response.status} ${raw}`);
    }

    let json: { choices: { message: { content: string } }[]; model?: string };
    try {
      json = JSON.parse(raw) as { choices: { message: { content: string } }[]; model?: string };
    } catch {
      throw new Error(`GitHub Copilot API parse error: ${response.status} ${raw}`);
    }

    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("GitHub Copilot returned an empty summary");
    }

    return {
      text: content,
      model: json.model ?? this.model,
    };
  }
}

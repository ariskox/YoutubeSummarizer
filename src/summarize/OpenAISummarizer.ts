import { Summary, SummaryVerbosity, SummaryFormat, Transcript } from "../shared/types.js";
import { getLogLevel, logger } from "../shared/logger.js";
import { createHttpDebugger } from "../shared/httpDebug.js";
import { buildSummaryPrompt } from "./SummaryPrompt.js";
import { Summarizer, normalizeSummaryOptions, SummaryRequestOptions } from "./Summarizer.js";

export class OpenAISummarizer implements Summarizer {
  constructor(
    private readonly apiKey: string,
    private readonly model: string
  ) {
    this.debug = createHttpDebugger(getLogLevel() === "debug");
  }

  private readonly debug;

  async summarize(
    transcript: Transcript,
    options?: SummaryRequestOptions
  ): Promise<Summary> {
    const { verbosity, summaryFormat } = normalizeSummaryOptions(options);
    const maxTokens = options?.maxTokens ?? 1536;
    logger.info(`Summarizing transcript using OpenAI model ${this.model} (${verbosity})`);

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
      max_tokens: maxTokens,
      temperature: 0.2,
    };

    const url = "https://api.openai.com/v1/chat/completions";

    this.debug.request("openai", {
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

    this.debug.response("openai", {
      status: response.status,
      headers: response.headers,
      body: raw,
    });

    if (!response.ok) {
      throw new Error(`OpenAI API error: ${response.status} ${raw}`);
    }

    let json: { choices: { message: { content: string } }[]; model?: string };
    try {
      json = JSON.parse(raw) as { choices: { message: { content: string } }[]; model?: string };
    } catch {
      throw new Error(`OpenAI API parse error: ${response.status} ${raw}`);
    }

    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("OpenAI returned an empty summary");
    }

    return {
      text: content,
      model: json.model ?? this.model,
    };
  }
}

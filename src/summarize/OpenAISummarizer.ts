import { Summary, SummaryVerbosity, SummaryFormat, Transcript } from "../shared/types.js";
import { logger } from "../shared/logger.js";
import { buildSummaryPrompt } from "./SummaryPrompt.js";
import { Summarizer } from "./Summarizer.js";

export class OpenAISummarizer implements Summarizer {
  constructor(
    private readonly apiKey: string,
    private readonly model: string
  ) {}

  async summarize(
    transcript: Transcript,
    options?: { maxTokens?: number; verbosity?: SummaryVerbosity; summaryFormat?: SummaryFormat }
  ): Promise<Summary> {
    const maxTokens = options?.maxTokens ?? 512;
    const verbosity = options?.verbosity ?? "standard";
    const summaryFormat = options?.summaryFormat ?? "txt";
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

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`OpenAI API error: ${response.status} ${body}`);
    }

    const json = (await response.json()) as {
      choices: { message: { content: string } }[];
      model?: string;
    };

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

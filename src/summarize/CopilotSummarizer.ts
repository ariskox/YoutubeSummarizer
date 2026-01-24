import { Summary, Transcript } from "../shared/types.js";
import { logger } from "../shared/logger.js";

export interface Summarizer {
  summarize(transcript: Transcript, options?: { maxTokens?: number }): Promise<Summary>;
}

export class CopilotSummarizer implements Summarizer {
  constructor(
    private readonly apiKey: string,
    private readonly model: string
  ) {}

  async summarize(transcript: Transcript, options: { maxTokens?: number } = {}): Promise<Summary> {
    const maxTokens = options.maxTokens ?? 512;
    logger.info(`Summarizing transcript using Copilot model ${this.model}`);

    const payload = {
      model: this.model,
      messages: [
        {
          role: "system",
          content: "Summarize the following transcript into concise bullet points.",
        },
        {
          role: "user",
          content: transcript.text,
        },
      ],
      max_tokens: maxTokens,
      temperature: 0.2,
    };

    const response = await fetch("https://api.githubcopilot.com/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const body = await response.text();
      throw new Error(`Copilot API error: ${response.status} ${body}`);
    }

    const json = (await response.json()) as {
      choices: { message: { content: string } }[];
      model?: string;
    };

    const content = json.choices?.[0]?.message?.content?.trim();
    if (!content) {
      throw new Error("Copilot returned an empty summary");
    }

    return {
      text: content,
      model: json.model ?? this.model,
    };
  }
}

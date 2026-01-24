import { Summary, Transcript } from "../shared/types.js";

export interface Summarizer {
  summarize(transcript: Transcript, options?: { maxTokens?: number }): Promise<Summary>;
}

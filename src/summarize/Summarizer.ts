import { Summary, SummaryVerbosity, Transcript } from "../shared/types.js";

export interface Summarizer {
  summarize(transcript: Transcript, options?: { maxTokens?: number; verbosity?: SummaryVerbosity }): Promise<Summary>;
}

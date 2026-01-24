import { Summary, SummaryVerbosity, SummaryFormat, Transcript } from "../shared/types.js";

export interface Summarizer {
  summarize(
    transcript: Transcript,
    options?: { maxTokens?: number; verbosity?: SummaryVerbosity; summaryFormat?: SummaryFormat }
  ): Promise<Summary>;
}

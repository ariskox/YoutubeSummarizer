import { Summary, SummaryVerbosity, SummaryFormat, Transcript } from "../shared/types.js";

export interface Summarizer {
  summarize(
    transcript: Transcript,
    options?: SummaryRequestOptions
  ): Promise<Summary>;
}

export type SummaryRequestOptions = {
  maxCompletionTokens?: number;
  verbosity?: SummaryVerbosity;
  summaryFormat?: SummaryFormat;
};

export const normalizeSummaryOptions = (options?: SummaryRequestOptions) => ({
  maxCompletionTokens: options?.maxCompletionTokens ?? 512,
  verbosity: options?.verbosity ?? "standard",
  summaryFormat: options?.summaryFormat ?? "txt",
});

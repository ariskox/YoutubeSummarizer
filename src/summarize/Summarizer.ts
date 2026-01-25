import { Summary, SummaryVerbosity, SummaryFormat, Transcript } from "../shared/types.js";

export interface Summarizer {
  summarize(
    transcript: Transcript,
    options?: SummaryRequestOptions
  ): Promise<Summary>;
}

export type SummaryRequestOptions = {
  maxTokens?: number;
  verbosity?: SummaryVerbosity;
  summaryFormat?: SummaryFormat;
};

export const normalizeSummaryOptions = (options?: SummaryRequestOptions) => ({
  maxTokens: options?.maxTokens ?? 512,
  verbosity: options?.verbosity ?? "standard",
  summaryFormat: options?.summaryFormat ?? "txt",
});

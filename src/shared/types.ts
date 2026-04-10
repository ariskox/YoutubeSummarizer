export type Transcript = {
  text: string;
  source: string;
};

export type Summary = {
  text: string;
  model: string;
};

export type SummaryVerbosity = "concise" | "standard" | "detailed";

export type SummaryFormat = "txt" | "html";

export type PipelineResult = {
  videoPath: string;
  audioPath: string;
  transcript: Transcript;
} & (
  | { transcriptOnly: true; summary?: never }
  | { transcriptOnly: false; summary: Summary }
);

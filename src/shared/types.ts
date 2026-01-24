export type Transcript = {
  text: string;
  source: string;
};

export type Summary = {
  text: string;
  model: string;
};

export type PipelineResult = {
  videoPath: string;
  audioPath: string;
  transcript: Transcript;
  summary: Summary;
};

import { promises as fs } from "node:fs";
import ora, { Color } from "ora";
import { fileExists, removeIfExists, ensureParentDir } from "../shared/fs.js";
import { logger } from "../shared/logger.js";
import { PipelineResult, Summary, Transcript, SummaryVerbosity } from "../shared/types.js";
import { AudioExtractor } from "../media/AudioExtractor.js";
import { MediaDownloader } from "../media/YoutubeDownloader.js";
import { Transcriber } from "../transcribe/WhisperTranscriber.js";
import { Summarizer } from "../summarize/Summarizer.js";

export class SummarizePipeline {
  constructor(
    private readonly downloader: MediaDownloader,
    private readonly extractor: AudioExtractor,
    private readonly transcriber: Transcriber,
    private readonly summarizer: Summarizer,
    private readonly keepTemp: boolean,
    private readonly useCache: boolean,
    private readonly verbosity: SummaryVerbosity,
    private readonly summarizerLabel: string
  ) {}

  async run(url: string, paths: {
    videoPath: string;
    audioPath: string;
    transcriptPath: string;
    summaryPath: string;
    isCache: boolean;
  }): Promise<PipelineResult> {
    logger.info("Starting pipeline");

    const video = await this.withSpinner("Download video", "cyan", () =>
      this.getOrDownload(url, paths.videoPath)
    );

    const audio = await this.withSpinner("Extract audio", "magenta", () =>
      this.getOrExtract(video.path, paths.audioPath)
    );

    const transcript = await this.withSpinner("Transcribe audio", "yellow", () =>
      this.getOrTranscribe(audio.path, paths.transcriptPath)
    );

    const summary = await this.withSpinner(`Summarize (${this.summarizerLabel})`, "green", () =>
      this.getOrSummarize(transcript.value, paths.summaryPath)
    );

    if (!this.keepTemp && !paths.isCache) {
      await removeIfExists(paths.videoPath);
      await removeIfExists(paths.audioPath);
      await removeIfExists(paths.transcriptPath);
      await removeIfExists(paths.summaryPath);
    }

    return { videoPath: video.path, audioPath: audio.path, transcript: transcript.value, summary: summary.value } satisfies PipelineResult;
  }

  private async withSpinner<T extends { fromCache?: boolean }>(label: string, color: Color, fn: () => Promise<T>): Promise<T> {
    const spinner = ora({ text: label, color }).start();
    try {
      const result = await fn();
      const suffix = result.fromCache ? " (cache)" : "";
      spinner.succeed(`${label}${suffix}`);
      return result;
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      spinner.fail(message);
      throw err;
    }
  }

  private async getOrDownload(url: string, videoPath: string) {
    if (this.useCache && await fileExists(videoPath)) {
      return { path: videoPath, fromCache: true } as const;
    }
    const path = await this.downloader.download(url, videoPath);
    return { path, fromCache: false } as const;
  }

  private async getOrExtract(videoPath: string, audioPath: string) {
    if (this.useCache && await fileExists(audioPath)) {
      return { path: audioPath, fromCache: true } as const;
    }
    const path = await this.extractor.extract(videoPath, audioPath);
    return { path, fromCache: false } as const;
  }

  private async getOrTranscribe(audioPath: string, transcriptPath: string): Promise<{ value: Transcript; fromCache: boolean }> {
    if (this.useCache && await fileExists(transcriptPath)) {
      const text = await fs.readFile(transcriptPath, "utf8");
      if (text.trim()) {
        return { value: { text, source: transcriptPath }, fromCache: true };
      }
    }
    const transcript = await this.transcriber.transcribe(audioPath, transcriptPath);
    await ensureParentDir(transcriptPath);
    await fs.writeFile(transcriptPath, transcript.text, "utf8");
    return { value: transcript, fromCache: false };
  }

  private async getOrSummarize(transcript: Transcript, summaryPath: string): Promise<{ value: Summary; fromCache: boolean }> {
    if (this.useCache && await fileExists(summaryPath)) {
      const text = await fs.readFile(summaryPath, "utf8");
      if (text.trim()) {
        return { value: { text, model: "cache" }, fromCache: true };
      }
    }
    const summary = await this.summarizer.summarize(transcript, { verbosity: this.verbosity });
    await ensureParentDir(summaryPath);
    await fs.writeFile(summaryPath, summary.text, "utf8");
    return { value: summary, fromCache: false };
  }
}

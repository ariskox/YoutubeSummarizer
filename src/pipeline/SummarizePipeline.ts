import { promises as fs } from "node:fs";
import ora, { Color } from "ora";
import { fileExists, removeIfExists, ensureParentDir } from "../shared/fs.js";
import { logger } from "../shared/logger.js";
import { PipelineResult, Transcript, SummaryVerbosity, SummaryFormat, Summary } from "../shared/types.js";
import { AudioExtractor } from "../media/AudioExtractor.js";
import { MediaDownloader } from "../media/YoutubeDownloader.js";
import { Transcriber } from "../transcribe/WhisperTranscriber.js";
import { Summarizer } from "../summarize/Summarizer.js";
import { SummaryFormatter } from "../summarize/SummaryFormatter.js";

export class SummarizePipeline {
  constructor(
    private readonly downloader: MediaDownloader,
    private readonly extractor: AudioExtractor,
    private readonly transcriber: Transcriber,
    private readonly summarizer: Summarizer,
    private readonly keepTemp: boolean,
    private readonly useCache: boolean,
    private readonly verbosity: SummaryVerbosity,
    private readonly summarizerLabel: string,
    private readonly summaryFormat: SummaryFormat
  ) {
    this.formatter = new SummaryFormatter(summaryFormat);
  }

  private readonly formatter: SummaryFormatter;

  async run(url: string, paths: {
    videoPath: string;
    audioPath: string;
    transcriptPath: string;
    summaryPath: string;
    isCache: boolean;
  }): Promise<PipelineResult> {
    logger.info("Starting pipeline");

    // If we already have a cached transcript, we can skip the media steps entirely.
    const cachedTranscript = await this.readCachedTranscript(paths.transcriptPath);

    const video = await this.cacheableStep(
      "Download audio",
      "cyan",
      () => this.cachedMediaPath(paths.videoPath, Boolean(cachedTranscript)),
      () => this.download(url, paths.videoPath),
      { cacheLabel: cachedTranscript ? " (skip)" : undefined }
    );

    const audio = await this.cacheableStep(
      "Extract audio",
      "magenta",
      () => this.cachedMediaPath(paths.audioPath, Boolean(cachedTranscript)),
      () => this.extract(video.value.path, paths.audioPath),
      { cacheLabel: cachedTranscript ? " (skip)" : undefined }
    );

    const transcript = await this.cacheableStep(
      "Transcribe audio",
      "yellow",
      () => this.readCachedTranscript(paths.transcriptPath),
      async () => {
        const result = await this.transcriber.transcribe(audio.value.path, paths.transcriptPath);
        return result;
      },
      {
        cacheLabel: cachedTranscript ? " (skip)" : undefined,
        persist: async (result) => this.writeFile(paths.transcriptPath, result.text),
      }
    );

    if (!this.keepTemp) {
      await removeIfExists(paths.videoPath);
      await removeIfExists(paths.audioPath);
    }

    const summary = await this.cacheableStep(
      `Summarize (${this.summarizerLabel})`,
      "green",
      () => this.readCachedSummary(paths.summaryPath),
      async () => {
        const result = await this.summarizer.summarize(transcript.value, {
          verbosity: this.verbosity,
          summaryFormat: this.summaryFormat,
        });
        return result;
      },
      {
        persist: async (result) => this.writeFile(paths.summaryPath, this.formatter.render(result)),
      }
    );

    if (!this.keepTemp && !paths.isCache && this.summaryFormat === "txt") {
      await removeIfExists(paths.summaryPath);
    }

    return { videoPath: video.value.path, audioPath: audio.value.path, transcript: transcript.value, summary: summary.value } satisfies PipelineResult;
  }

  private async cacheableStep<T>(
    label: string,
    color: Color,
    cacheReader: () => Promise<T | null>,
    worker: () => Promise<T>,
    opts: { cacheLabel?: string; persist?: (value: T) => Promise<void> } = {}
  ): Promise<{ value: T; fromCache: boolean }> {
    const spinner = ora({ text: label, color }).start();
    try {
      const cached = await cacheReader();
      if (cached !== null) {
        spinner.succeed(`${label}${opts.cacheLabel ?? " (cache)"}`);
        return { value: cached, fromCache: true };
      }

      const value = await worker();
      if (opts.persist) {
        await opts.persist(value);
      }
      spinner.succeed(label);
      return { value, fromCache: false };
    } catch (err) {
      const message = (err as Error).message ?? String(err);
      spinner.fail(message);
      throw err;
    }
  }

  private async cachedMediaPath(targetPath: string, skipCheck: boolean): Promise<{ path: string } | null> {
    if (skipCheck) {
      return { path: targetPath };
    }
    if (!this.useCache) return null;
    return (await fileExists(targetPath)) ? { path: targetPath } : null;
  }

  private async readCachedTranscript(transcriptPath: string): Promise<Transcript | null> {
    if (!this.useCache) return null;
    if (await fileExists(transcriptPath)) {
      const text = await fs.readFile(transcriptPath, "utf8");
      if (text.trim()) {
        return { text, source: transcriptPath };
      }
    }
    return null;
  }

  private async readCachedSummary(summaryPath: string): Promise<Summary | null> {
    if (!this.useCache) return null;
    if (await fileExists(summaryPath)) {
      const text = await fs.readFile(summaryPath, "utf8");
      if (text.trim()) {
        return { text, model: "cache" };
      }
    }
    return null;
  }

  private async download(url: string, outputPath: string) {
    const path = await this.downloader.download(url, outputPath);
    return { path } as const;
  }

  private async extract(videoPath: string, outputPath: string) {
    const path = await this.extractor.extract(videoPath, outputPath);
    return { path } as const;
  }

  private async writeFile(targetPath: string, content: string) {
    await ensureParentDir(targetPath);
    await fs.writeFile(targetPath, content, "utf8");
  }
}

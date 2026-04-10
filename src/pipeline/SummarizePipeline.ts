import ora, { Color } from "ora";
import { removeIfExists } from "../shared/fs.js";
import { logger } from "../shared/logger.js";
import { PipelineResult, Transcript, SummaryVerbosity, SummaryFormat, Summary } from "../shared/types.js";
import { AudioExtractor } from "../media/AudioExtractor.js";
import { MediaDownloader } from "../media/YoutubeDownloader.js";
import { Transcriber } from "../transcribe/WhisperTranscriber.js";
import { Summarizer } from "../summarize/Summarizer.js";
import { SummaryFormatter } from "../summarize/SummaryFormatter.js";
import { CacheManager } from "./CacheManager.js";

export class SummarizePipeline {
  constructor(
    private readonly downloader: MediaDownloader,
    private readonly extractor: AudioExtractor,
    private readonly transcriber: Transcriber,
    private readonly summarizer: Summarizer | null,
    private readonly transcriptOnly: boolean,
    private readonly keepTemp: boolean,
    private readonly useCache: boolean,
    private readonly verbosity: SummaryVerbosity,
    private readonly summarizerLabel: string,
    private readonly summaryFormat: SummaryFormat
  ) {
    if (!transcriptOnly && !summarizer) {
      throw new Error("Summarizer is required for summary generation");
    }
    this.formatter = new SummaryFormatter(summaryFormat);
    this.cache = new CacheManager(useCache);
  }

  private readonly formatter: SummaryFormatter;
  private readonly cache: CacheManager;

  async run(url: string, paths: {
    videoPath: string;
    audioPath: string;
    transcriptPath: string;
    summaryPath: string;
    isCache: boolean;
  }): Promise<PipelineResult> {
    logger.info("Starting pipeline");

    // If we already have a cached transcript, we can skip the media steps entirely.
    const cachedTranscript = await this.cache.readTranscript(paths.transcriptPath);

    const video = await this.cacheableStep(
      "Download audio",
      "cyan",
      () => this.cache.media(paths.videoPath, { allowMissing: Boolean(cachedTranscript) }),
      () => this.download(url, paths.videoPath),
      { cacheLabel: cachedTranscript ? " (skip)" : undefined }
    );

    const audio = await this.cacheableStep(
      "Extract audio",
      "magenta",
      () => this.cache.media(paths.audioPath, { allowMissing: Boolean(cachedTranscript) }),
      () => this.extract(video.value.path, paths.audioPath),
      { cacheLabel: cachedTranscript ? " (skip)" : undefined }
    );

    const transcript = await this.cacheableStep(
      "Transcribe audio",
      "yellow",
      () => this.cache.readTranscript(paths.transcriptPath),
      async () => {
        const result = await this.transcriber.transcribe(audio.value.path, paths.transcriptPath);
        return result;
      },
      {
        cacheLabel: cachedTranscript ? " (skip)" : undefined,
        persist: async (result) => this.cache.persistTranscript(paths.transcriptPath, result.text),
      }
    );

    if (!this.keepTemp) {
      await removeIfExists(paths.videoPath);
      await removeIfExists(paths.audioPath);
    }

    let summary: { value: Summary; fromCache: boolean } | null = null;
    if (!this.transcriptOnly) {
      const summarizer = this.requireSummarizer();
      summary = await this.cacheableStep(
        `Summarize (${this.summarizerLabel})`,
        "green",
        () => this.cache.readSummary(paths.summaryPath),
        async () => {
          const result = await summarizer.summarize(transcript.value, {
            verbosity: this.verbosity,
            summaryFormat: this.summaryFormat,
          });
          return result;
        },
        {
          persist: async (result) => this.cache.persistSummary(paths.summaryPath, this.formatter.render(result)),
        }
      );
    }

    if (!this.keepTemp && !paths.isCache && this.summaryFormat === "txt") {
      await removeIfExists(paths.summaryPath);
    }

    if (summary) {
      return {
        videoPath: video.value.path,
        audioPath: audio.value.path,
        transcript: transcript.value,
        transcriptOnly: false,
        summary: summary.value,
      } satisfies PipelineResult;
    }

    return {
      videoPath: video.value.path,
      audioPath: audio.value.path,
      transcript: transcript.value,
      transcriptOnly: true,
    } satisfies PipelineResult;
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

  private async download(url: string, outputPath: string) {
    const path = await this.downloader.download(url, outputPath);
    return { path } as const;
  }

  private async extract(videoPath: string, outputPath: string) {
    const path = await this.extractor.extract(videoPath, outputPath);
    return { path } as const;
  }

  private requireSummarizer(): Summarizer {
    if (!this.summarizer) {
      throw new Error("Summarizer is required for summary generation");
    }
    return this.summarizer;
  }
}

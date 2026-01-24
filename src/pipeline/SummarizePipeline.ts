import { promises as fs } from "node:fs";
import { fileExists, removeIfExists, ensureParentDir } from "../shared/fs.js";
import { logger } from "../shared/logger.js";
import { PipelineResult, Summary, Transcript } from "../shared/types.js";
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
    private readonly useCache: boolean
  ) {}

  async run(url: string, paths: {
    videoPath: string;
    audioPath: string;
    transcriptPath: string;
    summaryPath: string;
    isCache: boolean;
  }): Promise<PipelineResult> {
    logger.info("Starting pipeline");

    const videoPath = await this.getOrDownload(url, paths.videoPath);
    const audioPath = await this.getOrExtract(videoPath, paths.audioPath);
    const transcript = await this.getOrTranscribe(audioPath, paths.transcriptPath);
    const summary = await this.getOrSummarize(transcript, paths.summaryPath);

    if (!this.keepTemp && !paths.isCache) {
      await removeIfExists(paths.videoPath);
      await removeIfExists(paths.audioPath);
      await removeIfExists(paths.transcriptPath);
      await removeIfExists(paths.summaryPath);
    }

    return { videoPath, audioPath, transcript, summary } satisfies PipelineResult;
  }

  private async getOrDownload(url: string, videoPath: string) {
    if (this.useCache && await fileExists(videoPath)) {
      logger.info("Cache hit: video");
      return videoPath;
    }
    return this.downloader.download(url, videoPath);
  }

  private async getOrExtract(videoPath: string, audioPath: string) {
    if (this.useCache && await fileExists(audioPath)) {
      logger.info("Cache hit: audio");
      return audioPath;
    }
    return this.extractor.extract(videoPath, audioPath);
  }

  private async getOrTranscribe(audioPath: string, transcriptPath: string): Promise<Transcript> {
    if (this.useCache && await fileExists(transcriptPath)) {
      logger.info("Cache hit: transcript");
      const text = await fs.readFile(transcriptPath, "utf8");
      if (text.trim()) {
        return { text, source: transcriptPath };
      }
      logger.warn("Transcript cache was empty; regenerating");
    }
    const transcript = await this.transcriber.transcribe(audioPath, transcriptPath);
    await ensureParentDir(transcriptPath);
    await fs.writeFile(transcriptPath, transcript.text, "utf8");
    return transcript;
  }

  private async getOrSummarize(transcript: Transcript, summaryPath: string): Promise<Summary> {
    if (this.useCache && await fileExists(summaryPath)) {
      logger.info("Cache hit: summary");
      const text = await fs.readFile(summaryPath, "utf8");
      if (text.trim()) {
        return { text, model: "cache" };
      }
      logger.warn("Summary cache was empty; regenerating");
    }
    const summary = await this.summarizer.summarize(transcript);
    await ensureParentDir(summaryPath);
    await fs.writeFile(summaryPath, summary.text, "utf8");
    return summary;
  }
}

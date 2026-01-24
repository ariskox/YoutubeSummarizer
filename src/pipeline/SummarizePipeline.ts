import { removeIfExists } from "../shared/fs.js";
import { logger } from "../shared/logger.js";
import { PipelineResult, Summary, Transcript } from "../shared/types.js";
import { AudioExtractor } from "../media/AudioExtractor.js";
import { MediaDownloader } from "../media/YoutubeDownloader.js";
import { Transcriber } from "../transcribe/WhisperTranscriber.js";
import { Summarizer } from "../summarize/CopilotSummarizer.js";

export class SummarizePipeline {
  constructor(
    private readonly downloader: MediaDownloader,
    private readonly extractor: AudioExtractor,
    private readonly transcriber: Transcriber,
    private readonly summarizer: Summarizer,
    private readonly keepTemp: boolean
  ) {}

  async run(url: string, paths: {
    videoPath: string;
    audioPath: string;
    transcriptPath: string;
  }): Promise<PipelineResult> {
    logger.info("Starting pipeline");

    const videoPath = await this.downloader.download(url, paths.videoPath);
    const audioPath = await this.extractor.extract(videoPath, paths.audioPath);
    const transcript = await this.transcriber.transcribe(audioPath, paths.transcriptPath);
    const summary = await this.summarizer.summarize(transcript);

    if (!this.keepTemp) {
      await removeIfExists(paths.videoPath);
      await removeIfExists(paths.audioPath);
      await removeIfExists(paths.transcriptPath);
    }

    return { videoPath, audioPath, transcript, summary } satisfies PipelineResult;
  }
}

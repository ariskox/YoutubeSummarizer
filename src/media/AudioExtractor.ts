import { runCommand } from "../shared/exec.js";
import { fileExists, removeIfExists } from "../shared/fs.js";
import { logger } from "../shared/logger.js";

export interface AudioExtractor {
  extract(videoPath: string, outputPath: string): Promise<string>;
}

export class FfmpegAudioExtractor implements AudioExtractor {
  constructor(private readonly binary: string = "ffmpeg") {}

  async extract(videoPath: string, outputPath: string): Promise<string> {
    logger.info(`Extracting audio to ${outputPath}`);
    await removeIfExists(outputPath);
    const args = [
      "-y",
      "-i",
      videoPath,
      "-vn",
      "-acodec",
      "pcm_s16le",
      "-ar",
      "16000",
      "-ac",
      "1",
      outputPath,
    ];
    await runCommand(this.binary, args);
    const exists = await fileExists(outputPath);
    if (!exists) {
      throw new Error(`Audio extraction failed; file not found at ${outputPath}`);
    }
    logger.info(`Audio ready at ${outputPath}`);
    return outputPath;
  }
}

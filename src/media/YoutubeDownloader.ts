import { runCommand } from "../shared/exec.js";
import { fileExists } from "../shared/fs.js";
import { logger } from "../shared/logger.js";

export interface MediaDownloader {
  download(url: string, outputPath: string): Promise<string>;
}

export class YoutubeDownloader implements MediaDownloader {
  constructor(private readonly binary: string = "yt-dlp") {}

  async download(url: string, outputPath: string): Promise<string> {
    logger.info(`Downloading video from ${url}`);
    const args = ["-f", "mp4", "-o", outputPath, url];
    await runCommand(this.binary, args);
    const exists = await fileExists(outputPath);
    if (!exists) {
      throw new Error(`Download failed; file not found at ${outputPath}`);
    }
    logger.info(`Video saved to ${outputPath}`);
    return outputPath;
  }
}

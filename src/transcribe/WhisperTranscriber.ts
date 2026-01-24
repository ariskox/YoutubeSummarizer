import path from "node:path";
import { promises as fs } from "node:fs";
import { runCommand } from "../shared/exec.js";
import { fileExists } from "../shared/fs.js";
import { logger } from "../shared/logger.js";
import { Transcript } from "../shared/types.js";

export interface Transcriber {
  transcribe(audioPath: string, outputPath: string): Promise<Transcript>;
}

export class WhisperTranscriber implements Transcriber {
  constructor(
    private readonly binary: string,
    private readonly modelPath: string
  ) {}

  async transcribe(audioPath: string, outputPath: string): Promise<Transcript> {
    logger.info(`Transcribing audio with whisper.cpp using model ${this.modelPath}`);
    const args = ["-m", this.modelPath, "-f", audioPath, "-of", outputPath.replace(/\.txt$/, ""), "-otxt"];
    await runCommand(this.binary, args);

    const exists = await fileExists(outputPath);
    if (!exists) {
      throw new Error(`Transcription failed; file not found at ${outputPath}`);
    }

    const text = await fs.readFile(outputPath, "utf8");
    if (!text.trim()) {
      throw new Error("Transcription produced empty text");
    }
    logger.info("Transcription complete");
    return { text, source: path.resolve(outputPath) };
  }
}

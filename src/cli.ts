#!/usr/bin/env node
import { Command } from "commander";
import { loadConfig, workspacePaths } from "./config.js";
import { logger } from "./shared/logger.js";
import { YoutubeDownloader } from "./media/YoutubeDownloader.js";
import { FfmpegAudioExtractor } from "./media/AudioExtractor.js";
import { WhisperTranscriber } from "./transcribe/WhisperTranscriber.js";
import { CopilotSummarizer } from "./summarize/CopilotSummarizer.js";
import { OllamaSummarizer } from "./summarize/OllamaSummarizer.js";
import { SummarizePipeline } from "./pipeline/SummarizePipeline.js";

const program = new Command();

program
  .name("ytsum")
  .description("Download, transcribe, and summarize a YouTube video")
  .argument("<url>", "YouTube video URL")
  .option("--summarizer <copilot|ollama>", "Summarizer backend", "copilot")
  .option("--copilot-model <model>", "Copilot model", "gpt-4o-mini")
  .option("--ollama-model <model>", "Ollama model", "llama3.1")
  .option("--whisper-binary <path>", "Path to whisper.cpp binary", "./main")
  .option("--whisper-model <path>", "Path to whisper model", "./models/ggml-base.en.bin")
  .option("--cache-dir <path>", "Cache directory", undefined)
  .option("--keep-temp", "Keep temp artifacts", false)
  .option("--skip-cache", "Force bypass cache", false)
  .showHelpAfterError(true)
  .action(async (url, opts) => {
    try {
      const config = await loadConfig({
        keepTemp: opts.keepTemp,
        copilotModel: opts.copilotModel,
        whisperBinary: opts.whisperBinary,
        whisperModel: opts.whisperModel,
        ollamaModel: opts.ollamaModel,
        cacheDir: opts.cacheDir,
      });

      const useCache = !opts.skipCache;
      const temp = await workspacePaths(url, useCache, config.cacheDir);

      const downloader = new YoutubeDownloader();
      const extractor = new FfmpegAudioExtractor();
      const transcriber = new WhisperTranscriber(config.whisperBinary, config.whisperModel);

      const summarizer = opts.summarizer === "ollama"
        ? new OllamaSummarizer(config.ollamaModel)
        : (() => {
            if (!config.copilotApiKey) {
              throw new Error("COPILOT_API_KEY is required for copilot summarizer");
            }
            return new CopilotSummarizer(config.copilotApiKey, config.copilotModel);
          })();

      const pipeline = new SummarizePipeline(
        downloader,
        extractor,
        transcriber,
        summarizer,
        config.keepTemp,
        useCache
      );

      const result = await pipeline.run(url, temp);
      logger.info("Summary:\n" + result.summary.text);
    } catch (error) {
      const err = error as Error;
      logger.error(err.message);
      process.exitCode = 1;
    }
  });

program.parse(process.argv);

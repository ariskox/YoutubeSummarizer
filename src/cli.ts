#!/usr/bin/env node
import { Command } from "commander";
import { loadConfig, workspacePaths } from "./config.js";
import { logger } from "./shared/logger.js";
import { YoutubeDownloader } from "./media/YoutubeDownloader.js";
import { FfmpegAudioExtractor } from "./media/AudioExtractor.js";
import { WhisperTranscriber } from "./transcribe/WhisperTranscriber.js";
import { OllamaSummarizer } from "./summarize/OllamaSummarizer.js";
import { OpenAISummarizer } from "./summarize/OpenAISummarizer.js";
import { SummarizePipeline } from "./pipeline/SummarizePipeline.js";

const program = new Command();

program
  .name("ytsum")
  .description("Download, transcribe, and summarize a YouTube video")
  .argument("[url]", "YouTube video URL (omit when using --reconfigure)")
  .option("--summarizer <openai|ollama>", "Summarizer backend", "openai")
  .option("--openai-model <model>", "OpenAI model", "gpt-4o-mini")
  .option("--ollama-model <model>", "Ollama model", "llama3.1")
  .option("--whisper-binary <path>", "Path to whisper.cpp binary", "/usr/local/bin/whisper-cli")
  .option("--whisper-model <path>", "Path to whisper model", "/usr/local/lib/whisper-models/ggml-base.en.bin")
  .option("--cache-dir <path>", "Cache directory", undefined)
  .option("--keep-temp", "Keep temp artifacts", false)
  .option("--skip-cache", "Force bypass cache", false)
  .option("--reconfigure", "Run interactive configuration and save it", false)
  .showHelpAfterError(true)
  .action(async (url, opts) => {
    try {
      const config = await loadConfig({
        keepTemp: opts.keepTemp,
        openaiModel: opts.openaiModel,
        whisperBinary: opts.whisperBinary,
        whisperModel: opts.whisperModel,
        ollamaModel: opts.ollamaModel,
        cacheDir: opts.cacheDir,
      }, { reconfigure: opts.reconfigure });

      if (opts.reconfigure && !url) {
        // Configuration-only run; exit after setup.
        logger.info("Configuration saved.");
        return;
      }

      if (!url) {
        throw new Error("URL is required unless using --reconfigure");
      }

      const useCache = !opts.skipCache;
      const temp = await workspacePaths(url, useCache, config.cacheDir);

      const downloader = new YoutubeDownloader();
      const extractor = new FfmpegAudioExtractor();
      const transcriber = new WhisperTranscriber(config.whisperBinary, config.whisperModel);

      const summarizer = (() => {
        if (opts.summarizer === "ollama") {
          return new OllamaSummarizer(config.ollamaModel);
        }
        if (!config.openaiApiKey) {
          throw new Error("OPENAI_API_KEY is required for openai summarizer");
        }
        return new OpenAISummarizer(config.openaiApiKey, config.openaiModel);
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

#!/usr/bin/env node
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { Command } from "commander";
import { loadConfig, workspacePaths } from "./config.js";
import { logger, setLogLevel, LogLevel } from "./shared/logger.js";
import { YoutubeDownloader } from "./media/YoutubeDownloader.js";
import { FfmpegAudioExtractor } from "./media/AudioExtractor.js";
import { WhisperTranscriber } from "./transcribe/WhisperTranscriber.js";
import { OllamaSummarizer } from "./summarize/OllamaSummarizer.js";
import { OpenAISummarizer } from "./summarize/OpenAISummarizer.js";
import { SummarizePipeline } from "./pipeline/SummarizePipeline.js";
import { pruneCache, DEFAULT_CACHE_TTL_MS } from "./shared/fs.js";

const program = new Command();

program
  .name("ytsum")
  .description("Download, transcribe, and summarize a YouTube video")
  .argument("[url]", "YouTube video URL (omit when using --reconfigure)")
  .option("--summarizer <openai|ollama>", "Summarizer backend (default from config)")
  .option("--openai-model <model>", "OpenAI model", "gpt-4o-mini")
  .option("--ollama-model <model>", "Ollama model", "gemma3:4b")
  .option("--verbosity <concise|standard|detailed>", "Summary verbosity", "standard")
  .option("--whisper-binary <path>", "Path to whisper.cpp binary", "/usr/local/bin/whisper-cli")
  .option("--whisper-model <path>", "Path to whisper model", "/usr/local/lib/whisper-models/ggml-base.en.bin")
  .option("--cache-dir <path>", "Cache directory", undefined)
  .option("--format <html|txt>", "Summary output format", undefined)
  .option("--keep-temp", "Keep temp artifacts", false)
  .option("--skip-cache", "Force bypass cache", false)
  .option("--reconfigure", "Run interactive configuration and save it", false)
  .option("--clean-cache", "Delete all cached artifacts and exit (unless URL is provided)", false)
  .option("--transcript-only", "Skip summarization and print only the transcript", false)
  .option("--log-level <error|warn|info>", "Log level (default: error)", "error")
  .showHelpAfterError(true)
  .action(async (url, opts) => {
    try {
      setLogLevel((opts.logLevel ?? "error") as LogLevel);

      const config = await loadConfig({
        keepTemp: opts.keepTemp,
        openaiModel: opts.openaiModel,
        whisperBinary: opts.whisperBinary,
        whisperModel: opts.whisperModel,
        ollamaModel: opts.ollamaModel,
        cacheDir: opts.cacheDir,
        verbosity: opts.verbosity,
        summarizer: opts.summarizer,
        summaryFormat: opts.format,
      }, { reconfigure: opts.reconfigure });

      if (opts.cleanCache && !url) {
        await pruneCache(config.cacheDir, { force: true });
        logger.info("Cache cleared.");
        return;
      }

      if (opts.reconfigure && !url) {
        // Configuration-only run; exit after setup.
        logger.info("Configuration saved.");
        return;
      }

      if (!url) {
        throw new Error("URL is required unless using --reconfigure or --clean-cache");
      }

      if (opts.cleanCache) {
        await pruneCache(config.cacheDir, { force: true });
        logger.info("Cache cleared.");
      }

      // Opportunistic cache expiry (48h by default) before use.
      if (!opts.skipCache) {
        await pruneCache(config.cacheDir, { ttlMs: DEFAULT_CACHE_TTL_MS });
      }

      const selectedSummarizer = config.summarizer;
      const transcriptOnly = Boolean(opts.transcriptOnly);

      const useCache = !opts.skipCache;
      const modelKey = selectedSummarizer === "ollama" ? config.ollamaModel : config.openaiModel;
      const temp = await workspacePaths(
        url,
        useCache,
        config.cacheDir,
        config.verbosity,
        selectedSummarizer,
        modelKey,
        config.summaryFormat
      );

      const downloader = new YoutubeDownloader();
      const extractor = new FfmpegAudioExtractor();
      const transcriber = new WhisperTranscriber(config.whisperBinary, config.whisperModel);

      const ensureOllamaModel = async (model: string, endpoint: string) => {
        const res = await fetch(`${endpoint}/api/show`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ model }),
        });
        if (res.status === 404) {
          throw new Error(`Ollama model '${model}' not found at ${endpoint}. Please pull or create it.`);
        }
        if (!res.ok) {
          const body = await res.text();
          throw new Error(`Ollama model check failed: ${res.status} ${body}`);
        }
      };

      const summarizer = transcriptOnly ? null : (() => {
        if (selectedSummarizer === "ollama") {
          const endpoint = "http://localhost:11434";
          return new OllamaSummarizer(config.ollamaModel, endpoint, ensureOllamaModel);
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
        transcriptOnly,
        config.keepTemp,
        useCache,
        config.verbosity,
        `${selectedSummarizer}:${modelKey}`,
        config.summaryFormat
      );

      const result = await pipeline.run(url, temp);
      if (result.transcriptOnly) {
        // eslint-disable-next-line no-console
        console.log("Transcript:\n" + result.transcript.text);
      } else if (config.summaryFormat === "html") {
        const open = promisify(execFile);
        // Open in Safari on macOS for a quick view.
        await open("open", ["-a", "Safari", temp.summaryPath]);
        // eslint-disable-next-line no-console
        console.log(`Summary opened in Safari: ${temp.summaryPath}`);
      } else {
        // Always show summary regardless of log level.
        // eslint-disable-next-line no-console
        console.log("Summary:\n" + result.summary.text);
      }
    } catch (error) {
      const err = error as Error;
      logger.error(err.message);
      process.exitCode = 1;
    }
  });

program.parse(process.argv);

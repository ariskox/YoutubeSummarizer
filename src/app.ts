import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { loadConfig, workspacePaths } from "./config.js";
import { pruneCache, DEFAULT_CACHE_TTL_MS } from "./shared/fs.js";
import { logger, setLogLevel, LogLevel } from "./shared/logger.js";
import { YoutubeDownloader } from "./media/YoutubeDownloader.js";
import { FfmpegAudioExtractor } from "./media/AudioExtractor.js";
import { WhisperTranscriber } from "./transcribe/WhisperTranscriber.js";
import { OllamaSummarizer } from "./summarize/OllamaSummarizer.js";
import { OpenAISummarizer } from "./summarize/OpenAISummarizer.js";
import { SummarizePipeline } from "./pipeline/SummarizePipeline.js";
import { SummaryFormat, SummaryVerbosity } from "./shared/types.js";

export type RunMode = "cli" | "lambda";

export type RunOptions = {
  url: string;
  summarizer?: "openai" | "ollama";
  openaiModel?: string;
  ollamaModel?: string;
  whisperBinary?: string;
  whisperModel?: string;
  cacheDir?: string;
  verbosity?: SummaryVerbosity;
  summaryFormat?: SummaryFormat;
  keepTemp?: boolean;
  skipCache?: boolean;
  cleanCache?: boolean;
  reconfigure?: boolean;
  logLevel?: LogLevel;
};

export type RunResult = {
  summaryText: string;
  summaryFormat: SummaryFormat;
  transcriptPath: string;
  summaryPath: string;
  cacheUsed: boolean;
};

export const runSummarization = async (mode: RunMode, opts: RunOptions): Promise<RunResult> => {
  const {
    url,
    summarizer,
    openaiModel,
    ollamaModel,
    whisperBinary,
    whisperModel,
    cacheDir,
    verbosity,
    summaryFormat,
    keepTemp,
    skipCache,
    cleanCache,
    reconfigure,
    logLevel,
  } = opts;

  const effectiveLogLevel = (logLevel ?? (mode === "lambda" ? "info" : "error")) as LogLevel;
  setLogLevel(effectiveLogLevel);

  const forcedSummarizer = mode === "lambda" ? "openai" : summarizer;
  const cacheDirOverride = cacheDir ?? (mode === "lambda" ? "/tmp/ytsum" : undefined);
  const summaryFormatOverride = summaryFormat ?? (mode === "lambda" ? "txt" : undefined);

  const config = await loadConfig(
    {
      keepTemp,
      openaiModel,
      whisperBinary,
      whisperModel,
      ollamaModel,
      cacheDir: cacheDirOverride,
      verbosity,
      summarizer: forcedSummarizer,
      summaryFormat: summaryFormatOverride,
    },
    { reconfigure }
  );

  if (mode === "lambda" && config.summarizer !== "openai") {
    throw new Error("Lambda mode supports only the openai summarizer");
  }

  if (cleanCache) {
    await pruneCache(config.cacheDir, { force: true });
    if (mode === "lambda") {
      logger.info("Cache cleared (lambda mode)");
    }
  }

  if (!url) {
    throw new Error("URL is required");
  }

  if (!skipCache) {
    await pruneCache(config.cacheDir, { ttlMs: DEFAULT_CACHE_TTL_MS });
  }

  const useCache = !skipCache;
  const selectedSummarizer = config.summarizer;
  const modelKey = selectedSummarizer === "ollama" ? config.ollamaModel : config.openaiModel;
  const paths = await workspacePaths(
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

  const summarizerImpl = (() => {
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
    summarizerImpl,
    config.keepTemp,
    useCache,
    config.verbosity,
    `${selectedSummarizer}:${modelKey}`,
    config.summaryFormat
  );

  const result = await pipeline.run(url, paths);

  if (mode === "cli" && config.summaryFormat === "html") {
    const open = promisify(execFile);
    await open("open", ["-a", "Safari", paths.summaryPath]);
    // eslint-disable-next-line no-console
    console.log(`Summary opened in Safari: ${paths.summaryPath}`);
  }

  if (mode === "cli" && config.summaryFormat !== "html") {
    // eslint-disable-next-line no-console
    console.log("Summary:\n" + result.summary.text);
  }

  return {
    summaryText: result.summary.text,
    summaryFormat: config.summaryFormat,
    transcriptPath: paths.transcriptPath,
    summaryPath: paths.summaryPath,
    cacheUsed: paths.isCache,
  } satisfies RunResult;
};

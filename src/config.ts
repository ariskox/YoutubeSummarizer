import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createTempDir, defaultCacheDir, ensureDir, ensureParentDir, hashString, fileExists } from "./shared/fs.js";
import { SummaryFormat, SummaryVerbosity } from "./shared/types.js";

export type AppConfig = {
  openaiApiKey?: string;
  openaiModel: string;
  copilotApiKey?: string;
  copilotModel: string;
  whisperBinary: string;
  whisperModel: string;
  ollamaModel: string;
  keepTemp: boolean;
  cacheDir: string;
  verbosity: SummaryVerbosity;
  summarizer: "openai" | "ollama" | "copilot";
  summaryFormat: SummaryFormat;
};

const CONFIG_DIR = path.join(os.homedir(), ".config", "ytsum");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

const defaultConfig: AppConfig = {
  openaiApiKey: undefined,
  openaiModel: "gpt-4o-mini",
  copilotApiKey: undefined,
  copilotModel: "openai/gpt-4.1-mini",
  whisperBinary: "/usr/local/bin/whisper-cli",
  whisperModel: "/usr/local/lib/whisper-models/ggml-base.en.bin",
  ollamaModel: "gemma3:4b",
  keepTemp: false,
  cacheDir: defaultCacheDir,
  verbosity: "standard",
  summarizer: "openai",
  summaryFormat: "html",
};

type ConfigFlags = {
  keepTemp?: boolean;
  openaiModel?: string;
  copilotModel?: string;
  whisperBinary?: string;
  whisperModel?: string;
  ollamaModel?: string;
  cacheDir?: string;
  verbosity?: SummaryVerbosity;
  summarizer?: "openai" | "ollama" | "copilot";
  summaryFormat?: SummaryFormat;
};

const pickString = (value: unknown, fallback: string) => {
  return typeof value === "string" && value.trim().length > 0 ? value : fallback;
};

const expandPath = (p: string) => {
  if (p.startsWith("~")) {
    return path.join(os.homedir(), p.slice(1));
  }
  return p;
};

const readSavedConfig = async (): Promise<Partial<AppConfig>> => {
  try {
    const raw = await fs.readFile(CONFIG_FILE, "utf8");
    return JSON.parse(raw) as Partial<AppConfig>;
  } catch {
    return {};
  }
};

const writeConfig = async (config: Partial<AppConfig>) => {
  await ensureParentDir(CONFIG_FILE);
  await fs.writeFile(CONFIG_FILE, JSON.stringify(config, null, 2), "utf8");
};

const parseBoolean = (value: string | undefined): boolean | undefined => {
  if (value === undefined) return undefined;
  return ["1", "true", "yes", "y"].includes(value.toLowerCase());
};

const envOverrides = (): Partial<AppConfig> => {
  const keepTemp = parseBoolean(process.env.KEEP_TEMP);
  return {
    openaiApiKey: process.env.OPENAI_API_KEY,
    openaiModel: process.env.OPENAI_MODEL,
    copilotApiKey: process.env.COPILOT_API_KEY,
    copilotModel: process.env.COPILOT_MODEL,
    whisperBinary: process.env.WHISPER_BINARY,
    whisperModel: process.env.WHISPER_MODEL,
    ollamaModel: process.env.OLLAMA_MODEL,
    cacheDir: process.env.CACHE_DIR,
    verbosity: process.env.VERBOSITY as SummaryVerbosity | undefined,
    summarizer: process.env.SUMMARIZER as "openai" | "ollama" | "copilot" | undefined,
    summaryFormat: process.env.SUMMARY_FORMAT as SummaryFormat | undefined,
    ...(keepTemp !== undefined ? { keepTemp } : {}),
  };
};

const mergeConfig = (
  saved: Partial<AppConfig>,
  env: Partial<AppConfig>,
  flags: ConfigFlags
): AppConfig => ({
  openaiApiKey: env.openaiApiKey ?? saved.openaiApiKey ?? defaultConfig.openaiApiKey,
  openaiModel: pickString(flags.openaiModel ?? env.openaiModel ?? saved.openaiModel, defaultConfig.openaiModel),
  copilotApiKey: env.copilotApiKey ?? saved.copilotApiKey ?? defaultConfig.copilotApiKey,
  copilotModel: pickString(flags.copilotModel ?? env.copilotModel ?? saved.copilotModel, defaultConfig.copilotModel),
  whisperBinary: pickString(flags.whisperBinary ?? env.whisperBinary ?? saved.whisperBinary, defaultConfig.whisperBinary),
  whisperModel: pickString(flags.whisperModel ?? env.whisperModel ?? saved.whisperModel, defaultConfig.whisperModel),
  ollamaModel: pickString(flags.ollamaModel ?? env.ollamaModel ?? saved.ollamaModel, defaultConfig.ollamaModel),
  cacheDir: pickString(flags.cacheDir ?? env.cacheDir ?? saved.cacheDir, defaultCacheDir),
  keepTemp: flags.keepTemp ?? env.keepTemp ?? saved.keepTemp ?? defaultConfig.keepTemp,
  verbosity: (flags.verbosity ?? env.verbosity ?? saved.verbosity ?? defaultConfig.verbosity) as SummaryVerbosity,
  summarizer: (flags.summarizer ?? env.summarizer ?? saved.summarizer ?? defaultConfig.summarizer) as "openai" | "ollama" | "copilot",
  summaryFormat: (flags.summaryFormat ?? env.summaryFormat ?? saved.summaryFormat ?? defaultConfig.summaryFormat) as SummaryFormat,
});

const normalizeConfig = (config: AppConfig): AppConfig => ({
  ...config,
  cacheDir: expandPath(config.cacheDir),
  whisperBinary: expandPath(config.whisperBinary),
  whisperModel: expandPath(config.whisperModel),
  verbosity: ((): SummaryVerbosity => {
    if (config.verbosity === "concise" || config.verbosity === "standard" || config.verbosity === "detailed") {
      return config.verbosity;
    }
    return defaultConfig.verbosity;
  })(),
    summarizer: config.summarizer === "ollama" || config.summarizer === "copilot" ? config.summarizer : "openai",
    summaryFormat: config.summaryFormat === "txt" ? "txt" : "html",
});

const runInteractiveSetup = async (seed: AppConfig): Promise<AppConfig> => {
  const rl = createInterface({ input, output });
  const ask = async (question: string, defaultValue?: string) => {
    const suffix = defaultValue ? ` (${defaultValue})` : "";
    const answer = await rl.question(`${question}${suffix}: `);
    if (!answer && defaultValue !== undefined) return defaultValue;
    return answer;
  };
  const askBool = async (question: string, defaultValue: boolean) => {
    const defLabel = defaultValue ? "Y" : "N";
    const answer = await ask(`${question} [y/n]`, defLabel);
    return ["y", "yes", "true", "1", "Y"].includes(answer.trim());
  };

  const openaiApiKey = await ask("OpenAI API key (leave blank to skip)", seed.openaiApiKey ?? "");
  const openaiModel = await ask("OpenAI model", seed.openaiModel);
  const copilotApiKey = await ask("GitHub Copilot API key (leave blank to skip)", seed.copilotApiKey ?? "");
  const copilotModel = await ask("GitHub Copilot model", seed.copilotModel);
  const whisperBinary = await ask("Whisper binary path", seed.whisperBinary);
  const whisperModel = await ask("Whisper model path", seed.whisperModel);
  const ollamaModel = await ask("Ollama model", seed.ollamaModel);
  const cacheDir = await ask("Cache directory", seed.cacheDir);
  const verbosity = await ask("Summary verbosity (concise|standard|detailed)", seed.verbosity);
  const summarizer = await ask("Default summarizer (openai|ollama|copilot)", seed.summarizer);
  const summaryFormat = await ask("Summary format (html|txt)", seed.summaryFormat);
  const keepTemp = await askBool("Keep temp files", seed.keepTemp);

  await rl.close();

  const config: AppConfig = {
    openaiApiKey: openaiApiKey || undefined,
    openaiModel,
    copilotApiKey: copilotApiKey || undefined,
    copilotModel,
    whisperBinary,
    whisperModel,
    ollamaModel,
    cacheDir: expandPath(cacheDir),
    verbosity: (verbosity as SummaryVerbosity) || seed.verbosity,
    summarizer: (summarizer === "ollama" || summarizer === "openai" || summarizer === "copilot") ? summarizer : seed.summarizer,
    summaryFormat: (summaryFormat === "txt" || summaryFormat === "html") ? summaryFormat : seed.summaryFormat,
    keepTemp,
  };

  await ensureDir(config.cacheDir);
  await writeConfig(config);
  return config;
};

export const loadConfig = async (
  flags: ConfigFlags,
  opts: { reconfigure?: boolean } = {}
): Promise<AppConfig> => {
  const saved = await readSavedConfig();
  const env = envOverrides();
  await ensureDir(CONFIG_DIR);
  const needsSetup = opts.reconfigure || !(await fileExists(CONFIG_FILE));

  if (needsSetup) {
    const seed = normalizeConfig(mergeConfig(saved, env, flags));
    await runInteractiveSetup(seed);
  }

  const refreshedSaved = await readSavedConfig();
  return normalizeConfig(mergeConfig(refreshedSaved, env, flags));
};

export const workspacePaths = async (
  url: string,
  useCache: boolean,
  cacheDir: string,
  verbosity: SummaryVerbosity,
  summarizer: "openai" | "ollama" | "copilot",
  model: string,
  summaryFormat: SummaryFormat
) => {
  // Media/transcript cache keyed only by URL.
  const baseKey = hashString(url).slice(0, 16);
  const dir = useCache
    ? path.join(cacheDir, baseKey)
    : await createTempDir("ytsum-");

  await ensureDir(dir);

  return {
    root: dir,
    videoPath: path.join(dir, "video.mp4"),
    audioPath: path.join(dir, "audio.wav"),
    transcriptPath: path.join(dir, "transcript.txt"),
    // Summary cache also keys on summarizer, model, and verbosity to avoid cross-contamination.
    summaryPath: path.join(
      dir,
      `summary-${summarizer}_${model}_${verbosity}_${summaryFormat}.${summaryFormat}`
    ),
    isCache: useCache,
  } as const;
};

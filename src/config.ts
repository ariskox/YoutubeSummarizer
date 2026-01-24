import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { createTempDir, defaultCacheDir, ensureDir, ensureParentDir, hashString, fileExists } from "./shared/fs.js";
import { SummaryVerbosity } from "./shared/types.js";

export type AppConfig = {
  openaiApiKey?: string;
  openaiModel: string;
  whisperBinary: string;
  whisperModel: string;
  ollamaModel: string;
  keepTemp: boolean;
  cacheDir: string;
  verbosity: SummaryVerbosity;
};

const CONFIG_DIR = path.join(os.homedir(), ".config", "ytsum");
const CONFIG_FILE = path.join(CONFIG_DIR, "config.json");

const defaultConfig: AppConfig = {
  openaiApiKey: undefined,
  openaiModel: "gpt-4o-mini",
  whisperBinary: "/usr/local/bin/whisper-cli",
  whisperModel: "/usr/local/lib/whisper-models/ggml-base.en.bin",
  ollamaModel: "llama3.1",
  keepTemp: false,
  cacheDir: defaultCacheDir,
  verbosity: "standard",
};

type ConfigFlags = {
  keepTemp?: boolean;
  openaiModel?: string;
  whisperBinary?: string;
  whisperModel?: string;
  ollamaModel?: string;
  cacheDir?: string;
  verbosity?: SummaryVerbosity;
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
    whisperBinary: process.env.WHISPER_BINARY,
    whisperModel: process.env.WHISPER_MODEL,
    ollamaModel: process.env.OLLAMA_MODEL,
    cacheDir: process.env.CACHE_DIR,
    verbosity: process.env.VERBOSITY as SummaryVerbosity | undefined,
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
  whisperBinary: pickString(flags.whisperBinary ?? env.whisperBinary ?? saved.whisperBinary, defaultConfig.whisperBinary),
  whisperModel: pickString(flags.whisperModel ?? env.whisperModel ?? saved.whisperModel, defaultConfig.whisperModel),
  ollamaModel: pickString(flags.ollamaModel ?? env.ollamaModel ?? saved.ollamaModel, defaultConfig.ollamaModel),
  cacheDir: pickString(flags.cacheDir ?? env.cacheDir ?? saved.cacheDir, defaultCacheDir),
  keepTemp: flags.keepTemp ?? env.keepTemp ?? saved.keepTemp ?? defaultConfig.keepTemp,
  verbosity: (flags.verbosity ?? env.verbosity ?? saved.verbosity ?? defaultConfig.verbosity) as SummaryVerbosity,
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
  const whisperBinary = await ask("Whisper binary path", seed.whisperBinary);
  const whisperModel = await ask("Whisper model path", seed.whisperModel);
  const ollamaModel = await ask("Ollama model", seed.ollamaModel);
  const cacheDir = await ask("Cache directory", seed.cacheDir);
  const verbosity = await ask("Summary verbosity (concise|standard|detailed)", seed.verbosity);
  const keepTemp = await askBool("Keep temp files", seed.keepTemp);

  await rl.close();

  const config: AppConfig = {
    openaiApiKey: openaiApiKey || undefined,
    openaiModel,
    whisperBinary,
    whisperModel,
    ollamaModel,
    cacheDir: expandPath(cacheDir),
    verbosity: (verbosity as SummaryVerbosity) || seed.verbosity,
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

export const workspacePaths = async (url: string, useCache: boolean, cacheDir: string, verbosity: SummaryVerbosity) => {
  const dir = useCache
    ? path.join(cacheDir, hashString(url).slice(0, 16))
    : await createTempDir("ytsum-");

  await ensureDir(dir);

  return {
    root: dir,
    videoPath: path.join(dir, "video.mp4"),
    audioPath: path.join(dir, "audio.wav"),
    transcriptPath: path.join(dir, "transcript.txt"),
    summaryPath: path.join(dir, `summary-${verbosity}.txt`),
    isCache: useCache,
  } as const;
};

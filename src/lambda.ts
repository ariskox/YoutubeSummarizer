import { RunResult, runSummarization } from "./app.js";
import { LogLevel } from "./shared/logger.js";
import { SummaryFormat, SummaryVerbosity } from "./shared/types.js";

export type LambdaEvent = {
  url?: string;
  verbosity?: SummaryVerbosity;
  format?: SummaryFormat;
  skipCache?: boolean;
  logLevel?: LogLevel;
  openaiModel?: string;
  whisperBinary?: string;
  whisperModel?: string;
  cacheDir?: string;
  keepTemp?: boolean;
};

type LambdaResponse = {
  statusCode: number;
  body: string;
  headers?: Record<string, string>;
};

export const handler = async (event: LambdaEvent): Promise<LambdaResponse> => {
  try {
    if (!event?.url) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "url is required" }),
      };
    }

    const result = await runSummarization("lambda", {
      url: event.url,
      verbosity: event.verbosity,
      summaryFormat: event.format,
      skipCache: event.skipCache,
      logLevel: event.logLevel,
      openaiModel: event.openaiModel,
      whisperBinary: event.whisperBinary,
      whisperModel: event.whisperModel,
      cacheDir: event.cacheDir,
      keepTemp: event.keepTemp,
    });

    return ok(result);
  } catch (error) {
    const message = (error as Error).message ?? "Unknown error";
    return {
      statusCode: 500,
      body: JSON.stringify({ error: message }),
    };
  }
};

const ok = (result: RunResult): LambdaResponse => ({
  statusCode: 200,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    summary: result.summaryText,
    format: result.summaryFormat,
    transcriptPath: result.transcriptPath,
    summaryPath: result.summaryPath,
    cacheUsed: result.cacheUsed,
  }),
});

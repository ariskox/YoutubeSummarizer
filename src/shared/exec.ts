import { spawn } from "node:child_process";

export type ExecResult = {
  stdout: string;
  stderr: string;
  code: number | null;
};

export const runCommand = (
  command: string,
  args: string[],
  options: { cwd?: string } = {}
): Promise<ExecResult> => {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", (data) => {
      stderr += data.toString();
    });

    child.on("error", (error) => {
      reject(error);
    });

    child.on("close", (code) => {
      const result: ExecResult = { stdout, stderr, code };
      if (code === 0) {
        resolve(result);
      } else {
        const err = new Error(
          `Command failed: ${command} ${args.join(" ")} (code ${code})\n${stderr}`
        );
        reject(err);
      }
    });
  });
};

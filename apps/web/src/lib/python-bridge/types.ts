export interface PythonRunnerOptions {
  pythonPath?: string;
  cwd?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  env?: Record<string, string>;
}

export interface PythonWorkerOptions {
  pythonPath?: string;
  workerScriptPath?: string;
  timeoutMs?: number;
  maxOutputBytes?: number;
  env?: Record<string, string>;
}

export interface PythonResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  exitCode: number | null;
  durationMs: number;
  truncated?: boolean;
  timedOut?: boolean;
}

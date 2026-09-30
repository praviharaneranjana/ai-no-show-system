import fs from "node:fs/promises";
import path from "node:path";

export type BackendConfig = {
  baseUrl: string;
  apiKey?: string;
};

function configFilePath(): string | null {
  const dir = process.env.SHAI_USER_DATA_DIR;
  return dir ? path.join(dir, "server-config.json") : null;
}

async function readConfigFile(): Promise<BackendConfig | null> {
  const filePath = configFilePath();
  if (!filePath) return null;

  try {
    const raw = await fs.readFile(filePath, "utf-8");
    const parsed = JSON.parse(raw) as Partial<BackendConfig>;
    if (!parsed.baseUrl) return null;
    return { baseUrl: parsed.baseUrl, apiKey: parsed.apiKey || undefined };
  } catch {
    return null;
  }
}

/**
 * Resolves the backend the app should talk to. `BACKEND_API_URL` (env) always
 * wins — that's what every normal web/dev/test deployment uses. The file-based
 * config only comes into play inside the packaged Electron app, which has no
 * build-time `.env` and instead lets the user enter a server address at
 * runtime via the /setup screen (see `writeBackendConfig`).
 */
export async function getBackendConfig(): Promise<BackendConfig> {
  if (process.env.BACKEND_API_URL) {
    return { baseUrl: process.env.BACKEND_API_URL, apiKey: process.env.BACKEND_API_KEY };
  }

  const fromFile = await readConfigFile();
  if (fromFile) return fromFile;

  return { baseUrl: "" };
}

export async function isBackendConfigured(): Promise<boolean> {
  const { baseUrl } = await getBackendConfig();
  return baseUrl.length > 0;
}

export async function writeBackendConfig(config: BackendConfig): Promise<void> {
  const filePath = configFilePath();
  if (!filePath) {
    throw new Error(
      "writeBackendConfig requires SHAI_USER_DATA_DIR — it's only meaningful inside the desktop app."
    );
  }

  const tmpPath = `${filePath}.tmp`;
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(tmpPath, JSON.stringify(config, null, 2), "utf-8");
  await fs.rename(tmpPath, filePath);
}

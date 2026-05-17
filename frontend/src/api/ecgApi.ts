import type { ApiConfig, DiagnosisResponse } from "../types/diagnosis";

export const DEFAULT_API_CONFIG: ApiConfig = {
  endpoint: import.meta.env.VITE_API_URL || "https://ecg-backend-mmbi.onrender.com/diagnose",
  apiKey: "sumit_ecg_secure_access_2026",
};

export async function diagnoseEcg(file: File, config: ApiConfig): Promise<DiagnosisResponse> {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch(config.endpoint, {
    method: "POST",
    headers: {
      "X-API-Key": config.apiKey,
    },
    body: formData,
  });

  const body = await response.json().catch(() => null);

  if (!response.ok) {
    const detail = body?.detail;
    const message =
      typeof detail === "string"
        ? detail
        : detail?.message || body?.message || `Request failed with status ${response.status}`;
    throw new Error(message);
  }

  return body as DiagnosisResponse;
}

export async function readSignalFile(file: File): Promise<number[]> {
  const text = await file.text();
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  const looksLikeYoloLabels =
    lines.length > 0 &&
    lines.every((line) => {
      const parts = line.split(/\s+/).map(Number);
      return (
        parts.length === 5 &&
        Number.isInteger(parts[0]) &&
        parts.slice(1).every((value) => Number.isFinite(value) && value >= 0 && value <= 1)
      );
    });

  if (looksLikeYoloLabels) {
    throw new Error(
      "This TXT file looks like a detection label file, not raw ECG signal data. Upload a TXT/CSV file containing ECG waveform samples, one value per line or comma/space separated.",
    );
  }

  const values = text
    .replace(/,/g, " ")
    .split(/\s+/)
    .map((value) => Number(value.trim()))
    .filter((value) => Number.isFinite(value));

  return values;
}

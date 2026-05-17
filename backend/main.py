import os
from pathlib import Path
from fastapi import FastAPI, UploadFile, File, Header, HTTPException
import numpy as np
import joblib
import pandas as pd
import io
import uvicorn
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from scipy.signal import butter, lfilter

# Load Environment Variables
load_dotenv()
API_KEY_CREDIT = os.getenv("ECG_API_KEY", "sumit_ecg_secure_access_2026")
BASE_DIR = Path(__file__).resolve().parent
STATISTICAL_CLASSIFIER_PATH = BASE_DIR / "statistical_ecg_classifier_small.pkl"
FS = 500
WINDOW_SIZE = 500
ABNORMAL_PROBABILITY_THRESHOLD = 0.40

# Initialize the Web App
app = FastAPI(title="Explainable ECG Diagnostic API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


def parse_ecg_upload(contents: bytes):
    text = contents.decode("utf-8-sig", errors="ignore").strip()
    if not text:
        raise ValueError("Uploaded ECG file is empty")

    lines = [line.strip() for line in text.splitlines() if line.strip()]
    looks_like_yolo_labels = bool(lines) and all(
        len(parts := line.split()) == 5
        and parts[0].isdigit()
        and all(
            0 <= float(value) <= 1
            for value in parts[1:]
        )
        for line in lines
    )

    if looks_like_yolo_labels:
        raise ValueError(
            "Uploaded TXT looks like a detection label file, not raw ECG waveform samples. "
            "Upload ECG signal values with at least 500 numeric samples."
        )

    normalized = text.replace(",", " ").replace("\t", " ").replace("\r", " ").replace("\n", " ")
    values = np.fromstring(normalized, sep=" ")

    if values.size == 0:
        df = pd.read_csv(io.BytesIO(contents), header=None)
        values = df.values.flatten()

    if values.size < WINDOW_SIZE:
        raise ValueError(f"ECG file must contain at least {WINDOW_SIZE} numeric samples. Found {values.size}.")

    return values[:WINDOW_SIZE]


def ecg_filter(data, fs=FS):
    nyq = 0.5 * fs
    b, a = butter(2, [0.5 / nyq, 45.0 / nyq], btype="band")
    return lfilter(b, a, data)


def prepare_ecg_window(raw_signal):
    signal = np.asarray(raw_signal, dtype=float).reshape(-1)[:WINDOW_SIZE]

    if not np.all(np.isfinite(signal)):
        raise ValueError("ECG file contains non-finite values.")

    raw_peak = np.max(np.abs(signal))
    if raw_peak <= 0:
        raise ValueError("ECG signal has no measurable amplitude.")

    # Dataset/demo CSVs are usually already filtered and scaled to [-1, 1].
    # Raw device exports can be larger or drifted, so filter only those.
    working_signal = ecg_filter(signal) if raw_peak > 1.5 else signal

    peak = np.max(np.abs(working_signal))
    if peak <= 0:
        raise ValueError("ECG signal has no measurable amplitude.")

    return working_signal / peak


def extract_statistical_features(signal):
    signal = np.asarray(signal).reshape(-1).astype(float)
    diff = np.diff(signal)
    q25, q75 = np.percentile(signal, [25, 75])
    return np.array(
        [
            np.mean(signal),
            np.std(signal),
            np.min(signal),
            np.max(signal),
            q75 - q25,
            np.mean(np.abs(diff)) if diff.size else 0.0,
            np.sqrt(np.mean(np.square(signal))),
            np.mean(np.abs(signal - np.mean(signal))),
        ],
        dtype=float,
    )


def classify_ecg_features(latent_features):
    if hasattr(classifier, "predict_proba"):
        abnormal_probability = float(classifier.predict_proba(latent_features.reshape(1, -1))[0][1])
        prediction = 1 if abnormal_probability >= ABNORMAL_PROBABILITY_THRESHOLD else 0
        return prediction, abnormal_probability

    prediction = int(classifier.predict(latent_features.reshape(1, -1))[0])
    return prediction, None


# Load lightweight deployment model
classifier = None
startup_errors = []
startup_warnings = ["Using lightweight statistical ECG model for deployment."]
classifier_label = "lightweight statistical classifier"

print(f"Loading {classifier_label}...")
if STATISTICAL_CLASSIFIER_PATH.exists():
    classifier = joblib.load(STATISTICAL_CLASSIFIER_PATH)
else:
    startup_errors.append(f"Missing trained classifier model: {STATISTICAL_CLASSIFIER_PATH}")
    print(f"WARNING: {startup_errors[-1]}")

@app.get("/")
def home():
    return {
        "status": "online" if not startup_errors else "model_setup_incomplete",
        "message": "Secure ECG Server is Running",
        "model_errors": startup_errors,
        "model_warnings": startup_warnings,
        "encoder_mode": "statistical_features",
        "classifier": classifier_label,
    }

@app.post("/diagnose")
async def diagnose_ecg(
    file: UploadFile = File(...), 
    x_api_key: str = Header(None)
):
    if startup_errors:
        raise HTTPException(
            status_code=503,
            detail={
                "message": "Model setup incomplete. Add the missing trained model files, then restart the backend.",
                "errors": startup_errors,
            },
        )

    if x_api_key != API_KEY_CREDIT:
        raise HTTPException(status_code=401, detail="Invalid or Missing API Key")

    try:
        contents = await file.read()
        raw_signal = parse_ecg_upload(contents)
        prepared_signal = prepare_ecg_window(raw_signal)
        features = extract_statistical_features(prepared_signal)
        prediction, abnormal_probability = classify_ecg_features(features)
        
        return {
            "status": "success",
            "diagnosis": "Abnormal" if prediction == 1 else "Normal",
            "latent_representation": features.tolist(),
            "abnormal_probability": abnormal_probability,
            "screening_threshold": ABNORMAL_PROBABILITY_THRESHOLD if abnormal_probability is not None else None,
        }
            
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Data Error: {str(e)}")

if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)

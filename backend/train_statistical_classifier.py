import pickle

import numpy as np
from sklearn.metrics import classification_report
from sklearn.model_selection import train_test_split
from sklearn.ensemble import RandomForestClassifier


def extract_statistical_features(signals):
    signals = np.asarray(signals, dtype=float)
    diffs = np.diff(signals, axis=1)
    q25 = np.percentile(signals, 25, axis=1)
    q75 = np.percentile(signals, 75, axis=1)
    means = signals.mean(axis=1)

    return np.column_stack(
        [
            means,
            signals.std(axis=1),
            signals.min(axis=1),
            signals.max(axis=1),
            q75 - q25,
            np.mean(np.abs(diffs), axis=1),
            np.sqrt(np.mean(np.square(signals), axis=1)),
            np.mean(np.abs(signals - means[:, None]), axis=1),
        ],
    )


print("Loading PTB-XL heartbeat tensors...")
X = np.load("X_ptbxl_beats.npy")
Y = np.load("Y_ptbxl_labels.npy")

print("Extracting statistical ECG features...")
features = extract_statistical_features(X)

X_train, X_test, y_train, y_test = train_test_split(
    features,
    Y,
    test_size=0.2,
    random_state=42,
    stratify=Y,
)

print("Training fallback statistical Random Forest classifier...")
model = RandomForestClassifier(
    n_estimators=200,
    random_state=42,
    class_weight="balanced",
    min_samples_leaf=2,
    n_jobs=1,
)
model.fit(X_train, y_train)

print("\n--- STATISTICAL CLASSIFIER REPORT ---")
print(classification_report(y_test, model.predict(X_test), target_names=["Normal (0)", "Abnormal (1)"]))

with open("statistical_ecg_classifier.pkl", "wb") as f:
    pickle.dump(model, f)

print("\nSaved fallback model as statistical_ecg_classifier.pkl")

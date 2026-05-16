import os
import wfdb
import numpy as np
from scipy.signal import butter, lfilter, find_peaks
from tqdm import tqdm

# --- 1. CONFIGURATION ---
BASE_DIR = "D:/sumit projects/Heart_Disease_Using_ECG/a-large-scale-12-lead-electrocardiogram-database-for-arrhythmia-study-1.0.0/a-large-scale-12-lead-electrocardiogram-database-for-arrhythmia-study-1.0.0/WFDBRecords"
NORMAL_CODE = '426783006'
FS = 500
PRE_PEAK = 125   # 0.25 seconds before peak
POST_PEAK = 225  # 0.45 seconds after peak

# --- 2. FILTER FUNCTION ---
def ecg_filter(data, fs=500):
    nyq = 0.5 * fs
    b, a = butter(2, [0.5/nyq, 45.0/nyq], btype='band')
    return lfilter(b, a, data)

# --- 3. BATCH PROCESSING ---
all_beats = []
skipped_files = 0

print("🚀 Starting Batch Extraction of Normal Heartbeats...")

for root, dirs, files in os.walk(BASE_DIR):
    for file in tqdm(files, desc=f"Scanning {os.path.basename(root)}"):
        if file.endswith(".hea"):
            # Strip the .hea extension to get the base record name
            record_path = os.path.join(root, file[:-4])
            
            try:
                # 1. Back to standard reading (Removed the broken flag)
                header = wfdb.rdheader(record_path)
                
                # Only process if it's a Normal Sinus Rhythm
                if any(NORMAL_CODE in c for c in header.comments):
                    record = wfdb.rdrecord(record_path)
                    signal = ecg_filter(record.p_signal[:, 1], fs=FS)
                    peaks, _ = find_peaks(signal, distance=250, prominence=0.6)
                    
                    for peak in peaks:
                        if peak > PRE_PEAK and peak < (len(signal) - POST_PEAK):
                            beat = signal[peak-PRE_PEAK : peak+POST_PEAK]
                            all_beats.append(beat)
                            
            except Exception as e:
                # If a file is truly broken (like the bad date), skip it!
                skipped_files += 1
                continue

# --- 4. SAVE TO DISK ---
print("\nSaving data to disk... Please wait.")
X_train = np.array(all_beats)
np.save("X_train_normal.npy", X_train)

print("\n--- EXTRACTION COMPLETE ---")
print(f"✅ Saved {len(X_train)} individual normal heartbeats.")
print(f"📁 File saved as: X_train_normal.npy")
if skipped_files > 0:
    print(f"⚠️ Skipped {skipped_files} corrupted files.")
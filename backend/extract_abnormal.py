import os
import wfdb
import numpy as np
from scipy.signal import butter, lfilter, find_peaks
from tqdm import tqdm

BASE_DIR = "D:/sumit projects/Heart_Disease_Using_ECG/a-large-scale-12-lead-electrocardiogram-database-for-arrhythmia-study-1.0.0/a-large-scale-12-lead-electrocardiogram-database-for-arrhythmia-study-1.0.0/WFDBRecords"
NORMAL_CODE = '426783006'
FS = 500
PRE_PEAK, POST_PEAK = 125, 225
MAX_BEATS = 83000 # Balance with our normal dataset!

def ecg_filter(data, fs=500):
    nyq = 0.5 * fs
    b, a = butter(2, [0.5/nyq, 45.0/nyq], btype='band')
    return lfilter(b, a, data)

all_abnormal_beats = []
skipped_files = 0

print("⚠️ Starting Batch Extraction of ABNORMAL Heartbeats...")

for root, dirs, files in os.walk(BASE_DIR):
    for file in files:
        if file.endswith(".hea"):
            record_path = os.path.join(root, file[:-4])
            try:
                header = wfdb.rdheader(record_path)
                
                # IF THE NORMAL CODE IS *NOT* IN THE COMMENTS, IT IS ABNORMAL
                if not any(NORMAL_CODE in c for c in header.comments):
                    record = wfdb.rdrecord(record_path)
                    signal = ecg_filter(record.p_signal[:, 1], fs=FS)
                    peaks, _ = find_peaks(signal, distance=250, prominence=0.6)
                    
                    for peak in peaks:
                        if peak > PRE_PEAK and peak < (len(signal) - POST_PEAK):
                            beat = signal[peak-PRE_PEAK : peak+POST_PEAK]
                            all_abnormal_beats.append(beat)
                            
                            # Print progress and stop early if we hit our target
                            if len(all_abnormal_beats) % 5000 == 0:
                                print(f"Collected {len(all_abnormal_beats)} abnormal beats...")
                            if len(all_abnormal_beats) >= MAX_BEATS:
                                break
                    if len(all_abnormal_beats) >= MAX_BEATS:
                        break
            except Exception:
                skipped_files += 1
                continue
    if len(all_abnormal_beats) >= MAX_BEATS:
        break

print("\nSaving data to disk...")
X_abnormal = np.array(all_abnormal_beats)
np.save("X_abnormal.npy", X_abnormal)
print(f"✅ Saved {len(X_abnormal)} ABNORMAL heartbeats to X_abnormal.npy")
import os
import wfdb
import pandas as pd
import numpy as np
from scipy.signal import butter, lfilter, find_peaks
from tqdm import tqdm
import ast
from dotenv import load_dotenv

load_dotenv()

# --- 1. CONFIGURATION ---
# Change this in .env if your PTB-XL folder moves.
BASE_DIR = os.getenv(
    "PTBXL_BASE_DIR",
    r"C:\Users\tejas\Downloads\ptb-xl-a-large-publicly-available-electrocardiography-dataset-1.0.3",
)
CSV_PATH = os.path.join(BASE_DIR, "ptbxl_database.csv")
RECORD_LIMIT = int(os.getenv("PTBXL_RECORD_LIMIT", "10000"))

FS = 500 # Sampling rate (using the high-res 500Hz files)
WINDOW_SIZE = 500 # 1-second window as required by synopsis
PRE_PEAK = 200    # 0.4 seconds before R-peak
POST_PEAK = 300   # 0.6 seconds after R-peak

# --- 2. FILTER FUNCTION ---
def ecg_filter(data, fs=500):
    nyq = 0.5 * fs
    b, a = butter(2, [0.5/nyq, 45.0/nyq], btype='band') # Bandpass 0.5-45 Hz
    return lfilter(b, a, data)

# --- 3. LOAD METADATA ---
print(f"Loading PTB-XL metadata CSV from: {CSV_PATH}")
df = pd.read_csv(CSV_PATH, index_col='ecg_id')
# Convert the dictionary-like string in scp_codes into an actual Python dictionary
df.scp_codes = df.scp_codes.apply(lambda x: ast.literal_eval(x))

# We will separate Normal (NORM) from Abnormal for our SVM later
all_beats = []
all_labels = [] # 'Normal' or 'Abnormal'

print("Extracting 1-Second Lead I Heartbeats...")

# To save time and RAM for this phase, limit it with PTBXL_RECORD_LIMIT.
records_to_scan = df.head(RECORD_LIMIT)
for index, row in tqdm(records_to_scan.iterrows(), total=len(records_to_scan)):
    # PTB-XL provides filename paths in the CSV (use the 500Hz high-res ones)
    record_path = os.path.join(BASE_DIR, row['filename_hr'])
    
    # Determine Label (NORM is the code for normal ECG in PTB-XL)
    is_normal = 'NORM' in row['scp_codes'].keys()
    label = 0 if is_normal else 1 # 0 = Normal, 1 = Abnormal
    
    try:
        # Read the record
        record = wfdb.rdrecord(record_path)
        
        # EXTRACT LEAD II (Index 1 in PTB-XL)
        signal = ecg_filter(record.p_signal[:, 1], fs=FS)
        
        # Detect R-Peaks
        peaks, _ = find_peaks(signal, distance=250, prominence=0.5)
        
        for peak in peaks:
            if peak > PRE_PEAK and peak < (len(signal) - POST_PEAK):
                # Slice exactly 500 samples (1 second)
                beat = signal[peak-PRE_PEAK : peak+POST_PEAK]
                
                # Normalize the individual heartbeat between -1 and 1
                beat_max = np.max(np.abs(beat))
                if beat_max > 0:
                    beat = beat / beat_max
                    
                all_beats.append(beat)
                all_labels.append(label)
                
    except Exception as e:
        # Silently skip missing or corrupted files
        continue

# --- 4. SAVE ARRAYS FOR THE TC-VAE ---
print("\nSaving Tensors to disk...")
X_data = np.array(all_beats)
Y_labels = np.array(all_labels)

np.save("X_ptbxl_beats.npy", X_data)
np.save("Y_ptbxl_labels.npy", Y_labels)

print("Extraction Complete!")
print(f"Total Beats: {len(X_data)}")
print(f"Normal Beats: {np.sum(Y_labels == 0)} | Abnormal Beats: {np.sum(Y_labels == 1)}")
print("Shape of X_data:", X_data.shape, "--> MUST BE (N, 500)")

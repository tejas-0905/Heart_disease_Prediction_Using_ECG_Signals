import wfdb
import numpy as np
import matplotlib.pyplot as plt
from scipy.signal import butter, lfilter, find_peaks
import os

# --- 1. CONFIGURATION ---
# Use the same exact path as your peek_data.py
DATA_DIR = "D:/sumit projects/Heart_Disease_Using_ECG/a-large-scale-12-lead-electrocardiogram-database-for-arrhythmia-study-1.0.0/a-large-scale-12-lead-electrocardiogram-database-for-arrhythmia-study-1.0.0/WFDBRecords/01/010"
RECORD_ID = "JS00001"
full_path = os.path.join(DATA_DIR, RECORD_ID)

FS = 500 # Sampling frequency
PRE_PEAK = int(0.25 * FS)  # 125 samples
POST_PEAK = int(0.45 * FS) # 225 samples

# --- 2. FILTER FUNCTION ---
def ecg_filter(data, lowcut=0.5, highcut=45.0, fs=500, order=2):
    nyq = 0.5 * fs
    low = lowcut / nyq
    high = highcut / nyq
    b, a = butter(order, [low, high], btype='band')
    return lfilter(b, a, data)

# --- 3. PROCESS ---
record = wfdb.rdrecord(full_path)
signals = record.p_signal

# We use Lead II (index 1) for peak detection as it's the clearest
lead_ii = ecg_filter(signals[:, 1], fs=FS)

# --- THE UPGRADE ---
# We use prominence to only find peaks that "stand out" sharply by at least 0.6 mV
# We also reduced the distance to 250 (0.5 seconds) to catch slightly faster heartbeats
peaks, _ = find_peaks(lead_ii, distance=250, prominence=0.6)

print(f"Detected {len(peaks)} heartbeats in the 10-second strip.")

# --- 4. SLICE AND PLOT ---
plt.figure(figsize=(12, 6))

# Plot 1: The full strip with red dots on the peaks
plt.subplot(1, 2, 1)
plt.plot(lead_ii, color='gray', label='Filtered ECG')
plt.plot(peaks, lead_ii[peaks], "rx", label='Detected R-Peaks')
plt.title("R-Peak Detection")
plt.legend()

# Plot 2: Overlay all the individual sliced beats
plt.subplot(1, 2, 2)
valid_beats = 0

for peak in peaks:
    start = peak - PRE_PEAK
    end = peak + POST_PEAK
    
    # Ensure we don't slice outside the array bounds
    if start >= 0 and end < len(lead_ii):
        beat_slice = lead_ii[start:end]
        plt.plot(beat_slice, color='blue', alpha=0.5)
        valid_beats += 1

plt.title(f"Overlay of {valid_beats} Sliced Beats")
plt.xlabel("Samples (Length: 350)")
plt.ylabel("Voltage")
plt.tight_layout()
plt.show()
import wfdb
import matplotlib.pyplot as plt
import numpy as np
import os
from scipy.signal import butter, lfilter

# 1. SET YOUR PATH MANUALLY HERE (Use Forward Slashes /)
# Note: Do NOT add .hea or .mat at the end. 
DATA_DIR = "D:/sumit projects/Heart_Disease_Using_ECG/a-large-scale-12-lead-electrocardiogram-database-for-arrhythmia-study-1.0.0/a-large-scale-12-lead-electrocardiogram-database-for-arrhythmia-study-1.0.0/WFDBRecords/01/010"
RECORD_ID = "JS00001"
full_path = os.path.join(DATA_DIR, RECORD_ID)

# 2. HELPER: Bandpass Filter (Removes noise and drift)
def ecg_filter(data, lowcut=0.5, highcut=45.0, fs=500, order=2):
    nyq = 0.5 * fs
    low = lowcut / nyq
    high = highcut / nyq
    b, a = butter(order, [low, high], btype='band')
    return lfilter(b, a, data)

print(f"Searching for: {full_path}.hea")

if not os.path.exists(full_path + ".hea"):
    print("❌ ERROR: File not found! Please check your DATA_DIR path again.")
else:
    try:
        # 3. LOAD DATA
        record = wfdb.rdrecord(full_path)
        signals = record.p_signal  # This is a 2D array: [samples, 12 leads]
        fs = record.fs             # Sampling frequency (usually 500)
        
        print(f"✅ SUCCESS: Loaded {RECORD_ID}")
        print(f"Sampling Rate: {fs} Hz")
        print(f"Metadata: {record.comments}")

        # 4. PREPARE PLOT (Lead II is index 1)
        lead_ii_raw = signals[:1500, 1]  # First 3 seconds
        lead_ii_clean = ecg_filter(lead_ii_raw, fs=fs)

        plt.figure(figsize=(15, 6))
        
        # Plot Raw
        plt.subplot(2, 1, 1)
        plt.plot(lead_ii_raw, color='gray', alpha=0.5, label='Raw Signal')
        plt.title(f"ECG Lead II - {RECORD_ID} (First 3 Seconds)")
        plt.ylabel("Voltage (mV)")
        plt.legend()

        # Plot Filtered (This is what the VAE will eventually see)
        plt.subplot(2, 1, 2)
        plt.plot(lead_ii_clean, color='red', label='Filtered Signal')
        plt.xlabel("Samples")
        plt.ylabel("Voltage (mV)")
        plt.legend()

        plt.tight_layout()
        plt.show()

    except Exception as e:
        print(f"An unexpected error occurred: {e}")
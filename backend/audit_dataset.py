import os
import wfdb
from tqdm import tqdm # Install with: pip install tqdm

# --- CONFIG ---
BASE_DIR = r"D:/sumit projects/Heart_Disease_Using_ECG/a-large-scale-12-lead-electrocardiogram-database-for-arrhythmia-study-1.0.0/a-large-scale-12-lead-electrocardiogram-database-for-arrhythmia-study-1.0.0/WFDBRecords"
NORMAL_CODE = '426783006'

normal_count = 0
abnormal_count = 0
other_count = 0

print("🔍 Auditing dataset... this might take a minute.")

# Walking through all nested folders (01, 02, etc.)
for root, dirs, files in os.walk(BASE_DIR):
    for file in files:
        if file.endswith(".hea"):
            record_path = os.path.join(root, file[:-4]) # Remove .hea
            try:
                # We only read the header to save time/RAM
                header = wfdb.rdheader(record_path)
                
                # Check the comments for the Dx code
                is_normal = False
                for comment in header.comments:
                    if "Dx:" in comment and NORMAL_CODE in comment:
                        is_normal = True
                        break
                
                if is_normal:
                    normal_count += 1
                else:
                    abnormal_count += 1
                    
            except Exception:
                other_count += 1

print("\n--- AUDIT REPORT ---")
print(f"✅ Normal Records (Sinus Rhythm): {normal_count}")
print(f"⚠️ Abnormal Records (Arrhythmias): {abnormal_count}")
print(f"❌ Errors/Missing: {other_count}")
print(f"📊 Total Files Scanned: {normal_count + abnormal_count + other_count}")
import argparse
import ast
import zipfile
from pathlib import Path

import numpy as np
import pandas as pd
import wfdb
from scipy.signal import butter, find_peaks, lfilter


FS = 500
PRE_PEAK = 200
POST_PEAK = 300


def ecg_filter(data, fs=FS):
    nyq = 0.5 * fs
    b, a = butter(2, [0.5 / nyq, 45.0 / nyq], btype="band")
    return lfilter(b, a, data)


def find_zip_member(names, suffix):
    normalized_suffix = suffix.replace("\\", "/").lstrip("/")
    for name in names:
        if name.endswith(normalized_suffix):
            return name
    return None


def extract_record_files(zip_file, names, filename_hr, temp_dir):
    record_rel = filename_hr.replace("\\", "/")
    hea_member = find_zip_member(names, f"{record_rel}.hea")
    dat_member = find_zip_member(names, f"{record_rel}.dat")

    if not hea_member or not dat_member:
        raise FileNotFoundError(f"Could not find record files for {filename_hr}")

    local_base = Path(temp_dir) / Path(record_rel).name
    local_base.with_suffix(".hea").write_bytes(zip_file.read(hea_member))
    local_base.with_suffix(".dat").write_bytes(zip_file.read(dat_member))
    return local_base


def make_normal_csv(zip_path, output_path):
    with zipfile.ZipFile(zip_path) as zf:
        names = zf.namelist()
        metadata_member = find_zip_member(names, "ptbxl_database.csv")
        if not metadata_member:
            raise FileNotFoundError("ptbxl_database.csv not found inside ZIP")

        with zf.open(metadata_member) as metadata_file:
            df = pd.read_csv(metadata_file, index_col="ecg_id")

        df["scp_codes"] = df["scp_codes"].apply(ast.literal_eval)
        normal_records = df[df["scp_codes"].apply(lambda codes: "NORM" in codes)]

        if normal_records.empty:
            raise ValueError("No normal NORM records found in PTB-XL metadata")

        temp_dir = Path.cwd() / "_ptbxl_zip_extract_tmp"
        temp_dir.mkdir(exist_ok=True)
        errors_shown = 0
        for _, row in normal_records.iterrows():
            try:
                record_base = extract_record_files(zf, names, row["filename_hr"], temp_dir)
                record = wfdb.rdrecord(str(record_base))

                lead_ii = ecg_filter(record.p_signal[:, 1])
                peaks, _ = find_peaks(lead_ii, distance=250, prominence=0.3)

                for peak in peaks:
                    if peak > PRE_PEAK and peak < len(lead_ii) - POST_PEAK:
                        beat = lead_ii[peak - PRE_PEAK : peak + POST_PEAK]
                        beat_max = np.max(np.abs(beat))
                        if beat_max > 0:
                            beat = beat / beat_max

                        pd.DataFrame(beat).to_csv(output_path, index=False, header=False)
                        print(f"Saved normal ECG CSV: {output_path}")
                        print(f"Source PTB-XL record: {row['filename_hr']}")
                        print("Samples: 500")
                        return
            except Exception as exc:
                if errors_shown < 5:
                    print(f"Skipped {row['filename_hr']}: {exc}")
                    errors_shown += 1
                continue

    raise RuntimeError("Could not extract a valid normal 500-sample heartbeat from the ZIP")


def main():
    parser = argparse.ArgumentParser(description="Create one normal ECG CSV from a PTB-XL ZIP file.")
    parser.add_argument("zip_path", help="Path to the PTB-XL ZIP file")
    parser.add_argument("--output", default="normal_detection_ecg.csv", help="Output CSV file path")
    args = parser.parse_args()

    make_normal_csv(Path(args.zip_path), Path(args.output))


if __name__ == "__main__":
    main()

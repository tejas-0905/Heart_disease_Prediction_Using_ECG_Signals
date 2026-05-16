import numpy as np
import pandas as pd

# 1. Load the master heartbeat file
# This file is a big matrix of shape (95711, 500)
X = np.load("X_ptbxl_beats.npy")

# 2. Extract just the very first heartbeat (the first row)
# This is our "Test Case"
single_heartbeat = X[0] 

# 3. Save it as a simple CSV file
# This mimics a file coming from an Apple Watch or a digital ECG machine
df = pd.DataFrame(single_heartbeat)
df.to_csv("test_heartbeat.csv", index=False, header=False)

print("✅ Success! 'test_heartbeat.csv' has been created.")
print("Now upload this file to your Swagger UI (http://127.0.0.1:8000/docs) to test the model.")
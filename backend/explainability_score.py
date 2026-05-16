import numpy as np
import tensorflow as tf
import matplotlib.pyplot as plt
import seaborn as sns
from scipy.stats import pearsonr

# --- 1. REDEFINE SAMPLING ---
@tf.keras.utils.register_keras_serializable(name="sampling")
def sampling(args):
    z_mean, z_log_var = args
    batch = tf.shape(z_mean)[0]
    dim = tf.shape(z_mean)[1]
    epsilon = tf.keras.backend.random_normal(shape=(batch, dim))
    return z_mean + tf.exp(0.5 * z_log_var) * epsilon

# --- 2. LOAD DATA & ENCODER ---
print("Loading Data and TC-VAE...")
X_train = np.load("X_ptbxl_beats.npy")[:5000] # Use 5000 samples for the test
X_train_expanded = np.expand_dims(X_train, axis=-1)
encoder = tf.keras.models.load_model("tcvae_encoder.keras")

print("Extracting 8-Dimensional Latent Space...")
latent_space = encoder.predict(X_train_expanded, batch_size=256)[0]

# --- 3. EXTRACT PHYSICAL ECG FEATURES ---
print("Measuring physical heart traits...")
# We will extract 3 distinct physical features from the raw signals
r_peak_heights = []
t_wave_heights = []
st_segment_levels = []

for beat in X_train:
    # 1. R-Peak is the maximum value in the center
    r_peak = np.max(beat[180:220])
    
    # 2. T-Wave is the highest peak in the right-side window
    t_wave = np.max(beat[280:380])
    
    # 3. ST-Segment level is the average voltage right after the spike
    st_level = np.mean(beat[220:250])
    
    r_peak_heights.append(r_peak)
    t_wave_heights.append(t_wave)
    st_segment_levels.append(st_level)

physical_features = np.array([r_peak_heights, t_wave_heights, st_segment_levels])
feature_names = ["R-Peak Height", "T-Wave Height", "ST-Segment Level"]

# --- 4. CALCULATE CORRELATION MATRIX ---
print("Calculating Disentanglement Correlation Scores...")
correlation_matrix = np.zeros((8, 3))

for i in range(8): # For each of the 8 Latent Dimensions
    for j in range(3): # For each of the 3 Physical Features
        # Calculate Pearson correlation (r)
        corr, _ = pearsonr(latent_space[:, i], physical_features[j])
        correlation_matrix[i, j] = corr

# --- 5. VISUALIZE THE HEATMAP ---
plt.figure(figsize=(10, 8))
sns.heatmap(np.abs(correlation_matrix), annot=True, cmap="YlGnBu", 
            xticklabels=feature_names, 
            yticklabels=[f"Latent Dim {i}" for i in range(8)])

plt.title("Explainability Metric: Latent Space vs Physical Morphology\n(Absolute Pearson Correlation)")
plt.xlabel("Actual Physical Heart Feature")
plt.ylabel("AI Latent Dimension")
plt.tight_layout()
plt.show()
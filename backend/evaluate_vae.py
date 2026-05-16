import numpy as np
import tensorflow as tf
from tensorflow.keras.models import load_model
import matplotlib.pyplot as plt

# --- 1. REDEFINE CUSTOM FUNCTION FOR KERAS ---
def sampling(args):
    z_mean, z_log_var = args
    batch = tf.shape(z_mean)[0]
    dim = tf.shape(z_mean)[1]
    epsilon = tf.keras.backend.random_normal(shape=(batch, dim))
    return z_mean + tf.exp(0.5 * z_log_var) * epsilon

# --- 2. LOAD DATA ---
print("Loading datasets...")
X_normal = np.load("X_train_normal.npy")[:5000] # Just grab 5000 for a quick test
X_abnormal = np.load("X_abnormal.npy")[:5000]

X_normal = np.expand_dims(X_normal, -1)
X_abnormal = np.expand_dims(X_abnormal, -1)

norm_max = np.max(np.abs(X_normal))
X_normal = X_normal / norm_max
X_abnormal = X_abnormal / norm_max

# --- 3. LOAD MODELS WITH CUSTOM OBJECTS ---
print("Loading trained VAE models...")
# Tell Keras what 'sampling' means when it loads the encoder!
encoder = load_model("vae_encoder.h5", compile=False, custom_objects={'sampling': sampling})
decoder = load_model("vae_decoder.h5", compile=False)

# --- 4. EVALUATE ---
def get_reconstruction_error(data):
    # Pass through encoder to get latent space
    # The encoder returns [z_mean, z_log_var, z]. We want z_mean (index 0).
    z = encoder.predict(data, batch_size=128)[0]
    # Pass latent space through decoder
    reconstruction = decoder.predict(z, batch_size=128)
    # Calculate Mean Squared Error
    mse = np.mean(np.square(data - reconstruction), axis=1)
    return mse

print("Calculating errors for Normal hearts...")
normal_errors = get_reconstruction_error(X_normal)
 
print("Calculating errors for Abnormal hearts...")
abnormal_errors = get_reconstruction_error(X_abnormal)

# --- 5. VISUALIZATION ---
plt.figure(figsize=(10, 6))
plt.hist(normal_errors, bins=50, alpha=0.6, color='blue', label='Normal (Healthy)')
plt.hist(abnormal_errors, bins=50, alpha=0.6, color='red', label='Abnormal (Sick)')

plt.title("VAE Anomaly Detection: Reconstruction Error")
plt.xlabel("Mean Squared Error (MSE)")
plt.ylabel("Number of Heartbeats")

# Draw a threshold line at Mean + 2 Standard Deviations
threshold = np.mean(normal_errors) + 2*np.std(normal_errors)
plt.axvline(x=threshold, color='black', linestyle='dashed', linewidth=2, label=f'Suggested Threshold ({threshold:.4f})')

plt.legend()
plt.grid(True, alpha=0.3)
plt.show()
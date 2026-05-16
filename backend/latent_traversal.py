import numpy as np
import tensorflow as tf
import matplotlib.pyplot as plt

# --- 1. REDEFINE SAMPLING FOR KERAS ---
@tf.keras.utils.register_keras_serializable(name="sampling")
def sampling(args):
    z_mean, z_log_var = args
    batch = tf.shape(z_mean)[0]
    dim = tf.shape(z_mean)[1]
    epsilon = tf.keras.backend.random_normal(shape=(batch, dim))
    return z_mean + tf.exp(0.5 * z_log_var) * epsilon

# --- 2. LOAD MODELS & DATA ---
print("Loading trained TC-VAE components...")
encoder = tf.keras.models.load_model("tcvae_encoder.keras")
decoder = tf.keras.models.load_model("tcvae_decoder.keras")

print("Loading one healthy heartbeat...")
X_train = np.load("X_ptbxl_beats.npy")
Y_labels = np.load("Y_ptbxl_labels.npy")

# Find the first normal heartbeat (Label == 0)
normal_idx = np.where(Y_labels == 0)[0][0]
sample_beat = X_train[normal_idx]
sample_beat = np.expand_dims(sample_beat, axis=(0, -1)) # Shape (1, 500, 1)

# --- 3. EXTRACT LATENT VECTOR ---
# Get the 8 latent numbers for this specific heartbeat
z_base = encoder.predict(sample_beat, verbose=0)[0][0] 

# --- 4. LATENT TRAVERSAL (THE MAGIC) ---
# We will manipulate Dimension 0 and Dimension 1 to see what they control
dimensions_to_explore = [0, 1, 2, 3, 4, 5, 6, 7] 
traversal_steps = np.linspace(-3.0, 3.0, 5) # Slide the dial from -3 to +3 in 5 steps

plt.figure(figsize=(15, 5 * len(dimensions_to_explore)))

for i, dim in enumerate(dimensions_to_explore):
    plt.subplot(len(dimensions_to_explore), 1, i + 1)
    
    # Generate 5 different variations
    for step in traversal_steps:
        z_altered = np.copy(z_base)
        z_altered[dim] = step # Overwrite the specific dimension with our "dial" value
        
        # Decode the altered numbers back into a heartbeat
        reconstructed_beat = decoder.predict(np.expand_dims(z_altered, axis=0), verbose=0)[0]
        
        # Plot it!
        plt.plot(reconstructed_beat, label=f'Dim {dim} = {step:.1f}', alpha=0.7)
    
    plt.title(f"Latent Traversal: Manipulating Dimension {dim}")
    plt.xlabel("Samples (1 Second Window)")
    plt.ylabel("Voltage")
    plt.legend()
    plt.grid(alpha=0.3)

plt.tight_layout()
plt.show()
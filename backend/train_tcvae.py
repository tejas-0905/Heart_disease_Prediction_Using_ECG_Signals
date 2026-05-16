import numpy as np
import tensorflow as tf
from tensorflow.keras import layers, Model
import os
from dotenv import load_dotenv

load_dotenv()
EPOCHS = int(os.getenv("TCVAE_EPOCHS", "15"))
BATCH_SIZE = int(os.getenv("TCVAE_BATCH_SIZE", "256"))

# --- 1. LOAD PTB-XL DATA ---
print("Loading PTB-XL Tensors...")
X_train = np.load("X_ptbxl_beats.npy")
X_train = np.expand_dims(X_train, axis=-1) # Shape: (N, 500, 1)

print(f"Data shape: {X_train.shape}")

# --- 2. TC-VAE ARCHITECTURE ---
input_dim = 500  # Updated to 1-second window
latent_dim = 8   # Strict 8-dimension bottleneck as per synopsis

# ENCODER
encoder_inputs = layers.Input(shape=(input_dim, 1))
x = layers.Conv1D(32, 3, activation="relu", strides=2, padding="same")(encoder_inputs)
x = layers.Conv1D(64, 3, activation="relu", strides=2, padding="same")(x)
x = layers.Conv1D(128, 3, activation="relu", strides=2, padding="same")(x)
x = layers.Flatten()(x)
x = layers.Dense(32, activation="relu")(x)

z_mean = layers.Dense(latent_dim, name="z_mean")(x)
z_log_var = layers.Dense(latent_dim, name="z_log_var")(x)

# SAMPLING (Changed .saving to .utils here!)
@tf.keras.utils.register_keras_serializable(name="sampling")
def sampling(args):
    z_mean, z_log_var = args
    batch = tf.shape(z_mean)[0]
    dim = tf.shape(z_mean)[1]
    epsilon = tf.keras.backend.random_normal(shape=(batch, dim))
    return z_mean + tf.exp(0.5 * z_log_var) * epsilon

z = layers.Lambda(sampling, name="z")([z_mean, z_log_var])
encoder = Model(encoder_inputs, [z_mean, z_log_var, z], name="encoder")

# DECODER
latent_inputs = layers.Input(shape=(latent_dim,))
x = layers.Dense(63 * 128, activation="relu")(latent_inputs)
x = layers.Reshape((63, 128))(x)
x = layers.Conv1DTranspose(128, 3, activation="relu", strides=2, padding="same")(x)
x = layers.Conv1DTranspose(64, 3, activation="relu", strides=2, padding="same")(x)
x = layers.Conv1DTranspose(32, 3, activation="relu", strides=2, padding="same")(x)

decoder_outputs = layers.Conv1DTranspose(1, 3, activation="linear", padding="same")(x)
# Crop to exactly 500 samples
decoder_outputs = layers.Cropping1D(cropping=(2, 2))(decoder_outputs)

decoder = Model(latent_inputs, decoder_outputs, name="decoder")

# --- 3. BETA-TCVAE CLASS ---
# (Changed .saving to .utils here too!)
@tf.keras.utils.register_keras_serializable(name="TCVAE")
class TCVAE(Model):
    def __init__(self, encoder, decoder, beta=5.0, tc_gamma=10.0, **kwargs):
        super(TCVAE, self).__init__(**kwargs)
        self.encoder = encoder
        self.decoder = decoder
        self.beta = beta           # Weight for standard KL Divergence
        self.tc_gamma = tc_gamma   # Weight for Total Correlation / Independence penalty
        
        self.total_loss_tracker = tf.keras.metrics.Mean(name="total_loss")
        self.recon_loss_tracker = tf.keras.metrics.Mean(name="recon_loss")
        self.kl_loss_tracker = tf.keras.metrics.Mean(name="kl_loss")
        self.tc_loss_tracker = tf.keras.metrics.Mean(name="tc_loss")

    @property
    def metrics(self):
        return [self.total_loss_tracker, self.recon_loss_tracker, self.kl_loss_tracker, self.tc_loss_tracker]

    def train_step(self, data):
        with tf.GradientTape() as tape:
            z_mean, z_log_var, z = self.encoder(data)
            reconstruction = self.decoder(z)
            
            # 1. Reconstruction Loss (MSE)
            recon_loss = tf.reduce_mean(tf.reduce_sum(tf.keras.losses.mse(data, reconstruction), axis=1))
            
            # 2. Standard KL Divergence
            kl_loss = -0.5 * (1 + z_log_var - tf.square(z_mean) - tf.exp(z_log_var))
            kl_loss = tf.reduce_mean(tf.reduce_sum(kl_loss, axis=1))
            
            # 3. Total Correlation / Covariance Penalty (Forces Disentanglement)
            batch_size = tf.cast(tf.shape(z)[0], tf.float32)
            z_centered = z - tf.reduce_mean(z, axis=0)
            cov_z = tf.matmul(tf.transpose(z_centered), z_centered) / batch_size
            
            # Penalize off-diagonal elements (forces features to be independent)
            tc_loss = tf.reduce_sum(tf.square(cov_z - tf.linalg.diag(tf.linalg.diag_part(cov_z))))
            
            # Final combined loss
            total_loss = recon_loss + (self.beta * kl_loss) + (self.tc_gamma * tc_loss)

        grads = tape.gradient(total_loss, self.trainable_weights)
        self.optimizer.apply_gradients(zip(grads, self.trainable_weights))

        self.total_loss_tracker.update_state(total_loss)
        self.recon_loss_tracker.update_state(recon_loss)
        self.kl_loss_tracker.update_state(kl_loss)
        self.tc_loss_tracker.update_state(tc_loss)
        
        return {
            "loss": self.total_loss_tracker.result(),
            "recon": self.recon_loss_tracker.result(),
            "kl": self.kl_loss_tracker.result(),
            "tc_penalty": self.tc_loss_tracker.result(),
        }

# --- 4. TRAIN THE MODEL ---
# --- CHANGE THIS LINE ---
tcvae = TCVAE(encoder, decoder, beta=0.1, tc_gamma=0.5)
# -----------------------
tcvae.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=0.0005))

print("\nStarting beta-TCVAE Training...")
# 15 epochs is perfect for this dataset size
history = tcvae.fit(X_train, epochs=EPOCHS, batch_size=BATCH_SIZE)

# Save using the modern .keras format
encoder.save("tcvae_encoder.keras")
decoder.save("tcvae_decoder.keras")
print("\nTraining Complete! Disentangled models saved as .keras files.")

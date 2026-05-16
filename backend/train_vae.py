import numpy as np
import tensorflow as tf
from tensorflow.keras import layers, Model

# --- 1. LOAD AND PREPARE DATA ---
print("Loading X_train_normal.npy...")
X_train = np.load("X_train_normal.npy")

# Neural Networks expect 3D data for 1D Convolutions: (batch_size, steps, channels)
X_train = np.expand_dims(X_train, axis=-1) 

# Normalize the data between -1 and 1
max_val = np.max(np.abs(X_train))
X_train = X_train / max_val
print(f"Data shape: {X_train.shape} | Max Absolute Value: {np.max(np.abs(X_train))}")

# --- 2. BUILD THE VAE ARCHITECTURE ---
input_dim = 350
latent_dim = 16  # Compressing 350 points into 16 core features

# ENCODER
encoder_inputs = layers.Input(shape=(input_dim, 1))
x = layers.Conv1D(32, 3, activation="relu", strides=2, padding="same")(encoder_inputs)
x = layers.Conv1D(64, 3, activation="relu", strides=2, padding="same")(x)
x = layers.Flatten()(x)
x = layers.Dense(16, activation="relu")(x)

z_mean = layers.Dense(latent_dim, name="z_mean")(x)
z_log_var = layers.Dense(latent_dim, name="z_log_var")(x)

# SAMPLING LAYER
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
x = layers.Dense(88 * 64, activation="relu")(latent_inputs)
x = layers.Reshape((88, 64))(x)
x = layers.Conv1DTranspose(64, 3, activation="relu", strides=2, padding="same")(x)
x = layers.Conv1DTranspose(32, 3, activation="relu", strides=2, padding="same")(x)
decoder_outputs = layers.Conv1DTranspose(1, 3, activation="linear", padding="same")(x)
decoder_outputs = layers.Cropping1D(cropping=(1, 1))(decoder_outputs) # Trim to exactly 350

decoder = Model(latent_inputs, decoder_outputs, name="decoder")

# --- 3. THE VAE CLASS ---
class VAE(Model):
    def __init__(self, encoder, decoder, **kwargs):
        super(VAE, self).__init__(**kwargs)
        self.encoder = encoder
        self.decoder = decoder
        self.total_loss_tracker = tf.keras.metrics.Mean(name="total_loss")
        self.reconstruction_loss_tracker = tf.keras.metrics.Mean(name="reconstruction_loss")
        self.kl_loss_tracker = tf.keras.metrics.Mean(name="kl_loss")

    @property
    def metrics(self):
        return [self.total_loss_tracker, self.reconstruction_loss_tracker, self.kl_loss_tracker]

    def train_step(self, data):
        with tf.GradientTape() as tape:
            z_mean, z_log_var, z = self.encoder(data)
            reconstruction = self.decoder(z)
            
            reconstruction_loss = tf.reduce_mean(
                tf.reduce_sum(tf.keras.losses.mse(data, reconstruction), axis=1)
            )
            kl_loss = -0.5 * (1 + z_log_var - tf.square(z_mean) - tf.exp(z_log_var))
            kl_loss = tf.reduce_mean(tf.reduce_sum(kl_loss, axis=1))
            
            total_loss = reconstruction_loss + kl_loss

        grads = tape.gradient(total_loss, self.trainable_weights)
        self.optimizer.apply_gradients(zip(grads, self.trainable_weights))

        self.total_loss_tracker.update_state(total_loss)
        self.reconstruction_loss_tracker.update_state(reconstruction_loss)
        self.kl_loss_tracker.update_state(kl_loss)
        
        return {
            "loss": self.total_loss_tracker.result(),
            "reconstruction_loss": self.reconstruction_loss_tracker.result(),
            "kl_loss": self.kl_loss_tracker.result(),
        }

# --- 4. EXECUTE TRAINING ---
vae = VAE(encoder, decoder)
vae.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=0.0005))

print("\n🚀 Starting VAE Training on 83,165 heartbeats...")
# Batch size 128 is optimized for 4GB VRAM
history = vae.fit(X_train, epochs=20, batch_size=128)

# Save the Encoder and Decoder separately for easier deployment later
encoder.save("vae_encoder.h5")
decoder.save("vae_decoder.h5")
print("\n✅ Training Complete! Saved vae_encoder.h5 and vae_decoder.h5")
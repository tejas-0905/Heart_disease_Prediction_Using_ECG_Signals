import numpy as np
import tensorflow as tf
from sklearn.model_selection import train_test_split
from sklearn.neighbors import KNeighborsClassifier
from sklearn.metrics import classification_report
import pickle

# --- 1. REDEFINE SAMPLING FOR KERAS ---
# We must include this so Keras knows how to load our custom TC-VAE
@tf.keras.utils.register_keras_serializable(name="sampling")
def sampling(args):
    z_mean, z_log_var = args
    batch = tf.shape(z_mean)[0]
    dim = tf.shape(z_mean)[1]
    epsilon = tf.keras.backend.random_normal(shape=(batch, dim))
    return z_mean + tf.exp(0.5 * z_log_var) * epsilon

# --- 2. LOAD DATA AND ENCODER ---
print("Loading PTB-XL Data...")
X = np.load("X_ptbxl_beats.npy")
X = np.expand_dims(X, axis=-1)
Y = np.load("Y_ptbxl_labels.npy")

print("Loading trained TC-VAE Encoder...")
encoder = tf.keras.models.load_model("tcvae_encoder.keras", compile=False)

# --- 3. EXTRACT LATENT FEATURES ---
print("Compressing 500-point ECGs into 8 Latent Dimensions...")
# We use batch_size to process the 95,711 records quickly without crashing RAM
# index [0] grabs the z_mean (the stable 8 numbers)
latent_features = encoder.predict(X, batch_size=256)[0] 

# --- 4. TRAIN THE CLASSIFIER ---
print("Splitting data into 80% Training and 20% Testing...")
X_train, X_test, Y_train, Y_test = train_test_split(latent_features, Y, test_size=0.2, random_state=42)

print("Training k-Nearest Neighbors (kNN) Classifier...")
# We use k=5 as a strong default for clinical data
knn = KNeighborsClassifier(n_neighbors=5)
knn.fit(X_train, Y_train)

# --- 5. EVALUATE & SAVE ---
print("\nTesting Classifier on unseen data...")
predictions = knn.predict(X_test)

print("\n--- FINAL CLASSIFICATION REPORT ---")
print(classification_report(Y_test, predictions, target_names=["Normal (0)", "Abnormal (1)"]))

# Save the trained ML model so we can use it in the web backend later
with open("knn_ecg_classifier.pkl", "wb") as f:
    pickle.dump(knn, f)
print("\nSaved Diagnostician Model as knn_ecg_classifier.pkl")

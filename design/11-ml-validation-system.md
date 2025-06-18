# Machine Learning Validation System - BMTC Transit App

## Overview

The ML validation system ensures data quality and integrity in the crowdsourced
transit tracking system. It employs multiple machine learning models to detect
anomalies, validate GPS data authenticity, identify spoofing attempts, and
provide quality scoring for incoming location data in real-time.

## ML System Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           DATA INGESTION LAYER                              │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                      Location Data Streams                             │  │
│  │                                                                         │  │
│  │  Kafka Topic: raw-location-data                                         │  │
│  │  ├─ 10,000+ location updates per second                                 │  │
│  │  ├─ GPS coordinates, speed, heading, accuracy                          │  │
│  │  ├─ Timestamps and route context                                        │  │
│  │  └─ Device metadata and session info                                    │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────────────────┐
│                     ML PROCESSING PIPELINE                                  │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                    Feature Engineering Layer                           │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   Spatial       │  │   Temporal      │  │   Movement      │          │  │
│  │  │   Features      │  │   Features      │  │   Features      │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • Distance      │  │ • Time Deltas   │  │ • Speed         │          │  │
│  │  │   from Route    │  │ • Frequency     │  │   Patterns      │          │  │
│  │  │ • Stop          │  │   Analysis      │  │ • Acceleration  │          │  │
│  │  │   Proximity     │  │ • Time of Day   │  │ • Direction     │          │  │
│  │  │ • Geofence      │  │ • Day of Week   │  │   Consistency   │          │  │
│  │  │   Validation    │  │ • Seasonality   │  │ • Turn Patterns │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   Statistical   │  │   Context       │  │   Quality       │          │  │
│  │  │   Features      │  │   Features      │  │   Features      │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • Rolling       │  │ • Route Type    │  │ • GPS Accuracy  │          │  │
│  │  │   Statistics    │  │ • Traffic       │  │ • Signal        │          │  │
│  │  │ • Outlier       │  │   Conditions    │  │   Strength      │          │  │
│  │  │   Scores        │  │ • Weather       │  │ • Device        │          │  │
│  │  │ • Distribution  │  │   Conditions    │  │   Reliability   │          │  │
│  │  │   Metrics       │  │ • Event Info    │  │ • Network       │          │  │
│  │  └─────────────────┘  └─────────────────┘  │   Quality       │          │  │
│  │                                            └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                     ML Model Ensemble                                   │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   Anomaly       │  │    GPS          │  │   Movement      │          │  │
│  │  │   Detection     │  │   Spoofing      │  │  Classification │          │  │
│  │  │   Model         │  │   Detection     │  │    Model        │          │  │
│  │  │                 │  │    Model        │  │                 │          │  │
│  │  │ • Isolation     │  │                 │  │ • Random Forest │          │  │
│  │  │   Forest        │  │ • Deep Learning │  │ • Vehicle Type  │          │  │
│  │  │ • LOF           │  │   Classifier    │  │   Detection     │          │  │
│  │  │ • Statistical   │  │ • Pattern       │  │ • Walking vs    │          │  │
│  │  │   Tests         │  │   Analysis      │  │   Transit       │          │  │
│  │  │ • Real-time     │  │ • Behavioral    │  │ • Speed         │          │  │
│  │  │   Scoring       │  │   Fingerprints  │  │   Validation    │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   Quality       │  │   Route         │  │   Consensus     │          │  │
│  │  │   Scoring       │  │   Matching      │  │   Validation    │          │  │
│  │  │   Model         │  │    Model        │  │    Model        │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • XGBoost       │  │ • Deep Neural   │  │ • Multi-user    │          │  │
│  │  │   Regressor     │  │   Networks      │  │   Agreement     │          │  │
│  │  │ • Feature       │  │ • Sequence      │  │ • Confidence    │          │  │
│  │  │   Importance    │  │   Models        │  │   Scoring       │          │  │
│  │  │ • Confidence    │  │ • Spatial       │  │ • Outlier       │          │  │
│  │  │   Estimation    │  │   Clustering    │  │   Detection     │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                    Decision Fusion Engine                              │  │
│  │                                                                         │  │
│  │  • Weighted Model Outputs                                               │  │
│  │  • Confidence Aggregation                                               │  │
│  │  • Conflict Resolution                                                  │  │
│  │  • Final Validation Decision                                            │  │
│  │  • Quality Score Calculation                                            │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────────────────┐
│                     MODEL TRAINING & DEPLOYMENT                             │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                      Training Pipeline                                 │  │
│  │                                                                         │  │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐          │  │
│  │  │   Data          │  │   Feature       │  │   Model         │          │  │
│  │  │   Collection    │  │   Pipeline      │  │   Training      │          │  │
│  │  │                 │  │                 │  │                 │          │  │
│  │  │ • Historical    │  │ • Feature       │  │ • Cross         │          │  │
│  │  │   Data          │  │   Engineering   │  │   Validation    │          │  │
│  │  │ • Labeled       │  │ • Selection     │  │ • Hyperparameter│          │  │
│  │  │   Datasets      │  │ • Scaling       │  │   Tuning        │          │  │
│  │  │ • Synthetic     │  │ • Validation    │  │ • Performance   │          │  │
│  │  │   Data Gen      │  │                 │  │   Evaluation    │          │  │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘          │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
│                                      │                                        │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                    Model Management System                              │  │
│  │                                                                         │  │
│  │  • Model Versioning and Registry                                        │  │
│  │  • A/B Testing Framework                                                │  │
│  │  • Performance Monitoring                                               │  │
│  │  • Auto-retraining Triggers                                             │  │
│  │  • Gradual Rollout Mechanism                                            │  │
│  │  • Rollback Capabilities                                                │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────┬───────────────────────────────────────────────────┘
                          │
┌─────────────────────────▼───────────────────────────────────────────────────┐
│                      OUTPUT & FEEDBACK LAYER                                │
│                                                                             │
│  ┌─────────────────────────────────────────────────────────────────────────┐  │
│  │                     Validation Results                                  │  │
│  │                                                                         │  │
│  │  Kafka Topic: validated-location-data                                   │  │
│  │  ├─ Quality Score (0.0 - 1.0)                                           │  │
│  │  ├─ Anomaly Flags and Confidence                                        │  │
│  │  ├─ Validation Decision (accept/reject/flag)                            │  │
│  │  ├─ Model Predictions and Explanations                                  │  │
│  │  └─ Feedback Loop Data                                                   │  │
│  └─────────────────────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Core ML Models

### 1. Anomaly Detection Model

```python
import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest
from sklearn.neighbors import LocalOutlierFactor
from sklearn.preprocessing import StandardScaler
from scipy import stats
import joblib

class AnomalyDetectionModel:
    def __init__(self):
        self.isolation_forest = IsolationForest(
            contamination=0.1,
            random_state=42,
            n_estimators=100
        )
        self.lof = LocalOutlierFactor(
            n_neighbors=20,
            contamination=0.1,
            novelty=True
        )
        self.scaler = StandardScaler()
        self.feature_weights = {
            'speed_anomaly': 0.3,
            'location_anomaly': 0.4,
            'temporal_anomaly': 0.2,
            'pattern_anomaly': 0.1
        }

    def extract_features(self, location_data: dict, historical_data: pd.DataFrame) -> np.ndarray:
        """Extract features for anomaly detection"""
        features = []

        # Speed-related features
        current_speed = location_data.get('speed', 0)
        features.extend([
            current_speed,
            abs(current_speed - self._get_route_avg_speed(location_data['route_id'])),
            self._calculate_speed_consistency(historical_data)
        ])

        # Location-related features
        lat, lon = location_data['latitude'], location_data['longitude']
        features.extend([
            self._distance_from_route(lat, lon, location_data['route_id']),
            self._nearest_stop_distance(lat, lon),
            self._calculate_location_jump(lat, lon, historical_data)
        ])

        # Temporal features
        timestamp = location_data['timestamp']
        features.extend([
            self._time_gap_anomaly(timestamp, historical_data),
            self._time_of_day_score(timestamp),
            self._day_of_week_score(timestamp)
        ])

        # Movement pattern features
        features.extend([
            self._heading_consistency(location_data.get('heading', 0), historical_data),
            self._acceleration_anomaly(current_speed, historical_data),
            self._route_progression_score(lat, lon, location_data['route_id'])
        ])

        return np.array(features).reshape(1, -1)

    def detect_anomalies(self, location_data: dict, historical_data: pd.DataFrame) -> dict:
        """Main anomaly detection function"""
        features = self.extract_features(location_data, historical_data)
        features_scaled = self.scaler.transform(features)

        # Isolation Forest prediction
        iso_score = self.isolation_forest.decision_function(features_scaled)[0]
        iso_anomaly = self.isolation_forest.predict(features_scaled)[0] == -1

        # Local Outlier Factor prediction
        lof_score = self.lof.decision_function(features_scaled)[0]
        lof_anomaly = self.lof.predict(features_scaled)[0] == -1

        # Statistical tests
        stat_anomalies = self._statistical_anomaly_tests(location_data, historical_data)

        # Combine results
        anomaly_confidence = self._calculate_anomaly_confidence(
            iso_score, lof_score, stat_anomalies
        )

        is_anomaly = anomaly_confidence > 0.7  # Threshold

        return {
            'is_anomaly': is_anomaly,
            'confidence': anomaly_confidence,
            'isolation_forest_score': iso_score,
            'lof_score': lof_score,
            'statistical_anomalies': stat_anomalies,
            'explanation': self._generate_explanation(features, is_anomaly)
        }

    def _statistical_anomaly_tests(self, location_data: dict, historical_data: pd.DataFrame) -> dict:
        """Perform statistical tests for anomaly detection"""
        anomalies = {}

        if len(historical_data) > 10:
            # Speed anomaly test
            speeds = historical_data['speed'].values
            speed_zscore = np.abs(stats.zscore([location_data['speed']], speeds))[0]
            anomalies['speed_zscore'] = speed_zscore > 3

            # Location anomaly test (Mahalanobis distance)
            locations = historical_data[['latitude', 'longitude']].values
            current_location = np.array([[location_data['latitude'], location_data['longitude']]])

            if len(locations) > 5:
                try:
                    cov_matrix = np.cov(locations.T)
                    mean_location = np.mean(locations, axis=0)
                    diff = current_location[0] - mean_location
                    mahal_dist = np.sqrt(diff.T @ np.linalg.inv(cov_matrix) @ diff)
                    anomalies['location_mahalanobis'] = mahal_dist > 3
                except np.linalg.LinAlgError:
                    anomalies['location_mahalanobis'] = False

        return anomalies

    def _calculate_anomaly_confidence(self, iso_score: float, lof_score: float,
                                    stat_anomalies: dict) -> float:
        """Calculate overall anomaly confidence score"""
        # Normalize scores to 0-1 range
        iso_norm = max(0, min(1, (0.5 - iso_score) / 0.5))
        lof_norm = max(0, min(1, (0.5 - lof_score) / 0.5))

        # Statistical anomaly score
        stat_score = sum(stat_anomalies.values()) / max(1, len(stat_anomalies))

        # Weighted combination
        confidence = (
            0.4 * iso_norm +
            0.4 * lof_norm +
            0.2 * stat_score
        )

        return confidence

    def train(self, training_data: pd.DataFrame) -> None:
        """Train the anomaly detection models"""
        # Extract features for all training samples
        features_list = []
        for _, row in training_data.iterrows():
            # Get historical context for each sample
            historical = training_data[
                (training_data['route_id'] == row['route_id']) &
                (training_data['timestamp'] < row['timestamp'])
            ].tail(50)  # Last 50 points

            features = self.extract_features(row.to_dict(), historical)
            features_list.append(features[0])

        features_array = np.array(features_list)

        # Fit scaler and models
        features_scaled = self.scaler.fit_transform(features_array)
        self.isolation_forest.fit(features_scaled)
        self.lof.fit(features_scaled)

    def save_model(self, filepath: str) -> None:
        """Save the trained model"""
        model_data = {
            'isolation_forest': self.isolation_forest,
            'lof': self.lof,
            'scaler': self.scaler,
            'feature_weights': self.feature_weights
        }
        joblib.dump(model_data, filepath)

    def load_model(self, filepath: str) -> None:
        """Load a trained model"""
        model_data = joblib.load(filepath)
        self.isolation_forest = model_data['isolation_forest']
        self.lof = model_data['lof']
        self.scaler = model_data['scaler']
        self.feature_weights = model_data['feature_weights']
```

### 2. GPS Spoofing Detection Model

```python
import tensorflow as tf
from tensorflow.keras import layers, models
import numpy as np
from typing import List, Dict, Tuple

class GPSSpoofingDetector:
    def __init__(self):
        self.model = None
        self.sequence_length = 10  # Number of consecutive GPS points to analyze
        self.feature_dim = 15      # Number of features per GPS point

    def build_model(self) -> tf.keras.Model:
        """Build deep learning model for GPS spoofing detection"""
        # Input layer for GPS sequence
        gps_input = layers.Input(shape=(self.sequence_length, self.feature_dim), name='gps_sequence')

        # LSTM layers for temporal pattern analysis
        lstm1 = layers.LSTM(64, return_sequences=True, dropout=0.2)(gps_input)
        lstm2 = layers.LSTM(32, return_sequences=False, dropout=0.2)(lstm1)

        # Dense layers for pattern recognition
        dense1 = layers.Dense(64, activation='relu')(lstm2)
        dense1 = layers.Dropout(0.3)(dense1)

        dense2 = layers.Dense(32, activation='relu')(dense1)
        dense2 = layers.Dropout(0.2)(dense2)

        # Output layers
        spoofing_prob = layers.Dense(1, activation='sigmoid', name='spoofing_probability')(dense2)
        confidence_score = layers.Dense(1, activation='sigmoid', name='confidence_score')(dense2)

        model = models.Model(inputs=gps_input, outputs=[spoofing_prob, confidence_score])

        model.compile(
            optimizer='adam',
            loss={
                'spoofing_probability': 'binary_crossentropy',
                'confidence_score': 'mse'
            },
            metrics={
                'spoofing_probability': ['accuracy', 'precision', 'recall'],
                'confidence_score': ['mae']
            }
        )

        return model

    def extract_sequence_features(self, gps_sequence: List[Dict]) -> np.ndarray:
        """Extract features from a sequence of GPS points"""
        if len(gps_sequence) < self.sequence_length:
            # Pad sequence if too short
            gps_sequence = gps_sequence + [gps_sequence[-1]] * (self.sequence_length - len(gps_sequence))

        features = []
        for i, point in enumerate(gps_sequence[-self.sequence_length:]):
            point_features = []

            # Basic GPS features
            point_features.extend([
                point['latitude'],
                point['longitude'],
                point['speed'],
                point['heading'],
                point['accuracy']
            ])

            # Temporal features
            if i > 0:
                prev_point = gps_sequence[i-1]
                time_diff = point['timestamp'] - prev_point['timestamp']
                distance = self._haversine_distance(
                    point['latitude'], point['longitude'],
                    prev_point['latitude'], prev_point['longitude']
                )
                speed_calculated = distance / max(time_diff / 1000, 0.001)  # m/s

                point_features.extend([
                    time_diff,
                    distance,
                    speed_calculated,
                    abs(point['speed'] - speed_calculated),  # Speed consistency
                    self._bearing_change(prev_point, point)
                ])
            else:
                point_features.extend([0, 0, 0, 0, 0])  # Padding for first point

            # Device/signal quality features
            point_features.extend([
                point.get('satellite_count', 0),
                point.get('signal_strength', 0),
                point.get('hdop', 0),  # Horizontal Dilution of Precision
                point.get('vdop', 0),  # Vertical Dilution of Precision
                point.get('altitude', 0)
            ])

            features.append(point_features)

        return np.array(features).reshape(1, self.sequence_length, self.feature_dim)

    def detect_spoofing(self, gps_sequence: List[Dict]) -> Dict:
        """Detect if GPS data is spoofed"""
        features = self.extract_sequence_features(gps_sequence)

        # Model predictions
        spoofing_prob, confidence = self.model.predict(features, verbose=0)

        # Rule-based checks
        rule_based_flags = self._rule_based_spoofing_checks(gps_sequence)

        # Pattern analysis
        pattern_flags = self._analyze_movement_patterns(gps_sequence)

        # Combine all indicators
        final_spoofing_prob = self._combine_spoofing_indicators(
            spoofing_prob[0][0], rule_based_flags, pattern_flags
        )

        is_spoofed = final_spoofing_prob > 0.7

        return {
            'is_spoofed': is_spoofed,
            'spoofing_probability': float(final_spoofing_prob),
            'confidence': float(confidence[0][0]),
            'ml_prediction': float(spoofing_prob[0][0]),
            'rule_based_flags': rule_based_flags,
            'pattern_flags': pattern_flags,
            'explanation': self._generate_spoofing_explanation(
                final_spoofing_prob, rule_based_flags, pattern_flags
            )
        }

    def _rule_based_spoofing_checks(self, gps_sequence: List[Dict]) -> Dict:
        """Rule-based GPS spoofing detection"""
        flags = {}

        if len(gps_sequence) < 2:
            return flags

        # Check for impossible speeds
        max_reasonable_speed = 100  # km/h for transit
        impossible_speed = any(point['speed'] > max_reasonable_speed for point in gps_sequence)
        flags['impossible_speed'] = impossible_speed

        # Check for perfect geometric patterns (sign of simulation)
        coordinates = [(p['latitude'], p['longitude']) for p in gps_sequence]
        flags['geometric_pattern'] = self._detect_geometric_patterns(coordinates)

        # Check for sudden teleportation
        flags['teleportation'] = self._detect_teleportation(gps_sequence)

        # Check for constant values (stuck GPS)
        flags['stuck_gps'] = self._detect_stuck_gps(gps_sequence)

        # Check for unrealistic accuracy claims
        flags['suspicious_accuracy'] = any(
            point.get('accuracy', 100) < 1 for point in gps_sequence  # Sub-meter accuracy suspicious
        )

        return flags

    def _analyze_movement_patterns(self, gps_sequence: List[Dict]) -> Dict:
        """Analyze movement patterns for spoofing indicators"""
        patterns = {}

        if len(gps_sequence) < 3:
            return patterns

        # Calculate movement smoothness
        accelerations = []
        for i in range(2, len(gps_sequence)):
            prev_speed = gps_sequence[i-1]['speed']
            curr_speed = gps_sequence[i]['speed']
            time_diff = (gps_sequence[i]['timestamp'] - gps_sequence[i-1]['timestamp']) / 1000

            if time_diff > 0:
                acceleration = (curr_speed - prev_speed) / time_diff
                accelerations.append(abs(acceleration))

        if accelerations:
            avg_acceleration = np.mean(accelerations)
            patterns['excessive_acceleration'] = avg_acceleration > 5  # m/s²

        # Check for too-perfect path following
        patterns['perfect_path'] = self._check_perfect_path_following(gps_sequence)

        return patterns

    def _combine_spoofing_indicators(self, ml_prob: float, rule_flags: Dict,
                                   pattern_flags: Dict) -> float:
        """Combine all spoofing indicators into final probability"""
        # Weight the ML prediction
        final_prob = ml_prob * 0.6

        # Add rule-based penalties
        rule_penalty = sum(rule_flags.values()) * 0.2
        pattern_penalty = sum(pattern_flags.values()) * 0.2

        return min(1.0, final_prob + rule_penalty + pattern_penalty)

    def train(self, training_sequences: List[List[Dict]], labels: List[int]) -> None:
        """Train the GPS spoofing detection model"""
        # Extract features for all sequences
        X = []
        for sequence in training_sequences:
            features = self.extract_sequence_features(sequence)
            X.append(features[0])

        X = np.array(X)
        y_spoofing = np.array(labels)
        y_confidence = np.ones_like(y_spoofing)  # High confidence for training data

        # Build and train model
        self.model = self.build_model()

        history = self.model.fit(
            X, {'spoofing_probability': y_spoofing, 'confidence_score': y_confidence},
            epochs=50,
            batch_size=32,
            validation_split=0.2,
            verbose=1
        )

        return history
```

### 3. Quality Scoring Model

```python
import xgboost as xgb
from sklearn.model_selection import train_test_split
from sklearn.metrics import mean_squared_error, r2_score
import numpy as np
import pandas as pd

class QualityScoringModel:
    def __init__(self):
        self.model = None
        self.feature_names = [
            'gps_accuracy', 'speed_consistency', 'route_adherence',
            'temporal_consistency', 'signal_strength', 'satellite_count',
            'movement_smoothness', 'validation_consensus', 'device_reliability',
            'location_precision', 'heading_consistency', 'altitude_consistency'
        ]

    def extract_quality_features(self, location_data: Dict, historical_data: pd.DataFrame,
                               validation_results: Dict) -> np.ndarray:
        """Extract features for quality scoring"""
        features = []

        # GPS accuracy feature (inverted and normalized)
        gps_accuracy = min(location_data.get('accuracy', 100), 100)
        features.append(1.0 - (gps_accuracy / 100.0))

        # Speed consistency (compared to historical average)
        if len(historical_data) > 5:
            historical_speeds = historical_data['speed'].values
            speed_std = np.std(historical_speeds)
            current_speed = location_data['speed']
            speed_deviation = abs(current_speed - np.mean(historical_speeds))
            speed_consistency = max(0, 1.0 - (speed_deviation / max(speed_std * 3, 1)))
            features.append(speed_consistency)
        else:
            features.append(0.5)  # Neutral score for insufficient data

        # Route adherence (distance from expected route)
        route_distance = validation_results.get('distance_from_route', 1000)
        route_adherence = max(0, 1.0 - (route_distance / 200.0))  # 200m threshold
        features.append(route_adherence)

        # Temporal consistency (regular update frequency)
        if len(historical_data) > 2:
            time_diffs = historical_data['timestamp'].diff().dropna()
            time_consistency = 1.0 - min(1.0, np.std(time_diffs) / np.mean(time_diffs))
            features.append(time_consistency)
        else:
            features.append(0.5)

        # Signal strength and satellite features
        signal_strength = location_data.get('signal_strength', 0) / 100.0
        satellite_count = min(location_data.get('satellite_count', 0), 12) / 12.0
        features.extend([signal_strength, satellite_count])

        # Movement smoothness
        movement_smoothness = self._calculate_movement_smoothness(historical_data)
        features.append(movement_smoothness)

        # Validation consensus (agreement with other users)
        consensus_score = validation_results.get('consensus_score', 0.5)
        features.append(consensus_score)

        # Device reliability (based on historical performance)
        device_reliability = validation_results.get('device_reliability', 0.5)
        features.append(device_reliability)

        # Location precision (clustering with nearby points)
        location_precision = self._calculate_location_precision(location_data, historical_data)
        features.append(location_precision)

        # Heading consistency
        heading_consistency = self._calculate_heading_consistency(location_data, historical_data)
        features.append(heading_consistency)

        # Altitude consistency (for areas with known elevations)
        altitude_consistency = self._calculate_altitude_consistency(location_data, historical_data)
        features.append(altitude_consistency)

        return np.array(features)

    def predict_quality(self, location_data: Dict, historical_data: pd.DataFrame,
                       validation_results: Dict) -> Dict:
        """Predict quality score for location data"""
        features = self.extract_quality_features(location_data, historical_data, validation_results)

        # XGBoost prediction
        quality_score = self.model.predict(features.reshape(1, -1))[0]
        quality_score = max(0.0, min(1.0, quality_score))  # Clamp to [0, 1]

        # Feature importance for explainability
        feature_importance = self._get_feature_importance()

        # Quality category
        if quality_score >= 0.8:
            quality_category = 'excellent'
        elif quality_score >= 0.6:
            quality_category = 'good'
        elif quality_score >= 0.4:
            quality_category = 'fair'
        else:
            quality_category = 'poor'

        return {
            'quality_score': float(quality_score),
            'quality_category': quality_category,
            'feature_scores': dict(zip(self.feature_names, features)),
            'feature_importance': feature_importance,
            'explanation': self._generate_quality_explanation(quality_score, features)
        }

    def train(self, training_data: pd.DataFrame, quality_labels: np.ndarray) -> Dict:
        """Train the quality scoring model"""
        # Extract features for all training samples
        X = []
        for _, row in training_data.iterrows():
            # Mock validation results for training
            validation_results = {
                'distance_from_route': row.get('distance_from_route', 50),
                'consensus_score': row.get('consensus_score', 0.7),
                'device_reliability': row.get('device_reliability', 0.8)
            }

            # Get historical context
            historical = training_data[
                (training_data['route_id'] == row['route_id']) &
                (training_data['timestamp'] < row['timestamp'])
            ].tail(20)

            features = self.extract_quality_features(row.to_dict(), historical, validation_results)
            X.append(features)

        X = np.array(X)
        y = quality_labels

        # Split data
        X_train, X_test, y_train, y_test = train_test_split(X, y, test_size=0.2, random_state=42)

        # Train XGBoost model
        self.model = xgb.XGBRegressor(
            n_estimators=100,
            max_depth=6,
            learning_rate=0.1,
            random_state=42,
            objective='reg:squarederror'
        )

        self.model.fit(
            X_train, y_train,
            eval_set=[(X_test, y_test)],
            early_stopping_rounds=10,
            verbose=False
        )

        # Evaluate model
        y_pred = self.model.predict(X_test)
        mse = mean_squared_error(y_test, y_pred)
        r2 = r2_score(y_test, y_pred)

        return {
            'mse': mse,
            'r2_score': r2,
            'feature_importance': dict(zip(self.feature_names, self.model.feature_importances_))
        }

    def _calculate_movement_smoothness(self, historical_data: pd.DataFrame) -> float:
        """Calculate smoothness of movement pattern"""
        if len(historical_data) < 3:
            return 0.5

        # Calculate speed changes
        speeds = historical_data['speed'].values
        speed_changes = np.diff(speeds)

        # Smooth movement should have small, consistent speed changes
        if len(speed_changes) > 0:
            smoothness = 1.0 - min(1.0, np.std(speed_changes) / max(np.mean(speeds), 1))
            return max(0, smoothness)

        return 0.5

    def _get_feature_importance(self) -> Dict:
        """Get feature importance from trained model"""
        if self.model is None:
            return {}

        return dict(zip(self.feature_names, self.model.feature_importances_))
```

## Real-Time Processing Integration

### 1. Stream Processing Pipeline

```python
from kafka import KafkaConsumer, KafkaProducer
import json
import asyncio
from typing import Dict, List
import logging

class MLValidationProcessor:
    def __init__(self):
        self.anomaly_detector = AnomalyDetectionModel()
        self.spoofing_detector = GPSSpoofingDetector()
        self.quality_scorer = QualityScoringModel()

        # Load pre-trained models
        self.load_models()

        # Kafka setup
        self.consumer = KafkaConsumer(
            'raw-location-data',
            bootstrap_servers=['localhost:9092'],
            value_deserializer=lambda x: json.loads(x.decode('utf-8'))
        )

        self.producer = KafkaProducer(
            bootstrap_servers=['localhost:9092'],
            value_serializer=lambda x: json.dumps(x).encode('utf-8')
        )

        # State management for historical data
        self.user_histories = {}  # Store recent location history per user
        self.max_history_size = 50

    async def process_location_stream(self):
        """Main processing loop for location data stream"""
        for message in self.consumer:
            try:
                location_data = message.value
                user_id = location_data.get('user_id')

                # Update user history
                self.update_user_history(user_id, location_data)

                # Run ML validation pipeline
                validation_result = await self.validate_location_data(location_data)

                # Publish results
                await self.publish_validation_result(location_data, validation_result)

            except Exception as e:
                logging.error(f"Error processing location data: {e}")
                continue

    async def validate_location_data(self, location_data: Dict) -> Dict:
        """Complete ML validation pipeline"""
        user_id = location_data.get('user_id')
        historical_data = self.get_user_history(user_id)

        # Run all ML models in parallel
        anomaly_task = asyncio.create_task(
            self.run_anomaly_detection(location_data, historical_data)
        )
        spoofing_task = asyncio.create_task(
            self.run_spoofing_detection(location_data, historical_data)
        )

        # Wait for anomaly and spoofing detection
        anomaly_result, spoofing_result = await asyncio.gather(
            anomaly_task, spoofing_task
        )

        # Run quality scoring with validation context
        quality_result = await self.run_quality_scoring(
            location_data, historical_data, {
                'anomaly_result': anomaly_result,
                'spoofing_result': spoofing_result
            }
        )

        # Make final validation decision
        final_decision = self.make_validation_decision(
            anomaly_result, spoofing_result, quality_result
        )

        return {
            'validation_decision': final_decision,
            'anomaly_detection': anomaly_result,
            'spoofing_detection': spoofing_result,
            'quality_assessment': quality_result,
            'timestamp': location_data['timestamp'],
            'processing_time': asyncio.get_event_loop().time()
        }

    def make_validation_decision(self, anomaly_result: Dict, spoofing_result: Dict,
                               quality_result: Dict) -> Dict:
        """Make final validation decision based on all ML outputs"""
        # Decision thresholds
        anomaly_threshold = 0.7
        spoofing_threshold = 0.7
        quality_threshold = 0.3

        # Check conditions
        is_anomaly = anomaly_result['confidence'] > anomaly_threshold
        is_spoofed = spoofing_result['spoofing_probability'] > spoofing_threshold
        is_low_quality = quality_result['quality_score'] < quality_threshold

        # Decision logic
        if is_spoofed:
            decision = 'reject'
            reason = 'GPS spoofing detected'
            confidence = spoofing_result['spoofing_probability']
        elif is_anomaly:
            decision = 'flag'
            reason = 'Anomalous behavior detected'
            confidence = anomaly_result['confidence']
        elif is_low_quality:
            decision = 'flag'
            reason = 'Low data quality'
            confidence = 1.0 - quality_result['quality_score']
        else:
            decision = 'accept'
            reason = 'Data passed all validation checks'
            confidence = quality_result['quality_score']

        return {
            'decision': decision,
            'reason': reason,
            'confidence': confidence,
            'overall_quality_score': quality_result['quality_score']
        }

    async def run_anomaly_detection(self, location_data: Dict,
                                  historical_data: pd.DataFrame) -> Dict:
        """Run anomaly detection asynchronously"""
        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, self.anomaly_detector.detect_anomalies, location_data, historical_data
        )

    async def run_spoofing_detection(self, location_data: Dict,
                                   historical_data: pd.DataFrame) -> Dict:
        """Run GPS spoofing detection asynchronously"""
        # Convert historical data to sequence format
        gps_sequence = historical_data.tail(10).to_dict('records')
        gps_sequence.append(location_data)

        loop = asyncio.get_event_loop()
        return await loop.run_in_executor(
            None, self.spoofing_detector.detect_spoofing, gps_sequence
        )

    async def publish_validation_result(self, location_data: Dict,
                                      validation_result: Dict) -> None:
        """Publish validation results to output topic"""
        output_data = {
            **location_data,
            'ml_validation': validation_result
        }

        # Determine output topic based on validation decision
        decision = validation_result['validation_decision']['decision']
        if decision == 'accept':
            topic = 'validated-location-data'
        elif decision == 'flag':
            topic = 'flagged-location-data'
        else:  # reject
            topic = 'rejected-location-data'

        self.producer.send(topic, output_data)
```

This comprehensive ML validation system provides robust, real-time data quality
assurance for the crowdsourced transit app, ensuring high data integrity while
maintaining system performance.

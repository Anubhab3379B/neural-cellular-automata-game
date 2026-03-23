# Neural Cellular Automata - Interactive Educational Game

An advanced educational game demonstrating **Neural Cellular Automata** with obstacles, pathfinding, and real-time algorithm visualization.

Based on ["Growing Neural Cellular Automata"](https://distill.pub/2020/growing-ca/) by Mordvintsev, Randazzo, Niklasson, and Levin (Distill 2020).

## Features

### Core NCA Engine
- 16-channel cell state with Sobel-filter perception
- Stochastic update rule for robust growth patterns
- Full documentation with Big-O complexity annotations

### Game Mechanics
- **5 Progressive Levels**: Growth, Avoidance, Pathfinding, Efficiency, Memory Challenge
- **Obstacle Types**: Walls (block), Repulsors (push), Attractors (pull)
- **Scoring System**: Par-based bonuses, efficiency tracking

### Educational Features
- **Explanation Panel**: Real-time algorithm state visualization
- **Memory Monitor**: Live memory usage graph with threshold warnings
- **Pattern Library**: 10 built-in patterns + save custom patterns

### Modern UI
- Dark theme with glassmorphism effects
- Smooth CSS animations and transitions
- Responsive three-column layout
- Toast notifications

## Quick Start

```bash
cd web
python -m http.server 8000
```

Open **http://localhost:8000** in your browser.

## Keyboard Shortcuts

| Key | Action |
|-----|--------|
| Space | Play/Pause |
| R | Reset level |
| D | Draw tool |
| E | Erase tool |
| W | Wall tool |
| A | Attractor tool |
| X | Repulsor tool |
| S | Single step |
| Ctrl+S | Save game |
| Ctrl+L | Load game |
| +/- | Adjust brush size |

## Project Structure

```
web/
├── index.html              # Main HTML with three-column layout
├── style.css               # Dark theme, animations (~1,200 lines)
├── nca.js                  # Core NCA engine (~1,100 lines)
├── obstacle-system.js      # Walls, repulsors, attractors (~600 lines)
├── game-engine.js          # Levels, goals, scoring (~700 lines)
├── explanation-panel.js    # Algorithm visualization (~450 lines)
├── memory-monitor.js       # Memory usage tracking (~480 lines)
├── save-system.js          # LocalStorage persistence (~320 lines)
├── pattern-library.js      # Built-in and custom patterns (~350 lines)
└── controls.js             # UI integration (~620 lines)
```

## Technologies

- Vanilla JavaScript (ES6+)
- HTML5 Canvas API
- CSS3 with custom properties
- LocalStorage for persistence

## License

MIT License

## Credits

- Original NCA concept: Alexander Mordvintsev et al. (Google Research)
- Implementation: Built as an educational game with enhanced visualization


# Technical Documentation

## System Architecture

The Bio-Signal & Human Interface System is organized into five core modules, each addressing specific objectives:

### 1. Bio-Signal Preprocessing (O4)

**Location:** `src/bio_signal_preprocessing/`

**Purpose:** Handle time-series biological signals with noise reduction, normalization, and feature extraction.

**Key Components:**
- `BioSignal` class: Encapsulates bio-signals with metadata
- Signal generators: Create simulated EMG and EEG signals
- Filtering functions: Bandpass, notch, and wavelet denoising
- Feature extraction: Time and frequency domain features

**Workflow:**
1. Generate or load bio-signal
2. Apply preprocessing pipeline (filter → denoise → normalize)
3. Extract features for downstream processing

### 2. Neuro-Adaptive AI Control

**Location:** `src/neuro_adaptive_control/`

**Purpose:** AI layer that learns user's neural patterns and adapts over time.

**Key Components:**
- `AdaptiveNeuralNetwork`: PyTorch neural network that learns patterns
- `ReplayBuffer`: Stores experiences to prevent catastrophic forgetting
- `NeuroAdaptiveController`: Main controller with online and continual learning

**Learning Modes:**
- **Online Learning:** Adapts continuously to new data
- **Continual Learning:** Maintains previous knowledge while learning new patterns
- **Domain Adaptation:** Adapts from source user to target user

### 3. Sensory Feedback Encoding (A3, O7)

**Location:** `src/sensory_feedback/`

**Purpose:** Convert physical signals (pressure, texture, temperature) to neural encodings.

**Key Components:**
- `VariationalAutoencoder`: Compresses sensory data to low-dimensional representation
- `SpikeEncoder`: Converts continuous signals to spike trains
- `SensoryEncoder`: Complete encoding system for multiple modalities

**Encoding Strategies:**
- **Rate Coding:** Spike frequency encodes intensity
- **Temporal Coding:** Spike timing encodes intensity
- **VAE Compression:** Reduces dimensionality while preserving information

### 4. Intent Inference (O5)

**Location:** `src/intent_inference/`

**Purpose:** Infer user's intentions from bio-signals.

**Key Components:**
- `TemporalCNN`: Convolutional neural network for temporal pattern recognition
- `LSTMIntentClassifier`: LSTM network for sequence classification
- `IntentInferenceSystem`: Complete system with training and evaluation

**Capabilities:**
- Classify discrete intents (e.g., different movements)
- Map to continuous intents (e.g., desired force)
- Temporal pattern recognition across time scales

### 5. Adaptive Control Logic (O6)

**Location:** `src/adaptive_control/`

**Purpose:** Adaptive control with learning-based and rule-based approaches.

**Key Components:**
- `PIDController`: Classic rule-based controller (baseline)
- `NeuralController`: Learning-based neural network controller
- `AdaptiveControlSystem`: Combines both approaches with stability monitoring

**Features:**
- Multiple control modes: PID, Neural, or Blended
- Stability monitoring: Lyapunov stability, convergence, oscillation detection
- Performance comparison between approaches

## Data Flow

```
Raw Bio-Signal
    ↓
[Bio-Signal Preprocessing]
    ↓
Preprocessed Signal + Features
    ↓
[Intent Inference] ← [Neuro-Adaptive Control]
    ↓                        ↓
Inferred Intent    Adaptive Policy
    ↓                        ↓
[Adaptive Control Logic] ←──┘
    ↓
Control Commands
    ↓
[Sensory Feedback Encoding]
    ↓
Neural-Encoded Feedback
```

## Neural Network Architectures

### Adaptive Neural Network
```
Input (features) → FC(64) → BatchNorm → ReLU → Dropout
                           → FC(64) → BatchNorm → ReLU → Dropout
                           → FC(output) → Output
```

### Variational Autoencoder
```
Encoder: Input → FC(64) → FC(32) → [μ, log(σ²)]
Decoder: Latent → FC(32) → FC(64) → FC(Output)
```

### LSTM Intent Classifier
```
Input Sequence → LSTM(64, 2 layers) → Final Hidden State → FC → Output
```

### Temporal CNN
```
Input → Conv1D(32) → BatchNorm → ReLU → MaxPool
      → Conv1D(64) → BatchNorm → ReLU → MaxPool
      → Conv1D(128) → BatchNorm → ReLU
      → GlobalAvgPool → FC(64) → FC(Output)
```

## Algorithm Details

### PID Control
```
u(t) = Kp·e(t) + Ki·∫e(t)dt + Kd·de(t)/dt

where:
  e(t) = setpoint - measurement
  Kp, Ki, Kd = tunable gains
```

### VAE Loss Function
```
L = L_reconstruction + L_KL
L_reconstruction = BCE(x, x̂)
L_KL = -0.5 × Σ(1 + log(σ²) - μ² - σ²)
```

### Online Learning Update
```
1. Receive new data (x, y)
2. Add to replay buffer
3. Sample mini-batch: new data + replay samples
4. Compute loss L = loss_fn(model(x), y)
5. Update: θ ← θ - α·∇L
```

## Performance Metrics

### Signal Quality
- **Signal-to-Noise Ratio (SNR):** Measures signal cleanliness
- **Zero Crossing Rate:** Indicates frequency content
- **RMS:** Signal magnitude

### Classification Performance
- **Accuracy:** Percentage of correct predictions
- **Per-Class Accuracy:** Performance for each individual class
- **Confusion Matrix:** Shows misclassification patterns

### Control Performance
- **Mean Error:** Average distance from target
- **Settling Time:** Time to reach and stay within error threshold
- **Stability:** Boundedness and convergence

## Configuration Parameters

All parameters can be adjusted in `config/default_config.yaml`:

### Critical Parameters
- **Learning rates:** Control how fast models learn
- **Buffer sizes:** Affect memory and learning stability
- **Filter cutoffs:** Determine which frequencies to keep
- **Compression ratios:** Balance between data size and fidelity

### Tuning Guidelines
- **Higher learning rates:** Faster learning but less stable
- **Larger buffers:** Better memory but more computation
- **Wider filter bands:** Keep more information but also more noise
- **Higher compression:** Smaller representation but information loss

## Limitations and Assumptions

### Current Limitations
1. **Simulation Only:** No real hardware interface
2. **Simplified Dynamics:** Real bio-signals are more complex
3. **Controlled Conditions:** Assumes clean, consistent data
4. **No Real-Time Guarantees:** Not optimized for real-time systems
5. **Limited Validation:** No clinical or real-world testing

### Assumptions
1. Signals are periodic and somewhat predictable
2. Intent classes are well-separated
3. Control dynamics are relatively simple
4. Users can provide training data
5. Neural patterns are learnable

## Future Directions

### Potential Enhancements
1. **Real Hardware Integration:** Interface with actual sensors
2. **Transfer Learning:** Adapt from simulated to real data
3. **Multi-Modal Fusion:** Combine multiple signal types
4. **Advanced Architectures:** Transformer models, attention mechanisms
5. **Real-Time Optimization:** Reduce latency for interactive use

### Research Questions
1. How well do simulated results transfer to real systems?
2. What is the optimal compression ratio for different sensors?
3. Can one model adapt to multiple users?
4. How to handle non-stationary signals?
5. What are the minimum data requirements for learning?

## References and Further Reading

### Signal Processing
- Wavelet transforms for bio-signal processing
- Kalman filtering for real-time noise reduction
- Time-frequency analysis methods

### Machine Learning
- Online learning and continual learning
- Domain adaptation techniques
- Variational autoencoders

### Control Theory
- PID controller tuning
- Adaptive control systems
- Lyapunov stability analysis

### Neural Interfaces
- Brain-computer interfaces (BCI)
- Neural encoding and decoding
- Sensory substitution systems


/**
 * =============================================================================
 * NCA-CORE.JS - Neural Cellular Automata Core Engine
 * =============================================================================
 * 
 * This module implements the core simulation engine for Neural Cellular Automata.
 * Based on "Growing Neural Cellular Automata" by Mordvintsev et al., Distill 2020.
 * 
 * ARCHITECTURE OVERVIEW:
 * ----------------------
 * The NCA simulates a grid of cells where each cell has multiple channels (16 by
 * default). Cells communicate locally through perception (Sobel filters) and
 * update their state using a small neural network. This creates emergent patterns
 * that can grow, regenerate, and adapt to obstacles.
 * 
 * MEMORY LAYOUT:
 * --------------
 * Grid data is stored in a single Float32Array for cache efficiency:
 *   - Total size: gridWidth * gridHeight * channels * 4 bytes
 *   - Access pattern: grid[(y * width + x) * channels + c]
 *   - For 72x72x16: 82,944 bytes (81 KB)
 * 
 * COMPLEXITY SUMMARY:
 * -------------------
 *   - Single step: O(W * H * C^2) where W=width, H=height, C=channels
 *   - Perception: O(9 * C) per cell (3x3 kernel, C channels)
 *   - Neural network: O(C * hidden + hidden * C) per cell
 *   - Memory: O(W * H * C) for grid, O(W * H) for obstacle map
 * 
 * =============================================================================
 */

/* -----------------------------------------------------------------------------
 * SECTION 1: CONFIGURATION CONSTANTS
 * -----------------------------------------------------------------------------
 * These constants define the default behavior of the simulation.
 * Modifying these affects performance and visual output.
 * -------------------------------------------------------------------------- */

/**
 * DEFAULT_GRID_WIDTH - Number of cells horizontally
 * 
 * Trade-off: Larger grids show more detail but require O(n^2) more computation.
 * Recommended range: 32 to 128 for real-time performance.
 */
const DEFAULT_GRID_WIDTH = 72;

/**
 * DEFAULT_GRID_HEIGHT - Number of cells vertically
 * 
 * Should typically match width for square display.
 */
const DEFAULT_GRID_HEIGHT = 72;

/**
 * DEFAULT_CHANNELS - Number of state channels per cell
 * 
 * Channels 0-3: RGBA visual channels (red, green, blue, alpha)
 * Channels 4-15: Hidden state channels for computation
 * 
 * More channels = more expressive patterns but O(C^2) more computation.
 */
const DEFAULT_CHANNELS = 16;

/**
 * DEFAULT_HIDDEN_SIZE - Hidden layer size in neural network
 * 
 * Larger = more complex behaviors but slower updates.
 * 128 provides good balance of expressiveness and speed.
 */
const DEFAULT_HIDDEN_SIZE = 128;

/**
 * DEFAULT_FIRE_RATE - Probability that a cell updates each step
 * 
 * Value 0.5 means each cell has 50% chance to update.
 * This stochastic update enables asynchronous behavior and robustness.
 * Lower values = slower but more stable growth.
 */
const DEFAULT_FIRE_RATE = 0.5;

/**
 * ALIVE_THRESHOLD - Minimum alpha value for a cell to be considered alive
 * 
 * Cells with max-pooled alpha below this are treated as dead.
 * Used to prevent gradual "ghost" cells from accumulating.
 */
const ALIVE_THRESHOLD = 0.1;

/* -----------------------------------------------------------------------------
 * SECTION 2: SOBEL KERNELS
 * -----------------------------------------------------------------------------
 * Sobel operators detect intensity gradients in the cell state.
 * These enable cells to perceive their neighborhood structure.
 * -------------------------------------------------------------------------- */

/**
 * SOBEL_X - Horizontal gradient detection kernel
 * 
 * Detects vertical edges (horizontal intensity changes).
 * Kernel values sum to 0 for edge detection properties.
 * Division by 8 normalizes output range.
 * 
 * Mathematical form:
 *   | 1  0 -1 |
 *   | 2  0 -2 | * (1/8)
 *   | 1  0 -1 |
 */
const SOBEL_X = [
    [0.125, 0.0, -0.125],  // Row 0: top neighbors
    [0.25, 0.0, -0.25],   // Row 1: horizontal neighbors (stronger weight)
    [0.125, 0.0, -0.125]   // Row 2: bottom neighbors
];

/**
 * SOBEL_Y - Vertical gradient detection kernel
 * 
 * Detects horizontal edges (vertical intensity changes).
 * Transpose of SOBEL_X kernel.
 */
const SOBEL_Y = [
    [0.125, 0.25, 0.125],   // Row 0: top neighbors (positive)
    [0.0, 0.0, 0.0],     // Row 1: center row (zero contribution)
    [-0.125, -0.25, -0.125]    // Row 2: bottom neighbors (negative)
];

/* -----------------------------------------------------------------------------
 * SECTION 3: NEURAL CELLULAR AUTOMATA CLASS
 * -----------------------------------------------------------------------------
 * Main simulation class encapsulating all NCA logic.
 * -------------------------------------------------------------------------- */

class NeuralCellularAutomata {

    /* -------------------------------------------------------------------------
     * CONSTRUCTOR
     * -------------------------------------------------------------------------
     * Initializes the NCA simulation with given parameters.
     * 
     * Algorithm:
     *   1. Store configuration parameters
     *   2. Set up canvas rendering context
     *   3. Initialize neural network weights
     *   4. Create empty grid
     *   5. Set up obstacle system integration
     * 
     * Complexity: O(inputSize * hiddenSize + hiddenSize * channels) for weight init
     * Memory: Allocates grid array + weight matrices
     * 
     * @param {string} canvasId - DOM ID of canvas element to render to
     * @param {Object} options - Configuration options (see defaults above)
     * ----------------------------------------------------------------------- */
    constructor(canvasId, options = {}) {

        // ===== STEP 1: Store canvas reference =====
        // The canvas is our rendering target. We get the 2D context for drawing.
        // Using 2D context (not WebGL) for simplicity and broad compatibility.
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');

        // ===== STEP 2: Store grid dimensions =====
        // These define the simulation resolution. Larger = more detail but slower.
        this.gridWidth = options.gridWidth || DEFAULT_GRID_WIDTH;
        this.gridHeight = options.gridHeight || DEFAULT_GRID_HEIGHT;
        this.channels = options.channels || DEFAULT_CHANNELS;

        // ===== STEP 3: Calculate pixel size for rendering =====
        // Each grid cell is rendered as a pixelSize x pixelSize square.
        // Larger pixels = chunkier look but faster rendering.
        this.pixelSize = options.pixelSize || 8;
        this.canvas.width = this.gridWidth * this.pixelSize;
        this.canvas.height = this.gridHeight * this.pixelSize;

        // ===== STEP 4: Store simulation parameters =====
        this.fireRate = options.fireRate || DEFAULT_FIRE_RATE;
        this.stepsPerFrame = options.stepsPerFrame || 1;
        this.hiddenSize = options.hiddenSize || DEFAULT_HIDDEN_SIZE;

        // ===== STEP 5: Initialize state tracking =====
        // These track simulation progress for UI display.
        this.grid = null;           // Main grid data (Float32Array)
        this.isRunning = false;     // Animation loop control
        this.stepCount = 0;         // Total simulation steps taken
        this.lastFrameTime = 0;     // For FPS calculation
        this.fps = 0;               // Frames per second

        // ===== STEP 6: Obstacle system reference =====
        // Will be set by ObstacleSystem when attached.
        // Allows NCA to query obstacles during perception/update.
        this.obstacleSystem = null;

        // ===== STEP 7: Event callbacks =====
        // These allow external systems to hook into simulation events.
        this.onUpdate = null;       // Called after each frame with stats
        this.onCellUpdate = null;   // Called during cell updates for explanation panel

        // ===== STEP 8: Memory tracking =====
        // Used by MemoryMonitor to track allocations.
        this.memoryStats = {
            gridBytes: 0,
            peakBytes: 0,
            allocations: 0
        };

        // ===== STEP 9: Initialize neural network =====
        // Weights define how cells process their perceptions.
        this.initializeWeights();

        // ===== STEP 10: Create initial grid =====
        this.reset('center');
    }

    /* -------------------------------------------------------------------------
     * initializeWeights
     * -------------------------------------------------------------------------
     * Creates neural network weight matrices for the update rule.
     * 
     * Network architecture:
     *   Input: channels * 3 (identity + sobelX + sobelY perception)
     *   Hidden: hiddenSize neurons with ReLU activation
     *   Output: channels (state delta to apply)
     * 
     * Algorithm:
     *   1. Calculate input size from channels
     *   2. Use Xavier initialization for first layer (prevents vanishing gradients)
     *   3. Initialize second layer to zeros (starts with no updates)
     * 
     * Complexity: O(inputSize * hiddenSize + hiddenSize * channels)
     * Memory: inputSize * hiddenSize + hiddenSize + hiddenSize * channels floats
     * 
     * Efficiency Notes:
     *   - Xavier initialization keeps gradients in reasonable range
     *   - Zero initialization of output layer ensures stable start
     *   - Using regular arrays for weights (fast enough for this size)
     * ----------------------------------------------------------------------- */
    initializeWeights() {

        // ===== STEP 1: Calculate network dimensions =====
        // Input is concatenation of: identity (C) + sobelX (C) + sobelY (C) = 3C
        const inputSize = this.channels * 3;

        // ===== STEP 2: Xavier scaling factors =====
        // Xavier/Glorot initialization: weights ~ N(0, sqrt(2/(fan_in + fan_out)))
        // This keeps activations and gradients at reasonable magnitudes.
        const scale1 = Math.sqrt(2.0 / (inputSize + this.hiddenSize));
        const scale2 = Math.sqrt(2.0 / (this.hiddenSize + this.channels));

        // ===== STEP 3: Create first layer (input -> hidden) =====
        // Shape: [inputSize, hiddenSize] = [48, 128] by default
        // Each element is random value in [-scale1, scale1]
        this.weights1 = this.createMatrix(
            inputSize,
            this.hiddenSize,
            () => (Math.random() - 0.5) * 2 * scale1
        );

        // ===== STEP 4: Create first layer bias =====
        // Shape: [hiddenSize] = [128]
        // Initialize to zero (common practice for biases)
        this.bias1 = new Float32Array(this.hiddenSize).fill(0);

        // ===== STEP 5: Create second layer (hidden -> output) =====
        // Shape: [hiddenSize, channels] = [128, 16]
        // Initialize to ZEROS - this is intentional!
        // Zero weights mean no updates initially, allowing stable seeding.
        // As the network is "trained" (in our case, we use pre-defined behavior),
        // these weights determine how perceptions map to state changes.
        this.weights2 = this.createMatrix(
            this.hiddenSize,
            this.channels,
            () => (Math.random() - 0.5) * 2 * scale2 * 0.1  // Small random values
        );

        // ===== STEP 6: Update memory tracking =====
        const weight1Bytes = inputSize * this.hiddenSize * 4;
        const bias1Bytes = this.hiddenSize * 4;
        const weight2Bytes = this.hiddenSize * this.channels * 4;
        this.memoryStats.allocations += 3;
    }

    /* -------------------------------------------------------------------------
     * createMatrix
     * -------------------------------------------------------------------------
     * Utility function to create a 2D matrix as array of Float32Arrays.
     * 
     * Why Float32Array?
     *   - 4 bytes per element (vs 8 for regular JS numbers)
     *   - Contiguous memory layout for cache efficiency
     *   - Faster iteration than nested regular arrays
     * 
     * Complexity: O(rows * cols)
     * Memory: rows * cols * 4 bytes
     * 
     * @param {number} rows - Number of rows in matrix
     * @param {number} cols - Number of columns in matrix
     * @param {Function} initFn - Function returning initial value for each cell
     * @returns {Array<Float32Array>} 2D matrix
     * ----------------------------------------------------------------------- */
    createMatrix(rows, cols, initFn = () => 0) {

        // Create array to hold row arrays
        const matrix = new Array(rows);

        // For each row, create a Float32Array column
        for (let i = 0; i < rows; i++) {
            matrix[i] = new Float32Array(cols);

            // Initialize each element with provided function
            for (let j = 0; j < cols; j++) {
                matrix[i][j] = initFn();
            }
        }

        return matrix;
    }

    /* -------------------------------------------------------------------------
     * reset
     * -------------------------------------------------------------------------
     * Reset the grid to an initial seed pattern.
     * 
     * Algorithm:
     *   1. Allocate new grid array (zeros)
     *   2. Reset step counter
     *   3. Place seed(s) based on pattern type
     *   4. Update memory stats
     *   5. Render initial state
     * 
     * Complexity: O(gridWidth * gridHeight * channels) for allocation
     * Memory: Replaces existing grid with new allocation
     * 
     * @param {string} pattern - One of: 'center', 'random', 'ring', 'corners'
     * ----------------------------------------------------------------------- */
    reset(pattern = 'center') {

        // ===== STEP 1: Allocate new grid =====
        // Total size: width * height * channels floats
        // Using Float32Array for memory efficiency and typed operations
        const gridSize = this.gridWidth * this.gridHeight * this.channels;
        this.grid = new Float32Array(gridSize);

        // ===== STEP 2: Update memory tracking =====
        this.memoryStats.gridBytes = gridSize * 4;  // 4 bytes per float
        this.memoryStats.allocations++;

        // ===== STEP 3: Reset counters =====
        this.stepCount = 0;

        // ===== STEP 4: Place seeds based on pattern =====
        switch (pattern) {

            case 'center':
                // Single seed in center of grid
                // This is the classic NCA starting point
                this.setSeedAt(
                    Math.floor(this.gridWidth / 2),
                    Math.floor(this.gridHeight / 2)
                );
                break;

            case 'random':
                // Multiple random seeds scattered across grid
                // Creates more chaotic, multi-origin growth
                for (let i = 0; i < 5; i++) {
                    // Keep seeds away from edges (10px margin)
                    const x = Math.floor(Math.random() * (this.gridWidth - 20)) + 10;
                    const y = Math.floor(Math.random() * (this.gridHeight - 20)) + 10;
                    this.setSeedAt(x, y);
                }
                break;

            case 'ring':
                // Seeds arranged in a circle
                // Creates interesting interference patterns as they grow inward
                const cx = this.gridWidth / 2;
                const cy = this.gridHeight / 2;
                const radius = Math.min(cx, cy) * 0.6;

                // Place seed every 0.3 radians around circle
                for (let angle = 0; angle < Math.PI * 2; angle += 0.3) {
                    const x = Math.floor(cx + Math.cos(angle) * radius);
                    const y = Math.floor(cy + Math.sin(angle) * radius);
                    this.setSeedAt(x, y);
                }
                break;

            case 'corners':
                // Four seeds in corners
                // Good for testing obstacle avoidance (place obstacle in center)
                const margin = 15;
                this.setSeedAt(margin, margin);
                this.setSeedAt(this.gridWidth - margin, margin);
                this.setSeedAt(margin, this.gridHeight - margin);
                this.setSeedAt(this.gridWidth - margin, this.gridHeight - margin);
                break;
        }

        // ===== STEP 5: Render initial state =====
        this.render();
    }

    /* -------------------------------------------------------------------------
     * setSeedAt
     * -------------------------------------------------------------------------
     * Place a seed cell at the specified grid position.
     * 
     * A "seed" is a cell with alpha and hidden channels set to 1.0.
     * This marks the cell as alive and gives the neural network
     * non-zero input to start producing updates.
     * 
     * Algorithm:
     *   1. Bounds check
     *   2. Calculate array index
     *   3. Set channels 3+ to 1.0 (alpha and hidden state)
     * 
     * Complexity: O(channels)
     * Memory: No allocation
     * 
     * @param {number} x - Grid x coordinate (0 to gridWidth-1)
     * @param {number} y - Grid y coordinate (0 to gridHeight-1)
     * ----------------------------------------------------------------------- */
    setSeedAt(x, y) {

        // ===== STEP 1: Bounds check =====
        // Prevent array out-of-bounds access
        if (x < 0 || x >= this.gridWidth || y < 0 || y >= this.gridHeight) {
            return;
        }

        // ===== STEP 2: Check for obstacles =====
        // Don't place seeds on obstacle cells
        if (this.obstacleSystem && this.obstacleSystem.isObstacle(x, y)) {
            return;
        }

        // ===== STEP 3: Calculate array index =====
        // Grid is stored as flat array: [(y * width + x) * channels + c]
        const baseIndex = (y * this.gridWidth + x) * this.channels;

        // ===== STEP 4: Set alpha and hidden channels =====
        // Channels 0-2 (RGB) stay at 0 initially
        // Channel 3 (alpha) = 1.0 marks cell as alive
        // Channels 4-15 (hidden) = 1.0 provides initial state
        for (let c = 3; c < this.channels; c++) {
            this.grid[baseIndex + c] = 1.0;
        }
    }

    /* -------------------------------------------------------------------------
     * getCell
     * -------------------------------------------------------------------------
     * Read a single channel value from a grid cell.
     * 
     * Used extensively in perception and rendering.
     * Returns 0 for out-of-bounds coordinates (implicit zero-padding).
     * 
     * Complexity: O(1)
     * Memory: No allocation
     * 
     * @param {number} x - Grid x coordinate
     * @param {number} y - Grid y coordinate
     * @param {number} c - Channel index (0 to channels-1)
     * @returns {number} Channel value at position, or 0 if out of bounds
     * ----------------------------------------------------------------------- */
    getCell(x, y, c) {
        // Return 0 for out-of-bounds (zero-padding behavior)
        if (x < 0 || x >= this.gridWidth || y < 0 || y >= this.gridHeight) {
            return 0;
        }

        // Calculate flat array index and return value
        return this.grid[(y * this.gridWidth + x) * this.channels + c];
    }

    /* -------------------------------------------------------------------------
     * setCell
     * -------------------------------------------------------------------------
     * Write a single channel value to a grid cell.
     * 
     * Complexity: O(1)
     * Memory: No allocation
     * 
     * @param {number} x - Grid x coordinate
     * @param {number} y - Grid y coordinate
     * @param {number} c - Channel index
     * @param {number} value - Value to write
     * ----------------------------------------------------------------------- */
    setCell(x, y, c, value) {
        if (x < 0 || x >= this.gridWidth || y < 0 || y >= this.gridHeight) {
            return;
        }
        this.grid[(y * this.gridWidth + x) * this.channels + c] = value;
    }

    /* -------------------------------------------------------------------------
     * isAlive
     * -------------------------------------------------------------------------
     * Check if a cell is considered "alive" based on neighborhood alpha.
     *
     * Uses max-pooling over 3x3 neighborhood of the alpha channel:
     * A cell is alive if ANY cell in its neighborhood has alpha > ALIVE_THRESHOLD.
     *
     * This prevents "orphan" cells and creates smooth boundaries.
     * 
     * Algorithm:
     *   1. Iterate over 3x3 neighborhood
     *   2. Track maximum alpha value
     *   3. Compare to threshold
     * 
     * Complexity: O(9) = O(1) constant
     * Memory: No allocation
     * 
     * @param {number} x - Grid x coordinate
     * @param {number} y - Grid y coordinate
     * @returns {boolean} True if cell should update
     * ----------------------------------------------------------------------- */
    isAlive(x, y) {
        let maxAlpha = 0;

        // Check 3x3 neighborhood
        for (let dy = -1; dy <= 1; dy++) {
            for (let dx = -1; dx <= 1; dx++) {
                // Alpha is channel 3
                const alpha = this.getCell(x + dx, y + dy, 3);
                maxAlpha = Math.max(maxAlpha, alpha);
            }
        }

        return maxAlpha > ALIVE_THRESHOLD;
    }

    /* -------------------------------------------------------------------------
     * perceive
     * -------------------------------------------------------------------------
     * Compute the perception vector for a cell.
     *
     * The perception concatenates three views of each channel:
     *   1. Identity: The cell's own values
     *   2. Sobel X: Horizontal gradient (detects vertical edges)
     *   3. Sobel Y: Vertical gradient (detects horizontal edges)
     *
     * This gives cells information about their local structure.
     * 
     * Algorithm:
     *   For each channel c:
     *     1. Copy identity value (center cell)
     *     2. Apply Sobel X convolution
     *     3. Apply Sobel Y convolution
     *     (Optional) Add obstacle gradient if obstacle system attached
     *
     * Complexity: O(channels * 9 * 2) = O(288) for default 16 channels
     * Memory: Allocates Float32Array of size channels * 3 = 48 floats = 192 bytes
     *
     * Efficiency Notes:
     *   - Convolution kernels are pre-computed constants
     *   - Uses flat array access for cache efficiency
     * 
     * @param {number} x - Grid x coordinate
     * @param {number} y - Grid y coordinate
     * @returns {Float32Array} Perception vector of length channels * 3
     * ----------------------------------------------------------------------- */
    perceive(x, y) {

        // ===== STEP 1: Allocate perception array =====
        const perceptionSize = this.channels * 3;
        const perception = new Float32Array(perceptionSize);

        // ===== STEP 2: For each channel, compute identity and gradients =====
        for (let c = 0; c < this.channels; c++) {

            // ----- Identity: just the cell's own value -----
            perception[c] = this.getCell(x, y, c);

            // ----- Sobel X: horizontal gradient -----
            // Convolve channel with SOBEL_X kernel
            let sobelX = 0;
            for (let ky = 0; ky < 3; ky++) {
                for (let kx = 0; kx < 3; kx++) {
                    const nx = x + kx - 1;  // Offset to center kernel
                    const ny = y + ky - 1;
                    sobelX += this.getCell(nx, ny, c) * SOBEL_X[ky][kx];
                }
            }
            perception[c + this.channels] = sobelX;

            // ----- Sobel Y: vertical gradient -----
            let sobelY = 0;
            for (let ky = 0; ky < 3; ky++) {
                for (let kx = 0; kx < 3; kx++) {
                    const nx = x + kx - 1;
                    const ny = y + ky - 1;
                    sobelY += this.getCell(nx, ny, c) * SOBEL_Y[ky][kx];
                }
            }
            perception[c + this.channels * 2] = sobelY;
        }

        // ===== STEP 3: Add obstacle information if available =====
        if (this.obstacleSystem) {
            // Get obstacle gradient at this position
            const obstacleGrad = this.obstacleSystem.getGradient(x, y);

            // Inject obstacle information into perception
            // We modify the last few channels to encode obstacle proximity
            if (obstacleGrad) {
                // Scale and add to hidden channels
                perception[this.channels - 2] += obstacleGrad.x * 2;
                perception[this.channels - 1] += obstacleGrad.y * 2;
            }
        }

        return perception;
    }

    /* -------------------------------------------------------------------------
     * forwardPass
     * -------------------------------------------------------------------------
     * Run the neural network to compute state update delta.
     *
     * Network: perception -> Dense+ReLU -> Dense -> delta
     *
     * Algorithm:
     *   1. Compute hidden = ReLU(perception @ weights1 + bias1)
     *   2. Compute delta = hidden @ weights2
     *   3. Return delta
     *
     * Complexity:
     *   Layer 1: O(inputSize * hiddenSize) = O(48 * 128) = O(6144)
     *   Layer 2: O(hiddenSize * channels) = O(128 * 16) = O(2048)
     *   Total: O(8192) per cell
     *
     * Memory: Allocates hidden array (128 floats) + output array (16 floats)
     * 
     * @param {Float32Array} perception - Input perception vector
     * @returns {Float32Array} State delta vector of length channels
     * ----------------------------------------------------------------------- */
    forwardPass(perception) {

        // ===== LAYER 1: Dense + ReLU =====
        // hidden = ReLU(perception @ weights1 + bias1)
        const hidden = new Float32Array(this.hiddenSize);

        for (let j = 0; j < this.hiddenSize; j++) {
            let sum = this.bias1[j];

            // Matrix multiplication: sum over input dimension
            for (let i = 0; i < perception.length; i++) {
                sum += perception[i] * this.weights1[i][j];
            }

            // ReLU activation: max(0, x)
            // This introduces non-linearity, allowing complex mappings
            hidden[j] = Math.max(0, sum);
        }

        // ===== LAYER 2: Dense (no activation) =====
        // delta = hidden @ weights2
        const delta = new Float32Array(this.channels);

        for (let j = 0; j < this.channels; j++) {
            let sum = 0;

            for (let i = 0; i < this.hiddenSize; i++) {
                sum += hidden[i] * this.weights2[i][j];
            }

            delta[j] = sum;
        }

        return delta;
    }

    /* -------------------------------------------------------------------------
     * step
     * -------------------------------------------------------------------------
     * Execute one simulation step, updating all cells.
     *
     * Algorithm:
     *   1. Pre-compute alive mask for all cells
     *   2. Create new grid for double-buffering
     *   3. For each alive cell:
     *      a. Check stochastic fire rate
     *      b. Compute perception
     *      c. Run neural network forward pass
     *      d. Add delta to cell state
     *   4. Apply post-update alive mask
     *   5. Swap to new grid
     *
     * Complexity: O(W * H * (perception + forward_pass)) = O(W * H * C^2)
     * Memory: Allocates new grid array for double-buffering
     *
     * Double-Buffering:
     *   We compute updates into a NEW grid while reading from the OLD grid.
     *   This prevents artifacts from update order dependencies.
     *   All cells see the state from the previous step, not partial updates.
     * ----------------------------------------------------------------------- */
    step() {

        // ===== STEP 1: Allocate new grid for double-buffering =====
        const newGrid = new Float32Array(this.grid.length);
        this.memoryStats.allocations++;

        // ===== STEP 2: Pre-compute alive mask =====
        // This uses the OLD grid state, before any updates
        const preAlive = new Uint8Array(this.gridWidth * this.gridHeight);

        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                preAlive[y * this.gridWidth + x] = this.isAlive(x, y) ? 1 : 0;
            }
        }

        // ===== STEP 3: Track cells updated for explanation panel =====
        let cellsUpdated = 0;
        let cellsSkippedDead = 0;
        let cellsSkippedFire = 0;

        // ===== STEP 4: Update each cell =====
        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                const baseIdx = (y * this.gridWidth + x) * this.channels;

                // ----- Check if cell is alive -----
                if (!preAlive[y * this.gridWidth + x]) {
                    cellsSkippedDead++;
                    continue;  // Dead cells don't update
                }

                // ----- Check for obstacles -----
                if (this.obstacleSystem && this.obstacleSystem.isObstacle(x, y)) {
                    // Copy existing values but don't update
                    for (let c = 0; c < this.channels; c++) {
                        newGrid[baseIdx + c] = 0;  // Clear cells on obstacles
                    }
                    continue;
                }

                // ----- Stochastic update (cell fire rate) -----
                if (Math.random() > this.fireRate) {
                    cellsSkippedFire++;
                    // Cell doesn't fire this step, copy current values
                    for (let c = 0; c < this.channels; c++) {
                        newGrid[baseIdx + c] = this.grid[baseIdx + c];
                    }
                    continue;
                }

                // ----- Compute perception -----
                const perception = this.perceive(x, y);

                // ----- Neural network forward pass -----
                const delta = this.forwardPass(perception);

                // ----- Apply update: new_state = old_state + delta -----
                for (let c = 0; c < this.channels; c++) {
                    newGrid[baseIdx + c] = this.grid[baseIdx + c] + delta[c];
                }

                cellsUpdated++;
            }
        }

        // ===== STEP 5: Post-update alive masking =====
        // Kill cells that ended up with low alpha in neighborhood
        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                const baseIdx = (y * this.gridWidth + x) * this.channels;

                // Check neighborhood alpha in NEW grid
                let maxAlpha = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        const nx = x + dx;
                        const ny = y + dy;
                        if (nx >= 0 && nx < this.gridWidth && ny >= 0 && ny < this.gridHeight) {
                            const nIdx = (ny * this.gridWidth + nx) * this.channels;
                            maxAlpha = Math.max(maxAlpha, newGrid[nIdx + 3]);
                        }
                    }
                }

                // Zero out cells with no alive neighbors
                if (maxAlpha <= ALIVE_THRESHOLD) {
                    for (let c = 0; c < this.channels; c++) {
                        newGrid[baseIdx + c] = 0;
                    }
                }
            }
        }

        // ===== STEP 6: Swap grids =====
        this.grid = newGrid;
        this.stepCount++;

        // ===== STEP 7: Emit update event for explanation panel =====
        if (this.onCellUpdate) {
            this.onCellUpdate({
                step: this.stepCount,
                cellsUpdated: cellsUpdated,
                cellsSkippedDead: cellsSkippedDead,
                cellsSkippedFire: cellsSkippedFire,
                totalCells: this.gridWidth * this.gridHeight
            });
        }
    }

    /* -------------------------------------------------------------------------
     * toRGB
     * -------------------------------------------------------------------------
     * Convert cell state to RGB color values for rendering.
     *
     * The first 4 channels are treated as RGBA (premultiplied alpha):
     *   - Channel 0: Red
     *   - Channel 1: Green
     *   - Channel 2: Blue
     *   - Channel 3: Alpha
     *
     * Premultiplied alpha means RGB values are already scaled by alpha.
     * To display, we composite against white background.
     *
     * Formula: displayed = (1 - alpha) * 1.0 + rgb
     *
     * Complexity: O(1)
     * Memory: No allocation (returns object)
     * 
     * @param {number} x - Grid x coordinate
     * @param {number} y - Grid y coordinate
     * @returns {Object} {r, g, b} values in range 0-255
     * ----------------------------------------------------------------------- */
    toRGB(x, y) {
        const baseIdx = (y * this.gridWidth + x) * this.channels;

        // Read RGBA from first 4 channels
        const r = this.grid[baseIdx];
        const g = this.grid[baseIdx + 1];
        const b = this.grid[baseIdx + 2];
        const a = Math.max(0, Math.min(this.grid[baseIdx + 3], 0.9999));

        // Composite against white background
        // For premultiplied alpha: result = (1 - a) * bg + rgb
        return {
            r: Math.floor(Math.max(0, Math.min((1.0 - a + r) * 255, 255))),
            g: Math.floor(Math.max(0, Math.min((1.0 - a + g) * 255, 255))),
            b: Math.floor(Math.max(0, Math.min((1.0 - a + b) * 255, 255)))
        };
    }

    /* -------------------------------------------------------------------------
     * render
     * -------------------------------------------------------------------------
     * Draw the current grid state to the canvas.
     *
     * Algorithm:
     *   1. Create ImageData buffer
     *   2. For each grid cell:
     *      a. Convert to RGB
     *      b. Fill all pixels in the cell's block
     *   3. Render obstacles if present
     *   4. Put ImageData to canvas
     *
     * Complexity: O(gridWidth * gridHeight * pixelSize^2)
     * Memory: Allocates ImageData (width * height * 4 bytes)
     *
     * Efficiency Notes:
     *   - Using ImageData is faster than individual fillRect calls
     *   - Pixel loop is unrolled for cache efficiency
     * ----------------------------------------------------------------------- */
    render() {

        // ===== STEP 1: Create image buffer =====
        const imageData = this.ctx.createImageData(this.canvas.width, this.canvas.height);
        const data = imageData.data;

        // ===== STEP 2: Fill pixel data for each cell =====
        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {

                // Get cell color
                const rgb = this.toRGB(x, y);

                // Check for obstacle overlay
                let isObstacle = false;
                let obstacleType = null;
                if (this.obstacleSystem) {
                    obstacleType = this.obstacleSystem.getObstacleType(x, y);
                    isObstacle = obstacleType !== null;
                }

                // Fill the pixel block for this cell
                for (let py = 0; py < this.pixelSize; py++) {
                    for (let px = 0; px < this.pixelSize; px++) {
                        const canvasX = x * this.pixelSize + px;
                        const canvasY = y * this.pixelSize + py;
                        const i = (canvasY * this.canvas.width + canvasX) * 4;

                        if (isObstacle) {
                            // Render obstacle with distinct colors
                            switch (obstacleType) {
                                case 'wall':
                                    data[i] = 60;      // Dark gray
                                    data[i + 1] = 60;
                                    data[i + 2] = 70;
                                    break;
                                case 'repulsor':
                                    data[i] = 180;     // Red tint
                                    data[i + 1] = 60;
                                    data[i + 2] = 60;
                                    break;
                                case 'attractor':
                                    data[i] = 60;      // Green tint
                                    data[i + 1] = 180;
                                    data[i + 2] = 60;
                                    break;
                                default:
                                    data[i] = rgb.r;
                                    data[i + 1] = rgb.g;
                                    data[i + 2] = rgb.b;
                            }
                        } else {
                            data[i] = rgb.r;
                            data[i + 1] = rgb.g;
                            data[i + 2] = rgb.b;
                        }
                        data[i + 3] = 255;  // Full opacity
                    }
                }
            }
        }

        // ===== STEP 3: Draw to canvas =====
        this.ctx.putImageData(imageData, 0, 0);
    }

    /* -------------------------------------------------------------------------
     * draw
     * -------------------------------------------------------------------------
     * Add seed cells at a canvas position (for user interaction).
     *
     * Converts canvas coordinates to grid coordinates and places seeds
     * in a circular brush pattern.
     *
     * Complexity: O(radius^2)
     * Memory: No allocation
     * 
     * @param {number} canvasX - Canvas x coordinate (pixels)
     * @param {number} canvasY - Canvas y coordinate (pixels)
     * @param {number} radius - Brush radius in grid cells
     * ----------------------------------------------------------------------- */
    draw(canvasX, canvasY, radius = 3) {
        // Convert canvas coords to grid coords
        const gridX = Math.floor(canvasX / this.pixelSize);
        const gridY = Math.floor(canvasY / this.pixelSize);

        // Place seeds in circular pattern
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                // Check if within circle
                if (dx * dx + dy * dy <= radius * radius) {
                    this.setSeedAt(gridX + dx, gridY + dy);
                }
            }
        }
    }

    /* -------------------------------------------------------------------------
     * erase
     * -------------------------------------------------------------------------
     * Remove cells at a canvas position (for user interaction).
     *
     * Complexity: O(radius^2 * channels)
     * Memory: No allocation
     * 
     * @param {number} canvasX - Canvas x coordinate (pixels)
     * @param {number} canvasY - Canvas y coordinate (pixels)
     * @param {number} radius - Eraser radius in grid cells
     * ----------------------------------------------------------------------- */
    erase(canvasX, canvasY, radius = 3) {
        const gridX = Math.floor(canvasX / this.pixelSize);
        const gridY = Math.floor(canvasY / this.pixelSize);

        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                if (dx * dx + dy * dy <= radius * radius) {
                    const x = gridX + dx;
                    const y = gridY + dy;

                    // Bounds check
                    if (x >= 0 && x < this.gridWidth && y >= 0 && y < this.gridHeight) {
                        const baseIdx = (y * this.gridWidth + x) * this.channels;

                        // Zero all channels
                        for (let c = 0; c < this.channels; c++) {
                            this.grid[baseIdx + c] = 0;
                        }
                    }
                }
            }
        }
    }

    /* -------------------------------------------------------------------------
     * animate
     * -------------------------------------------------------------------------
     * Main animation loop callback.
     *
     * Called by requestAnimationFrame. Runs simulation steps and renders.
     * 
     * @param {number} timestamp - DOMHighResTimeStamp from requestAnimationFrame
     * ----------------------------------------------------------------------- */
    animate(timestamp) {
        if (!this.isRunning) return;

        // Calculate FPS
        if (this.lastFrameTime) {
            const delta = timestamp - this.lastFrameTime;
            this.fps = Math.round(1000 / delta);
        }
        this.lastFrameTime = timestamp;

        // Run simulation steps
        for (let i = 0; i < this.stepsPerFrame; i++) {
            this.step();
        }

        // Render
        this.render();

        // Callback for UI updates
        if (this.onUpdate) {
            this.onUpdate(this.fps, this.stepCount, this.memoryStats);
        }

        // Continue animation loop
        requestAnimationFrame((t) => this.animate(t));
    }

    /* -------------------------------------------------------------------------
     * start / stop / toggle / singleStep
     * -------------------------------------------------------------------------
     * Animation control methods.
     * ----------------------------------------------------------------------- */

    start() {
        if (this.isRunning) return;
        this.isRunning = true;
        this.lastFrameTime = 0;
        requestAnimationFrame((t) => this.animate(t));
    }

    stop() {
        this.isRunning = false;
    }

    toggle() {
        if (this.isRunning) {
            this.stop();
        } else {
            this.start();
        }
        return this.isRunning;
    }

    singleStep() {
        this.step();
        this.render();
        if (this.onUpdate) {
            this.onUpdate(this.fps, this.stepCount, this.memoryStats);
        }
    }

    setSpeed(stepsPerFrame) {
        this.stepsPerFrame = Math.max(1, Math.min(10, stepsPerFrame));
    }

    /* -------------------------------------------------------------------------
     * getMemoryUsage
     * -------------------------------------------------------------------------
     * Calculate current memory usage for monitoring.
     *
     * @returns {Object} Memory statistics
     * ----------------------------------------------------------------------- */
    getMemoryUsage() {
        const gridBytes = this.grid ? this.grid.length * 4 : 0;
        const weight1Bytes = this.channels * 3 * this.hiddenSize * 4;
        const weight2Bytes = this.hiddenSize * this.channels * 4;
        const biasBytes = this.hiddenSize * 4;

        const totalBytes = gridBytes + weight1Bytes + weight2Bytes + biasBytes;

        return {
            gridBytes: gridBytes,
            weightsBytes: weight1Bytes + weight2Bytes + biasBytes,
            totalBytes: totalBytes,
            peakBytes: Math.max(this.memoryStats.peakBytes, totalBytes),
            allocations: this.memoryStats.allocations
        };
    }

    /* -------------------------------------------------------------------------
     * attachObstacleSystem
     * -------------------------------------------------------------------------
     * Connect an obstacle system to the NCA for collision detection.
     * 
     * @param {ObstacleSystem} obstacleSystem - Obstacle system instance
     * ----------------------------------------------------------------------- */
    attachObstacleSystem(obstacleSystem) {
        this.obstacleSystem = obstacleSystem;
    }
}

// Export to global scope for use by other modules
window.NeuralCellularAutomata = NeuralCellularAutomata;

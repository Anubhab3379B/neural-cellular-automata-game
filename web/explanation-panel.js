/**
 * =============================================================================
 * EXPLANATION-PANEL.JS - Real-time Algorithm Explanation Display
 * =============================================================================
 * 
 * This module provides educational feedback about the NCA simulation.
 * It displays what the algorithm is doing at each step, helping users
 * understand the mechanics of cellular automata.
 * 
 * DISPLAYED INFORMATION:
 * ----------------------
 *   1. Current simulation step number
 *   2. Cells updated vs skipped (dead, fire rate)
 *   3. Algorithm phase (perceive, forward pass, update, mask)
 *   4. Obstacle interaction details
 *   5. Neural network layer activations (simplified)
 * 
 * UPDATE FREQUENCY:
 * -----------------
 * The panel updates every frame to reflect real-time simulation state.
 * Heavy computations (like activation visualization) are throttled.
 * 
 * =============================================================================
 */

/* -----------------------------------------------------------------------------
 * SECTION 1: CONFIGURATION
 * -------------------------------------------------------------------------- */

/**
 * UPDATE_THROTTLE_MS - Minimum time between expensive UI updates
 * Prevents UI from consuming too much CPU during fast simulation.
 */
const UPDATE_THROTTLE_MS = 100;

/**
 * MAX_HISTORY_ENTRIES - Number of log entries to keep
 * Older entries are removed to prevent memory growth.
 */
const MAX_HISTORY_ENTRIES = 50;

/* -----------------------------------------------------------------------------
 * SECTION 2: EXPLANATION PANEL CLASS
 * -------------------------------------------------------------------------- */

class ExplanationPanel {

    /* -------------------------------------------------------------------------
     * CONSTRUCTOR
     * -------------------------------------------------------------------------
     * Initialize the explanation panel.
     * 
     * Algorithm:
     *   1. Get DOM element reference
     *   2. Create internal state for tracking
     *   3. Set up event listeners
     * 
     * @param {string} containerId - DOM ID of the panel container
     * ----------------------------------------------------------------------- */
    constructor(containerId) {

        // ===== STEP 1: Get container element =====
        this.container = document.getElementById(containerId);

        // ===== STEP 2: Initialize state =====
        this.lastUpdateTime = 0;
        this.currentStep = 0;
        this.history = [];

        // ===== STEP 3: Statistics accumulators =====
        this.stats = {
            totalCellsUpdated: 0,
            totalCellsSkippedDead: 0,
            totalCellsSkippedFire: 0,
            obstacleInteractions: 0
        };

        // ===== STEP 4: Create panel structure =====
        this.createPanelStructure();
    }

    /* -------------------------------------------------------------------------
     * createPanelStructure
     * -------------------------------------------------------------------------
     * Build the HTML structure for the explanation panel.
     * ----------------------------------------------------------------------- */
    createPanelStructure() {

        if (!this.container) return;

        this.container.innerHTML = `
            <div class="explanation-header">
                <h3>Algorithm State</h3>
            </div>
            
            <div class="explanation-section">
                <div class="stat-row">
                    <span class="stat-label">Step</span>
                    <span class="stat-value" id="exp-step">0</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Cells Updated</span>
                    <span class="stat-value" id="exp-updated">0</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Skipped (Dead)</span>
                    <span class="stat-value" id="exp-skipped-dead">0</span>
                </div>
                <div class="stat-row">
                    <span class="stat-label">Skipped (Fire)</span>
                    <span class="stat-value" id="exp-skipped-fire">0</span>
                </div>
            </div>
            
            <div class="explanation-section">
                <h4>Current Phase</h4>
                <div class="phase-indicator" id="exp-phase">Idle</div>
            </div>
            
            <div class="explanation-section">
                <h4>Algorithm Steps</h4>
                <div class="algorithm-steps" id="exp-algorithm">
                    <div class="algo-step" data-step="alive">1. Check alive mask</div>
                    <div class="algo-step" data-step="perceive">2. Compute perception</div>
                    <div class="algo-step" data-step="forward">3. Neural network</div>
                    <div class="algo-step" data-step="update">4. Apply delta</div>
                    <div class="algo-step" data-step="mask">5. Post-alive mask</div>
                </div>
            </div>
            
            <div class="explanation-section" id="exp-obstacle-section" style="display:none;">
                <h4>Obstacle Interaction</h4>
                <div id="exp-obstacle-info"></div>
            </div>
            
            <div class="explanation-section">
                <h4>Recent Events</h4>
                <div class="event-log" id="exp-log"></div>
            </div>
        `;

        // ===== Cache DOM references for fast updates =====
        this.elements = {
            step: document.getElementById('exp-step'),
            updated: document.getElementById('exp-updated'),
            skippedDead: document.getElementById('exp-skipped-dead'),
            skippedFire: document.getElementById('exp-skipped-fire'),
            phase: document.getElementById('exp-phase'),
            algorithm: document.getElementById('exp-algorithm'),
            obstacleSection: document.getElementById('exp-obstacle-section'),
            obstacleInfo: document.getElementById('exp-obstacle-info'),
            log: document.getElementById('exp-log')
        };
    }

    /* -------------------------------------------------------------------------
     * updateCellStats
     * -------------------------------------------------------------------------
     * Update the cell statistics display.
     * Called by NCA after each step.
     * 
     * @param {Object} stats - Statistics from NCA step
     * ----------------------------------------------------------------------- */
    updateCellStats(stats) {

        if (!this.elements) return;

        this.currentStep = stats.step;

        // Update cumulative stats
        this.stats.totalCellsUpdated += stats.cellsUpdated;
        this.stats.totalCellsSkippedDead += stats.cellsSkippedDead;
        this.stats.totalCellsSkippedFire += stats.cellsSkippedFire;

        // Throttle DOM updates
        const now = performance.now();
        if (now - this.lastUpdateTime < UPDATE_THROTTLE_MS) {
            return;
        }
        this.lastUpdateTime = now;

        // Update display
        this.elements.step.textContent = stats.step.toLocaleString();
        this.elements.updated.textContent = stats.cellsUpdated.toLocaleString();
        this.elements.skippedDead.textContent = stats.cellsSkippedDead.toLocaleString();
        this.elements.skippedFire.textContent = stats.cellsSkippedFire.toLocaleString();
    }

    /* -------------------------------------------------------------------------
     * setPhase
     * -------------------------------------------------------------------------
     * Highlight the current algorithm phase.
     * 
     * @param {string} phase - One of: 'alive', 'perceive', 'forward', 'update', 'mask', 'idle'
     * ----------------------------------------------------------------------- */
    setPhase(phase) {

        if (!this.elements) return;

        // Update phase indicator
        const phaseLabels = {
            'idle': 'Idle',
            'alive': 'Checking Alive Mask',
            'perceive': 'Computing Perception',
            'forward': 'Neural Network Forward Pass',
            'update': 'Applying State Delta',
            'mask': 'Post-Update Masking'
        };

        this.elements.phase.textContent = phaseLabels[phase] || phase;

        // Highlight current step in algorithm list
        const steps = this.elements.algorithm.querySelectorAll('.algo-step');
        steps.forEach(step => {
            if (step.dataset.step === phase) {
                step.classList.add('active');
            } else {
                step.classList.remove('active');
            }
        });
    }

    /* -------------------------------------------------------------------------
     * showObstacleInfo
     * -------------------------------------------------------------------------
     * Display information about an obstacle interaction.
     * 
     * @param {Object} info - Obstacle explanation from ObstacleSystem
     * ----------------------------------------------------------------------- */
    showObstacleInfo(info) {

        if (!this.elements || !info) {
            this.elements.obstacleSection.style.display = 'none';
            return;
        }

        this.elements.obstacleSection.style.display = 'block';

        let html = '';

        if (info.hasObstacle) {
            html += `<div class="obstacle-type">${info.obstacleType.toUpperCase()}</div>`;
        }

        if (info.gradient) {
            html += `<div class="gradient-display">
                Gradient: (${info.gradient.x.toFixed(3)}, ${info.gradient.y.toFixed(3)})
            </div>`;
        }

        if (info.description) {
            html += `<div class="obstacle-desc">${info.description}</div>`;
        }

        this.elements.obstacleInfo.innerHTML = html;
        this.stats.obstacleInteractions++;
    }

    /* -------------------------------------------------------------------------
     * hideObstacleInfo
     * -------------------------------------------------------------------------
     * Hide the obstacle info section.
     * ----------------------------------------------------------------------- */
    hideObstacleInfo() {
        if (this.elements) {
            this.elements.obstacleSection.style.display = 'none';
        }
    }

    /* -------------------------------------------------------------------------
     * addLogEntry
     * -------------------------------------------------------------------------
     * Add an entry to the event log.
     * 
     * @param {string} message - Log message
     * @param {string} type - 'info', 'warning', 'success'
     * ----------------------------------------------------------------------- */
    addLogEntry(message, type = 'info') {

        // Add to history
        this.history.push({
            time: new Date().toLocaleTimeString(),
            message: message,
            type: type
        });

        // Limit history size
        while (this.history.length > MAX_HISTORY_ENTRIES) {
            this.history.shift();
        }

        // Update display
        this.renderLog();
    }

    /* -------------------------------------------------------------------------
     * renderLog
     * -------------------------------------------------------------------------
     * Render the event log to the DOM.
     * Shows most recent entries at top.
     * ----------------------------------------------------------------------- */
    renderLog() {

        if (!this.elements || !this.elements.log) return;

        const recentEntries = this.history.slice(-10).reverse();

        this.elements.log.innerHTML = recentEntries.map(entry => `
            <div class="log-entry log-${entry.type}">
                <span class="log-time">${entry.time}</span>
                <span class="log-message">${entry.message}</span>
            </div>
        `).join('');
    }

    /* -------------------------------------------------------------------------
     * reset
     * -------------------------------------------------------------------------
     * Reset all statistics and logs.
     * ----------------------------------------------------------------------- */
    reset() {
        this.stats = {
            totalCellsUpdated: 0,
            totalCellsSkippedDead: 0,
            totalCellsSkippedFire: 0,
            obstacleInteractions: 0
        };
        this.history = [];
        this.currentStep = 0;

        if (this.elements) {
            this.elements.step.textContent = '0';
            this.elements.updated.textContent = '0';
            this.elements.skippedDead.textContent = '0';
            this.elements.skippedFire.textContent = '0';
            this.elements.log.innerHTML = '';
        }

        this.addLogEntry('Simulation reset', 'info');
    }

    /* -------------------------------------------------------------------------
     * getFormattedExplanation
     * -------------------------------------------------------------------------
     * Generate a detailed explanation string for a specific operation.
     * Used for tooltips and detailed popups.
     * 
     * @param {string} operation - Operation name
     * @returns {string} Detailed explanation
     * ----------------------------------------------------------------------- */
    getFormattedExplanation(operation) {

        const explanations = {
            'alive_mask': `
ALIVE MASK CHECK
================
Purpose: Determine which cells should update this step.

Algorithm:
1. For each cell (x, y), examine its 3x3 neighborhood
2. Find the maximum alpha value in that neighborhood
3. If max(alpha) > 0.1, the cell is "alive" and will update

Complexity: O(9) = O(1) per cell
Memory: Uses pre-allocated boolean array

Why Max-Pooling?
This creates smooth boundaries and prevents orphan cells.
A cell stays alive if ANY neighbor has significant alpha.
`,

            'perception': `
PERCEPTION COMPUTATION
======================
Purpose: Let each cell "see" its local neighborhood.

Algorithm:
For each of 16 channels, compute three values:
1. Identity: The cell's own value (no computation)
2. Sobel X: Horizontal gradient (detects vertical edges)
3. Sobel Y: Vertical gradient (detects horizontal edges)

Result: 48-dimensional perception vector

Sobel Kernels:
X gradient: detects left-right intensity changes
Y gradient: detects top-bottom intensity changes

Complexity: O(9 * 2 * 16) = O(288) per cell
Memory: Allocates 48-float temporary array
`,

            'forward_pass': `
NEURAL NETWORK FORWARD PASS
===========================
Purpose: Compute how the cell state should change.

Architecture:
Input (48) -> Dense+ReLU (128) -> Dense (16) -> Output

Layer 1: Perception to Hidden
- Matrix multiplication: 48 x 128 = 6,144 ops
- Add bias: 128 ops
- ReLU activation: max(0, x) for each neuron

Layer 2: Hidden to Output
- Matrix multiplication: 128 x 16 = 2,048 ops
- No activation (residual connection)

Total: ~8,200 operations per cell
Memory: 128 + 16 = 144 floats temporary

Output is the STATE DELTA, not the new state.
`,

            'update': `
STATE UPDATE
============
Purpose: Apply the computed delta to cell state.

Formula: new_state = old_state + delta

This is a RESIDUAL update, meaning the network only
needs to learn the CHANGE, not the entire new state.
This makes training more stable and allows identity
mappings (delta = 0 means no change).

Stochastic Update:
Each cell only updates with probability 0.5 (fire rate).
This introduces asynchrony, making the system more robust
to timing variations and perturbations.
`,

            'post_mask': `
POST-UPDATE ALIVE MASK
======================
Purpose: Clean up cells that "died" during update.

After applying updates, some cells may have very low alpha.
We check the new grid and zero out cells where:
- No cell in 3x3 neighborhood has alpha > 0.1

This prevents "ghost" cells and keeps boundaries clean.
It also saves computation by not updating dead regions.
`
        };

        return explanations[operation] || 'No explanation available.';
    }
}

// Export to global scope
window.ExplanationPanel = ExplanationPanel;

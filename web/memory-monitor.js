/**
 * =============================================================================
 * MEMORY-MONITOR.JS - Dynamic Memory Usage Visualization
 * =============================================================================
 * 
 * This module tracks and displays memory usage of the NCA simulation.
 * It shows a real-time graph with threshold warnings and overflow detection.
 * 
 * TRACKED METRICS:
 * ----------------
 *   1. Grid memory (main cell data)
 *   2. Obstacle system memory
 *   3. Weight matrices memory
 *   4. Peak usage over time
 *   5. JavaScript heap (if available)
 * 
 * VISUALIZATION:
 * --------------
 * A rolling line graph shows memory over time with:
 *   - Green zone: Normal usage
 *   - Yellow zone: Approaching threshold (80%+)
 *   - Red zone: Exceeding threshold (overflow)
 * 
 * =============================================================================
 */

/* -----------------------------------------------------------------------------
 * SECTION 1: CONFIGURATION
 * -------------------------------------------------------------------------- */

/**
 * DEFAULT_THRESHOLD_KB - Default memory threshold in kilobytes
 * When usage exceeds this, we trigger overflow warnings.
 */
const DEFAULT_THRESHOLD_KB = 100;

/**
 * GRAPH_HISTORY_LENGTH - Number of data points to show in graph
 * Higher = longer history but more DOM updates.
 */
const GRAPH_HISTORY_LENGTH = 100;

/**
 * UPDATE_INTERVAL_MS - How often to sample memory
 */
const UPDATE_INTERVAL_MS = 100;

/**
 * WARNING_THRESHOLD_PERCENT - Yellow zone starts at this percentage
 */
const WARNING_THRESHOLD_PERCENT = 80;

/* -----------------------------------------------------------------------------
 * SECTION 2: MEMORY MONITOR CLASS
 * -------------------------------------------------------------------------- */

class MemoryMonitor {

    /* -------------------------------------------------------------------------
     * CONSTRUCTOR
     * -------------------------------------------------------------------------
     * Initialize the memory monitor.
     * 
     * @param {string} containerId - DOM ID of the monitor container
     * @param {Object} options - Configuration options
     * ----------------------------------------------------------------------- */
    constructor(containerId, options = {}) {

        // ===== STEP 1: Configuration =====
        this.container = document.getElementById(containerId);
        this.thresholdKB = options.thresholdKB || DEFAULT_THRESHOLD_KB;
        this.thresholdBytes = this.thresholdKB * 1024;

        // ===== STEP 2: Data tracking =====
        this.history = [];              // Array of memory samples
        this.peakBytes = 0;             // Highest recorded usage
        this.overflowCount = 0;         // Number of threshold breaches
        this.lastOverflowTime = 0;      // Debounce overflow events
        this.isOverflowing = false;     // Currently exceeding threshold

        // ===== STEP 3: External references =====
        this.nca = null;                // NCA instance to monitor
        this.obstacleSystem = null;     // ObstacleSystem instance

        // ===== STEP 4: Update timer =====
        this.updateTimer = null;

        // ===== STEP 5: Callbacks =====
        this.onOverflow = null;         // Called when threshold exceeded
        this.onNormal = null;           // Called when returning to normal

        // ===== STEP 6: Create UI =====
        this.createUI();
    }

    /* -------------------------------------------------------------------------
     * createUI
     * -------------------------------------------------------------------------
     * Build the HTML structure for the memory monitor.
     * ----------------------------------------------------------------------- */
    createUI() {

        if (!this.container) return;

        this.container.innerHTML = `
            <div class="memory-header">
                <h3>Memory Monitor</h3>
                <span class="memory-status" id="mem-status">Normal</span>
            </div>
            
            <div class="memory-graph-container">
                <canvas id="mem-graph" width="280" height="80"></canvas>
                <div class="memory-threshold-line" id="mem-threshold-line"></div>
            </div>
            
            <div class="memory-stats">
                <div class="mem-stat">
                    <span class="mem-label">Current</span>
                    <span class="mem-value" id="mem-current">0 KB</span>
                </div>
                <div class="mem-stat">
                    <span class="mem-label">Peak</span>
                    <span class="mem-value" id="mem-peak">0 KB</span>
                </div>
                <div class="mem-stat">
                    <span class="mem-label">Threshold</span>
                    <span class="mem-value" id="mem-threshold">${this.thresholdKB} KB</span>
                </div>
                <div class="mem-stat">
                    <span class="mem-label">Overflows</span>
                    <span class="mem-value" id="mem-overflows">0</span>
                </div>
            </div>
            
            <div class="memory-breakdown" id="mem-breakdown">
                <div class="breakdown-row">
                    <span>Grid:</span>
                    <span id="mem-grid">0 KB</span>
                </div>
                <div class="breakdown-row">
                    <span>Weights:</span>
                    <span id="mem-weights">0 KB</span>
                </div>
                <div class="breakdown-row">
                    <span>Obstacles:</span>
                    <span id="mem-obstacles">0 KB</span>
                </div>
            </div>
        `;

        // ===== Cache DOM references =====
        this.elements = {
            status: document.getElementById('mem-status'),
            graph: document.getElementById('mem-graph'),
            thresholdLine: document.getElementById('mem-threshold-line'),
            current: document.getElementById('mem-current'),
            peak: document.getElementById('mem-peak'),
            threshold: document.getElementById('mem-threshold'),
            overflows: document.getElementById('mem-overflows'),
            grid: document.getElementById('mem-grid'),
            weights: document.getElementById('mem-weights'),
            obstacles: document.getElementById('mem-obstacles')
        };

        // ===== Get canvas context =====
        this.graphCtx = this.elements.graph.getContext('2d');
    }

    /* -------------------------------------------------------------------------
     * attach
     * -------------------------------------------------------------------------
     * Connect to NCA and obstacle system for monitoring.
     * 
     * @param {NeuralCellularAutomata} nca - NCA instance
     * @param {ObstacleSystem} obstacleSystem - Obstacle system (optional)
     * ----------------------------------------------------------------------- */
    attach(nca, obstacleSystem = null) {
        this.nca = nca;
        this.obstacleSystem = obstacleSystem;
    }

    /* -------------------------------------------------------------------------
     * start
     * -------------------------------------------------------------------------
     * Begin periodic memory sampling.
     * ----------------------------------------------------------------------- */
    start() {
        if (this.updateTimer) return;

        this.updateTimer = setInterval(() => {
            this.sample();
        }, UPDATE_INTERVAL_MS);
    }

    /* -------------------------------------------------------------------------
     * stop
     * -------------------------------------------------------------------------
     * Stop periodic memory sampling.
     * ----------------------------------------------------------------------- */
    stop() {
        if (this.updateTimer) {
            clearInterval(this.updateTimer);
            this.updateTimer = null;
        }
    }

    /* -------------------------------------------------------------------------
     * sample
     * -------------------------------------------------------------------------
     * Take a memory sample and update the display.
     * 
     * Algorithm:
     *   1. Query memory from NCA and obstacle system
     *   2. Add to history (rolling window)
     *   3. Check for threshold breach
     *   4. Update graph and stats display
     * 
     * Complexity: O(GRAPH_HISTORY_LENGTH) for rendering
     * ----------------------------------------------------------------------- */
    sample() {

        // ===== STEP 1: Gather memory data =====
        let gridBytes = 0;
        let weightsBytes = 0;
        let obstacleBytes = 0;

        if (this.nca) {
            const ncaMemory = this.nca.getMemoryUsage();
            gridBytes = ncaMemory.gridBytes || 0;
            weightsBytes = ncaMemory.weightsBytes || 0;
        }

        if (this.obstacleSystem) {
            const obsMemory = this.obstacleSystem.getMemoryUsage();
            obstacleBytes = obsMemory.totalBytes || 0;
        }

        const totalBytes = gridBytes + weightsBytes + obstacleBytes;

        // ===== STEP 2: Update peak =====
        if (totalBytes > this.peakBytes) {
            this.peakBytes = totalBytes;
        }

        // ===== STEP 3: Add to history =====
        this.history.push({
            timestamp: performance.now(),
            bytes: totalBytes,
            gridBytes: gridBytes,
            weightsBytes: weightsBytes,
            obstacleBytes: obstacleBytes
        });

        // Keep history bounded
        while (this.history.length > GRAPH_HISTORY_LENGTH) {
            this.history.shift();
        }

        // ===== STEP 4: Check threshold =====
        const wasOverflowing = this.isOverflowing;
        this.isOverflowing = totalBytes > this.thresholdBytes;

        if (this.isOverflowing && !wasOverflowing) {
            // Just started overflowing
            this.overflowCount++;
            this.lastOverflowTime = performance.now();

            if (this.onOverflow) {
                this.onOverflow({
                    currentBytes: totalBytes,
                    thresholdBytes: this.thresholdBytes,
                    overflowCount: this.overflowCount
                });
            }
        } else if (!this.isOverflowing && wasOverflowing) {
            // Returned to normal
            if (this.onNormal) {
                this.onNormal({
                    currentBytes: totalBytes,
                    thresholdBytes: this.thresholdBytes
                });
            }
        }

        // ===== STEP 5: Update display =====
        this.updateDisplay(totalBytes, gridBytes, weightsBytes, obstacleBytes);
        this.renderGraph();
    }

    /* -------------------------------------------------------------------------
     * updateDisplay
     * -------------------------------------------------------------------------
     * Update the numeric displays.
     * 
     * @param {number} totalBytes - Total memory usage
     * @param {number} gridBytes - Grid memory
     * @param {number} weightsBytes - Weight matrices memory
     * @param {number} obstacleBytes - Obstacle system memory
     * ----------------------------------------------------------------------- */
    updateDisplay(totalBytes, gridBytes, weightsBytes, obstacleBytes) {

        if (!this.elements) return;

        // Format as KB
        const toKB = (bytes) => (bytes / 1024).toFixed(1) + ' KB';

        // Update values
        this.elements.current.textContent = toKB(totalBytes);
        this.elements.peak.textContent = toKB(this.peakBytes);
        this.elements.overflows.textContent = this.overflowCount.toString();
        this.elements.grid.textContent = toKB(gridBytes);
        this.elements.weights.textContent = toKB(weightsBytes);
        this.elements.obstacles.textContent = toKB(obstacleBytes);

        // Update status indicator
        const usagePercent = (totalBytes / this.thresholdBytes) * 100;

        if (usagePercent >= 100) {
            this.elements.status.textContent = 'OVERFLOW';
            this.elements.status.className = 'memory-status overflow';
        } else if (usagePercent >= WARNING_THRESHOLD_PERCENT) {
            this.elements.status.textContent = 'Warning';
            this.elements.status.className = 'memory-status warning';
        } else {
            this.elements.status.textContent = 'Normal';
            this.elements.status.className = 'memory-status normal';
        }
    }

    /* -------------------------------------------------------------------------
     * renderGraph
     * -------------------------------------------------------------------------
     * Draw the memory usage graph.
     * 
     * Uses Canvas 2D for efficient drawing.
     * Shows history as a line graph with threshold line.
     * ----------------------------------------------------------------------- */
    renderGraph() {

        if (!this.graphCtx || this.history.length < 2) return;

        const ctx = this.graphCtx;
        const width = this.elements.graph.width;
        const height = this.elements.graph.height;

        // ===== STEP 1: Clear canvas =====
        ctx.fillStyle = '#1a1a25';
        ctx.fillRect(0, 0, width, height);

        // ===== STEP 2: Calculate scale =====
        // Y-axis: 0 to max(threshold * 1.2, peak)
        const maxY = Math.max(this.thresholdBytes * 1.2, this.peakBytes * 1.1);
        const yScale = height / maxY;

        // X-axis: fit all history points
        const xStep = width / (GRAPH_HISTORY_LENGTH - 1);

        // ===== STEP 3: Draw threshold line =====
        const thresholdY = height - (this.thresholdBytes * yScale);
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(0, thresholdY);
        ctx.lineTo(width, thresholdY);
        ctx.stroke();
        ctx.setLineDash([]);

        // ===== STEP 4: Draw warning zone =====
        const warningY = height - (this.thresholdBytes * WARNING_THRESHOLD_PERCENT / 100 * yScale);
        ctx.fillStyle = 'rgba(245, 158, 11, 0.1)';
        ctx.fillRect(0, warningY, width, thresholdY - warningY);

        // ===== STEP 5: Draw overflow zone =====
        ctx.fillStyle = 'rgba(239, 68, 68, 0.1)';
        ctx.fillRect(0, 0, width, thresholdY);

        // ===== STEP 6: Draw memory line =====
        ctx.beginPath();
        ctx.strokeStyle = '#6366f1';
        ctx.lineWidth = 2;

        for (let i = 0; i < this.history.length; i++) {
            const x = i * xStep;
            const y = height - (this.history[i].bytes * yScale);

            if (i === 0) {
                ctx.moveTo(x, y);
            } else {
                ctx.lineTo(x, y);
            }
        }
        ctx.stroke();

        // ===== STEP 7: Draw fill under line =====
        ctx.lineTo(width, height);
        ctx.lineTo(0, height);
        ctx.closePath();

        const gradient = ctx.createLinearGradient(0, 0, 0, height);
        gradient.addColorStop(0, 'rgba(99, 102, 241, 0.3)');
        gradient.addColorStop(1, 'rgba(99, 102, 241, 0.05)');
        ctx.fillStyle = gradient;
        ctx.fill();

        // ===== STEP 8: Draw current value marker =====
        if (this.history.length > 0) {
            const lastSample = this.history[this.history.length - 1];
            const lastX = (this.history.length - 1) * xStep;
            const lastY = height - (lastSample.bytes * yScale);

            ctx.beginPath();
            ctx.arc(lastX, lastY, 4, 0, Math.PI * 2);
            ctx.fillStyle = this.isOverflowing ? '#ef4444' : '#6366f1';
            ctx.fill();
        }
    }

    /* -------------------------------------------------------------------------
     * setThreshold
     * -------------------------------------------------------------------------
     * Change the memory threshold.
     * 
     * @param {number} thresholdKB - New threshold in kilobytes
     * ----------------------------------------------------------------------- */
    setThreshold(thresholdKB) {
        this.thresholdKB = thresholdKB;
        this.thresholdBytes = thresholdKB * 1024;

        if (this.elements) {
            this.elements.threshold.textContent = thresholdKB + ' KB';
        }
    }

    /* -------------------------------------------------------------------------
     * reset
     * -------------------------------------------------------------------------
     * Reset all tracking data.
     * ----------------------------------------------------------------------- */
    reset() {
        this.history = [];
        this.peakBytes = 0;
        this.overflowCount = 0;
        this.isOverflowing = false;

        if (this.elements) {
            this.elements.overflows.textContent = '0';
            this.elements.peak.textContent = '0 KB';
            this.elements.status.textContent = 'Normal';
            this.elements.status.className = 'memory-status normal';
        }
    }

    /* -------------------------------------------------------------------------
     * getStats
     * -------------------------------------------------------------------------
     * Get current memory statistics.
     * 
     * @returns {Object} Memory statistics
     * ----------------------------------------------------------------------- */
    getStats() {
        const latest = this.history.length > 0 ?
            this.history[this.history.length - 1] :
            { bytes: 0, gridBytes: 0, weightsBytes: 0, obstacleBytes: 0 };

        return {
            currentBytes: latest.bytes,
            currentKB: latest.bytes / 1024,
            peakBytes: this.peakBytes,
            peakKB: this.peakBytes / 1024,
            thresholdBytes: this.thresholdBytes,
            thresholdKB: this.thresholdKB,
            usagePercent: (latest.bytes / this.thresholdBytes) * 100,
            isOverflowing: this.isOverflowing,
            overflowCount: this.overflowCount,
            breakdown: {
                grid: latest.gridBytes,
                weights: latest.weightsBytes,
                obstacles: latest.obstacleBytes
            }
        };
    }
}

// Export to global scope
window.MemoryMonitor = MemoryMonitor;

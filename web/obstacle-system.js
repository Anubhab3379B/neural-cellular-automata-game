/**
 * =============================================================================
 * OBSTACLE-SYSTEM.JS - Obstacle Management for NCA
 * =============================================================================
 * 
 * This module implements obstacle placement and collision detection for the
 * Neural Cellular Automata simulation. Obstacles affect how cells grow and
 * spread across the grid.
 * 
 * OBSTACLE TYPES:
 * ---------------
 *   1. WALL - Blocks cell growth entirely. Cells cannot exist on wall cells.
 *   2. REPULSOR - Pushes cells away. Adds gradient to cell perception.
 *   3. ATTRACTOR - Pulls cells toward it. Opposite gradient of repulsor.
 * 
 * IMPLEMENTATION:
 * ---------------
 * Uses a typed array map for O(1) obstacle lookup and pre-computed distance
 * fields for smooth gradient effects around obstacles.
 * 
 * MEMORY USAGE:
 * -------------
 *   - Obstacle map: gridWidth * gridHeight bytes (1 byte per cell)
 *   - Distance field: gridWidth * gridHeight * 4 bytes (float per cell)
 *   - For 72x72 grid: ~26 KB total
 * 
 * =============================================================================
 */

/* -----------------------------------------------------------------------------
 * SECTION 1: OBSTACLE TYPE CONSTANTS
 * -----------------------------------------------------------------------------
 * Numeric codes for obstacle types stored in the obstacle map.
 * Using integers for memory efficiency (1 byte instead of string).
 * -------------------------------------------------------------------------- */

/**
 * OBSTACLE_NONE - No obstacle at this cell (value 0)
 */
const OBSTACLE_NONE = 0;

/**
 * OBSTACLE_WALL - Impassable barrier (value 1)
 * Cells are cleared when they touch a wall.
 */
const OBSTACLE_WALL = 1;

/**
 * OBSTACLE_REPULSOR - Pushes cells away (value 2)
 * Adds negative gradient in perception, discouraging growth toward it.
 */
const OBSTACLE_REPULSOR = 2;

/**
 * OBSTACLE_ATTRACTOR - Pulls cells toward (value 3)
 * Adds positive gradient in perception, encouraging growth toward it.
 */
const OBSTACLE_ATTRACTOR = 3;

/**
 * OBSTACLE_NAMES - Human-readable names for each type
 * Used in explanation panel and debugging.
 */
const OBSTACLE_NAMES = {
    [OBSTACLE_NONE]: null,
    [OBSTACLE_WALL]: 'wall',
    [OBSTACLE_REPULSOR]: 'repulsor',
    [OBSTACLE_ATTRACTOR]: 'attractor'
};

/**
 * GRADIENT_RADIUS - How far obstacle effects extend
 * Larger radius = smoother but more computation
 */
const GRADIENT_RADIUS = 8;

/**
 * GRADIENT_STRENGTH - Multiplier for gradient effect
 * Higher = stronger attraction/repulsion
 */
const GRADIENT_STRENGTH = 0.5;

/* -----------------------------------------------------------------------------
 * SECTION 2: OBSTACLE SYSTEM CLASS
 * -------------------------------------------------------------------------- */

class ObstacleSystem {

    /* -------------------------------------------------------------------------
     * CONSTRUCTOR
     * -------------------------------------------------------------------------
     * Initialize obstacle system for a given grid size.
     * 
     * Algorithm:
     *   1. Store grid dimensions
     *   2. Allocate obstacle map (1 byte per cell)
     *   3. Allocate gradient fields (2 floats per cell for x,y)
     *   4. Initialize all to zero/no obstacles
     * 
     * Complexity: O(gridWidth * gridHeight)
     * Memory: gridWidth * gridHeight * (1 + 8) = 9 bytes per cell
     * 
     * @param {number} gridWidth - Width of the NCA grid
     * @param {number} gridHeight - Height of the NCA grid
     * ----------------------------------------------------------------------- */
    constructor(gridWidth, gridHeight) {

        // ===== STEP 1: Store dimensions =====
        this.gridWidth = gridWidth;
        this.gridHeight = gridHeight;

        // ===== STEP 2: Allocate obstacle map =====
        // Uint8Array uses 1 byte per cell (efficient for small enum values)
        // Index formula: y * gridWidth + x
        this.obstacleMap = new Uint8Array(gridWidth * gridHeight);

        // ===== STEP 3: Allocate gradient fields =====
        // Two separate arrays for X and Y components
        // Float32Array for smooth gradient values
        this.gradientX = new Float32Array(gridWidth * gridHeight);
        this.gradientY = new Float32Array(gridWidth * gridHeight);

        // ===== STEP 4: Track obstacle positions for fast iteration =====
        // Set of "x,y" strings for quick lookup during gradient computation
        this.obstaclePositions = new Set();

        // ===== STEP 5: Event callback for explanation panel =====
        this.onObstacleChange = null;

        // ===== STEP 6: Track memory usage =====
        this.memoryBytes = gridWidth * gridHeight * 9;  // map + 2 gradient fields
    }

    /* -------------------------------------------------------------------------
     * placeObstacle
     * -------------------------------------------------------------------------
     * Place an obstacle at a specific grid position.
     * 
     * Algorithm:
     *   1. Validate coordinates
     *   2. Update obstacle map
     *   3. Track position in set
     *   4. Recompute affected gradients
     *   5. Emit change event
     * 
     * Complexity: O(GRADIENT_RADIUS^2) for gradient update
     * Memory: No new allocation
     * 
     * @param {number} x - Grid x coordinate
     * @param {number} y - Grid y coordinate
     * @param {string} type - One of: 'wall', 'repulsor', 'attractor'
     * ----------------------------------------------------------------------- */
    placeObstacle(x, y, type) {

        // ===== STEP 1: Validate coordinates =====
        if (x < 0 || x >= this.gridWidth || y < 0 || y >= this.gridHeight) {
            return;
        }

        // ===== STEP 2: Convert type string to numeric code =====
        let typeCode;
        switch (type) {
            case 'wall':
                typeCode = OBSTACLE_WALL;
                break;
            case 'repulsor':
                typeCode = OBSTACLE_REPULSOR;
                break;
            case 'attractor':
                typeCode = OBSTACLE_ATTRACTOR;
                break;
            default:
                return;  // Invalid type
        }

        // ===== STEP 3: Update obstacle map =====
        const index = y * this.gridWidth + x;
        this.obstacleMap[index] = typeCode;

        // ===== STEP 4: Track position =====
        this.obstaclePositions.add(`${x},${y}`);

        // ===== STEP 5: Update gradients around this obstacle =====
        this.updateGradientsAround(x, y);

        // ===== STEP 6: Emit event =====
        if (this.onObstacleChange) {
            this.onObstacleChange({
                action: 'place',
                x: x,
                y: y,
                type: type,
                totalObstacles: this.obstaclePositions.size
            });
        }
    }

    /* -------------------------------------------------------------------------
     * placeObstacleCircle
     * -------------------------------------------------------------------------
     * Place obstacles in a circular brush pattern.
     * Useful for mouse-based placement.
     * 
     * Complexity: O(radius^2 * GRADIENT_RADIUS^2)
     * 
     * @param {number} centerX - Center x coordinate
     * @param {number} centerY - Center y coordinate
     * @param {number} radius - Brush radius
     * @param {string} type - Obstacle type
     * ----------------------------------------------------------------------- */
    placeObstacleCircle(centerX, centerY, radius, type) {

        // Iterate over bounding box
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {

                // Check if within circle
                if (dx * dx + dy * dy <= radius * radius) {
                    this.placeObstacle(centerX + dx, centerY + dy, type);
                }
            }
        }
    }

    /* -------------------------------------------------------------------------
     * removeObstacle
     * -------------------------------------------------------------------------
     * Remove an obstacle from a grid position.
     * 
     * Complexity: O(GRADIENT_RADIUS^2)
     * 
     * @param {number} x - Grid x coordinate
     * @param {number} y - Grid y coordinate
     * ----------------------------------------------------------------------- */
    removeObstacle(x, y) {

        if (x < 0 || x >= this.gridWidth || y < 0 || y >= this.gridHeight) {
            return;
        }

        const index = y * this.gridWidth + x;

        // Only update if there was an obstacle
        if (this.obstacleMap[index] !== OBSTACLE_NONE) {
            this.obstacleMap[index] = OBSTACLE_NONE;
            this.obstaclePositions.delete(`${x},${y}`);

            // Recompute gradients
            this.updateGradientsAround(x, y);

            if (this.onObstacleChange) {
                this.onObstacleChange({
                    action: 'remove',
                    x: x,
                    y: y,
                    totalObstacles: this.obstaclePositions.size
                });
            }
        }
    }

    /* -------------------------------------------------------------------------
     * removeObstacleCircle
     * -------------------------------------------------------------------------
     * Remove obstacles in a circular pattern.
     * 
     * @param {number} centerX - Center x coordinate
     * @param {number} centerY - Center y coordinate
     * @param {number} radius - Eraser radius
     * ----------------------------------------------------------------------- */
    removeObstacleCircle(centerX, centerY, radius) {
        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                if (dx * dx + dy * dy <= radius * radius) {
                    this.removeObstacle(centerX + dx, centerY + dy);
                }
            }
        }
    }

    /* -------------------------------------------------------------------------
     * isObstacle
     * -------------------------------------------------------------------------
     * Check if a cell contains any obstacle.
     * 
     * Complexity: O(1)
     * 
     * @param {number} x - Grid x coordinate
     * @param {number} y - Grid y coordinate
     * @returns {boolean} True if cell has an obstacle
     * ----------------------------------------------------------------------- */
    isObstacle(x, y) {
        if (x < 0 || x >= this.gridWidth || y < 0 || y >= this.gridHeight) {
            return false;
        }
        return this.obstacleMap[y * this.gridWidth + x] !== OBSTACLE_NONE;
    }

    /* -------------------------------------------------------------------------
     * isWall
     * -------------------------------------------------------------------------
     * Check if a cell is specifically a wall (blocks growth).
     * 
     * Complexity: O(1)
     * 
     * @param {number} x - Grid x coordinate
     * @param {number} y - Grid y coordinate
     * @returns {boolean} True if cell is a wall
     * ----------------------------------------------------------------------- */
    isWall(x, y) {
        if (x < 0 || x >= this.gridWidth || y < 0 || y >= this.gridHeight) {
            return false;
        }
        return this.obstacleMap[y * this.gridWidth + x] === OBSTACLE_WALL;
    }

    /* -------------------------------------------------------------------------
     * getObstacleType
     * -------------------------------------------------------------------------
     * Get the type of obstacle at a position.
     * 
     * Complexity: O(1)
     * 
     * @param {number} x - Grid x coordinate
     * @param {number} y - Grid y coordinate
     * @returns {string|null} 'wall', 'repulsor', 'attractor', or null
     * ----------------------------------------------------------------------- */
    getObstacleType(x, y) {
        if (x < 0 || x >= this.gridWidth || y < 0 || y >= this.gridHeight) {
            return null;
        }
        const typeCode = this.obstacleMap[y * this.gridWidth + x];
        return OBSTACLE_NAMES[typeCode];
    }

    /* -------------------------------------------------------------------------
     * getGradient
     * -------------------------------------------------------------------------
     * Get the pre-computed gradient at a position.
     * 
     * The gradient points away from repulsors and toward attractors.
     * Magnitude decreases with distance from obstacle.
     * 
     * Complexity: O(1) - uses pre-computed values
     * 
     * @param {number} x - Grid x coordinate
     * @param {number} y - Grid y coordinate
     * @returns {Object|null} {x, y} gradient vector or null if zero
     * ----------------------------------------------------------------------- */
    getGradient(x, y) {
        if (x < 0 || x >= this.gridWidth || y < 0 || y >= this.gridHeight) {
            return null;
        }

        const index = y * this.gridWidth + x;
        const gx = this.gradientX[index];
        const gy = this.gradientY[index];

        // Return null for zero gradient (optimization)
        if (gx === 0 && gy === 0) {
            return null;
        }

        return { x: gx, y: gy };
    }

    /* -------------------------------------------------------------------------
     * updateGradientsAround
     * -------------------------------------------------------------------------
     * Recompute gradients in a region around a changed obstacle.
     * 
     * Algorithm:
     *   For each cell in radius around the changed position:
     *     1. Sum contributions from all nearby obstacles
     *     2. Repulsors add gradient pointing away
     *     3. Attractors add gradient pointing toward
     *     4. Magnitude decreases with distance (1/d)
     * 
     * Complexity: O(GRADIENT_RADIUS^2 * numNearbyObstacles)
     * 
     * @param {number} cx - Center x of affected region
     * @param {number} cy - Center y of affected region
     * ----------------------------------------------------------------------- */
    updateGradientsAround(cx, cy) {

        // ===== Iterate over affected region =====
        const radius = GRADIENT_RADIUS + 2;  // Extra margin

        for (let dy = -radius; dy <= radius; dy++) {
            for (let dx = -radius; dx <= radius; dx++) {
                const x = cx + dx;
                const y = cy + dy;

                // Skip out of bounds
                if (x < 0 || x >= this.gridWidth || y < 0 || y >= this.gridHeight) {
                    continue;
                }

                // Compute gradient at this cell
                this.computeGradientAt(x, y);
            }
        }
    }

    /* -------------------------------------------------------------------------
     * computeGradientAt
     * -------------------------------------------------------------------------
     * Compute the gradient vector at a single cell.
     * 
     * The gradient is the sum of contributions from all obstacles
     * within GRADIENT_RADIUS distance.
     * 
     * Algorithm:
     *   gradX = sum over obstacles of: sign * (obs.x - x) / distance^2
     *   gradY = sum over obstacles of: sign * (obs.y - y) / distance^2
     *   
     *   sign = -1 for repulsors (point away)
     *   sign = +1 for attractors (point toward)
     * 
     * Complexity: O(GRADIENT_RADIUS^2)
     * 
     * @param {number} x - Grid x coordinate
     * @param {number} y - Grid y coordinate
     * ----------------------------------------------------------------------- */
    computeGradientAt(x, y) {

        let gradX = 0;
        let gradY = 0;

        // ===== Check all cells within gradient radius =====
        for (let dy = -GRADIENT_RADIUS; dy <= GRADIENT_RADIUS; dy++) {
            for (let dx = -GRADIENT_RADIUS; dx <= GRADIENT_RADIUS; dx++) {

                const ox = x + dx;
                const oy = y + dy;

                // Skip out of bounds
                if (ox < 0 || ox >= this.gridWidth || oy < 0 || oy >= this.gridHeight) {
                    continue;
                }

                // Check obstacle type at this position
                const typeCode = this.obstacleMap[oy * this.gridWidth + ox];

                if (typeCode === OBSTACLE_NONE || typeCode === OBSTACLE_WALL) {
                    continue;  // Walls don't create gradients
                }

                // Calculate distance (avoid division by zero)
                const distSq = dx * dx + dy * dy;
                if (distSq === 0) continue;

                const dist = Math.sqrt(distSq);

                // Skip if beyond gradient radius
                if (dist > GRADIENT_RADIUS) continue;

                // Determine sign based on obstacle type
                // Repulsor: gradient points AWAY (we add direction from obstacle to cell)
                // Attractor: gradient points TOWARD (we add direction from cell to obstacle)
                let sign;
                if (typeCode === OBSTACLE_REPULSOR) {
                    sign = 1;  // Points away from obstacle
                } else if (typeCode === OBSTACLE_ATTRACTOR) {
                    sign = -1;  // Points toward obstacle
                } else {
                    continue;
                }

                // Gradient magnitude decreases with distance (1/d falloff)
                // Normalize direction vector and scale by strength/distance
                const magnitude = GRADIENT_STRENGTH / dist;

                // Direction from obstacle to cell (for repulsor) or cell to obstacle (attractor)
                gradX += sign * (dx / dist) * magnitude;
                gradY += sign * (dy / dist) * magnitude;
            }
        }

        // ===== Store computed gradient =====
        const index = y * this.gridWidth + x;
        this.gradientX[index] = gradX;
        this.gradientY[index] = gradY;
    }

    /* -------------------------------------------------------------------------
     * recomputeAllGradients
     * -------------------------------------------------------------------------
     * Recompute all gradients from scratch.
     * Called after major changes or loading a saved state.
     * 
     * Complexity: O(gridWidth * gridHeight * GRADIENT_RADIUS^2)
     * ----------------------------------------------------------------------- */
    recomputeAllGradients() {

        // Clear gradient fields
        this.gradientX.fill(0);
        this.gradientY.fill(0);

        // Recompute for each cell
        for (let y = 0; y < this.gridHeight; y++) {
            for (let x = 0; x < this.gridWidth; x++) {
                this.computeGradientAt(x, y);
            }
        }
    }

    /* -------------------------------------------------------------------------
     * clear
     * -------------------------------------------------------------------------
     * Remove all obstacles.
     * 
     * Complexity: O(gridWidth * gridHeight)
     * ----------------------------------------------------------------------- */
    clear() {
        this.obstacleMap.fill(OBSTACLE_NONE);
        this.gradientX.fill(0);
        this.gradientY.fill(0);
        this.obstaclePositions.clear();

        if (this.onObstacleChange) {
            this.onObstacleChange({
                action: 'clear',
                totalObstacles: 0
            });
        }
    }

    /* -------------------------------------------------------------------------
     * getObstacleCount
     * -------------------------------------------------------------------------
     * Get the number of obstacle cells.
     * 
     * Complexity: O(1)
     * 
     * @returns {number} Count of cells with obstacles
     * ----------------------------------------------------------------------- */
    getObstacleCount() {
        return this.obstaclePositions.size;
    }

    /* -------------------------------------------------------------------------
     * getMemoryUsage
     * -------------------------------------------------------------------------
     * Get memory usage for this obstacle system.
     * 
     * @returns {Object} Memory statistics
     * ----------------------------------------------------------------------- */
    getMemoryUsage() {
        return {
            obstacleMapBytes: this.obstacleMap.length,
            gradientBytes: this.gradientX.length * 4 * 2,
            totalBytes: this.memoryBytes
        };
    }

    /* -------------------------------------------------------------------------
     * getExplanation
     * -------------------------------------------------------------------------
     * Generate human-readable explanation of obstacle at position.
     * Used by the explanation panel.
     * 
     * @param {number} x - Grid x coordinate
     * @param {number} y - Grid y coordinate
     * @returns {Object|null} Explanation object or null
     * ----------------------------------------------------------------------- */
    getExplanation(x, y) {
        const type = this.getObstacleType(x, y);
        const gradient = this.getGradient(x, y);

        if (!type && !gradient) {
            return null;
        }

        const explanation = {
            hasObstacle: type !== null,
            obstacleType: type,
            gradient: gradient,
            description: ''
        };

        if (type === 'wall') {
            explanation.description = 'WALL: Cells cannot grow into this area. ' +
                'The alive mask will exclude this cell, preventing any updates.';
        } else if (type === 'repulsor') {
            explanation.description = 'REPULSOR: Cells are pushed away from this area. ' +
                'A gradient is added to perception, biasing updates away.';
        } else if (type === 'attractor') {
            explanation.description = 'ATTRACTOR: Cells are pulled toward this area. ' +
                'A gradient is added to perception, biasing updates closer.';
        } else if (gradient) {
            explanation.description = `Gradient field: (${gradient.x.toFixed(3)}, ${gradient.y.toFixed(3)}). ` +
                'This cell is influenced by nearby repulsors/attractors.';
        }

        return explanation;
    }
}

// Export to global scope
window.ObstacleSystem = ObstacleSystem;

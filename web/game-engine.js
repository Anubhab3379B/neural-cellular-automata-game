/**
 * =============================================================================
 * GAME-ENGINE.JS - Level Management and Scoring System
 * =============================================================================
 * 
 * This module implements the game progression system with levels, goals,
 * and scoring. It transforms the NCA simulation into an educational game.
 * 
 * LEVEL TYPES:
 * ------------
 *   Level 1: Growth - Fill 50% of the grid
 *   Level 2: Avoidance - Grow while avoiding 3 walls
 *   Level 3: Pathfinding - Guide pattern from start to goal
 *   Level 4: Efficiency - Complete growth in minimal steps
 *   Level 5: Memory - Stay under memory threshold
 * 
 * SCORING:
 * --------
 *   - Base score for completing level
 *   - Bonus for fewer steps
 *   - Bonus for memory efficiency
 *   - Penalty for obstacle collisions
 * 
 * =============================================================================
 */

/* -----------------------------------------------------------------------------
 * SECTION 1: LEVEL DEFINITIONS
 * -------------------------------------------------------------------------- */

/**
 * LEVELS - Array of level configuration objects
 * 
 * Each level has:
 *   - id: Unique identifier
 *   - name: Display name
 *   - description: Brief explanation
 *   - goalType: Type of win condition
 *   - goalValue: Target value for win condition
 *   - obstacles: Pre-placed obstacles for the level
 *   - par: Target steps for bonus scoring
 *   - memoryLimit: Memory threshold for this level
 */
const LEVELS = [
    {
        id: 1,
        name: 'Growth',
        description: 'Grow your pattern to fill 50% of the grid. Click to add seeds and watch them spread.',
        goalType: 'coverage',
        goalValue: 50,  // 50% coverage
        obstacles: [],
        par: 500,
        memoryLimit: 100,
        tutorial: [
            'Welcome to Neural Cellular Automata.',
            'Each cell perceives its neighbors using Sobel filters.',
            'A small neural network computes the state update.',
            'Click to add seed cells and watch them grow.',
            'Goal: Fill 50% of the grid with living cells.'
        ]
    },
    {
        id: 2,
        name: 'Avoidance',
        description: 'Grow your pattern while avoiding the walls. Cells cannot grow into wall areas.',
        goalType: 'coverage',
        goalValue: 40,  // 40% coverage (less because of obstacles)
        obstacles: [
            { type: 'wall', x: 35, y: 20, radius: 5 },
            { type: 'wall', x: 20, y: 50, radius: 5 },
            { type: 'wall', x: 55, y: 45, radius: 5 }
        ],
        par: 600,
        memoryLimit: 100,
        tutorial: [
            'Walls block cell growth.',
            'The alive mask excludes wall cells.',
            'Cells adjacent to walls will have modified perception.',
            'Grow around the obstacles to reach the goal.'
        ]
    },
    {
        id: 3,
        name: 'Pathfinding',
        description: 'Guide cells from the start zone to the goal zone using attractors.',
        goalType: 'reach_goal',
        goalValue: 1,  // Reach goal zone
        startZone: { x: 10, y: 36, radius: 5 },
        goalZone: { x: 62, y: 36, radius: 5 },
        obstacles: [
            { type: 'wall', x: 36, y: 36, radius: 15 },
            { type: 'attractor', x: 36, y: 10, radius: 3 },
            { type: 'attractor', x: 36, y: 62, radius: 3 }
        ],
        par: 800,
        memoryLimit: 100,
        tutorial: [
            'Green zones are ATTRACTORS.',
            'Attractors add a gradient to cell perception.',
            'Cells will tend to grow toward attractors.',
            'Use the path around the wall to reach the goal.'
        ]
    },
    {
        id: 4,
        name: 'Efficiency',
        description: 'Fill 60% of the grid in as few steps as possible. Optimize your seed placement.',
        goalType: 'coverage',
        goalValue: 60,
        obstacles: [],
        par: 300,
        memoryLimit: 100,
        tutorial: [
            'This level tests your optimization skills.',
            'Place seeds strategically to minimize steps.',
            'Multiple seeds can grow faster than one.',
            'Bonus points for completing under par.'
        ]
    },
    {
        id: 5,
        name: 'Memory Challenge',
        description: 'Complete the level while staying under the memory threshold. Watch the monitor.',
        goalType: 'coverage',
        goalValue: 45,
        obstacles: [
            { type: 'repulsor', x: 20, y: 20, radius: 4 },
            { type: 'repulsor', x: 50, y: 50, radius: 4 }
        ],
        par: 600,
        memoryLimit: 80,  // Tighter limit
        tutorial: [
            'Memory is limited in this level.',
            'Red zones are REPULSORS that push cells away.',
            'Watch the memory monitor on the right.',
            'If you overflow, you lose points.',
            'Complete the goal before running out of memory.'
        ]
    }
];

/* -----------------------------------------------------------------------------
 * SECTION 2: GAME ENGINE CLASS
 * -------------------------------------------------------------------------- */

class GameEngine {

    /* -------------------------------------------------------------------------
     * CONSTRUCTOR
     * -------------------------------------------------------------------------
     * Initialize the game engine.
     * 
     * @param {NeuralCellularAutomata} nca - NCA instance
     * @param {ObstacleSystem} obstacleSystem - Obstacle system
     * @param {MemoryMonitor} memoryMonitor - Memory monitor
     * @param {ExplanationPanel} explanationPanel - Explanation panel
     * ----------------------------------------------------------------------- */
    constructor(nca, obstacleSystem, memoryMonitor, explanationPanel) {

        // ===== External systems =====
        this.nca = nca;
        this.obstacleSystem = obstacleSystem;
        this.memoryMonitor = memoryMonitor;
        this.explanationPanel = explanationPanel;

        // ===== Game state =====
        this.currentLevelIndex = 0;
        this.currentLevel = null;
        this.isPlaying = false;
        this.isPaused = false;

        // ===== Scoring =====
        this.score = 0;
        this.levelScore = 0;
        this.stepsTaken = 0;
        this.memoryOverflows = 0;

        // ===== Goal tracking =====
        this.goalProgress = 0;
        this.goalComplete = false;

        // ===== Callbacks =====
        this.onLevelStart = null;
        this.onLevelComplete = null;
        this.onGoalProgress = null;
        this.onScoreChange = null;

        // ===== UI elements =====
        this.uiElements = {};
    }

    /* -------------------------------------------------------------------------
     * initialize
     * -------------------------------------------------------------------------
     * Set up the game and load the first level.
     * ----------------------------------------------------------------------- */
    initialize() {

        // Cache UI elements
        this.uiElements = {
            levelName: document.getElementById('level-name'),
            levelDesc: document.getElementById('level-desc'),
            progress: document.getElementById('goal-progress'),
            progressBar: document.getElementById('progress-bar'),
            stepCount: document.getElementById('step-count'),
            scoreDisplay: document.getElementById('score-display'),
            tutorialPanel: document.getElementById('tutorial-panel'),
            tutorialText: document.getElementById('tutorial-text'),
            levelSelect: document.getElementById('level-select')
        };

        // Populate level selector
        this.populateLevelSelector();

        // Hook into NCA updates
        if (this.nca) {
            const originalOnCellUpdate = this.nca.onCellUpdate;
            this.nca.onCellUpdate = (stats) => {
                if (originalOnCellUpdate) originalOnCellUpdate(stats);
                this.onSimulationStep(stats);
            };
        }

        // Hook into memory overflows
        if (this.memoryMonitor) {
            this.memoryMonitor.onOverflow = () => {
                this.memoryOverflows++;
                this.addScorePenalty(50, 'Memory overflow');
            };
        }

        // Load first level
        this.loadLevel(0);
    }

    /* -------------------------------------------------------------------------
     * populateLevelSelector
     * -------------------------------------------------------------------------
     * Fill the level selection dropdown.
     * ----------------------------------------------------------------------- */
    populateLevelSelector() {
        if (!this.uiElements.levelSelect) return;

        this.uiElements.levelSelect.innerHTML = LEVELS.map((level, index) => `
            <option value="${index}">Level ${level.id}: ${level.name}</option>
        `).join('');

        this.uiElements.levelSelect.addEventListener('change', (e) => {
            this.loadLevel(parseInt(e.target.value));
        });
    }

    /* -------------------------------------------------------------------------
     * loadLevel
     * -------------------------------------------------------------------------
     * Load and set up a specific level.
     * 
     * Algorithm:
     *   1. Stop current simulation
     *   2. Get level configuration
     *   3. Reset all systems
     *   4. Place obstacles
     *   5. Set memory threshold
     *   6. Update UI
     *   7. Show tutorial
     * 
     * @param {number} levelIndex - Index into LEVELS array
     * ----------------------------------------------------------------------- */
    loadLevel(levelIndex) {

        // ===== STEP 1: Validate level index =====
        if (levelIndex < 0 || levelIndex >= LEVELS.length) {
            levelIndex = 0;
        }

        // ===== STEP 2: Stop simulation =====
        if (this.nca) {
            this.nca.stop();
        }

        // ===== STEP 3: Load level config =====
        this.currentLevelIndex = levelIndex;
        this.currentLevel = LEVELS[levelIndex];

        // ===== STEP 4: Reset game state =====
        this.isPlaying = false;
        this.isPaused = false;
        this.levelScore = 0;
        this.stepsTaken = 0;
        this.memoryOverflows = 0;
        this.goalProgress = 0;
        this.goalComplete = false;

        // ===== STEP 5: Reset NCA =====
        if (this.nca) {
            this.nca.reset('center');
        }

        // ===== STEP 6: Clear and place obstacles =====
        if (this.obstacleSystem) {
            this.obstacleSystem.clear();

            for (const obs of this.currentLevel.obstacles) {
                this.obstacleSystem.placeObstacleCircle(
                    obs.x,
                    obs.y,
                    obs.radius,
                    obs.type
                );
            }
        }

        // ===== STEP 7: Set memory threshold =====
        if (this.memoryMonitor) {
            this.memoryMonitor.setThreshold(this.currentLevel.memoryLimit);
            this.memoryMonitor.reset();
        }

        // ===== STEP 8: Reset explanation panel =====
        if (this.explanationPanel) {
            this.explanationPanel.reset();
            this.explanationPanel.addLogEntry(`Level ${this.currentLevel.id}: ${this.currentLevel.name}`, 'info');
        }

        // ===== STEP 9: Update UI =====
        this.updateLevelUI();
        this.showTutorial();

        // ===== STEP 10: Render initial state =====
        if (this.nca) {
            this.nca.render();
        }

        // ===== STEP 11: Fire callback =====
        if (this.onLevelStart) {
            this.onLevelStart(this.currentLevel);
        }
    }

    /* -------------------------------------------------------------------------
     * updateLevelUI
     * -------------------------------------------------------------------------
     * Update all level-related UI elements.
     * ----------------------------------------------------------------------- */
    updateLevelUI() {
        const level = this.currentLevel;
        if (!level) return;

        if (this.uiElements.levelName) {
            this.uiElements.levelName.textContent = `Level ${level.id}: ${level.name}`;
        }

        if (this.uiElements.levelDesc) {
            this.uiElements.levelDesc.textContent = level.description;
        }

        this.updateProgressUI();
        this.updateScoreUI();
    }

    /* -------------------------------------------------------------------------
     * showTutorial
     * -------------------------------------------------------------------------
     * Display the tutorial for the current level.
     * ----------------------------------------------------------------------- */
    showTutorial() {
        const level = this.currentLevel;
        if (!level || !level.tutorial || !this.uiElements.tutorialPanel) return;

        this.uiElements.tutorialText.innerHTML = level.tutorial.map(
            line => `<p>${line}</p>`
        ).join('');

        this.uiElements.tutorialPanel.style.display = 'block';
    }

    /* -------------------------------------------------------------------------
     * hideTutorial
     * -------------------------------------------------------------------------
     * Hide the tutorial panel.
     * ----------------------------------------------------------------------- */
    hideTutorial() {
        if (this.uiElements.tutorialPanel) {
            this.uiElements.tutorialPanel.style.display = 'none';
        }
    }

    /* -------------------------------------------------------------------------
     * start
     * -------------------------------------------------------------------------
     * Start or resume the game.
     * ----------------------------------------------------------------------- */
    start() {
        this.isPlaying = true;
        this.isPaused = false;
        this.hideTutorial();

        if (this.nca) {
            this.nca.start();
        }

        if (this.memoryMonitor) {
            this.memoryMonitor.start();
        }
    }

    /* -------------------------------------------------------------------------
     * pause
     * -------------------------------------------------------------------------
     * Pause the game.
     * ----------------------------------------------------------------------- */
    pause() {
        this.isPaused = true;

        if (this.nca) {
            this.nca.stop();
        }
    }

    /* -------------------------------------------------------------------------
     * resume
     * -------------------------------------------------------------------------
     * Resume from pause.
     * ----------------------------------------------------------------------- */
    resume() {
        this.isPaused = false;

        if (this.nca) {
            this.nca.start();
        }
    }

    /* -------------------------------------------------------------------------
     * onSimulationStep
     * -------------------------------------------------------------------------
     * Called after each NCA simulation step.
     * Updates goal progress and checks win condition.
     * 
     * @param {Object} stats - Step statistics from NCA
     * ----------------------------------------------------------------------- */
    onSimulationStep(stats) {

        if (!this.isPlaying || this.goalComplete) return;

        this.stepsTaken++;

        // Check goal based on type
        switch (this.currentLevel.goalType) {
            case 'coverage':
                this.checkCoverageGoal();
                break;
            case 'reach_goal':
                this.checkReachGoal();
                break;
        }

        // Update UI periodically
        if (this.stepsTaken % 10 === 0) {
            this.updateProgressUI();
        }
    }

    /* -------------------------------------------------------------------------
     * checkCoverageGoal
     * -------------------------------------------------------------------------
     * Check if coverage goal is met.
     * ----------------------------------------------------------------------- */
    checkCoverageGoal() {

        if (!this.nca) return;

        // Count alive cells
        let aliveCells = 0;
        const totalCells = this.nca.gridWidth * this.nca.gridHeight;

        for (let y = 0; y < this.nca.gridHeight; y++) {
            for (let x = 0; x < this.nca.gridWidth; x++) {
                if (this.nca.isAlive(x, y)) {
                    aliveCells++;
                }
            }
        }

        // Calculate coverage percentage
        this.goalProgress = (aliveCells / totalCells) * 100;

        // Check if goal met
        if (this.goalProgress >= this.currentLevel.goalValue) {
            this.completeLevel();
        }

        // Fire progress callback
        if (this.onGoalProgress) {
            this.onGoalProgress(this.goalProgress, this.currentLevel.goalValue);
        }
    }

    /* -------------------------------------------------------------------------
     * checkReachGoal
     * -------------------------------------------------------------------------
     * Check if cells have reached the goal zone.
     * ----------------------------------------------------------------------- */
    checkReachGoal() {

        if (!this.nca || !this.currentLevel.goalZone) return;

        const goal = this.currentLevel.goalZone;

        // Check if any alive cell is in goal zone
        for (let dy = -goal.radius; dy <= goal.radius; dy++) {
            for (let dx = -goal.radius; dx <= goal.radius; dx++) {
                if (dx * dx + dy * dy <= goal.radius * goal.radius) {
                    const x = goal.x + dx;
                    const y = goal.y + dy;

                    if (this.nca.isAlive(x, y)) {
                        this.goalProgress = 100;
                        this.completeLevel();
                        return;
                    }
                }
            }
        }

        // Update progress based on distance to goal
        // (for visual feedback, not used for completion)
        let minDist = Infinity;
        for (let y = 0; y < this.nca.gridHeight; y++) {
            for (let x = 0; x < this.nca.gridWidth; x++) {
                if (this.nca.isAlive(x, y)) {
                    const dist = Math.sqrt(
                        (x - goal.x) ** 2 + (y - goal.y) ** 2
                    );
                    minDist = Math.min(minDist, dist);
                }
            }
        }

        // Convert distance to progress (closer = higher)
        const maxDist = Math.sqrt(this.nca.gridWidth ** 2 + this.nca.gridHeight ** 2);
        this.goalProgress = Math.max(0, 100 - (minDist / maxDist) * 100);
    }

    /* -------------------------------------------------------------------------
     * completeLevel
     * -------------------------------------------------------------------------
     * Handle level completion.
     * ----------------------------------------------------------------------- */
    completeLevel() {

        this.goalComplete = true;
        this.nca.stop();

        // Calculate score
        const baseScore = 1000;
        const parBonus = this.stepsTaken < this.currentLevel.par ?
            Math.floor((this.currentLevel.par - this.stepsTaken) * 2) : 0;
        const memoryPenalty = this.memoryOverflows * 50;

        this.levelScore = Math.max(0, baseScore + parBonus - memoryPenalty);
        this.score += this.levelScore;

        // Update UI
        this.updateScoreUI();
        this.updateProgressUI();

        // Log completion
        if (this.explanationPanel) {
            this.explanationPanel.addLogEntry(
                `Level complete. Score: ${this.levelScore}`,
                'success'
            );
        }

        // Fire callback
        if (this.onLevelComplete) {
            this.onLevelComplete({
                level: this.currentLevel,
                score: this.levelScore,
                steps: this.stepsTaken,
                parBonus: parBonus,
                overflows: this.memoryOverflows
            });
        }

        // Show completion message
        this.showCompletionMessage();
    }

    /* -------------------------------------------------------------------------
     * showCompletionMessage
     * -------------------------------------------------------------------------
     * Display level completion feedback.
     * ----------------------------------------------------------------------- */
    showCompletionMessage() {
        const msg = document.createElement('div');
        msg.className = 'level-complete-message';
        msg.innerHTML = `
            <h2>Level Complete</h2>
            <div class="score-breakdown">
                <div>Base Score: 1000</div>
                <div>Par Bonus: +${this.stepsTaken < this.currentLevel.par ?
                Math.floor((this.currentLevel.par - this.stepsTaken) * 2) : 0}</div>
                <div>Memory Penalties: -${this.memoryOverflows * 50}</div>
                <div class="total">Total: ${this.levelScore}</div>
            </div>
            <button id="next-level-btn">Next Level</button>
        `;

        document.body.appendChild(msg);

        document.getElementById('next-level-btn').addEventListener('click', () => {
            msg.remove();
            this.loadLevel(this.currentLevelIndex + 1);
        });
    }

    /* -------------------------------------------------------------------------
     * addScorePenalty
     * -------------------------------------------------------------------------
     * Subtract from level score.
     * 
     * @param {number} points - Points to subtract
     * @param {string} reason - Reason for penalty
     * ----------------------------------------------------------------------- */
    addScorePenalty(points, reason) {
        this.levelScore = Math.max(0, this.levelScore - points);

        if (this.explanationPanel) {
            this.explanationPanel.addLogEntry(`-${points}: ${reason}`, 'warning');
        }

        this.updateScoreUI();
    }

    /* -------------------------------------------------------------------------
     * updateProgressUI
     * -------------------------------------------------------------------------
     * Update goal progress display.
     * ----------------------------------------------------------------------- */
    updateProgressUI() {

        if (this.uiElements.progress) {
            this.uiElements.progress.textContent =
                `${this.goalProgress.toFixed(1)}% / ${this.currentLevel.goalValue}%`;
        }

        if (this.uiElements.progressBar) {
            const percent = Math.min(100,
                (this.goalProgress / this.currentLevel.goalValue) * 100
            );
            this.uiElements.progressBar.style.width = percent + '%';
        }

        if (this.uiElements.stepCount) {
            this.uiElements.stepCount.textContent = this.stepsTaken.toLocaleString();
        }
    }

    /* -------------------------------------------------------------------------
     * updateScoreUI
     * -------------------------------------------------------------------------
     * Update score display.
     * ----------------------------------------------------------------------- */
    updateScoreUI() {
        if (this.uiElements.scoreDisplay) {
            this.uiElements.scoreDisplay.textContent = this.score.toLocaleString();
        }
    }

    /* -------------------------------------------------------------------------
     * getCurrentLevel
     * -------------------------------------------------------------------------
     * Get current level configuration.
     * 
     * @returns {Object} Current level object
     * ----------------------------------------------------------------------- */
    getCurrentLevel() {
        return this.currentLevel;
    }

    /* -------------------------------------------------------------------------
     * getGameState
     * -------------------------------------------------------------------------
     * Get complete game state for saving/debugging.
     * 
     * @returns {Object} Game state
     * ----------------------------------------------------------------------- */
    getGameState() {
        return {
            currentLevelIndex: this.currentLevelIndex,
            isPlaying: this.isPlaying,
            isPaused: this.isPaused,
            score: this.score,
            levelScore: this.levelScore,
            stepsTaken: this.stepsTaken,
            goalProgress: this.goalProgress,
            goalComplete: this.goalComplete,
            memoryOverflows: this.memoryOverflows
        };
    }
}

// Export to global scope
window.GameEngine = GameEngine;
window.LEVELS = LEVELS;

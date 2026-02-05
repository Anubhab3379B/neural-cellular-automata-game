/**
 * =============================================================================
 * SAVE-SYSTEM.JS - Save/Load Game State
 * =============================================================================
 * 
 * Handles persistent storage of game state using localStorage.
 * Supports saving/loading:
 *   - Grid state (cell data)
 *   - Obstacle configurations
 *   - Game progress (scores, level)
 *   - Custom patterns
 * 
 * =============================================================================
 */

/* -----------------------------------------------------------------------------
 * SECTION 1: CONFIGURATION
 * -------------------------------------------------------------------------- */

const STORAGE_PREFIX = 'nca_game_';
const MAX_SAVED_PATTERNS = 20;
const AUTO_SAVE_INTERVAL = 30000; // 30 seconds

/* -----------------------------------------------------------------------------
 * SECTION 2: SAVE SYSTEM CLASS
 * -------------------------------------------------------------------------- */

class SaveSystem {

    constructor() {
        this.autoSaveTimer = null;
        this.lastSaveTime = 0;
    }

    /* -------------------------------------------------------------------------
     * saveGameState
     * -------------------------------------------------------------------------
     * Save complete game state to localStorage.
     * 
     * @param {Object} gameState - State from GameEngine
     * @param {Object} nca - NCA instance
     * @param {Object} obstacleSystem - Obstacle system instance
     * @returns {boolean} Success status
     * ----------------------------------------------------------------------- */
    saveGameState(gameState, nca, obstacleSystem) {
        try {
            const saveData = {
                version: 2,
                timestamp: Date.now(),
                game: {
                    currentLevel: gameState.currentLevelIndex,
                    score: gameState.score,
                    stepsTaken: gameState.stepsTaken
                },
                grid: this.serializeGrid(nca),
                obstacles: this.serializeObstacles(obstacleSystem)
            };

            localStorage.setItem(STORAGE_PREFIX + 'state', JSON.stringify(saveData));
            this.lastSaveTime = Date.now();
            return true;
        } catch (e) {
            console.error('Failed to save game state:', e);
            return false;
        }
    }

    /* -------------------------------------------------------------------------
     * loadGameState
     * -------------------------------------------------------------------------
     * Load game state from localStorage.
     * 
     * @returns {Object|null} Saved state or null if not found
     * ----------------------------------------------------------------------- */
    loadGameState() {
        try {
            const data = localStorage.getItem(STORAGE_PREFIX + 'state');
            if (!data) return null;

            const saveData = JSON.parse(data);

            // Version check
            if (saveData.version < 2) {
                console.warn('Old save version, may not be compatible');
            }

            return saveData;
        } catch (e) {
            console.error('Failed to load game state:', e);
            return null;
        }
    }

    /* -------------------------------------------------------------------------
     * restoreGameState
     * -------------------------------------------------------------------------
     * Apply loaded state to game systems.
     * 
     * @param {Object} saveData - Loaded save data
     * @param {Object} gameEngine - Game engine instance
     * @param {Object} nca - NCA instance
     * @param {Object} obstacleSystem - Obstacle system instance
     * ----------------------------------------------------------------------- */
    restoreGameState(saveData, gameEngine, nca, obstacleSystem) {
        if (!saveData) return false;

        try {
            // Restore game progress
            if (saveData.game) {
                gameEngine.score = saveData.game.score || 0;
                gameEngine.loadLevel(saveData.game.currentLevel || 0);
            }

            // Restore grid
            if (saveData.grid) {
                this.deserializeGrid(saveData.grid, nca);
            }

            // Restore obstacles
            if (saveData.obstacles) {
                this.deserializeObstacles(saveData.obstacles, obstacleSystem);
            }

            nca.render();
            return true;
        } catch (e) {
            console.error('Failed to restore game state:', e);
            return false;
        }
    }

    /* -------------------------------------------------------------------------
     * serializeGrid
     * -------------------------------------------------------------------------
     * Convert NCA grid to storable format.
     * Uses run-length encoding for efficiency.
     * ----------------------------------------------------------------------- */
    serializeGrid(nca) {
        // Only save significant cells (where alpha > 0.1)
        const cells = [];

        for (let y = 0; y < nca.gridHeight; y++) {
            for (let x = 0; x < nca.gridWidth; x++) {
                const alpha = nca.getCell(x, y, 3);
                if (alpha > 0.1) {
                    // Save position and first 4 channels (RGBA)
                    cells.push({
                        x, y,
                        r: nca.getCell(x, y, 0),
                        g: nca.getCell(x, y, 1),
                        b: nca.getCell(x, y, 2),
                        a: alpha
                    });
                }
            }
        }

        return {
            width: nca.gridWidth,
            height: nca.gridHeight,
            cells: cells
        };
    }

    /* -------------------------------------------------------------------------
     * deserializeGrid
     * -------------------------------------------------------------------------
     * Restore grid from saved data.
     * ----------------------------------------------------------------------- */
    deserializeGrid(gridData, nca) {
        // Clear grid first
        nca.reset('empty');

        // Restore saved cells
        for (const cell of gridData.cells) {
            nca.setCell(cell.x, cell.y, 0, cell.r);
            nca.setCell(cell.x, cell.y, 1, cell.g);
            nca.setCell(cell.x, cell.y, 2, cell.b);
            nca.setCell(cell.x, cell.y, 3, cell.a);
        }
    }

    /* -------------------------------------------------------------------------
     * serializeObstacles
     * -------------------------------------------------------------------------
     * Convert obstacles to storable format.
     * ----------------------------------------------------------------------- */
    serializeObstacles(obstacleSystem) {
        const obstacles = [];

        for (let y = 0; y < obstacleSystem.gridHeight; y++) {
            for (let x = 0; x < obstacleSystem.gridWidth; x++) {
                const type = obstacleSystem.getObstacleType(x, y);
                if (type) {
                    obstacles.push({ x, y, type });
                }
            }
        }

        return obstacles;
    }

    /* -------------------------------------------------------------------------
     * deserializeObstacles
     * -------------------------------------------------------------------------
     * Restore obstacles from saved data.
     * ----------------------------------------------------------------------- */
    deserializeObstacles(obstacleData, obstacleSystem) {
        obstacleSystem.clear();

        for (const obs of obstacleData) {
            obstacleSystem.placeObstacle(obs.x, obs.y, obs.type);
        }

        obstacleSystem.recomputeAllGradients();
    }

    /* -------------------------------------------------------------------------
     * PATTERN MANAGEMENT
     * ----------------------------------------------------------------------- */

    /* -------------------------------------------------------------------------
     * savePattern
     * -------------------------------------------------------------------------
     * Save current grid as a named pattern.
     * 
     * @param {string} name - Pattern name
     * @param {Object} nca - NCA instance
     * ----------------------------------------------------------------------- */
    savePattern(name, nca) {
        const patterns = this.getPatterns();

        // Limit saved patterns
        if (patterns.length >= MAX_SAVED_PATTERNS) {
            patterns.shift(); // Remove oldest
        }

        patterns.push({
            name: name,
            timestamp: Date.now(),
            grid: this.serializeGrid(nca)
        });

        localStorage.setItem(STORAGE_PREFIX + 'patterns', JSON.stringify(patterns));
        return true;
    }

    /* -------------------------------------------------------------------------
     * getPatterns
     * -------------------------------------------------------------------------
     * Get list of saved patterns.
     * 
     * @returns {Array} Saved patterns
     * ----------------------------------------------------------------------- */
    getPatterns() {
        try {
            const data = localStorage.getItem(STORAGE_PREFIX + 'patterns');
            return data ? JSON.parse(data) : [];
        } catch (e) {
            return [];
        }
    }

    /* -------------------------------------------------------------------------
     * loadPattern
     * -------------------------------------------------------------------------
     * Load a saved pattern by index.
     * 
     * @param {number} index - Pattern index
     * @param {Object} nca - NCA instance
     * ----------------------------------------------------------------------- */
    loadPattern(index, nca) {
        const patterns = this.getPatterns();

        if (index >= 0 && index < patterns.length) {
            this.deserializeGrid(patterns[index].grid, nca);
            nca.render();
            return patterns[index].name;
        }

        return null;
    }

    /* -------------------------------------------------------------------------
     * deletePattern
     * -------------------------------------------------------------------------
     * Delete a saved pattern.
     * 
     * @param {number} index - Pattern index
     * ----------------------------------------------------------------------- */
    deletePattern(index) {
        const patterns = this.getPatterns();

        if (index >= 0 && index < patterns.length) {
            patterns.splice(index, 1);
            localStorage.setItem(STORAGE_PREFIX + 'patterns', JSON.stringify(patterns));
            return true;
        }

        return false;
    }

    /* -------------------------------------------------------------------------
     * HIGH SCORES
     * ----------------------------------------------------------------------- */

    saveHighScore(levelId, score) {
        const scores = this.getHighScores();

        if (!scores[levelId] || score > scores[levelId]) {
            scores[levelId] = score;
            localStorage.setItem(STORAGE_PREFIX + 'highscores', JSON.stringify(scores));
            return true;
        }

        return false;
    }

    getHighScores() {
        try {
            const data = localStorage.getItem(STORAGE_PREFIX + 'highscores');
            return data ? JSON.parse(data) : {};
        } catch (e) {
            return {};
        }
    }

    /* -------------------------------------------------------------------------
     * AUTO-SAVE
     * ----------------------------------------------------------------------- */

    startAutoSave(gameEngine, nca, obstacleSystem) {
        this.stopAutoSave();

        this.autoSaveTimer = setInterval(() => {
            if (gameEngine.isPlaying) {
                this.saveGameState(gameEngine.getGameState(), nca, obstacleSystem);
            }
        }, AUTO_SAVE_INTERVAL);
    }

    stopAutoSave() {
        if (this.autoSaveTimer) {
            clearInterval(this.autoSaveTimer);
            this.autoSaveTimer = null;
        }
    }

    /* -------------------------------------------------------------------------
     * UTILITY
     * ----------------------------------------------------------------------- */

    clearAllData() {
        const keys = Object.keys(localStorage).filter(k => k.startsWith(STORAGE_PREFIX));
        keys.forEach(k => localStorage.removeItem(k));
    }

    getStorageUsage() {
        let total = 0;
        const keys = Object.keys(localStorage).filter(k => k.startsWith(STORAGE_PREFIX));
        keys.forEach(k => {
            total += localStorage.getItem(k).length * 2; // UTF-16
        });
        return total;
    }
}

// Export
window.SaveSystem = SaveSystem;

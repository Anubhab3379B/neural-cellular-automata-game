/**
 * =============================================================================
 * CONTROLS.JS - UI Controls and System Integration
 * =============================================================================
 * 
 * This module initializes and connects all the game components:
 *   1. NCA simulation engine
 *   2. Obstacle system
 *   3. Explanation panel
 *   4. Memory monitor
 *   5. Game engine
 *   6. Save system
 *   7. Pattern library
 * 
 * It also handles user input from buttons, sliders, and canvas interactions.
 * 
 * =============================================================================
 */

/* -----------------------------------------------------------------------------
 * SECTION 1: GLOBAL STATE
 * -------------------------------------------------------------------------- */

/** @type {NeuralCellularAutomata} Main NCA simulation instance */
let nca = null;

/** @type {ObstacleSystem} Obstacle management system */
let obstacleSystem = null;

/** @type {ExplanationPanel} Algorithm explanation panel */
let explanationPanel = null;

/** @type {MemoryMonitor} Memory usage monitor */
let memoryMonitor = null;

/** @type {GameEngine} Game level and scoring system */
let gameEngine = null;

/** @type {SaveSystem} Save/load system */
let saveSystem = null;

/** @type {PatternLibrary} Pattern library */
let patternLibrary = null;

/** Current drawing tool: 'draw' | 'erase' | 'wall' | 'repulsor' | 'attractor' | 'clear-obstacles' */
let currentTool = 'draw';

/** Current brush size */
let brushSize = 3;

/** Is mouse/touch currently pressed */
let isDrawing = false;

/** Canvas offset for coordinate calculation */
let canvasOffset = { x: 0, y: 0 };

/** FPS tracking */
let fpsHistory = [];
let lastFrameTime = performance.now();

/* -----------------------------------------------------------------------------
 * SECTION 2: INITIALIZATION
 * -------------------------------------------------------------------------- */

/**
 * Initialize all game systems when the DOM is ready.
 */
document.addEventListener('DOMContentLoaded', function () {

    // ===== STEP 1: Initialize NCA =====
    nca = new NeuralCellularAutomata('nca-canvas', {
        gridWidth: 72,
        gridHeight: 72,
        pixelSize: 6,
        fireRate: 0.5,
        channels: 16
    });

    // ===== STEP 2: Initialize Obstacle System =====
    obstacleSystem = new ObstacleSystem(nca.gridWidth, nca.gridHeight);
    nca.attachObstacleSystem(obstacleSystem);

    // ===== STEP 3: Initialize Explanation Panel =====
    explanationPanel = new ExplanationPanel('explanation-panel');

    // Hook NCA to explanation panel
    nca.onStepComplete = function (stats) {
        explanationPanel.updateCellStats(stats);
    };

    // ===== STEP 4: Initialize Memory Monitor =====
    memoryMonitor = new MemoryMonitor('memory-panel', {
        thresholdKB: 100
    });
    memoryMonitor.attach(nca, obstacleSystem);

    // ===== STEP 5: Initialize Game Engine =====
    gameEngine = new GameEngine(nca, obstacleSystem, memoryMonitor, explanationPanel);
    gameEngine.initialize();

    // Hook level changes for obstacles
    gameEngine.onLevelStart = function (level) {
        explanationPanel.addLogEntry(`Loaded level: ${level.name}`, 'info');
    };

    // ===== STEP 6: Initialize Save System =====
    saveSystem = new SaveSystem();

    // ===== STEP 7: Initialize Pattern Library =====
    patternLibrary = new PatternLibrary('pattern-library');
    patternLibrary.attach(nca, saveSystem);
    patternLibrary.createUI();
    patternLibrary.onPatternApplied = function (name) {
        showToast(`Applied pattern: ${name}`, 'success');
        explanationPanel.addLogEntry(`Pattern: ${name}`, 'info');
    };

    // ===== STEP 8: Set up UI event listeners =====
    setupToolButtons();
    setupSliders();
    setupPlaybackControls();
    setupCanvasInteraction();
    setupKeyboardShortcuts();
    setupTutorialButton();
    setupSaveLoadButtons();

    // ===== STEP 9: Initial render =====
    nca.render();
    updateCanvasOffset();

    // ===== STEP 10: FPS counter =====
    setInterval(updateFPSDisplay, 500);

    // ===== STEP 11: Try to load saved game =====
    const savedState = saveSystem.loadGameState();
    if (savedState) {
        showToast('Previous game found. Click Load to restore.', 'info');
    }

    console.log('NCA Game initialized successfully');
});

/* -----------------------------------------------------------------------------
 * SECTION 3: TOOL BUTTONS
 * -------------------------------------------------------------------------- */

/**
 * Set up tool button click handlers.
 */
function setupToolButtons() {

    const tools = ['draw', 'erase', 'wall', 'repulsor', 'attractor', 'clear-obstacles'];

    tools.forEach(tool => {
        const btn = document.getElementById(`btn-${tool}`);
        if (!btn) return;

        btn.addEventListener('click', function () {

            // Handle clear obstacles separately
            if (tool === 'clear-obstacles') {
                obstacleSystem.clear();
                explanationPanel.addLogEntry('Cleared all obstacles', 'info');
                nca.render();
                return;
            }

            // Set current tool
            currentTool = tool;

            // Update active state
            document.querySelectorAll('.tool-btn').forEach(b => b.classList.remove('active'));
            this.classList.add('active');

            // Log tool change
            explanationPanel.addLogEntry(`Tool: ${tool}`, 'info');
        });
    });
}

/* -----------------------------------------------------------------------------
 * SECTION 4: SLIDERS
 * -------------------------------------------------------------------------- */

/**
 * Set up slider controls.
 */
function setupSliders() {

    // Brush size slider
    const brushSlider = document.getElementById('brush-size');
    const brushValue = document.getElementById('brush-value');

    if (brushSlider && brushValue) {
        brushSlider.addEventListener('input', function () {
            brushSize = parseInt(this.value);
            brushValue.textContent = brushSize;
        });
    }

    // Speed slider
    const speedSlider = document.getElementById('speed');
    const speedValue = document.getElementById('speed-value');

    if (speedSlider && speedValue) {
        speedSlider.addEventListener('input', function () {
            const speed = parseInt(this.value);
            speedValue.textContent = speed;

            // Adjust NCA speed (higher = faster update rate)
            if (nca) {
                nca.speed = speed;
            }
        });
    }
}

/* -----------------------------------------------------------------------------
 * SECTION 5: PLAYBACK CONTROLS
 * -------------------------------------------------------------------------- */

/**
 * Set up play/pause, step, and reset buttons.
 */
function setupPlaybackControls() {

    // Play/Pause button
    const playPauseBtn = document.getElementById('btn-play-pause');
    const playLabel = document.getElementById('play-label');

    if (playPauseBtn) {
        playPauseBtn.addEventListener('click', function () {
            if (nca.running) {
                nca.stop();
                memoryMonitor.stop();
                playLabel.textContent = 'Start';
                explanationPanel.addLogEntry('Paused', 'info');
            } else {
                gameEngine.start();
                playLabel.textContent = 'Pause';
                explanationPanel.addLogEntry('Running', 'info');
            }
        });
    }

    // Step button
    const stepBtn = document.getElementById('btn-step');
    if (stepBtn) {
        stepBtn.addEventListener('click', function () {
            if (!nca.running) {
                nca.step();
                nca.render();
                explanationPanel.addLogEntry('Single step', 'info');
            }
        });
    }

    // Reset button
    const resetBtn = document.getElementById('btn-reset');
    if (resetBtn) {
        resetBtn.addEventListener('click', function () {
            gameEngine.loadLevel(gameEngine.currentLevelIndex);
            const playLabel = document.getElementById('play-label');
            if (playLabel) playLabel.textContent = 'Start';
        });
    }
}

/* -----------------------------------------------------------------------------
 * SECTION 5B: SAVE/LOAD BUTTONS
 * -------------------------------------------------------------------------- */

/**
 * Set up save and load buttons.
 */
function setupSaveLoadButtons() {

    const saveBtn = document.getElementById('btn-save');
    const loadBtn = document.getElementById('btn-load');

    if (saveBtn) {
        saveBtn.addEventListener('click', function () {
            const gameState = {
                currentLevelIndex: gameEngine.currentLevelIndex,
                score: gameEngine.score,
                stepsTaken: gameEngine.stepsTaken
            };

            if (saveSystem.saveGameState(gameState, nca, obstacleSystem)) {
                showToast('Game saved successfully!', 'success');
                explanationPanel.addLogEntry('Game saved', 'success');
            } else {
                showToast('Failed to save game', 'error');
            }
        });
    }

    if (loadBtn) {
        loadBtn.addEventListener('click', function () {
            const savedState = saveSystem.loadGameState();

            if (savedState) {
                if (saveSystem.restoreGameState(savedState, gameEngine, nca, obstacleSystem)) {
                    showToast('Game loaded!', 'success');
                    explanationPanel.addLogEntry('Game restored', 'success');

                    // Update UI
                    const playLabel = document.getElementById('play-label');
                    if (playLabel) playLabel.textContent = 'Start';
                } else {
                    showToast('Failed to restore game', 'error');
                }
            } else {
                showToast('No saved game found', 'error');
            }
        });
    }
}

/* -----------------------------------------------------------------------------
 * SECTION 6: CANVAS INTERACTION
 * -------------------------------------------------------------------------- */

/**
 * Update canvas offset for coordinate calculation.
 */
function updateCanvasOffset() {
    const canvas = document.getElementById('nca-canvas');
    if (canvas) {
        const rect = canvas.getBoundingClientRect();
        canvasOffset = { x: rect.left, y: rect.top };
    }
}

/**
 * Convert screen coordinates to grid coordinates.
 * 
 * @param {number} clientX - Screen X coordinate
 * @param {number} clientY - Screen Y coordinate
 * @returns {Object} {x, y} grid coordinates
 */
function screenToGrid(clientX, clientY) {
    updateCanvasOffset();

    const x = Math.floor((clientX - canvasOffset.x) / nca.pixelSize);
    const y = Math.floor((clientY - canvasOffset.y) / nca.pixelSize);

    return { x, y };
}

/**
 * Handle a draw/interaction event at screen coordinates.
 * 
 * @param {number} clientX - Screen X coordinate
 * @param {number} clientY - Screen Y coordinate
 */
function handleDraw(clientX, clientY) {

    const { x, y } = screenToGrid(clientX, clientY);

    // Update coordinate display
    const coordDisplay = document.getElementById('coord-display');
    if (coordDisplay) {
        coordDisplay.textContent = `Position: (${x}, ${y})`;
    }

    // Apply tool
    switch (currentTool) {

        case 'draw':
            // Add seed cells
            for (let dy = -brushSize; dy <= brushSize; dy++) {
                for (let dx = -brushSize; dx <= brushSize; dx++) {
                    if (dx * dx + dy * dy <= brushSize * brushSize) {
                        nca.setCell(x + dx, y + dy, true);
                    }
                }
            }
            break;

        case 'erase':
            // Remove cells
            for (let dy = -brushSize; dy <= brushSize; dy++) {
                for (let dx = -brushSize; dx <= brushSize; dx++) {
                    if (dx * dx + dy * dy <= brushSize * brushSize) {
                        nca.setCell(x + dx, y + dy, false);
                    }
                }
            }
            break;

        case 'wall':
            obstacleSystem.placeObstacleCircle(x, y, brushSize, 'wall');
            break;

        case 'repulsor':
            obstacleSystem.placeObstacleCircle(x, y, brushSize, 'repulsor');
            break;

        case 'attractor':
            obstacleSystem.placeObstacleCircle(x, y, brushSize, 'attractor');
            break;
    }

    // Show obstacle info if hovering over one
    const obstacleInfo = obstacleSystem.getExplanation(x, y);
    if (obstacleInfo) {
        explanationPanel.showObstacleInfo(obstacleInfo);
    } else {
        explanationPanel.hideObstacleInfo();
    }

    // Render if not running (running will auto-render)
    if (!nca.running) {
        nca.render();
    }
}

/**
 * Set up canvas mouse and touch interaction.
 */
function setupCanvasInteraction() {

    const canvas = document.getElementById('nca-canvas');
    if (!canvas) return;

    // Mouse events
    canvas.addEventListener('mousedown', function (e) {
        isDrawing = true;
        handleDraw(e.clientX, e.clientY);
    });

    canvas.addEventListener('mousemove', function (e) {
        if (isDrawing) {
            handleDraw(e.clientX, e.clientY);
        } else {
            // Show coordinates and obstacle info on hover
            const { x, y } = screenToGrid(e.clientX, e.clientY);
            const coordDisplay = document.getElementById('coord-display');
            if (coordDisplay) {
                coordDisplay.textContent = `Position: (${x}, ${y})`;
            }

            const obstacleInfo = obstacleSystem.getExplanation(x, y);
            if (obstacleInfo) {
                explanationPanel.showObstacleInfo(obstacleInfo);
            } else {
                explanationPanel.hideObstacleInfo();
            }
        }
    });

    canvas.addEventListener('mouseup', function () {
        isDrawing = false;
    });

    canvas.addEventListener('mouseleave', function () {
        isDrawing = false;
    });

    // Touch events
    canvas.addEventListener('touchstart', function (e) {
        e.preventDefault();
        isDrawing = true;
        const touch = e.touches[0];
        handleDraw(touch.clientX, touch.clientY);
    }, { passive: false });

    canvas.addEventListener('touchmove', function (e) {
        e.preventDefault();
        if (isDrawing) {
            const touch = e.touches[0];
            handleDraw(touch.clientX, touch.clientY);
        }
    }, { passive: false });

    canvas.addEventListener('touchend', function () {
        isDrawing = false;
    });

    // Window resize
    window.addEventListener('resize', updateCanvasOffset);
}

/* -----------------------------------------------------------------------------
 * SECTION 7: KEYBOARD SHORTCUTS
 * -------------------------------------------------------------------------- */

/**
 * Set up keyboard shortcuts.
 */
function setupKeyboardShortcuts() {

    document.addEventListener('keydown', function (e) {

        // Ignore if typing in an input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') {
            return;
        }

        switch (e.key.toLowerCase()) {

            case ' ':  // Space - Play/Pause
                e.preventDefault();
                document.getElementById('btn-play-pause')?.click();
                break;

            case 'r':  // R - Reset
                document.getElementById('btn-reset')?.click();
                break;

            case 'd':  // D - Draw tool
                document.getElementById('btn-draw')?.click();
                break;

            case 'e':  // E - Erase tool
                document.getElementById('btn-erase')?.click();
                break;

            case 'w':  // W - Wall tool
                document.getElementById('btn-wall')?.click();
                break;

            case 'a':  // A - Attractor tool
                document.getElementById('btn-attractor')?.click();
                break;

            case 'x':  // X - Repulsor tool
                document.getElementById('btn-repulsor')?.click();
                break;

            case 's':  // S - Single step (with Ctrl for save)
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    document.getElementById('btn-save')?.click();
                } else {
                    document.getElementById('btn-step')?.click();
                }
                break;

            case 'l':  // L - Load (with Ctrl)
                if (e.ctrlKey || e.metaKey) {
                    e.preventDefault();
                    document.getElementById('btn-load')?.click();
                }
                break;

            case 'arrowup':
            case '+':
                // Increase brush size
                const brushSlider = document.getElementById('brush-size');
                if (brushSlider) {
                    brushSlider.value = Math.min(10, parseInt(brushSlider.value) + 1);
                    brushSlider.dispatchEvent(new Event('input'));
                }
                break;

            case 'arrowdown':
            case '-':
                // Decrease brush size
                const brushSliderDown = document.getElementById('brush-size');
                if (brushSliderDown) {
                    brushSliderDown.value = Math.max(1, parseInt(brushSliderDown.value) - 1);
                    brushSliderDown.dispatchEvent(new Event('input'));
                }
                break;
        }
    });
}

/* -----------------------------------------------------------------------------
 * SECTION 8: TUTORIAL
 * -------------------------------------------------------------------------- */

/**
 * Set up tutorial button.
 */
function setupTutorialButton() {

    const startBtn = document.getElementById('btn-start-game');
    if (startBtn) {
        startBtn.addEventListener('click', function () {
            gameEngine.start();
            document.getElementById('play-label').textContent = 'Pause';
        });
    }
}

/* -----------------------------------------------------------------------------
 * SECTION 9: FPS COUNTER
 * -------------------------------------------------------------------------- */

/**
 * Update FPS display.
 */
function updateFPSDisplay() {

    const fpsCounter = document.getElementById('fps-counter');
    const cellCount = document.getElementById('cell-count');

    if (!fpsCounter || !nca) return;

    // Calculate FPS from NCA step count
    if (nca.running) {
        const now = performance.now();
        const elapsed = now - lastFrameTime;
        const fps = Math.round(1000 / elapsed * (nca.stepCount - (fpsHistory[0] || 0)));
        fpsHistory.push(nca.stepCount);
        if (fpsHistory.length > 2) fpsHistory.shift();
        lastFrameTime = now;

        fpsCounter.textContent = `${Math.min(60, Math.max(0, fps || 0))} FPS`;
    } else {
        fpsCounter.textContent = '0 FPS';
    }

    // Update cell count
    if (cellCount) {
        let alive = 0;
        for (let y = 0; y < nca.gridHeight; y++) {
            for (let x = 0; x < nca.gridWidth; x++) {
                if (nca.isAlive(x, y)) alive++;
            }
        }
        cellCount.textContent = `Cells: ${alive}`;
    }
}

/* -----------------------------------------------------------------------------
 * SECTION 10: TOAST NOTIFICATIONS
 * -------------------------------------------------------------------------- */

/**
 * Show a toast notification.
 * 
 * @param {string} message - Message to display
 * @param {string} type - 'success', 'error', or 'info'
 * @param {number} duration - How long to show (ms)
 */
function showToast(message, type = 'info', duration = 3000) {
    const toast = document.getElementById('toast');
    if (!toast) return;

    toast.textContent = message;
    toast.className = `toast ${type}`;

    // Trigger animation
    requestAnimationFrame(() => {
        toast.classList.add('show');
    });

    // Hide after duration
    setTimeout(() => {
        toast.classList.remove('show');
    }, duration);
}

/* -----------------------------------------------------------------------------
 * SECTION 11: EXPORTS (for debugging)
 * -------------------------------------------------------------------------- */

// Expose to window for debugging
window.nca = () => nca;
window.obstacleSystem = () => obstacleSystem;
window.gameEngine = () => gameEngine;
window.memoryMonitor = () => memoryMonitor;
window.explanationPanel = () => explanationPanel;
window.saveSystem = () => saveSystem;
window.patternLibrary = () => patternLibrary;
window.showToast = showToast;


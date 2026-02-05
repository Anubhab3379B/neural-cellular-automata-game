/**
 * =============================================================================
 * PATTERN-LIBRARY.JS - Pre-made Seed Patterns
 * =============================================================================
 * 
 * Provides a collection of interesting seed patterns for the NCA simulation.
 * Users can quickly apply these patterns instead of drawing from scratch.
 * 
 * =============================================================================
 */

/* -----------------------------------------------------------------------------
 * SECTION 1: BUILT-IN PATTERNS
 * -------------------------------------------------------------------------- */

const BUILTIN_PATTERNS = [
    {
        id: 'center',
        name: 'Center Seed',
        description: 'Single seed in the center',
        icon: 'o',
        generate: (width, height) => {
            return [{ x: Math.floor(width / 2), y: Math.floor(height / 2) }];
        }
    },
    {
        id: 'corners',
        name: 'Four Corners',
        description: 'Seeds in each corner',
        icon: '::',
        generate: (width, height) => {
            const margin = 5;
            return [
                { x: margin, y: margin },
                { x: width - margin, y: margin },
                { x: margin, y: height - margin },
                { x: width - margin, y: height - margin }
            ];
        }
    },
    {
        id: 'ring',
        name: 'Ring',
        description: 'Circle of seeds',
        icon: 'O',
        generate: (width, height) => {
            const cx = width / 2;
            const cy = height / 2;
            const radius = Math.min(width, height) / 4;
            const points = [];

            for (let angle = 0; angle < Math.PI * 2; angle += 0.2) {
                points.push({
                    x: Math.floor(cx + Math.cos(angle) * radius),
                    y: Math.floor(cy + Math.sin(angle) * radius)
                });
            }

            return points;
        }
    },
    {
        id: 'line',
        name: 'Horizontal Line',
        description: 'Line across the center',
        icon: '--',
        generate: (width, height) => {
            const y = Math.floor(height / 2);
            const points = [];

            for (let x = 10; x < width - 10; x += 3) {
                points.push({ x, y });
            }

            return points;
        }
    },
    {
        id: 'cross',
        name: 'Cross',
        description: 'Plus sign pattern',
        icon: '+',
        generate: (width, height) => {
            const cx = Math.floor(width / 2);
            const cy = Math.floor(height / 2);
            const size = 15;
            const points = [];

            // Horizontal
            for (let dx = -size; dx <= size; dx++) {
                points.push({ x: cx + dx, y: cy });
            }

            // Vertical
            for (let dy = -size; dy <= size; dy++) {
                if (dy !== 0) points.push({ x: cx, y: cy + dy });
            }

            return points;
        }
    },
    {
        id: 'spiral',
        name: 'Spiral',
        description: 'Spiral pattern from center',
        icon: '@',
        generate: (width, height) => {
            const cx = width / 2;
            const cy = height / 2;
            const points = [];

            for (let t = 0; t < 20; t += 0.3) {
                const r = t * 1.5;
                points.push({
                    x: Math.floor(cx + Math.cos(t) * r),
                    y: Math.floor(cy + Math.sin(t) * r)
                });
            }

            return points;
        }
    },
    {
        id: 'grid',
        name: 'Grid',
        description: 'Regular grid of seeds',
        icon: '#',
        generate: (width, height) => {
            const points = [];
            const spacing = 12;
            const margin = 10;

            for (let y = margin; y < height - margin; y += spacing) {
                for (let x = margin; x < width - margin; x += spacing) {
                    points.push({ x, y });
                }
            }

            return points;
        }
    },
    {
        id: 'random',
        name: 'Random',
        description: 'Randomly scattered seeds',
        icon: '*',
        generate: (width, height) => {
            const points = [];
            const count = 20;
            const margin = 5;

            for (let i = 0; i < count; i++) {
                points.push({
                    x: margin + Math.floor(Math.random() * (width - margin * 2)),
                    y: margin + Math.floor(Math.random() * (height - margin * 2))
                });
            }

            return points;
        }
    },
    {
        id: 'triangle',
        name: 'Triangle',
        description: 'Triangular arrangement',
        icon: '^',
        generate: (width, height) => {
            const cx = width / 2;
            const cy = height / 2;
            const size = 20;
            const points = [];

            // Three vertices
            for (let i = 0; i < 3; i++) {
                const angle = (i * Math.PI * 2 / 3) - Math.PI / 2;
                const x = Math.floor(cx + Math.cos(angle) * size);
                const y = Math.floor(cy + Math.sin(angle) * size);

                // Add cluster at each vertex
                for (let dx = -2; dx <= 2; dx++) {
                    for (let dy = -2; dy <= 2; dy++) {
                        if (dx * dx + dy * dy <= 4) {
                            points.push({ x: x + dx, y: y + dy });
                        }
                    }
                }
            }

            return points;
        }
    },
    {
        id: 'waves',
        name: 'Waves',
        description: 'Sinusoidal wave pattern',
        icon: '~',
        generate: (width, height) => {
            const points = [];
            const cy = height / 2;

            for (let x = 5; x < width - 5; x += 2) {
                const y = Math.floor(cy + Math.sin(x * 0.2) * 15);
                points.push({ x, y });
            }

            return points;
        }
    }
];

/* -----------------------------------------------------------------------------
 * SECTION 2: PATTERN LIBRARY CLASS
 * -------------------------------------------------------------------------- */

class PatternLibrary {

    constructor(containerId) {
        this.container = document.getElementById(containerId);
        this.nca = null;
        this.saveSystem = null;
        this.onPatternApplied = null;

        this.builtinPatterns = BUILTIN_PATTERNS;
    }

    /* -------------------------------------------------------------------------
     * attach
     * -------------------------------------------------------------------------
     * Connect to NCA and save system.
     * ----------------------------------------------------------------------- */
    attach(nca, saveSystem) {
        this.nca = nca;
        this.saveSystem = saveSystem;
    }

    /* -------------------------------------------------------------------------
     * createUI
     * -------------------------------------------------------------------------
     * Build the pattern selection interface.
     * ----------------------------------------------------------------------- */
    createUI() {
        if (!this.container) return;

        this.container.innerHTML = `
            <div class="pattern-library">
                <h3>Pattern Library</h3>
                
                <div class="pattern-tabs">
                    <button class="pattern-tab active" data-tab="builtin">Built-in</button>
                    <button class="pattern-tab" data-tab="saved">Saved</button>
                </div>
                
                <div class="pattern-grid" id="pattern-grid-builtin">
                    ${this.builtinPatterns.map((p, i) => `
                        <button class="pattern-btn" data-pattern="${p.id}" title="${p.description}">
                            <span class="pattern-icon">${p.icon}</span>
                            <span class="pattern-name">${p.name}</span>
                        </button>
                    `).join('')}
                </div>
                
                <div class="pattern-grid hidden" id="pattern-grid-saved">
                    <div id="saved-patterns-list"></div>
                    <button class="pattern-btn save-current" id="btn-save-pattern">
                        <span class="pattern-icon">+</span>
                        <span class="pattern-name">Save Current</span>
                    </button>
                </div>
            </div>
        `;

        this.setupEventListeners();
        this.refreshSavedPatterns();
    }

    /* -------------------------------------------------------------------------
     * setupEventListeners
     * -------------------------------------------------------------------------
     * Set up pattern selection handlers.
     * ----------------------------------------------------------------------- */
    setupEventListeners() {
        // Tab switching
        const tabs = this.container.querySelectorAll('.pattern-tab');
        tabs.forEach(tab => {
            tab.addEventListener('click', () => {
                tabs.forEach(t => t.classList.remove('active'));
                tab.classList.add('active');

                const tabName = tab.dataset.tab;
                document.getElementById('pattern-grid-builtin')
                    .classList.toggle('hidden', tabName !== 'builtin');
                document.getElementById('pattern-grid-saved')
                    .classList.toggle('hidden', tabName !== 'saved');
            });
        });

        // Built-in pattern selection
        const patternBtns = this.container.querySelectorAll('[data-pattern]');
        patternBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.applyPattern(btn.dataset.pattern);
            });
        });

        // Save current pattern
        const saveBtn = document.getElementById('btn-save-pattern');
        if (saveBtn) {
            saveBtn.addEventListener('click', () => {
                this.promptSavePattern();
            });
        }
    }

    /* -------------------------------------------------------------------------
     * applyPattern
     * -------------------------------------------------------------------------
     * Apply a built-in pattern to the grid.
     * ----------------------------------------------------------------------- */
    applyPattern(patternId) {
        if (!this.nca) return;

        const pattern = this.builtinPatterns.find(p => p.id === patternId);
        if (!pattern) return;

        // Clear grid
        this.nca.reset('empty');

        // Generate and apply pattern
        const points = pattern.generate(this.nca.gridWidth, this.nca.gridHeight);

        for (const point of points) {
            this.nca.setSeedAt(point.x, point.y);
        }

        this.nca.render();

        if (this.onPatternApplied) {
            this.onPatternApplied(pattern.name);
        }
    }

    /* -------------------------------------------------------------------------
     * promptSavePattern
     * -------------------------------------------------------------------------
     * Show dialog to save current pattern.
     * ----------------------------------------------------------------------- */
    promptSavePattern() {
        const name = prompt('Enter pattern name:', 'My Pattern ' + Date.now());

        if (name && this.saveSystem && this.nca) {
            this.saveSystem.savePattern(name, this.nca);
            this.refreshSavedPatterns();
        }
    }

    /* -------------------------------------------------------------------------
     * refreshSavedPatterns
     * -------------------------------------------------------------------------
     * Update the saved patterns list.
     * ----------------------------------------------------------------------- */
    refreshSavedPatterns() {
        const list = document.getElementById('saved-patterns-list');
        if (!list || !this.saveSystem) return;

        const patterns = this.saveSystem.getPatterns();

        if (patterns.length === 0) {
            list.innerHTML = '<p class="no-patterns">No saved patterns</p>';
            return;
        }

        list.innerHTML = patterns.map((p, i) => `
            <div class="saved-pattern-item">
                <button class="pattern-btn" data-saved-index="${i}">
                    <span class="pattern-name">${p.name}</span>
                </button>
                <button class="delete-btn" data-delete-index="${i}" title="Delete">X</button>
            </div>
        `).join('');

        // Load handlers
        list.querySelectorAll('[data-saved-index]').forEach(btn => {
            btn.addEventListener('click', () => {
                const name = this.saveSystem.loadPattern(parseInt(btn.dataset.savedIndex), this.nca);
                if (name && this.onPatternApplied) {
                    this.onPatternApplied(name);
                }
            });
        });

        // Delete handlers
        list.querySelectorAll('[data-delete-index]').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                if (confirm('Delete this pattern?')) {
                    this.saveSystem.deletePattern(parseInt(btn.dataset.deleteIndex));
                    this.refreshSavedPatterns();
                }
            });
        });
    }
}

// Export
window.PatternLibrary = PatternLibrary;
window.BUILTIN_PATTERNS = BUILTIN_PATTERNS;

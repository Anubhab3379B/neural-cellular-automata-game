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


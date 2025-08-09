### Rogue-2048: An Offline Web Prototype

This project is a unique take on the classic 2048 puzzle game, blending its core mechanics with elements from Roguelike games. Developed as a single HTML file, it's a completely offline experience.

---

### Gameplay

The game combines the familiar tile-merging puzzle with a simple combat system.

* **Core Mechanics**: Use the arrow keys (← ↑ → ↓) to move tiles on the 4x4 grid. When two tiles of the same number merge, they combine into a new tile with a value equal to their sum.
* **Roguelike Elements**:
    * **Player & Enemy HP**: The game introduces a simple health point (HP) system for both the player and an enemy.
    * **Combat**: Merging tiles deals damage to the enemy. The amount of damage is calculated based on the merged value ($`mergedValue / 8`$).
    * **Enemy Attacks**: The enemy will attack the player every 5 moves, so you must strategically merge tiles to defeat the enemy before your HP runs out.

---

### Features

* **Offline**: The entire game is contained within a single HTML file, allowing you to play it offline without any internet connection.
* **Pure Web Technologies**: The project is built using only HTML and vanilla JavaScript, making it an excellent example for web development beginners.
* **Undo Function**: You can undo your last move, which is a helpful feature for strategizing.


Feel free to fork the repository and contribute your own ideas!

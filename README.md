# GameEngine2 — FPS prototype (Next.js)

First-person shooter basics on **Next.js** and **Three.js**: square arena, WASD movement, mouse and arrow-key look (arrows ease in smoothly), sprint, crouch, jump, and shooting.

## Run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Click the overlay to capture the mouse. Press **Esc** to release pointer lock.

## Project structure

```
app/
  layout.jsx      # Root layout + metadata
  page.jsx        # Home page
  globals.css     # Full-screen game UI styles
components/
  FpsGame.jsx     # Client component — Three.js game loop
lib/
  Level.js        # Square arena geometry
  Input.js        # Keyboard / mouse / pointer lock
  PlayerController.js
```

## Controls

| Input | Action |
|-------|--------|
| **W A S D** | Walk (rebindable in Controls) |
| **Z** (hold) | Aim down sights |
| **Shift** | Sprint |
| **Ctrl** | Crouch |
| **Space** | Jump |
| **Mouse** | Look |
| **Arrow keys** | Look (smooth ease-in) |
| **Enter** / **LMB** | Shoot |
| **Settings** | Look sensitivity, invert Y, weapon tuning on/off |
| **Controls** | Key bindings |

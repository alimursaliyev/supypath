# Path Plugin v3.0

Expression-driven logo anatomy script for After Effects. Extracts the structural skeleton of vector shape layers — anchor points, bezier handles, outlines, grid lines, and coordinate labels — as separate, fully animated layers.

## How to Use

1. **File > Scripts > Run Script File** and select `Path Plugin.jsx`
2. Select a source shape layer from the dropdown
3. Click **Build Visuals**

The script creates a `PP_Control` null with all settings as effect sliders — no need to re-run the script to tweak anything.

## What It Generates

| Layer | Description |
|-------|-------------|
| **PP_Control** | Null with all visibility, size, color, animation, and offset controls |
| **PP_Anchors** | Rectangles at every vertex (size, roundness, color controllable) |
| **PP_Handles** | Rectangles at bezier in/out tangent positions |
| **PP_HandleLines** | Dashed connector lines from vertex to tangent |
| **PP_Outlines** | Stroke-only copies of every path |
| **PP_Grid** | Vertical, horizontal, and diagonal guide lines through vertices |
| **PP_Label_X_Y** | Text layers showing `(x, y)` coordinates at each vertex |

All generated layers are expression-linked to the source — move the source and everything follows.

## Animation

Everything uses a construction-style reveal (trim paths for lines, scale pops for dots). No opacity fades.

**Timeline slider** (0-100) on `PP_Control` drives a choreographed sequence:

- Grid draws on (0-30)
- Outlines draw on (10-55)
- Anchors pop in (30-65)
- Handles pop in (50-80)
- Labels pop in (65-95)

Additional controls on `PP_Control`:

| Slider | Purpose |
|--------|---------|
| **Stagger** | 0 = all together, 100 = fully sequential within each group |
| **Easing** | 0 = linear, 50 = smooth, 100 = snappy punch |
| **Per-element overrides** | Grid Draw, Outline Draw, Anchor Pop, Handle Pop, Label Pop (set below 100 to override Timeline) |

**Auto-Animate** button keyframes Timeline from 0 to 100 at the current time with configurable duration, stagger, and easing.

## Bake

**Bake** freezes outline expressions into static path data on `PP_Outlines`, then re-links all other layers (anchors, handles, labels, grid) to reference `PP_Outlines` instead of the source. This lets you edit outlines with the pen tool while everything else follows.

## Other Actions

- **Cleanup All** — removes all `PP_` layers
- **Precomp** — groups all `PP_` layers into a single precomp
- **Reset Animation** — clears keyframes, sets Timeline to 100 (fully visible)

## Requirements

- After Effects CC 2018 (15.1) or later

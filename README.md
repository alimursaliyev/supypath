# Path Plugin v3.0

Expression-driven logo anatomy script for After Effects. Extracts the structural skeleton of vector shape layers — anchor points, bezier handles, outlines, grid lines, geometric constructions, and coordinate labels — as separate, fully animated layers.

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
| **PP_Circumcircles** | One circumscribed circle per closed sub-path (expression-linked) |
| **PP_Tangents** | Extended bezier tangent lines at significant vertices (expression-linked) |
| **PP_Triangulation** | Internal diagonal lines from Delaunay triangulation (expression-linked) |
| **PP_OffsetContours** | Concentric offset copies using AE Offset Paths (expression-linked) |
| **PP_Bisectors** | Perpendicular bisectors of diagonal edges (expression-linked) |
| **PP_Label_X_Y** | Text layers showing `(x, y)` coordinates at each vertex |

All generated layers are expression-linked to the source — move the source and everything follows.

## Geometric Constructions

The five construction generators add mathematical geometry derived from the source paths:

- **Circumcircles** — one circumscribed circle per closed sub-path, through the 3 most spread-out vertices (largest-area triangle). Max 6 circles. Expression-linked: circles follow when source or outlines move.
- **Tangent Lines** — extends bezier tangent handles outward. Only the top 12 most significant tangents are shown (sorted by handle length). Expression-linked length from the Tangent Length slider.
- **Delaunay Triangulation** — per-path Bowyer-Watson Delaunay, showing only internal diagonals (edges that don't overlap with the outline). Max 15 diagonals, sorted by length.
- **Offset Contours** — 3 concentric offset levels per closed path using AE's Offset Paths effect. Expression-linked to source paths. Contour Count slider controls visibility (1–3).
- **Bisectors** — perpendicular bisectors only for diagonal edges (skips horizontal/vertical edges that duplicate the grid). Max 8, sorted by edge length. Expression-linked length from Bisector Length slider.

## Animation

Everything uses a construction-style reveal (trim paths for lines, scale pops for dots). No opacity fades.

**Timeline slider** (0-100) on `PP_Control` drives a choreographed sequence:

- Bisectors draw on (0-20)
- Circumcircles pop in (15-40)
- Triangulation draws on (25-55)
- Grid draws on (0-30)
- Offset Contours draw on (35-65)
- Tangents draw on (50-75)
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
| **Circumcircle Opacity** | Opacity of circumscribed circles (default 30) |
| **Tangent Length** | Length of tangent extension lines in pixels (default 200) |
| **Contour Count** | Number of visible offset contour levels, 1–3 (default 3) |
| **Contour Spacing** | Base spacing between contour levels in pixels (default 8) |
| **Bisector Length** | Length of bisector lines in pixels (default 120) |
| **Grid Elements Opacity** | Master opacity multiplier for all construction geometry (default 100) |

**Auto-Animate** button keyframes Timeline from 0 to 100 at the current time with configurable duration, stagger, and easing.

## Bake

**Bake** freezes outline expressions into static path data on `PP_Outlines`, then re-links **all** other layers (anchors, handles, labels, grid, circumcircles, tangents, triangulation, offset contours, bisectors) to reference `PP_Outlines` instead of the source. This lets you edit outlines with the pen tool while everything follows — including all construction geometry.

## Other Actions

- **Cleanup All** — removes all `PP_` layers
- **Precomp** — groups all `PP_` layers into a single precomp
- **Reset Animation** — clears keyframes, sets Timeline to 100 (fully visible)

## Requirements

- After Effects CC 2018 (15.1) or later

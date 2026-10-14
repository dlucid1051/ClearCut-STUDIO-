# Non-Destructive Image Background Layer & Compositing

Implement a dedicated, non-destructive **Image Background Layer** tool that attaches solid colors or photo backdrops directly to the image itself. When adding a background image, the canvas expands to match the backdrop's dimensions, centering the cutout on top. All exports (**Save As...**, PNG, WebP, JPEG, ICO) and camera screenshots composite this layer seamlessly, while keeping the editor viewport checker/grid toggle as an independent viewing preference.

---

## User Review & Critical Decisions

> [!IMPORTANT]
> The following key decisions were confirmed during the requirements clarification:

- **Confirmed Decision 1 (Layer Type)**: **Non-destructive background layer**. The background is kept in state behind the transparent cutout. It can be changed, recolored, toggled, or cleared at any time without damaging the original cutout pixels.
- **Confirmed Decision 2 (Canvas Geometry)**: **Expand cutout canvas to match background image dimensions**. When an image backdrop is selected, the composite canvas adopts the width and height of the background image, placing the transparent cutout centered (or positioned) on top. When cleared, the canvas returns to the cutout dimensions.
- **Confirmed Decision 3 (Interface Architecture)**: **Dedicated Image Background tool**. Located in the contextual bottom dock and editor shelf as a distinct "Backdrop" tab, leaving the top floating "BG" toggle to serve strictly as the workspace viewport inspector (Dark Grid, Light Grid, White, Dark Slate).

---

## 1. Overview & Core Concept

### What It Does
1. **Separates Viewer from Image**: 
   - **Viewport Toggle (Top Right)**: Only controls the workspace canvas board (Dark Grid, Light Grid, White, Dark) so users can inspect transparency without affecting image pixels.
   - **Image Background Layer (Bottom Dock Tool)**: Controls the actual artwork background (Solid Color or Photo Backdrop).
2. **Layer Compositing**:
   - In the editor, the cutout canvas renders directly over the active background layer with exact 1:1 pixel boundaries.
   - For solid colors, the layer fills the cutout dimensions (default: `#000000` Black, with presets and custom hex picker).
   - For background images (uploads or preset studio backdrops), the image dimensions expand to match the backdrop image, and the cutout is composed centered on top.
3. **Universal Export & Capture**:
   - **Save As... (PNG, WebP, JPEG, ICO)**: Automatically composites the background layer beneath the cutout before encoding, ensuring downloaded files look exactly as previewed.
   - **Single-Tap Screenshot Camera**: Captures the full or active selection area composited over the background layer.
   - **Transparency Retention**: If no image background is active, standard transparent exports remain intact.

---

## 2. User Experience & Visual Design

```
+-------------------------------------------------------------------+
| [Undo/Redo]  [800x600]     |      [Open Image]    [Save As...]     |  <- Top Bar
+-------------------------------------------------------------------+
|                                             [BG: Dark Grid]       |  <- Viewport Inspector
|                                                                   |
|                      [  Camera Button  ]                          |
|                                                                   |
|             +---------------------------------------+             |
|             | Background Image Layer (e.g. 1920x1080)|             |
|             |          +-----------------+          |             |
|             |          | Cutout Subject  |          |             |
|             |          | (Transparent)   |          |             |
|             |          +-----------------+          |             |
|             +---------------------------------------+             |
|                                                                   |
|                                                     [100% Zoom]   |
+-------------------------------------------------------------------+
| [Layers/Backdrop Shelf: Color Swatches | Upload | Studio Backdrops]| <- Context Shelf
+-------------------------------------------------------------------+
|       [ Crop ]     [ Resize ]     [ Backdrop ]     [ Transform ]  | <- Bottom Dock
+-------------------------------------------------------------------+
```

### Key User Flows
1. **Adding a Solid Color Background**:
   - User clicks the **Backdrop** tab in the bottom dock.
   - A contextual shelf opens showing solid color swatches (**Black as default**, slate, charcoal, white, chroma green, etc.) plus a custom HEX picker.
   - Selecting a color immediately updates the image canvas boundary with the solid color backdrop.
2. **Adding an Image Backdrop**:
   - User clicks "Upload Image" or picks from the curated **Studio Backdrops** library (Studio Spotlight, Minimal Studio Wall, Warm Wood, Cyberpunk Ambient, Forest Bokeh, Golden Sunset).
   - The canvas smoothly expands to match the backdrop image's dimensions, centering the cutout on top.
   - The shelf displays backdrop controls: fitting mode (Cover, Contain, Stretch), blur/bokeh slider (0–20px), and a "Remove Backdrop" button.
3. **Saving or Screenshotting**:
   - Clicking **Save As...** generates PNG, WebP, JPEG, or ICO previews with the composite already applied.
   - Clicking the floating **Camera** button takes a screenshot of the composite (or cutout selection) with the background included.
4. **Toggling Viewport Grid**:
   - The top-right floating "BG" toggle switches between Dark Grid, Light Grid, and White so users can check alpha edges around the canvas independently.

---

## 3. Technical Architecture & Data Strategy

```
┌────────────────────────────────────────────────────────────────────────┐
│                        EditorWorkspace State                           │
│                                                                        │
│  Cutout Canvases:                                                      │
│  • currentCanvas (Transparent Cutout Pixels)                          │
│  • currentOriginalCanvas (Pixel Restoration Canvas)                    │
│                                                                        │
│  Image Background Layer State:                                         │
│  • imageBgType: 'none' | 'color' | 'image'                             │
│  • imageBgColor: '#000000' (Default)                                   │
│  • imageBgUrl: string | null                                           │
│  • imageBgElement: HTMLImageElement | null                             │
│  • imageBgFit: 'cover' | 'contain' | 'stretch'                         │
│  • imageBgBlur: number (0 - 20)                                        │
│                                                                        │
│  Viewport Inspector State (Separate):                                  │
│  • viewportGridMode: 'checker-dark' | 'checker-light' | 'white'        │
└───────────────────────────────────┬────────────────────────────────────┘
                                    │
                                    ▼
┌────────────────────────────────────────────────────────────────────────┐
│                     Composite Rendering Engine                         │
│                                                                        │
│  getCompositeCanvas(): HTMLCanvasElement                               │
│  1. If imageBgType === 'none': returns clone of currentCanvas          │
│  2. If imageBgType === 'color':                                        │
│     - Creates canvas matching currentCanvas dimensions                 │
│     - Fills with imageBgColor                                          │
│     - Draws currentCanvas on top                                       │
│  3. If imageBgType === 'image' && imageBgElement:                      │
│     - Creates canvas matching imageBgElement dimensions                │
│     - Applies optional blur & fitting transformation                   │
│     - Draws background image                                           │
│     - Draws currentCanvas centered on top                              │
└──────────────────┬─────────────────────────────────┬───────────────────┘
                   │                                 │
                   ▼                                 ▼
┌────────────────────────────────────┐ ┌─────────────────────────────────┐
│     Live Canvas & Overlays         │ │       Universal Exporters       │
│                                    │ │                                 │
│ • Live canvas renders composite    │ │ • SaveAsModal receives composite│
│ • CropOverlay respects new bounds  │ │ • Camera screenshot captures    │
│ • SelectionOverlay maps correctly  │ │   exact composite or selection  │
└────────────────────────────────────┘ └─────────────────────────────────┘
```

### Component & State Plan
1. **`src/types/background.ts`**:
   - Clean types for `ImageBackgroundState` (`type`, `color`, `url`, `element`, `fit`, `blur`).
2. **`src/utils/compositing.ts`**:
   - Pure utility `createCompositeCanvas(cutoutCanvas, backgroundState)` to generate the merged canvas synchronously or asynchronously for export and live display.
3. **`src/components/EditorWorkspace.tsx`**:
   - Add **Backdrop** tab to the bottom thumb dock (`activeTab = 'backdrop'`).
   - Connect shelf controls for quick color swatches, image upload, studio backdrops, and remove button.
   - Refactor top-right toggle to control only viewport inspection grid (`viewportGridMode`).
   - Pass the live composite canvas to `SaveAsModal` and `handleCaptureScreenshot`.
4. **`src/components/BackgroundShelf.tsx`**:
   - Ergonomic, thumb-friendly contextual shelf providing:
     - Preset color circles with `#000000` Black as default + custom hex picker.
     - Upload image button and studio backdrop selector.
     - Fitting mode and bokeh blur slider when an image backdrop is active.
     - Clear/remove button to revert to transparent cutout.

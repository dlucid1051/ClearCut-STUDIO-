# ClearCut STUDIO ✂️

> A private, installable Progressive Web App that strips image backgrounds directly in the browser using client-side AI — no server uploads, 100% offline.

---

## ✨ Features

- 🔒 **100% Client-Side & Private:** Neural network segmentation via `@imgly/background-removal` runs locally in WebAssembly. Your photos and assets never leave your device.
- 📴 **Offline PWA:** Fully cached service worker and manifest; install on desktop or mobile and use without internet connectivity.
- 🗜️ **WebP Compression:** Live quality toggles (50%–100%) and instant file-size savings calculator.
- 🪟 **Multi-Size .ICO Generator:** Pack 16px to 256px frames into standard Windows `.ico` files directly in-browser.
- 📐 **Crop & Resize:** Interactive aspect ratios (`1:1`, `16:9`, `4:3`, `3:2`, `9:16`), dimension locking, and rotation/flip tools.
- 🔍 **Before/After Split Slider:** Seamless visual comparison with custom background previews (Dark Grid, Light Grid, Solid White, Dark, and Custom Colors).
- 📋 **Drag, Drop & Paste:** Full support for file drag-and-drop, native file picker, and clipboard paste (`Ctrl+V` / `⌘V`).
- ⚡ **Offline Demo Samples:** Built-in test samples (Product sneaker, Studio portrait, Coffee mug) generated in-memory for instant testing.

---

## 🛠️ Tech Stack

- **Framework:** React 19 + TypeScript
- **Bundler & PWA:** Vite + `vite-plugin-pwa` (Workbox Service Worker)
- **Styling:** Tailwind CSS
- **AI / Matting:** `@imgly/background-removal` (ONNX Runtime Web / WebAssembly)
- **Icons:** Lucide React

---

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- npm or pnpm

### Installation

```bash
# Clone the repository
git clone https://github.com/your-username/clearcut-studio.git
cd clearcut-studio

# Install dependencies
npm install

# Start the development server
npm run dev
```

### Production Build

```bash
# Build the production bundle and generate service worker assets
npm run build

# Preview the production build locally
npm run preview
```

---

## 🚀 GitHub Pages Deployment

This repository includes an automated workflow in `.github/workflows/deploy.yml`:

1. Push your code to the `main` (or `master`) branch on GitHub.
2. Go to your repository on GitHub: **Settings** → **Pages**.
3. Under **Build and deployment** → **Source**, select **GitHub Actions**.
4. The workflow will automatically trigger, build the static site, and publish it to GitHub Pages.

---

## 📄 License

Apache-2.0

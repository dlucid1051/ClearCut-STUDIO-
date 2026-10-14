import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './index.css';
import { registerSW } from 'virtual:pwa-register';

// Suppress benign ONNX Runtime and Vite HMR WebSocket notices
const filterOrtWarnings = (originalFn: (...args: unknown[]) => void) => {
  return (...args: unknown[]) => {
    const text = args
      .map((a) => (typeof a === 'string' ? a : typeof a === 'object' ? JSON.stringify(a) : String(a)))
      .join(' ');
    if (
      text.includes('VerifyEachNodeIsAssignedToAnEp') ||
      text.includes('preferred execution providers') ||
      text.includes('[W:onnxruntime:') ||
      text.includes('WebSocket closed without opened') ||
      text.includes('@vite/client')
    ) {
      return;
    }
    originalFn.apply(console, args);
  };
};

console.warn = filterOrtWarnings(console.warn);
console.error = filterOrtWarnings(console.error);

// Register Service Worker for offline capability
registerSW({ immediate: true });

createRoot(document.getElementById('root')!).render(<App />);

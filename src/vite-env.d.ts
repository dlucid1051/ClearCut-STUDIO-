/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare module 'onnxruntime-web' {
  export const env: {
    logLevel?: string;
    [key: string]: unknown;
  };
  const content: any;
  export default content;
}

declare module 'onnxruntime-web/webgpu' {
  export const env: {
    logLevel?: string;
    [key: string]: unknown;
  };
  const content: any;
  export default content;
}

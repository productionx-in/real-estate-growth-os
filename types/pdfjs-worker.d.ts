// PDF.js ships its worker module without type declarations; the server loads it in-process (lib/plots/pdf-inspect.ts).
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  export const WorkerMessageHandler: unknown
}

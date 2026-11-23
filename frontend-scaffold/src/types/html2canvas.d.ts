declare module 'html2canvas' {
  const html2canvas: (
    element: HTMLElement,
    options?: Record<string, unknown>,
  ) => Promise<HTMLCanvasElement>;

  export default html2canvas;
}

// Type helper for the lazy-loaded dynamic import shape:
// `import('html2canvas')` resolves to a module whose `default` is the html2canvas function.
declare global {
  type Html2CanvasModule = typeof import('html2canvas');
  type Html2CanvasDefault = typeof import('html2canvas').default;
}

export {};
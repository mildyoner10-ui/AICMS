declare namespace bootstrap {
  class Offcanvas {
    constructor(element: Element, options?: OffcanvasOptions);
    static VERSION: string;
    static NAME: string;
    static DATA_KEY: string;
    static getInstance(el: Element): Offcanvas | null;
    static getOrCreateInstance(el: Element, conf?: OffcanvasOptions): Offcanvas;
    show(): void;
    hide(): void;
    toggle(): void;
    dispose(): void;
    isShown(): boolean;
  }
  interface OffcanvasOptions {
    backdrop?: boolean;
    scroll?: boolean;
  }
}

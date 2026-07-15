declare global {
  interface HTMLElementTagNameMap {
    webview: HTMLWebViewElement;
  }
  class HTMLWebViewElement extends HTMLElement {
    constructor();
  }
}

export {};

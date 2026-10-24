import { LitElement, html, css, nothing } from "lit";

interface Position {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

/** 浮动位置和拖动手势独立封装，插槽内的控件保留原生点击行为。 */
class ExportPositioner extends LitElement {
  static properties = { position: { state: true } };
  static styles = css`
    :host {
      display: block;
    }
    .positioner {
      position: fixed;
      right: 16px;
      bottom: 20px;
      z-index: 2147483647;
      display: grid;
      max-inline-size: 100vw;
      touch-action: none;
      user-select: none;
      cursor: grab;

      &:active {
        cursor: grabbing;
      }
      &[data-positioned] {
        left: clamp(0px, var(--left), calc(100vw - var(--width)));
        top: clamp(0px, var(--top), calc(100dvh - var(--height)));
        right: auto;
        bottom: auto;
      }
    }
    ::slotted(*) {
      cursor: inherit;
    }
  `;
  declare protected position: Position | null;
  #drag: {
    pointerId: number;
    x: number;
    y: number;
    origin: Position;
    moved: boolean;
  } | null = null;
  #suppressClick = false;

  constructor() {
    super();
    this.position = null;
  }

  protected render() {
    const position = this.position;
    return html`
      <div
        class="positioner"
        ?data-positioned=${position !== null}
        style=${position ? `--left: ${position.left}px; --top: ${position.top}px; --width: ${position.width}px; --height: ${position.height}px;` : nothing}
        @pointerdown=${this.#onPointerDown}
        @pointermove=${this.#onPointerMove}
        @pointerup=${this.#onPointerEnd}
        @pointercancel=${this.#onPointerEnd}
        @lostpointercapture=${this.#onPointerEnd}
        @click=${this.#onClick}
      >
        <slot></slot>
      </div>
    `;
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.#drag = null;
    this.#suppressClick = false;
  }

  #onPointerDown(event: PointerEvent) {
    if (!event.isPrimary || event.button !== 0) return;
    const container = event.currentTarget as HTMLElement;
    const { left, top, width, height } = container.getBoundingClientRect();
    this.#suppressClick = false;
    this.#drag = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      origin: { left, top, width, height },
      moved: false,
    };
    // 保留原始控件为事件目标，使未拖动时的原生 command 点击仍然生效。
    (event.composedPath()[0] as Element).setPointerCapture(event.pointerId);
  }

  #onPointerMove(event: PointerEvent) {
    const drag = this.#drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.x;
    const dy = event.clientY - drag.y;
    // 小幅抖动仍算点击；达到阈值后整次手势只负责拖动。
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    const { left, top, width, height } = drag.origin;
    this.position = {
      left: left + dx,
      top: top + dy,
      width,
      height,
    };
  }

  #onPointerEnd(event: PointerEvent) {
    if (this.#drag?.pointerId !== event.pointerId) return;
    this.#suppressClick = this.#drag.moved;
    this.#drag = null;
    // pointerup / pointercancel 会由浏览器自动释放捕获。
  }

  #onClick(event: MouseEvent) {
    const dragged = this.#suppressClick && event.detail > 0;
    this.#suppressClick = false;
    if (dragged) event.preventDefault();
  }
}

customElements.define("pdd-export-positioner", ExportPositioner);

declare global {
  interface HTMLElementTagNameMap {
    "pdd-export-positioner": ExportPositioner;
  }
}

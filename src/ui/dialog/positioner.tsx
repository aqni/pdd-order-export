import { Component, h, type ComponentChildren } from "preact";

interface Position {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** 只处理位置和指针手势，点击仍由内部原生控件处理。 */
export class ExportPositioner extends Component<
  { children: ComponentChildren },
  { position: Position | null }
> {
  state = { position: null as Position | null };
  #drag: {
    pointerId: number;
    x: number;
    y: number;
    origin: Position;
    moved: boolean;
  } | null = null;
  #suppressClick = false;

  render(
    { children }: { children: ComponentChildren },
    { position }: { position: Position | null },
  ) {
    return (
      <div
        data-ui="positioner"
        data-positioned={position !== null || undefined}
        style={
          position
            ? {
                "--left": `${position.left}px`,
                "--top": `${position.top}px`,
                "--width": `${position.width}px`,
                "--height": `${position.height}px`,
              }
            : undefined
        }
        onPointerDown={this.#start}
        onPointerMove={this.#move}
        onPointerUp={this.#end}
        onPointerCancel={this.#end}
        onLostPointerCapture={this.#end}
        onClick={this.#click}
      >
        {children}
      </div>
    );
  }

  #start = (event: PointerEvent) => {
    if (!event.isPrimary || event.button !== 0) return;
    const { left, top, width, height } = (
      event.currentTarget as HTMLElement
    ).getBoundingClientRect();
    this.#suppressClick = false;
    this.#drag = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      origin: { left, top, width, height },
      moved: false,
    };
    // 捕获原始按钮，保证未拖动时的 command 点击仍然生效。
    (event.target as Element).setPointerCapture(event.pointerId);
  };
  #move = (event: PointerEvent) => {
    const drag = this.#drag;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.x,
      dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    this.setState({
      position: {
        ...drag.origin,
        left: drag.origin.left + dx,
        top: drag.origin.top + dy,
      },
    });
  };
  #end = (event: PointerEvent) => {
    if (this.#drag?.pointerId !== event.pointerId) return;
    this.#suppressClick = this.#drag.moved;
    this.#drag = null;
  };
  #click = (event: MouseEvent) => {
    if (this.#suppressClick && event.detail > 0) event.preventDefault();
    this.#suppressClick = false;
  };
}

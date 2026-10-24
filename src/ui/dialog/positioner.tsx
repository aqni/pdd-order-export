import { defineComponent, shallowRef } from "vue";

interface Position {
  left: number;
  top: number;
  width: number;
  height: number;
}

/** 位置参与渲染；手势是实例内部状态，点击仍由原生控件处理。 */
export const ExportPositioner = defineComponent((_props, { slots }) => {
  const position = shallowRef<Position | null>(null);
  let drag: {
    pointerId: number;
    x: number;
    y: number;
    origin: Position;
    moved: boolean;
  } | null = null;
  let suppressClick = false;

  function start(event: PointerEvent) {
    if (!event.isPrimary || event.button !== 0) return;
    const { left, top, width, height } = (
      event.currentTarget as HTMLElement
    ).getBoundingClientRect();
    suppressClick = false;
    drag = {
      pointerId: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      origin: { left, top, width, height },
      moved: false,
    };
    // 捕获原始按钮，保证未拖动时的 command 点击仍然生效。
    (event.target as Element).setPointerCapture(event.pointerId);
  }

  function move(event: PointerEvent) {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const dx = event.clientX - drag.x,
      dy = event.clientY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 5) return;
    drag.moved = true;
    position.value = {
      ...drag.origin,
      left: drag.origin.left + dx,
      top: drag.origin.top + dy,
    };
  }

  function end(event: PointerEvent) {
    if (drag?.pointerId !== event.pointerId) return;
    suppressClick = drag.moved;
    drag = null;
  }

  function click(event: MouseEvent) {
    if (suppressClick && event.detail > 0) event.preventDefault();
    suppressClick = false;
  }

  return () => (
    <div
      data-ui="positioner"
      data-positioned={position.value !== null || undefined}
      style={
        position.value
          ? {
              "--left": `${position.value.left}px`,
              "--top": `${position.value.top}px`,
              "--width": `${position.value.width}px`,
              "--height": `${position.value.height}px`,
            }
          : undefined
      }
      onPointerdown={start}
      onPointermove={move}
      onPointerup={end}
      onPointercancel={end}
      onLostpointercapture={end}
      onClick={click}
    >
      {slots.default?.()}
    </div>
  );
});

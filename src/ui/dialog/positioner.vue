<script setup lang="ts">
import { shallowRef } from "vue";
interface Position {
  left: number;
  top: number;
  width: number;
  height: number;
}

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
</script>

<template>
  <div
    data-ui="positioner"
    :data-positioned="position !== null || undefined"
    :style="
      position
        ? {
            '--left': `${position.left}px`,
            '--top': `${position.top}px`,
            '--width': `${position.width}px`,
            '--height': `${position.height}px`,
          }
        : undefined
    "
    @pointerdown="start"
    @pointermove="move"
    @pointerup="end"
    @pointercancel="end"
    @lostpointercapture="end"
    @click="click"
  >
    <slot />
  </div>
</template>

<style scoped>
[data-ui="positioner"] {
  position: fixed;
  right: 16px;
  bottom: 20px;
  z-index: 2147483647;
  display: grid;
  max-inline-size: 100vw;
  touch-action: none;
  user-select: none;
  cursor: grab;
}
[data-ui="positioner"]:active {
  cursor: grabbing;
}
[data-ui="positioner"][data-positioned] {
  left: clamp(0px, var(--left), calc(100vw - var(--width)));
  top: clamp(0px, var(--top), calc(100dvh - var(--height)));
  right: auto;
  bottom: auto;
}
:slotted(button) {
  cursor: inherit;
}
</style>

import vue from "@vitejs/plugin-vue";
import ts from "typescript-vue";

// Vue 编译器需要 JS TypeScript 的文件系统接口来解析导入的 Props 类型。
export function vueComponents() {
  return vue({ customElement: true, script: { fs: ts.sys } });
}

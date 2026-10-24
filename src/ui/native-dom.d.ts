import "vue";

// 项目使用的原生捕获事件及 Chrome 136+ command 属性尚未包含在 Vue 类型中。
declare module "vue" {
  interface HTMLAttributes {
    onInvalidCapture?: (event: Event) => void;
  }
  interface ButtonHTMLAttributes {
    command?: "show-modal";
    commandfor?: string;
  }
}

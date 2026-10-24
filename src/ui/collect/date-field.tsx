import { Component, createElement, type RefObject } from "preact";

/** 日期输入的空值提示；原生输入引用供表单读取和设置校验信息。 */
export class DateField extends Component<DateFieldProps> {
  render({ label, name, inputRef }: DateFieldProps) {
    return (
      <label class="date-field">
        {label}
        <input
          name={name}
          type="date"
          ref={inputRef}
          onInput={this.#updateEmptyState}
        />
        <span class="date-placeholder" aria-hidden="true">
          不限
        </span>
      </label>
    );
  }

  componentDidMount(): void {
    this.#updateEmptyState();
  }

  #updateEmptyState = () => {
    const input = this.props.inputRef.current!;
    input.toggleAttribute(
      "data-empty",
      !input.value && !input.validity.badInput,
    );
  };
}

interface DateFieldProps {
  label: string;
  name: string;
  inputRef: RefObject<HTMLInputElement>;
}

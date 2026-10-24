import { Component, createElement } from "preact";
import type { CollectResult } from "../collect/controls";
import { downloadFile, exportFile } from "../../export";

/** 拥有导出按钮及文件操作；失败使用原生提示，不依赖收集任务状态。 */
export class ExportActions extends Component<ExportActionsProps> {
  static readonly #formats: readonly {
    format: FileFormat;
    description: string;
  }[] = [
    {
      format: "csv",
      description:
        "导出为 CSV 账单表格，订单金额未扣除退款。\n\n导入表格软件时，请将订单号和快递单号设为文本。",
    },
    {
      format: "json",
      description:
        "导出为 JSON，保留解析后的订单与详情数据。\n\n数据可能包含地址、手机号等个人信息，请妥善保管。大整数可能存在精度损失。",
    },
  ];

  #disposed = false;

  render({ result }: ExportActionsProps) {
    const { entries, partial } = result;
    return (
      <div class="exports" hidden={!entries.length}>
        {ExportActions.#formats.map(({ format, description }) => (
          <button
            key={format}
            type="button"
            title={description}
            onClick={() => this.#export(format)}
          >
            {`导出${partial ? "部分" : ""} ${format.toUpperCase()}`}
          </button>
        ))}
      </div>
    );
  }

  componentWillUnmount(): void {
    this.#disposed = true;
  }

  #export(format: FileFormat): void {
    const { entries, partial, startDate, endDate } = this.props.result;
    if (this.#disposed || !entries.length) return;
    let file;
    try {
      // CSV 校验失败不影响原始 JSON 备份。
      file = exportFile(entries, format, startDate, endDate, partial);
    } catch {
      globalThis.alert(
        format === "csv"
          ? "CSV 生成失败，请尝试导出 JSON。"
          : "JSON 生成失败，请稍后重试。",
      );
      return;
    }
    try {
      downloadFile(file.name, file.blob);
    } catch {
      globalThis.alert("无法发起下载，请检查浏览器下载权限后重试。");
    }
  }
}

type FileFormat = Parameters<typeof exportFile>[1];

interface ExportActionsProps {
  result: CollectResult;
}

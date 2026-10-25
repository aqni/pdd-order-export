<script setup lang="ts">
import type { CollectResult } from "../collect";
import { downloadFile, exportFile } from "../../export";

type FileFormat = Parameters<typeof exportFile>[1];
const descriptions: Record<FileFormat, string> = {
  csv: "导出为 CSV 账单表格，订单金额未扣除退款。\n\n导入表格软件时，请将订单号和快递单号设为文本。",
  json: "导出为 JSON，保留解析后的订单与详情数据。\n\n数据可能包含地址、手机号等个人信息，请妥善保管。大整数可能存在精度损失。",
};

const props = defineProps<{ result: CollectResult; format: FileFormat }>();
function download(event: MouseEvent) {
  if ((event.currentTarget as HTMLButtonElement).isConnected)
    save(props.result, props.format);
}
function save(
  { entries, partial, startDate, endDate }: CollectResult,
  format: FileFormat,
) {
  if (!entries.length) return;
  let file;
  try {
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
</script>

<template>
  <button type="button" :title="descriptions[format]" @click="download">
    {{ `导出${result.partial ? "部分" : ""} ${format.toUpperCase()}` }}
  </button>
</template>

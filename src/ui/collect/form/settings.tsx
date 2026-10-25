import { h, type RefObject } from "preact";
import { CollectDateRange } from "./date-range";
import { CollectDetailsOption } from "./details-option";
import { CollectRequestSettings } from "./request-settings";
import type { CollectDraft } from "./form";

/** 摘要直接由草稿推导；不保存摘要副本，也不读取子组件实例。 */
export function CollectSettings({
  draft,
  disabled,
  detailsRef,
}: {
  draft: CollectDraft;
  disabled: boolean;
  detailsRef: RefObject<HTMLDetailsElement>;
}) {
  const { startDate, endDate, includeDetails } = draft;
  const dates =
    !startDate && !endDate
      ? "不限日期"
      : `${startDate || "不限"} 至 ${endDate || "不限"}`;
  const summary = dates + (includeDetails ? " · 含详情" : " · 仅列表");
  return (
    <details
      data-ui="collect-settings"
      open
      ref={detailsRef}
      onInvalidCapture={(event) => {
        event.currentTarget.open = true;
      }}
    >
      <summary>
        <span>收集设置</span>
        <small>{summary}</small>
      </summary>
      <fieldset disabled={disabled}>
        <CollectDateRange startDate={startDate} endDate={endDate} />
        <CollectDetailsOption checked={includeDetails} />
        <CollectRequestSettings
          pageSize={draft.pageSize}
          maxPages={draft.maxPages}
        />
      </fieldset>
    </details>
  );
}

import { computed, defineComponent } from "vue";
import { CollectDateRange } from "./date-range";
import { CollectDetailsOption } from "./details-option";
import { CollectRequestSettings } from "./request-settings";

export interface CollectDraft {
  startDate: string;
  endDate: string;
  includeDetails: boolean;
  pageSize: number | string;
  maxPages: number | string;
}

interface Props {
  draft: CollectDraft;
  disabled: boolean;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
}

/** 摘要由草稿推导；字段通过同一份响应式模型协作，不再暴露 read 接口。 */
export const CollectSettings = defineComponent(
  (props: Props) => {
    const summary = computed(() => {
      const { startDate, endDate, includeDetails } = props.draft;
      const dates =
        !startDate && !endDate
          ? "不限日期"
          : `${startDate || "不限"} 至 ${endDate || "不限"}`;
      return dates + (includeDetails ? " · 含详情" : " · 仅列表");
    });

    return () => (
      <details
        data-ui="collect-settings"
        class="settings"
        open={props.expanded}
        onToggle={(event) =>
          props.onExpandedChange(
            (event.currentTarget as HTMLDetailsElement).open,
          )
        }
        onInvalidCapture={(event) => {
          (event.currentTarget as HTMLDetailsElement).open = true;
          props.onExpandedChange(true);
        }}
      >
        <summary>
          <span>收集设置</span>
          <small>{summary.value}</small>
        </summary>
        <fieldset disabled={props.disabled}>
          <CollectDateRange draft={props.draft} />
          <CollectDetailsOption draft={props.draft} />
          <CollectRequestSettings draft={props.draft} />
        </fieldset>
      </details>
    );
  },
  { props: ["draft", "disabled", "expanded", "onExpandedChange"] },
);

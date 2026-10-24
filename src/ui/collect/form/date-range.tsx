import { defineComponent } from "vue";
import type { CollectDraft } from "./settings";

export const CollectDateRange = defineComponent(
  (props: { draft: CollectDraft }) => {
    const hint = `pdd-date-${crypto.randomUUID()}`;
    return () => (
      <div data-ui="collect-dates">
        <div class="fields">
          <label>
            开始日期
            <input
              type="date"
              name="startDate"
              v-model={props.draft.startDate}
              aria-describedby={hint}
            />
          </label>
          <label>
            结束日期
            <input
              type="date"
              name="endDate"
              v-model={props.draft.endDate}
              min={props.draft.startDate}
              aria-describedby={hint}
            />
          </label>
        </div>
        <small id={hint}>日期留空表示不限。</small>
      </div>
    );
  },
  { props: ["draft"] },
);

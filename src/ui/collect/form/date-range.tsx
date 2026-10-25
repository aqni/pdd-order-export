import { Component, h } from "preact";
import type { CollectDraft } from "./form";

type Props = Pick<CollectDraft, "startDate" | "endDate">;

export class CollectDateRange extends Component<Props> {
  readonly #hint = `pdd-date-${crypto.randomUUID()}`;
  render({ startDate, endDate }: Props) {
    return (
      <div data-ui="collect-dates">
        <div class="fields">
          <label>
            开始日期
            <input
              type="date"
              name="startDate"
              value={startDate}
              aria-describedby={this.#hint}
            />
          </label>
          <label>
            结束日期
            <input
              type="date"
              name="endDate"
              value={endDate}
              min={startDate}
              aria-describedby={this.#hint}
            />
          </label>
        </div>
        <small id={this.#hint}>日期留空表示不限。</small>
      </div>
    );
  }
}

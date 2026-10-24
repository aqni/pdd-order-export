import { h } from "preact";
import type { CollectionState } from "./controls";
import { CollectProgress } from "./progress";

export function CollectFeedback({ status, progress, error }: CollectionState) {
  const active = status === "collecting" || status === "cancelling";
  return (
    <div data-ui="collect-feedback">
      <p role="alert" hidden={!error}>
        {error}
      </p>
      <hr hidden={!active} />
      {active && (
        <CollectProgress
          cancelling={status === "cancelling"}
          counts={progress}
        />
      )}
    </div>
  );
}

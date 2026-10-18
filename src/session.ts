import { PddClient } from "./pdd";
import {
  collectOrders,
  validateOptions,
  type ExportOptions,
  type LiveProgress,
  type ReadonlyExportResult,
} from "./collect";

export interface CollectionDependencies {
  source: () => Pick<PddClient, "getOrders" | "getOrderDetail">;
  collect: typeof collectOrders;
}

type LiveSnapshot = Readonly<LiveProgress> & {
  readonly current: Readonly<LiveProgress["current"]>;
};

export type CollectionState =
  | { readonly phase: "idle" }
  | { readonly phase: "collecting"; readonly progress: LiveSnapshot | null }
  | { readonly phase: "cancelling" }
  | { readonly phase: "ready"; readonly result: ReadonlyExportResult }
  | {
      readonly phase: "failed";
      readonly error: unknown;
      readonly result: ReadonlyExportResult | null;
    }
  | { readonly phase: "disposed" };

/** Owns one collection; presentation observes states without running inside the generator. */
export class CollectionSession {
  readonly #dependencies: CollectionDependencies;
  readonly #notify: (state: CollectionState) => void;
  #controller: AbortController | null = null;
  #state: CollectionState = { phase: "idle" };

  constructor(
    notify: (state: CollectionState) => void = () => {},
    overrides: Partial<CollectionDependencies> = {},
  ) {
    this.#notify = notify;
    this.#dependencies = {
      source: () => new PddClient(),
      collect: collectOrders,
      ...overrides,
    };
  }

  get state(): CollectionState {
    return this.#state;
  }

  async collect(input: ExportOptions): Promise<void> {
    if (this.#controller || this.#state.phase === "disposed") {
      return;
    }
    let retained = "result" in this.#state ? this.#state.result : null;
    try {
      const options = validateOptions(input);
      const source = this.#dependencies.source();
      const controller = new AbortController();
      this.#controller = controller;
      retained = null;
      this.#publish({ phase: "collecting", progress: null });
      let result: ReadonlyExportResult | undefined;
      for await (const event of this.#dependencies.collect(
        source,
        options,
        controller.signal,
      )) {
        if (this.state.phase === "disposed") {
          break;
        }
        switch (event.type) {
          case "progress":
            if (!controller.signal.aborted) {
              this.#publish({ phase: "collecting", progress: event.progress });
            }
            break;
          case "result":
            result = event.result;
            break;
        }
      }
      this.#controller = null;
      if (this.state.phase === "disposed") {
        return;
      }
      if (!result) {
        throw new Error("Collection ended without a result");
      }
      this.#publish({ phase: "ready", result });
    } catch (error) {
      this.#controller = null;
      this.#publish({ phase: "failed", error, result: retained });
    }
  }

  cancel(): void {
    if (!this.#controller || this.#state.phase === "cancelling") {
      return;
    }
    this.#controller.abort();
    this.#publish({ phase: "cancelling" });
  }

  dispose(): void {
    this.#state = { phase: "disposed" };
    this.#controller?.abort();
  }

  #publish(state: CollectionState): void {
    if (this.#state.phase === "disposed") {
      return;
    }
    this.#state = state;
    try {
      this.#notify(state);
    } catch {
      // Observer failures must not interrupt iteration or discard collected data.
    }
  }
}

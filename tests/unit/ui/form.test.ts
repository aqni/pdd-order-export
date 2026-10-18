// @vitest-environment jsdom
import { afterEach, expect, test, vi } from "vitest";
import { formTag, type ExportFormElement } from "../../../src/ui/form";

vi.mock("../../../src/ui/styles.css?style", () => ({
  default: document.createElement("style"),
}));
vi.mock("../../../src/ui/form.css?style", () => ({
  default: document.createElement("style"),
}));
afterEach(() => document.body.replaceChildren());

function form() {
  const element = document.createElement(formTag) as ExportFormElement;
  document.body.append(element);
  const native = element.shadowRoot!.querySelector("form")!;
  const requests = vi.fn();
  element.addEventListener("collect-request", requests);
  return {
    element,
    native,
    requests,
    input: (name: string) =>
      native.elements.namedItem(name) as HTMLInputElement,
  };
}

test("submits collection options and keeps drafts while its busy state changes", () => {
  const { element, native, requests, input } = form();
  input("startDate").value = "";
  input("endDate").value = "";
  input("pageSize").value = "20";
  element.running = true;
  element.running = false;
  expect(element.shadowRoot!.querySelector("form")).toBe(native);
  expect(input("pageSize").value).toBe("20");
  expect(native.elements.namedItem("format")).toBeNull();
  native.requestSubmit();
  expect(requests).toHaveBeenCalledOnce();
  expect((requests.mock.calls[0]![0] as CustomEvent).detail).toMatchObject({
    pageSize: 20,
    startDate: "",
    endDate: "",
  });
});

test("invalid input emits no collection request and correcting it restores submission", () => {
  const { native, requests, input } = form();
  input("pageSize").value = "0";
  native.requestSubmit();
  expect(input("pageSize").validity.rangeUnderflow).toBe(true);
  expect(requests).not.toHaveBeenCalled();
  input("pageSize").value = "10";
  native.requestSubmit();
  expect(requests).toHaveBeenCalledOnce();
});

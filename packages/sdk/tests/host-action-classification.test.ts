import { describe, expect, it } from "vitest";
import { excelHostAdapter } from "../src/host/excel";
import { wordHostAdapter } from "../src/host/word";

describe("host action classification", () => {
  it("classifies Word tools into action classes", () => {
    expect(wordHostAdapter.classifyAction("get_document_text")).toBe("read");
    expect(wordHostAdapter.classifyAction("execute_office_js")).toBe(
      "unsafe_eval",
    );
    expect(wordHostAdapter.classifyAction("bash")).toBe("external_io");
  });

  it("classifies Excel tools into action classes", () => {
    expect(excelHostAdapter.classifyAction("get_cell_ranges")).toBe("read");
    expect(excelHostAdapter.classifyAction("set_cell_range")).toBe(
      "benign_write",
    );
    expect(excelHostAdapter.classifyAction("modify_sheet_structure")).toBe(
      "structural_write",
    );
    expect(excelHostAdapter.classifyAction("eval_officejs")).toBe(
      "unsafe_eval",
    );
  });
});

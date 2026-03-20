import { describe, expect, it } from "vitest";
import { ReflectionEngine } from "../src/reflection/ReflectionEngine";

describe("ReflectionEngine", () => {
  it("retries on tool execution errors", () => {
    const engine = new ReflectionEngine();
    const decision = engine.microReflect({
      toolName: "execute_office_js",
      isError: true,
      warnings: [],
    });

    expect(decision.status).toBe("retry");
  });

  it("suggests review when warnings are present without hard failure", () => {
    const engine = new ReflectionEngine();
    const decision = engine.microReflect({
      toolName: "set_cell_range",
      isError: false,
      warnings: ["Formatting drift detected."],
    });

    expect(decision.status).toBe("suggest");
  });
});

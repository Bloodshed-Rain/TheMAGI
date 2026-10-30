import { withMeleeAccuracy } from "../src/meleeAccuracy";
import { describe, expect, it, vi } from "vitest";
const { analyze } = vi.hoisted(() => ({ analyze: vi.fn() }));
vi.mock("../src/main/chatgpt", () => ({ getChatGPTClient: () => ({ analyze }) }));
import { callLLM, callLLMStream, LLM_DEFAULTS } from "../src/llm";

describe("ChatGPT analysis provider routing", () => {
  const config = { ...LLM_DEFAULTS, modelId: "account-specific-model", activeProvider: "chatgpt" as const };
  it("uses the signed-in account for non-streaming analysis without API keys", async () => {
    analyze.mockResolvedValueOnce("Evidence-based coaching.");
    await expect(callLLM({ systemPrompt: "coach", userPrompt: "replay evidence", config })).resolves.toBe(
      "Evidence-based coaching.",
    );
    expect(analyze).toHaveBeenLastCalledWith(withMeleeAccuracy("coach"), "replay evidence", "account-specific-model");
  });
  it("routes Cornerman streaming through the same authenticated provider", async () => {
    const chunk = vi.fn();
    analyze.mockResolvedValueOnce("Completed adjustment.");
    await expect(callLLMStream({ systemPrompt: "corner", userPrompt: "set evidence", config }, chunk)).resolves.toBe(
      "Completed adjustment.",
    );
    expect(analyze).toHaveBeenLastCalledWith(
      withMeleeAccuracy("corner"),
      "set evidence",
      "account-specific-model",
      chunk,
    );
  });
  it("propagates connection errors without switching to another provider", async () => {
    analyze.mockRejectedValueOnce(new Error("ChatGPT plan usage is not enabled"));
    await expect(callLLM({ systemPrompt: "coach", userPrompt: "evidence", config })).rejects.toThrow(
      "plan usage is not enabled",
    );
  });
});

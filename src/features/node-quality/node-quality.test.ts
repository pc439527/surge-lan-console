import { describe, expect, it } from "vitest";
import { nodeQuality, rankNodes } from "./node-quality";
describe("node quality", () => { it("ranks measured nodes before unknown nodes", () => { const rows = rankNodes([nodeQuality("b", "g"), nodeQuality("a", "g", { ok: true, latency: 42 })]); expect(rows[0].name).toBe("a"); expect(rows[0].score).toBe(92); }); });

import { describe, expect, it } from "vitest";
import { fetchAShareSnapshot, mapEastmoneyStock } from "../src/connectors/eastmoney.js";

describe("Eastmoney mapper", () => {
  it("maps endpoint fields into AShareStock", () => {
    const stock = mapEastmoneyStock({
      f12: "688001",
      f14: "测试公司",
      f2: 12.3,
      f3: 1.2,
      f20: 10,
      f21: 9,
      f9: 33,
      f23: 2,
      f62: 1,
      f100: "半导体",
      f102: "上海",
      f103: "CPO",
    });
    expect(stock.code).toBe("688001");
    expect(stock.industry).toBe("半导体");
    expect(stock.concept).toBe("CPO");
  });

  it("keeps deterministic fixture path available when live snapshot is disabled", async () => {
    const previous = process.env.A_SHARE_DISABLE_FIXTURE;
    process.env.A_SHARE_DISABLE_FIXTURE = "false";
    const stocks = await fetchAShareSnapshot(1);
    if (previous == null) delete process.env.A_SHARE_DISABLE_FIXTURE;
    else process.env.A_SHARE_DISABLE_FIXTURE = previous;
    expect(stocks).toHaveLength(1);
    expect(stocks[0].code).toBeTruthy();
  });
});

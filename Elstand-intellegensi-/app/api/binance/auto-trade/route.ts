import { NextResponse } from "next/server";
import { getAutoTraderSettings, getDefaultAutoTraderSettings, updateAutoTraderSettings, type AutoTraderSettings } from "@/lib/binance/db";
import { withRouteErrorHandling, badRequest } from "@/lib/binance/routeHelpers";

export async function GET() {
  return withRouteErrorHandling("auto-trade:get", async () => {
    const persisted = await getAutoTraderSettings();
    return { settings: persisted ?? getDefaultAutoTraderSettings(), persisted: persisted !== null };
  });
}

type SettingsPatch = Partial<Pick<AutoTraderSettings, "enabled" | "symbols" | "timeframe" | "risk_percent" | "leverage" | "min_confluences" | "min_risk_reward" | "max_risk_reward" | "max_concurrent_positions" | "cooldown_minutes">>;

export async function PATCH(req: Request) {
  return withRouteErrorHandling("auto-trade:update", async () => {
    const body = (await req.json().catch(() => null)) as SettingsPatch | null;
    if (!body) return badRequest("Body request tidak valid.");
    if (body.symbols && (!Array.isArray(body.symbols) || body.symbols.some((s: unknown) => typeof s !== "string"))) {
      return badRequest("symbols harus berupa array string.");
    }
    const result = await updateAutoTraderSettings({
      ...body,
      symbols: body.symbols?.map((s) => s.toUpperCase()),
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: 400 });
    return { settings: result.settings };
  });
}

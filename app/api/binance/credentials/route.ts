import { getCredentialsStatus, saveCredentials, clearCredentials } from "@/lib/binance/credentials";
import { withRouteErrorHandling, badRequest } from "@/lib/binance/routeHelpers";

export async function GET() {
  return withRouteErrorHandling("credentials:status", async () => {
    return await getCredentialsStatus();
  });
}

interface SaveCredentialsBody {
  apiKey?: string;
  secretKey?: string;
}

export async function POST(req: Request) {
  return withRouteErrorHandling("credentials:save", async () => {
    const body = (await req.json().catch(() => null)) as SaveCredentialsBody | null;
    if (!body?.apiKey || !body?.secretKey) return badRequest("apiKey dan secretKey wajib diisi.");

    const result = await saveCredentials(body.apiKey, body.secretKey);
    if ("error" in result) return badRequest(result.error);
    return await getCredentialsStatus();
  });
}

export async function DELETE() {
  return withRouteErrorHandling("credentials:clear", async () => {
    const result = await clearCredentials();
    if ("error" in result) return badRequest(result.error);
    return await getCredentialsStatus();
  });
}

import { NextRequest, NextResponse } from "next/server";
import { ping } from "@/lib/signer/cos";
import { countUsers } from "@/lib/signer/users";
import { config } from "@/lib/signer/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest) {
  return NextResponse.json({
    ok: true,
    bucket: config.bucket,
    region: config.region,
    userCount: countUsers(),
    sessionSecretConfigured: config.sessionSecret.length >= 16,
    cosReachable: await ping(),
  });
}

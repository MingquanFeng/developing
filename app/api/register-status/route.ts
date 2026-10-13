import { NextResponse } from "next/server";
import { config } from "@/lib/signer/config";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 是否开放网页注册。前端拿它决定显示表单还是「暂未开放」 */
export function GET() {
  return NextResponse.json({ enabled: config.registrationOpen });
}

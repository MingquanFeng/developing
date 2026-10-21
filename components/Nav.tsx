/**
 * Nav —— server component 包装
 * ------------------------------------------------------------------
 * 在 server 端读 cookie、查 user，把 me 通过 prop 传给 NavShell。
 *
 * 关键点：这是 server component（"use client" 没有），所以能直接 import
 * 来自 lib/signer/users 与 next/headers 的 cookies()。这与 NavShell 内部
 * 的所有 useState / useEffect 无关 —— server component 只负责读一次。
 *
 * 导航内容项同理：server 端查 SQLite 的 site_content 覆盖值（回落
 * lib/data/nav 静态默认），后台改了立刻反映。
 */
import { cookies } from "next/headers";
import { readCookie, verifySession, sessionCookieName } from "@/lib/signer/auth";
import { findById, toPublic } from "@/lib/signer/users";
import { getNav } from "@/lib/data/site-content";
import NavShell from "./NavShell";
import type { PublicUser } from "@/lib/contracts";

/** 每次请求都重新算：确保 cookie 改 / sessionVersion 改都生效 */
export const dynamic = "force-dynamic";

export default async function Nav() {
  const c = await cookies();
  const raw = c.get(sessionCookieName())?.value;
  let me: PublicUser | null = null;

  if (raw) {
    const session = verifySession(raw);
    if (session) {
      const user = findById(session.userId);
      if (
        user &&
        !user.disabled &&
        user.sessionVersion === session.sessionVersion
      ) {
        me = toPublic(user);
      }
    }
  }

  /* 导航内容项：DB 覆盖值优先，回落 lib/data/nav 静态默认 */
  const items = await getNav();

  return <NavShell me={me} items={items} />;
}
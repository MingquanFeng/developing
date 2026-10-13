/**
 * 用户管理 CLI
 *
 *   npm run user -- list
 *   npm run user -- add <用户名> [显示名] [--admin|--viewer]
 *   npm run user -- passwd <用户名>
 *   npm run user -- role <用户名> <admin|viewer>
 *   npm run user -- revoke-sessions <用户名>   踢出该账号所有会话
 *   npm run user -- rm <用户名>
 *
 * 角色：admin 能传图/改清单/管用户；viewer 只能登录浏览。
 * 网页注册（REGISTRATION_OPEN）建的账号一律是 viewer。
 * 建第一个管理员必须走这里 --admin —— 攻击面最小。
 */
const readline = require("node:readline");
const fs = require("node:fs");
const path = require("node:path");
const bcrypt = require("bcryptjs");
require("dotenv").config({ path: path.join(__dirname, "..", ".env"), quiet: true });

// dist/users.js 与 src/users.ts 同构，直接复用
const {
  createUser, listUsers, findByUsername, updateUser, deleteUser,
  bumpSessionVersion, validUsername, validPassword, dbFile,
} = require(path.join(__dirname, "..", "dist", "users.js"));

const IS_TTY = process.stdin.isTTY === true;

/* 非 TTY（管道 / CI / 脚本调用）：一次性把 stdin 读完按行取。
   逐个 createInterface 提问会在 rl.close() 时丢掉缓冲区里剩下的行，
   于是第二个问题永远读不到答案。 */
let piped = null;
let pipeCursor = 0;
if (!IS_TTY) {
  piped = fs.readFileSync(0, "utf8").split(/\r?\n/);
}

function askHidden(query) {
  if (!IS_TTY) {
    process.stdout.write(query);
    const v = piped[pipeCursor++] ?? "";
    process.stdout.write("\n");
    return Promise.resolve(v);
  }
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin, output: process.stdout, terminal: true,
    });
    rl.question(query, (a) => {
      readline.moveCursor(process.stdout, 0, -1);
      readline.clearLine(process.stdout, 1);
      rl.close();
      resolve(a);
    });
    process.stdin.on("data", (c) => {
      const s = c.toString("utf8");
      if (s.includes("\n") || s.includes("\r")) process.stdin.removeAllListeners("data");
    });
  });
}

async function askPassword(prompt) {
  const a = await askHidden(prompt);
  const b = await askHidden("再输一次：");
  if (a !== b) throw new Error("两次不一致");
  const bad = validPassword(a);
  if (bad) throw new Error(bad);
  return a;
}

const [cmd, arg, extra] = process.argv.slice(2);

(async () => {
  switch (cmd) {
    case "list": {
      const users = listUsers();
      console.log(`\n用户（${users.length}）  库文件：${dbFile}\n`);
      if (!users.length) {
        console.log("  还没有用户。用 npm run user -- add <用户名> 建第一个。\n");
        return;
      }
      users.forEach((u) =>
        console.log(
          `  ${u.username.padEnd(20)} ${(u.displayName || "").padEnd(16)} ` +
            `${u.role === "admin" ? "[管理员] " : "[访客] "}` +
            `${u.disabled ? "[已停用] " : ""}` +
            `创建于 ${u.createdAt.slice(0, 10)}` +
            (u.lastLoginAt ? `  最近登录 ${u.lastLoginAt.slice(0, 16).replace("T", " ")}` : "  从未登录"),
        ),
      );
      console.log("");
      return;
    }

    case "add": {
      if (!arg) throw new Error("用法：npm run user -- add <用户名> [显示名] [--admin|--viewer]");
      const bad = validUsername(arg);
      if (bad) throw new Error(bad);
      if (findByUsername(arg)) throw new Error(`用户名 ${arg} 已存在`);

      // 默认给 visitor。要能管用户必须显式 --admin ——
      // 免得随手建出一个不受控的管理员。
      const flags = process.argv.slice(3);
      if (flags.includes("--admin") && flags.includes("--viewer")) {
        throw new Error("--admin 与 --viewer 只能选一个");
      }
      const role = flags.includes("--admin") ? "admin" : "viewer";

      console.log(`\n新建用户 ${arg}（${role === "admin" ? "管理员" : "访客"}）`);
      const pw = await askPassword("密码：");
      const u = await createUser({
        username: arg, password: pw, displayName: extra, role,
      });
      console.log(`\n  已创建：${u.username}（${u.displayName} · ${u.role}）\n`);
      return;
    }

    case "passwd": {
      if (!arg) throw new Error("用法：npm run user -- passwd <用户名>");
      const u = findByUsername(arg);
      if (!u) throw new Error(`没有这个用户：${arg}`);
      const pw = await askPassword(`给 ${arg} 设新密码：`);
      await updateUser(u.id, { password: pw });
      console.log(`\n  ${arg} 的密码已更新\n`);
      return;
    }

    case "role": {
      if (!arg || !extra) throw new Error("用法：npm run user -- role <用户名> <admin|viewer>");
      const u = findByUsername(arg);
      if (!u) throw new Error(`没有这个用户：${arg}`);
      if (extra !== "admin" && extra !== "viewer") throw new Error("角色只能是 admin 或 viewer");
      const r = await updateUser(u.id, { role: extra });
      console.log(`\n  ${arg} 现在是：${r.role}\n`);
      return;
    }

    case "revoke-sessions": {
      if (!arg) throw new Error("用法：npm run user -- revoke-sessions <用户名>");
      const u = findByUsername(arg);
      if (!u) throw new Error(`没有这个用户：${arg}`);
      const next = bumpSessionVersion(u.id);
      if (next === null) throw new Error(`用户 ${arg} 不存在`);
      console.log(`\n  ${arg} 的所有 session 已吊销（session_version = ${next}）\n`);
      return;
    }

    case "rm": {
      if (!arg) throw new Error("用法：npm run user -- rm <用户名>");
      const u = findByUsername(arg);
      if (!u) throw new Error(`没有这个用户：${arg}`);
      deleteUser(u.id);
      console.log(`\n  已删除 ${arg}\n`);
      return;
    }

    default:
      console.log(`
用户管理

  npm run user -- list                 查看所有用户
  npm run user -- add <用户名> [显示名] 新建用户（默认访客）
  npm run user -- add <用户名> [显示名] --admin   新建管理员
  npm run user -- passwd <用户名>      重设密码
  npm run user -- role <用户名> <admin|viewer>   改角色
  npm run user -- revoke-sessions <用户名>   吊销该用户所有会话
  npm run user -- rm <用户名>          删除用户（不能删最后一个管理员）

库文件：${dbFile}
`);
  }
})().catch((e) => {
  console.error(`\n  ✗ ${e.message}\n`);
  process.exit(1);
});
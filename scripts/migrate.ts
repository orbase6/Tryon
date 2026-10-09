import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import mysql from "mysql2/promise";

const args = new Set(process.argv.slice(2));
const root = path.resolve(__dirname, "..");

async function main() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST || "127.0.0.1",
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "root",
    password: process.env.DB_PASSWORD || "",
    multipleStatements: true,
  });
  const dbName = process.env.DB_NAME || "tryon_store";
  if (!/^[A-Za-z0-9_]+$/.test(dbName)) throw new Error("Invalid DB_NAME");
  if (args.has("--reset")) await conn.query(`DROP DATABASE IF EXISTS \`${dbName}\``);
  await conn.query(`CREATE DATABASE IF NOT EXISTS \`${dbName}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
  await conn.query(`USE \`${dbName}\``);
  await conn.query(fs.readFileSync(path.join(root, "db/schema.sql"), "utf8"));
  console.log("✔ schema applied");
  if (args.has("--seed")) {
    const [rows] = await conn.query("SELECT COUNT(*) AS c FROM products");
    if ((rows as { c: number }[])[0].c > 0 && !args.has("--reset")) {
      console.log("• products already exist, skipping seed (use --reset to rebuild)");
    } else {
      await conn.query(fs.readFileSync(path.join(root, "db/seed.sql"), "utf8"));
      console.log("✔ seed applied");
    }
  }
  await conn.end();
}
main().catch((e) => { console.error(e); process.exit(1); });

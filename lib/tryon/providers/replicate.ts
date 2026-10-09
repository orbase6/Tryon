// Minimal Replicate REST client (predictions API with `Prefer: wait` + polling).
const API = "https://api.replicate.com/v1";

export const toDataUri = (buf: Buffer, mime: string) => `data:${mime};base64,${buf.toString("base64")}`;

const versionCache = new Map<string, string>();

/** Community models must be run by version id; resolve "owner/name" to its latest version. */
async function resolveVersion(ref: string, token: string): Promise<string> {
  const hit = versionCache.get(ref);
  if (hit) return hit;
  const res = await fetch(`${API}/models/${ref}`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) throw new Error(`Replicate model "${ref}" not found (${res.status}). Check REPLICATE_TRYON_MODEL and your token.`);
  const m = await res.json();
  const id = m?.latest_version?.id;
  if (!id) throw new Error(`Replicate model "${ref}" has no public version; set REPLICATE_TRYON_MODEL=owner/name:version`);
  versionCache.set(ref, id);
  return id;
}

export async function replicateRun(model: string, input: Record<string, unknown>): Promise<unknown> {
  const token = process.env.REPLICATE_API_TOKEN?.trim();
  if (!token) throw new Error("REPLICATE_API_TOKEN is not set");
  // accepts "owner/name", "owner/name:version" or a bare 64-char version hash
  const m = model.trim();
  const isHash = /^[a-f0-9]{64}$/.test(m);
  const [ref, ver] = !isHash && m.includes(":") ? m.split(":") : [m, ""];
  const version = isHash ? m : ver || (await resolveVersion(ref, token));
  let res = await fetch(`${API}/predictions`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "wait=60" },
    body: JSON.stringify({ version, input }),
  });
  if (!res.ok) throw new Error(`Replicate ${res.status}: ${(await res.text()).slice(0, 300)}`);
  let pred = await res.json();
  const started = Date.now();
  while (pred.status === "starting" || pred.status === "processing") {
    if (Date.now() - started > 240_000) throw new Error("Replicate timed out");
    await new Promise((r) => setTimeout(r, 2000));
    res = await fetch(pred.urls.get, { headers: { Authorization: `Bearer ${token}` } });
    pred = await res.json();
  }
  if (pred.status !== "succeeded") throw new Error(`Replicate ${pred.status}: ${pred.error ?? ""}`);
  return pred.output;
}

export async function fetchBuffer(url: string): Promise<Buffer> {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`download failed ${r.status}`);
  return Buffer.from(await r.arrayBuffer());
}

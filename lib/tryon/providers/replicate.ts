// Minimal Replicate REST client (predictions API with `Prefer: wait` + polling).
const API = "https://api.replicate.com/v1";

export const toDataUri = (buf: Buffer, mime: string) => `data:${mime};base64,${buf.toString("base64")}`;

export async function replicateRun(model: string, input: Record<string, unknown>): Promise<unknown> {
  const token = process.env.REPLICATE_API_TOKEN;
  if (!token) throw new Error("REPLICATE_API_TOKEN is not set");
  // "owner/name" -> models endpoint, "owner/name:version" or bare hash -> predictions endpoint
  const [ref, version] = model.includes(":") ? model.split(":") : [model, ""];
  const isHash = /^[a-f0-9]{64}$/.test(ref);
  const url = isHash || version ? `${API}/predictions` : `${API}/models/${ref}/predictions`;
  const body = isHash ? { version: ref, input } : version ? { version, input } : { input };
  let res = await fetch(url, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Prefer: "wait=60" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Replicate ${res.status}: ${(await res.text()).slice(0, 200)}`);
  let pred = await res.json();
  const started = Date.now();
  while (pred.status === "starting" || pred.status === "processing") {
    if (Date.now() - started > 150_000) throw new Error("Replicate timed out");
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

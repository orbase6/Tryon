"""Train the Lumen NLU model (intent + slot tagging) with PyTorch and export it
for in-browser inference (see ../nlu.js). Run: python gen_data.py && python train.py
"""
import json, math, base64, random, time
import numpy as np, torch, torch.nn as nn, torch.nn.functional as F

torch.manual_seed(0); random.seed(0)
torch.set_num_threads(4)
D = json.load(open('data.json'))
TAGS = ['O'] + [f'{p}-{s}' for s in ['MOVIE', 'COUNT', 'DATE', 'TIME', 'PLACE', 'PREF', 'FORMAT'] for p in 'BI']
INTENTS = ['book', 'confirm', 'deny', 'change', 'my_tickets', 'cancel_booking', 'notify', 'help']
BUCKETS, DIM, LAYERS, HEADS, FF, MAXLEN, NGRAM_MAX = 4096, 64, 2, 4, 128, 32, 8

def fnv(s):  # FNV-1a over Unicode code points; nlu.js does exactly the same
    h = 2166136261
    for ch in s:
        h ^= ord(ch); h = (h * 16777619) & 0xFFFFFFFF
    return h
def grams(w):  # word id + character 2/3/4-grams of "<word>" -> bucket ids
    s = '<' + w + '>'
    g = ['w:' + w] + [s[i:i + n] for n in (2, 3, 4) for i in range(len(s) - n + 1)]
    return [fnv(x) % BUCKETS for x in g][:NGRAM_MAX * 4]

class LN(nn.Module):
    def __init__(s, d): super().__init__(); s.g = nn.Parameter(torch.ones(d)); s.b = nn.Parameter(torch.zeros(d))
    def forward(s, x): m = x.mean(-1, keepdim=True); v = ((x - m) ** 2).mean(-1, keepdim=True); return (x - m) / torch.sqrt(v + 1e-5) * s.g + s.b
class Block(nn.Module):
    def __init__(s):
        super().__init__(); s.n1, s.n2 = LN(DIM), LN(DIM)
        s.qkv = nn.Linear(DIM, 3 * DIM); s.o = nn.Linear(DIM, DIM); s.f1 = nn.Linear(DIM, FF); s.f2 = nn.Linear(FF, DIM)
    def forward(s, x, mask):
        B, T, _ = x.shape; h = s.n1(x)
        q, k, v = s.qkv(h).view(B, T, 3, HEADS, DIM // HEADS).permute(2, 0, 3, 1, 4)
        a = (q @ k.transpose(-1, -2)) / math.sqrt(DIM // HEADS)
        a = a.masked_fill(~mask[:, None, None, :], -1e9).softmax(-1)
        x = x + s.o((a @ v).transpose(1, 2).reshape(B, T, DIM))
        return x + s.f2(F.relu(s.f1(s.n2(x))))
class NLU(nn.Module):
    def __init__(s):
        super().__init__()
        s.emb = nn.EmbeddingBag(BUCKETS, DIM, mode='mean'); s.pos = nn.Parameter(torch.randn(MAXLEN, DIM) * 0.02)
        s.blocks = nn.ModuleList([Block() for _ in range(LAYERS)]); s.nf = LN(DIM)
        s.tag = nn.Linear(DIM, len(TAGS)); s.intent = nn.Linear(DIM, len(INTENTS))
    def forward(s, ids, offs, B, T, mask):
        x = s.emb(ids, offs).view(B, T, DIM) + s.pos[:T]
        for b in s.blocks: x = b(x, mask)
        x = s.nf(x)
        pooled = (x * mask[..., None]).sum(1) / mask.sum(1, keepdim=True)
        return s.tag(x), s.intent(pooled)

def batchify(rows):
    T = max(len(r['w']) for r in rows); B = len(rows)
    ids, offs, tags, mask = [], [], torch.full((B, T), -100), torch.zeros(B, T, dtype=torch.bool)
    for i, r in enumerate(rows):
        for j in range(T):
            offs.append(len(ids))
            if j < len(r['w']):
                ids += grams(r['w'][j]); tags[i, j] = TAGS.index(r['t'][j]); mask[i, j] = True
            else: ids.append(0)
    return torch.tensor(ids), torch.tensor(offs), B, T, mask, tags, torch.tensor([INTENTS.index(r['i']) for r in rows])

def evaluate(model, rows):
    model.eval(); ok_i = tp = fp = fn = ok_sent = 0
    with torch.no_grad():
        for k in range(0, len(rows), 256):
            ch = rows[k:k + 256]; ids, offs, B, T, mask, tags, ints = batchify(ch)
            tl, il = model(ids, offs, B, T, mask)
            pi = il.argmax(-1); pt = tl.argmax(-1)
            ok_i += (pi == ints).sum().item()
            for i, r in enumerate(ch):
                gold = r['t']; pred = [TAGS[x] for x in pt[i, :len(gold)].tolist()]
                gs = spans(gold); ps = spans(pred)
                tp += len(gs & ps); fp += len(ps - gs); fn += len(gs - ps)
                ok_sent += (gs == ps and pi[i].item() == ints[i].item())
    p = tp / max(1, tp + fp); r = tp / max(1, tp + fn)
    return {'intent_acc': ok_i / len(rows), 'slot_f1': 2 * p * r / max(1e-9, p + r), 'exact': ok_sent / len(rows)}
def spans(tags):
    out, cur = set(), None
    for i, t in enumerate(tags + ['O']):
        if t.startswith('B-') or t == 'O' or (t.startswith('I-') and (not cur or cur[0] != t[2:])):
            if cur: out.add((cur[0], cur[1], i)); cur = None
            if t.startswith('B-'): cur = (t[2:], i)
            elif t.startswith('I-'): cur = (t[2:], i)
    return out

model = NLU()
print('parameters:', sum(p.numel() for p in model.parameters()))
opt = torch.optim.AdamW(model.parameters(), lr=3e-3, weight_decay=0.01)
train = D['train']; EPOCHS = 4; steps = EPOCHS * math.ceil(len(train) / 64); step = 0
sched = torch.optim.lr_scheduler.OneCycleLR(opt, max_lr=3e-3, total_steps=steps)
t0 = time.time()
for ep in range(EPOCHS):
    model.train(); random.shuffle(train)
    for k in range(0, len(train), 64):
        ids, offs, B, T, mask, tags, ints = batchify(train[k:k + 64])
        tl, il = model(ids, offs, B, T, mask)
        loss = F.cross_entropy(tl.reshape(-1, len(TAGS)), tags.reshape(-1), ignore_index=-100) + F.cross_entropy(il, ints)
        opt.zero_grad(); loss.backward(); nn.utils.clip_grad_norm_(model.parameters(), 1.0); opt.step(); sched.step(); step += 1
    print(f'epoch {ep + 1} loss {loss.item():.4f} test {evaluate(model, D["test"])} ({time.time() - t0:.0f}s)')

# Export: int8 per-tensor quantised weights in one JSON file
def q8(t):
    a = t.detach().float().numpy().astype(np.float32); s = max(1e-8, float(np.abs(a).max()) / 127)
    return {'shape': list(a.shape), 'scale': s, 'data': base64.b64encode(np.clip(np.round(a / s), -127, 127).astype(np.int8).tobytes()).decode()}
sd = {k: q8(v) for k, v in model.state_dict().items()}
json.dump({'config': {'buckets': BUCKETS, 'dim': DIM, 'layers': LAYERS, 'heads': HEADS, 'ff': FF, 'maxlen': MAXLEN, 'tags': TAGS, 'intents': INTENTS},
           'weights': sd}, open('../nlu-model.json', 'w'))
torch.save(model.state_dict(), 'model.pt')
res = evaluate(model, D['test']); json.dump(res, open('metrics.json', 'w'), indent=1)
print('exported. final:', res)

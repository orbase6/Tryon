import json, torch, sys
sys.argv = ['x']
exec(open('train.py').read().split('model = NLU()')[0])  # reuse definitions without training
model = NLU(); model.load_state_dict(torch.load('model.pt')); model.eval()
# use the quantised weights so both sides see the same numbers
import base64, numpy as np
J = json.load(open('../nlu-model.json'))
sd = {k: torch.tensor(np.frombuffer(base64.b64decode(v['data']), dtype=np.int8).astype(np.float32).reshape(v['shape']) * v['scale']) for k, v in J['weights'].items()}
model.load_state_dict(sd)
rows = D['test'][:300]; out = []
with torch.no_grad():
    for r in rows:
        ids, offs, B, T, mask, tags, ints = batchify([r]); tl, il = model(ids, offs, B, T, mask)
        out.append({'w': r['w'], 'tags': [TAGS[i] for i in tl.argmax(-1)[0].tolist()], 'intent': INTENTS[il.argmax(-1).item()]})
json.dump(out, open('parity.json', 'w'), ensure_ascii=False)
print('python done')

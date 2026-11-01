"""Synthetic training data for the Lumen booking NLU model.

Builds sentences the way people actually ask for tickets: English, Tamil,
Tanglish, mixed word order, filler words and typos. Every word gets a BIO slot
tag, every sentence gets an intent. Run: python gen_data.py
"""
import json, random, re, sys

MOVIES = {
    'kaalam': ['kaalam', 'kalam', 'kaalam the last monsoon', 'last monsoon', 'காலம்'],
    'neonkadal': ['neon kadal', 'neonkadal', 'neon', 'kadal', 'நியான் கடல்'],
    'paati': ["paati's kitchen", 'paati kitchen', 'paati', 'patti', 'paatti', 'பாட்டி'],
    'orbit9': ['orbit nine', 'orbit 9', 'orbit', 'ஆர்பிட்'],
    'rajarumble': ['raja rumble', 'raja', 'rumble', 'ராஜா ரம்பிள்'],
    'mazhavil': ['mazhavil', 'mazhai vil', 'mazhavillu', 'மழவில்'],
    'lastferry': ['the last ferry', 'last ferry', 'ferry'],
    'kanna': ['little kanna', 'kanna', 'கண்ணா'],
    'dhool': ['dhool express', 'dhool'],
    'silentvalley': ['silent valley'],
    'agniparavai': ['agni paravai', 'agni', 'அக்னி பறவை'],
    'moonlit': ['moonlit market', 'moonlit'],
    'kuyil': ['kuyil', 'குயில்'],
    'starfall': ['starfall', 'star fall'],
}
COUNTS = ['1', '2', '3', '4', '5', '6', '8', '10', 'one', 'two', 'three', 'four', 'five', 'six', 'onnu', 'oru', 'rendu', 'randu', 'moonu', 'naalu',
          'anju', 'aaru', 'pathu', 'ஒரு', 'இரண்டு', 'ரெண்டு', 'மூணு', 'நாலு', 'அஞ்சு', 'couple', 'jodi']
COUNT_TAIL = ['tickets', 'ticket', 'seats', 'seat', 'per', 'peru', 'people', 'pere', 'டிக்கெட்', 'சீட்', 'பேர்', '']
DATES = ['today', 'tonight', 'tomorrow', 'tmrw', 'day after tomorrow', 'naalaikku', 'nalaiku', 'naalai', 'inniki', 'innaikku', 'indru', 'இன்று', 'இன்னைக்கு',
         'நாளை', 'நாளைக்கு', 'saturday', 'sunday', 'this saturday', 'this sunday', 'friday', 'monday', 'next sunday', 'sat', 'sun']
TIMES = ['morning', 'evening', 'night', 'afternoon', 'late night', 'kaalai', 'maalai', 'iravu', 'saayangalam', 'madhiyam', 'காலை', 'மாலை', 'இரவு', 'மதியம்',
         '7 pm', '7:30 pm', '6.30 pm', '10 am', '9 pm', '11 am', '7 mani', '6 mani', 'first show', 'second show', 'noon show', 'matinee']
PLACES = ['anna nagar', 'vadapalani', 'omr', 'velachery', 'rs puram', 'gandhipuram', 'koramangala', 'kakkanad', 'edappally', 'kk nagar',
          'lumen talkies', 'lumen', 'starline', 'starline imax', 'velvet lounge', 'velvet', 'ganga cinemas', 'ganga', 'chennai', 'madurai', 'kochi',
          'coimbatore', 'bengaluru', 'அண்ணா நகர்', 'வடபழனி']
PREFS = ['recliner', 'recliners', 'balcony', 'back row', 'last row', 'front row', 'centre', 'center', 'middle', 'nadu', 'naduvula', 'cheap', 'cheapest',
         'budget', 'kammi rate', 'best view', 'best seats', 'aisle', 'couple sofa', 'நடுவில்', 'பால்கனி', 'ரெக்லைனர்', 'கம்மி']
FORMATS = ['imax', '4dx', 'dolby', 'dolby atmos', 'big screen', 'periya screen', '2d']

PRE = {'PLACE': ['at', 'in', 'near', '', '', ''], 'TIME': ['at', 'for', '', '', ''], 'DATE': ['for', 'on', '', '', ''], 'PREF': ['in', 'with', '', '', ''], 'FORMAT': ['in', '', '']}
POST = {'PLACE': ['la', 'le', 'il', 'theatre', 'side', '', '', ''], 'TIME': ['show', 'la', 'ku', '', '', ''], 'DATE': ['ku', '', '', ''], 'PREF': ['seat', 'seats', 'la', '', ''], 'FORMAT': ['la', '', '']}
OPEN = ['book', 'i want', 'i need', 'get me', 'can you book', 'please book', 'book pannu', 'venum', 'kudu', 'podu', 'show me', 'reserve', 'புக் பண்ணு',
        'எனக்கு', 'பார்க்கணும்', 'paakanum', 'paaka poganum', 'enakku', 'hey', 'hi lumen', '', '', '', '']
CLOSE = ['please', 'pls', 'venum', 'kudu', 'pannu', 'book pannunga', 'thanks', 'வேணும்', 'பண்ணு', '', '', '', '', '']
MIDDLE = ['for', 'movie', 'padam', 'film', 'show', 'tickets', 'and', '', '', '', '']

INTENT_PHRASES = {
    'confirm': ['yes', 'yes book it', 'ok', 'okay go ahead', 'confirm', 'sari', 'seri', 'aama', 'aama podu', 'ok book pannu', 'done', 'perfect book it', 'ஆமா', 'சரி', 'ஓகே', 'yes please', 'yep', 'sure'],
    'deny': ['no', 'nope', 'vendam', 'venam', 'illa', 'change it', 'not this', 'vera venum', 'another time', 'வேண்டாம்', 'இல்லை', 'no thanks', 'something else'],
    'my_tickets': ['show my tickets', 'my tickets', 'my bookings', 'en ticket kaattu', 'where is my ticket', 'en booking', 'என் டிக்கெட்', 'open my ticket'],
    'cancel_booking': ['cancel my booking', 'cancel the ticket', 'ticket cancel pannu', 'booking cancel', 'refund my ticket', 'cancel பண்ணு'],
    'help': ['hi', 'hello', 'help', 'what can you do', 'enna panna mudiyum', 'how does this work', 'vanakkam', 'வணக்கம்', 'உதவி'],
}
NOTIFY = ['remind me when {m} releases', 'notify me for {m}', '{m} release aana sollu', '{m} eppo release', 'tell me when {m} comes', '{m} வந்தா சொல்லு']

TOK = re.compile(r"[\s,!?;\"()]+")
def words(s):
    return [w for w in TOK.split(s.lower()) if w]

def typo(w, rng):
    if len(w) < 4 or not w.isascii() or rng.random() > 0.12: return w
    i = rng.randrange(1, len(w) - 1); k = rng.random()
    if k < 0.33: return w[:i] + w[i + 1:]
    if k < 0.66: return w[:i] + w[i] + w[i:]
    return w[:i] + w[i + 1] + w[i] + w[i + 2:]

def chunk(label, phrase, rng):
    out = []
    pre = rng.choice(PRE.get(label, ['']))
    if pre: out += [(w, 'O') for w in words(pre)]
    ws = [typo(w, rng) for w in words(phrase)]
    out += [(w, ('B-' if j == 0 else 'I-') + label) for j, w in enumerate(ws)]
    post = rng.choice(POST.get(label, ['']))
    if post: out += [(w, 'O') for w in words(post)]
    return out

def book_sentence(rng):
    parts = []
    mv = rng.choice(list(MOVIES))
    slots = []
    if rng.random() < 0.85: slots.append(('MOVIE', rng.choice(MOVIES[mv])))
    if rng.random() < 0.75:
        c = rng.choice(COUNTS); tail = rng.choice(COUNT_TAIL)
        slots.append(('COUNT', c, tail))
    if rng.random() < 0.6: slots.append(('DATE', rng.choice(DATES)))
    if rng.random() < 0.55: slots.append(('TIME', rng.choice(TIMES)))
    if rng.random() < 0.35: slots.append(('PLACE', rng.choice(PLACES)))
    if rng.random() < 0.3: slots.append(('PREF', rng.choice(PREFS)))
    if rng.random() < 0.18: slots.append(('FORMAT', rng.choice(FORMATS)))
    if not slots: slots.append(('MOVIE', rng.choice(MOVIES[mv])))
    rng.shuffle(slots)
    op = rng.choice(OPEN)
    if op and rng.random() < 0.8: parts += [(w, 'O') for w in words(op)]
    for s in slots:
        if s[0] == 'COUNT':
            parts += [(typo(w, rng), ('B-' if j == 0 else 'I-') + 'COUNT') for j, w in enumerate(words(s[1]))]
            if s[2]: parts += [(w, 'O') for w in words(s[2])]
        else:
            parts += chunk(s[0], s[1], rng)
        mid = rng.choice(MIDDLE)
        if mid and rng.random() < 0.4: parts += [(w, 'O') for w in words(mid)]
    cl = rng.choice(CLOSE)
    if cl: parts += [(w, 'O') for w in words(cl)]
    return parts, 'book'

def sentence(rng):
    r = rng.random()
    if r < 0.62: return book_sentence(rng)
    if r < 0.68:
        mv = rng.choice(list(MOVIES)); tpl = rng.choice(NOTIFY)
        pre, _, post = tpl.partition('{m}')
        parts = [(w, 'O') for w in words(pre)] + [(typo(w, rng), ('B-' if j == 0 else 'I-') + 'MOVIE') for j, w in enumerate(words(rng.choice(MOVIES[mv])))] + [(w, 'O') for w in words(post)]
        return parts, 'notify'
    if r < 0.74:
        # change request after a proposal: "evening la venum", "make it 3 tickets", "vera theatre"
        lab, vals = rng.choice([('TIME', TIMES), ('DATE', DATES), ('PREF', PREFS), ('PLACE', PLACES), ('FORMAT', FORMATS)])
        parts = [(w, 'O') for w in words(rng.choice(['make it', 'change to', 'instead', 'how about', 'vera', '', '']))] + chunk(lab, rng.choice(vals), rng)
        parts += [(w, 'O') for w in words(rng.choice(['venum', 'please', 'la', '', '']))]
        return parts, 'change'
    intent = rng.choice(list(INTENT_PHRASES))
    return [(typo(w, rng), 'O') for w in words(rng.choice(INTENT_PHRASES[intent]))], intent

def build(n, seed):
    rng = random.Random(seed)
    out = []
    for _ in range(n):
        parts, intent = sentence(rng)
        parts = parts[:32]
        out.append({'w': [p[0] for p in parts], 't': [p[1] for p in parts], 'i': intent})
    return out

if __name__ == '__main__':
    train, test = build(60000, 1), build(4000, 99)
    json.dump({'train': train, 'test': test}, open('data.json', 'w'), ensure_ascii=False)
    print('train', len(train), 'test', len(test)); print(' '.join(train[0]['w']), train[0]['t'], train[0]['i'])

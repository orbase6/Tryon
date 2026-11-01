// Create an account or reset its password, directly in data/db.json.
// Close the Lumen server window first, then run (inside the cinema folder):
//
//   node set-password.js admin   you@example.com      "YourPassword1"
//   node set-password.js partner partner@example.com "TheirPassword1" c0t0
//
// The last value (partner only) is the theatre this partner runs; default c0t0
// (first theatre in Chennai). Several: c0t0,c0t1. Theatre ids are shown in Console → Theatres.
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const net = require('net');

const [role, emailRaw, password, theatres] = process.argv.slice(2);
const DATA = path.join(__dirname, 'data'), DB_FILE = path.join(DATA, 'db.json');
const email = String(emailRaw || '').trim().toLowerCase();
const fail = (m) => { console.log('\n  ' + m + '\n'); process.exit(1); };

if (!['admin', 'partner'].includes(role) || !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email) || !password)
  fail('Use:  node set-password.js admin|partner email password [theatre ids]');
if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) fail('Password needs 8+ characters with letters and numbers.');
const theatreIds = role === 'partner' ? String(theatres || 'c0t0').split(',').map((x) => x.trim()).filter((x) => /^c\d+t\d+$/.test(x)) : [];
if (role === 'partner' && !theatreIds.length) fail('Theatre ids look like c0t0 (city 0, theatre 0).');

// The running server keeps its own copy in memory and would overwrite this change
const port = +process.env.PORT || 5500;
const probe = net.connect({ host: '127.0.0.1', port }, () => { probe.destroy(); fail(`Lumen is running on port ${port}. Close its window first, then run this again.`); });
probe.on('error', () => {
  let db = {};
  try { db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8')); } catch (e) { /* first run: start empty */ }
  db.users ||= []; db.sessions ||= {};
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  let u = db.users.find((x) => x.email === email);
  if (!u) {
    u = { id: crypto.randomBytes(9).toString('base64url'), email, name: role === 'admin' ? 'Lumen admin' : 'Theatre partner', phone: '', createdAt: Date.now() };
    db.users.push(u);
  }
  Object.assign(u, { role, status: 'active', salt, hash, note: '' });
  if (role === 'partner') u.theatreIds = [...new Set([...(u.theatreIds || []), ...theatreIds])]; else delete u.theatreIds;
  for (const [k, s] of Object.entries(db.sessions)) if (s.userId === u.id) delete db.sessions[k];
  fs.mkdirSync(DATA, { recursive: true });
  fs.writeFileSync(DB_FILE + '.tmp', JSON.stringify(db));
  fs.renameSync(DB_FILE + '.tmp', DB_FILE);
  console.log(`\n  Done: ${role} ${email} can sign in now${role === 'partner' ? ` (theatres: ${u.theatreIds.join(', ')})` : ''}.\n  Start Lumen with start.bat and open http://127.0.0.1:5500/#login\n`);
});

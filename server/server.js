const express    = require('express');
const cors       = require('cors');
const nodemailer = require('nodemailer');
const path       = require('path');
const fs         = require('fs');

const app  = express();
const PORT = 3000;

/* ─────────────────────────────────────────
   MIDDLEWARE
───────────────────────────────────────── */
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '..')));

/* ─────────────────────────────────────────
   DATABASE (JSON file — no install needed)
   Reservations are saved to database.json
   in the server folder.
───────────────────────────────────────── */
const DB_PATH = path.join(__dirname, 'database.json');

function readDB() {
  if (!fs.existsSync(DB_PATH)) {
    fs.writeFileSync(DB_PATH, JSON.stringify({ reservations: [], nextId: 1 }, null, 2));
  }
  return JSON.parse(fs.readFileSync(DB_PATH, 'utf-8'));
}

function writeDB(data) {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2));
}

/* ─────────────────────────────────────────
   EMAIL SETUP (optional)
   Fill in your Gmail + App Password to get
   confirmation emails. Leave empty to skip.
   Get App Password:
   myaccount.google.com → Security →
   2-Step Verification → App Passwords
───────────────────────────────────────── */
const EMAIL_USER = '';  // e.g. 'yourname@gmail.com'
const EMAIL_PASS = '';  // e.g. 'abcd efgh ijkl mnop'

const transporter = (EMAIL_USER && EMAIL_PASS)
  ? nodemailer.createTransport({
      service: 'gmail',
      auth: { user: EMAIL_USER, pass: EMAIL_PASS },
    })
  : null;

async function sendConfirmationEmail(r) {
  if (!transporter) return;
  await transporter.sendMail({
    from: `"Cozy Coffee" <${EMAIL_USER}>`,
    to: r.email,
    subject: `Reservation confirmed — ${r.date} at ${r.time}`,
    html: `
      <h2>We've got your table, ${r.first_name}!</h2>
      <p><strong>Date:</strong> ${r.date}</p>
      <p><strong>Time:</strong> ${r.time}</p>
      <p><strong>Guests:</strong> ${r.guests}</p>
      ${r.occasion ? `<p><strong>Occasion:</strong> ${r.occasion}</p>` : ''}
      <p>Your table will be held for 15 minutes. Reply to this email if your plans change.</p>
      <p>See you soon,<br/>The Cozy Coffee team</p>
    `,
  });
  await transporter.sendMail({
    from: `"Cozy Coffee Bookings" <${EMAIL_USER}>`,
    to: EMAIL_USER,
    subject: `New reservation — ${r.first_name} ${r.last_name} on ${r.date} at ${r.time}`,
    html: `
      <h3>New reservation</h3>
      <p><strong>Name:</strong> ${r.first_name} ${r.last_name}</p>
      <p><strong>Email:</strong> ${r.email}</p>
      <p><strong>Phone:</strong> ${r.phone}</p>
      <p><strong>Date:</strong> ${r.date}</p>
      <p><strong>Time:</strong> ${r.time}</p>
      <p><strong>Guests:</strong> ${r.guests}</p>
      ${r.occasion ? `<p><strong>Occasion:</strong> ${r.occasion}</p>` : ''}
      ${r.requests ? `<p><strong>Requests:</strong> ${r.requests}</p>` : ''}
    `,
  });
}

/* ─────────────────────────────────────────
   ALL TIME SLOTS
───────────────────────────────────────── */
const ALL_SLOTS = [
  '11:30 AM','12:00 PM','12:30 PM',
  '1:00 PM','1:30 PM','2:00 PM',
  '5:00 PM','5:30 PM','6:00 PM',
  '6:30 PM','7:00 PM','7:30 PM',
];
const MAX_TABLES = 5; // change this to your actual number of tables

/* ─────────────────────────────────────────
   ROUTES
───────────────────────────────────────── */

// GET /api/availability?date=2026-06-01
app.get('/api/availability', (req, res) => {
  const { date } = req.query;
  if (!date) return res.status(400).json({ error: 'date is required' });

  const db = readDB();

  // Count bookings per time slot on this date
  const counts = {};
  db.reservations
    .filter(r => r.date === date)
    .forEach(r => { counts[r.time] = (counts[r.time] || 0) + 1; });

  const availability = ALL_SLOTS.map(slot => ({
    time:      slot,
    available: (counts[slot] || 0) < MAX_TABLES,
    remaining: Math.max(0, MAX_TABLES - (counts[slot] || 0)),
  }));

  res.json({ date, availability });
});


// POST /api/reservations — create a booking
app.post('/api/reservations', async (req, res) => {
  const { first_name, last_name, email, phone, date, time, guests, occasion, requests } = req.body;

  if (!first_name || !last_name || !email || !phone || !date || !time || !guests) {
    return res.status(400).json({ error: 'All required fields must be filled in.' });
  }

  const db = readDB();

  // Check slot availability
  const count = db.reservations.filter(r => r.date === date && r.time === time).length;
  if (count >= MAX_TABLES) {
    return res.status(409).json({
      error: `Sorry, ${time} on ${date} is fully booked. Please choose another time.`,
    });
  }

  // Save reservation
  const reservation = {
    id: db.nextId++,
    first_name, last_name, email, phone,
    date, time,
    guests: parseInt(guests),
    occasion: occasion || '',
    requests: requests || '',
    created_at: new Date().toISOString(),
  };

  db.reservations.push(reservation);
  writeDB(db);

  // Send emails (won't crash booking if email fails)
  try { await sendConfirmationEmail(reservation); }
  catch (err) { console.warn('Email failed (booking still saved):', err.message); }

  res.status(201).json({
    success: true,
    message: `Reservation confirmed for ${first_name} on ${date} at ${time}.`,
    id: reservation.id,
  });
});


// GET /api/reservations — see all bookings
app.get('/api/reservations', (req, res) => {
  const db = readDB();
  const sorted = [...db.reservations].sort((a, b) =>
    a.date.localeCompare(b.date) || a.time.localeCompare(b.time)
  );
  res.json(sorted);
});


// DELETE /api/reservations/:id — cancel a booking
app.delete('/api/reservations/:id', (req, res) => {
  const id = parseInt(req.params.id);
  const db = readDB();
  const before = db.reservations.length;
  db.reservations = db.reservations.filter(r => r.id !== id);
  if (db.reservations.length === before) {
    return res.status(404).json({ error: `Reservation ${id} not found.` });
  }
  writeDB(db);
  res.json({ success: true, message: `Reservation ${id} cancelled.` });
});


/* ─────────────────────────────────────────
   ADMIN PAGE — view & delete bookings
   Go to http://localhost:3000/admin
───────────────────────────────────────── */
app.get('/admin', (req, res) => {
  const db = readDB();
  const sorted = [...db.reservations].sort((a, b) =>
    a.date.localeCompare(b.date) || a.time.localeCompare(b.time)
  );

  const rows = sorted.length === 0
    ? `<tr><td colspan="8" style="text-align:center;color:#999;padding:32px">No reservations yet.</td></tr>`
    : sorted.map(r => `
        <tr>
          <td>${r.id}</td>
          <td>${r.date}</td>
          <td>${r.time}</td>
          <td>${r.first_name} ${r.last_name}</td>
          <td>${r.email}</td>
          <td>${r.phone}</td>
          <td>${r.guests}</td>
          <td>${r.occasion || '—'}</td>
          <td>${r.requests || '—'}</td>
          <td>
            <button onclick="deleteRes(${r.id})" style="
              background:#8c3526;color:#fff;border:none;
              padding:6px 14px;cursor:pointer;font-size:0.8rem;
              font-family:sans-serif;
            ">Delete</button>
          </td>
        </tr>
      `).join('');

  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Admin — Cozy Coffee Reservations</title>
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { font-family: 'Segoe UI', sans-serif; background:#f5f5f0; color:#1a1a1a; }
    header {
      background:#283618; color:#fff;
      padding:20px 32px;
      display:flex; align-items:center; justify-content:space-between;
    }
    header h1 { font-size:1.3rem; font-weight:700; letter-spacing:0.5px; }
    header span { font-size:0.8rem; opacity:0.55; }
    .container { padding:32px; max-width:1300px; margin:0 auto; }
    .stats {
      display:grid; grid-template-columns:repeat(3,1fr);
      gap:16px; margin-bottom:28px;
    }
    .stat {
      background:#fff; border:1px solid #e0ddd0;
      padding:20px 24px; border-radius:2px;
    }
    .stat-num { font-size:2rem; font-weight:800; color:#283618; line-height:1; }
    .stat-label { font-size:0.75rem; color:#999; margin-top:4px; letter-spacing:1px; text-transform:uppercase; }
    .table-wrap { background:#fff; border:1px solid #e0ddd0; overflow-x:auto; }
    table { width:100%; border-collapse:collapse; font-size:0.85rem; }
    th {
      background:#283618; color:#fff;
      padding:12px 16px; text-align:left;
      font-size:0.7rem; letter-spacing:1.5px; text-transform:uppercase;
      font-weight:600; white-space:nowrap;
    }
    td { padding:12px 16px; border-bottom:1px solid #f0ede0; white-space:nowrap; }
    tr:last-child td { border-bottom:none; }
    tr:hover td { background:#fafaf5; }
    .refresh {
      background:none; border:1px solid #283618;
      color:#283618; padding:8px 20px;
      font-size:0.78rem; letter-spacing:1px; text-transform:uppercase;
      cursor:pointer; font-family:inherit; margin-bottom:20px;
    }
    .refresh:hover { background:#283618; color:#fff; }
    .toast {
      position:fixed; bottom:24px; right:24px;
      background:#283618; color:#fff;
      padding:12px 24px; font-size:0.85rem;
      display:none; border-radius:2px;
      box-shadow:0 4px 20px rgba(0,0,0,0.2);
    }
    .toast.show { display:block; }
  </style>
</head>
<body>
<header>
  <h1>Cozy Coffee — Reservations</h1>
  <span>Admin panel · ${sorted.length} total bookings</span>
</header>
<div class="container">
  <div class="stats">
    <div class="stat">
      <div class="stat-num">${sorted.length}</div>
      <div class="stat-label">Total reservations</div>
    </div>
    <div class="stat">
      <div class="stat-num">${sorted.filter(r => r.date === new Date().toISOString().split('T')[0]).length}</div>
      <div class="stat-label">Today's bookings</div>
    </div>
    <div class="stat">
      <div class="stat-num">${sorted.filter(r => r.date >= new Date().toISOString().split('T')[0]).length}</div>
      <div class="stat-label">Upcoming</div>
    </div>
  </div>
  <button class="refresh" onclick="location.reload()">↻ Refresh</button>
  <div class="table-wrap">
    <table>
      <thead>
        <tr>
          <th>ID</th><th>Date</th><th>Time</th><th>Name</th>
          <th>Email</th><th>Phone</th><th>Guests</th>
          <th>Occasion</th><th>Requests</th><th>Action</th>
        </tr>
      </thead>
      <tbody id="tbody">${rows}</tbody>
    </table>
  </div>
</div>
<div class="toast" id="toast"></div>
<script>
async function deleteRes(id) {
  if (!confirm('Delete this reservation? This cannot be undone.')) return;
  const res = await fetch('/api/reservations/' + id, { method: 'DELETE' });
  const data = await res.json();
  if (res.ok) {
    document.getElementById('toast').textContent = 'Reservation deleted.';
    document.getElementById('toast').classList.add('show');
    setTimeout(() => location.reload(), 1200);
  } else {
    alert(data.error || 'Failed to delete.');
  }
}
</script>
</body>
</html>`);
});


/* ─────────────────────────────────────────
   START
───────────────────────────────────────── */
app.listen(PORT, () => {
  console.log(`\n✅  Cozy Coffee server running`);
  console.log(`🌐  Website:      http://localhost:${PORT}`);
  console.log(`📋  Admin panel:  http://localhost:${PORT}/admin`);
  console.log(`🗃️   All bookings: http://localhost:${PORT}/api/reservations\n`);
});
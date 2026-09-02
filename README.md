# Autonomous Drug Repurposing Discovery Pipeline

An end-to-end, AI-driven computational framework and interactive web application designed to systematically identify and biologically validate novel drug-disease associations with minimal human intervention.

Developed by:
- **R. Manoj Kumar** (Roll No: 23241A12J2)
- **M. Faizuddin Uzair** (Roll No: 23241A12G4)
- **U. Abhishek** (Roll No: 23241A12J8)

**Project Guide**: Mr. K. Sandeep, Assistant Professor  
**Department**: Department of Information Technology  
**Institution**: Gokaraju Rangaraju Institute of Engineering and Technology (GRIET), Hyderabad

---

## Key Features & System Architecture

1. **Multi-Modal Data Integration**:
   - **Genomic & Transcriptomic Profiles**: LINCS L1000 perturbational gene expression signatures.
   - **Protein-Protein Interaction Networks**: DrugBank & DisGeNET heterogeneous relational graphs.
   - **Chemical Fingerprints**: SMILES chemical structure Morgan fingerprints.
   - **Biomedical Literature**: SciBERT/BioBERT NLP text mining over PubMed abstracts & clinical trials.

2. **AI & Biophysical Pipeline**:
   - **GNN-Based DTI Model**: Heterogeneous message passing graph neural network scoring drug-target interaction probabilities.
   - **Disease-Gene Classifier**: DisGeNET disease-gene relevance predictor.
   - **Closed-Loop Biological Validation**: AutoDock Vina biophysical docking simulation (\(\Delta G\) binding energy in kcal/mol and estimated \(K_i\)) + Reactome/KEGG pathway enrichment check.
   - **Multi-Agent Orchestrator**: CrewAI-style virtual research team consisting of Agent 1 (Data & GNN Miner), Agent 2 (Docking & Pathway Validator), and Agent 3 (NLP & Safety Ranker).

3. **Web Application Features**:
   - **Interactive Disease Search**: Live query execution with instant suggestion chips (Alzheimer's, Parkinson's, ALS, COVID-19, Type 2 Diabetes, TNBC, Glioblastoma, Huntington's).
   - **Real-Time Agent Progress Feed**: Step-by-step visual execution logs of active research agents.
   - **Hardware-Accelerated 3D Molecular Viewer**: WebGL protein-ligand 3D binding pocket viewer via `3Dmol.js`.
   - **Explainability View ("Why Was This Picked?")**: Plain-English AI reasoning narrative with multi-modal radar score breakdowns.
   - **Side-by-Side Drug Comparison**: Direct comparison tool analyzing thermodynamic binding affinity and safety profiles.
   - **PDF Report Generator**: On-demand publication-grade PDF report download powered by Python `ReportLab`.
   - **Interactive Research Assistant Chatbot**: Follow-up AI research assistant answering domain questions.

---

## Tech Stack

- **Frontend**: React 18, Vite, Tailwind CSS v4, Lucide Icons, 3Dmol.js (WebGL 3D Viewer).
- **Backend**: Python 3.13, FastAPI, Uvicorn, Pydantic v2, NumPy, ReportLab.
- **Data Engine**: DrugBank 5.0, DisGeNET v7.0, LINCS L1000 Connectivity Map, AutoDock Vina, PubMed SciBERT.

---

## Quick Start & Installation

### Prerequisites
- Node.js (v18+)
- Python (v3.10+)

### 1. Backend Setup & Launch
```bash
cd backend

# Install Python dependencies
pip3 install -r requirements.txt

# Launch FastAPI server (Runs on http://localhost:8000)
python3 -m app.main
```

### 2. Frontend Setup & Launch
```bash
cd frontend

# Install Node dependencies
npm install

# Start Vite development server (Runs on http://localhost:5173)
npm run dev
```

---

## API Documentation

- `GET /api/health` — System status and pipeline version.
- `GET /api/diseases` — List available benchmark diseases and target gene mappings.
- `GET /api/metrics` — Model performance metrics table (Table I from paper).
- `POST /api/search` — Runs full multi-agent pipeline for a disease query.
- `GET /api/drugs/{id}` — Fetch detailed metadata for a candidate drug.
- `GET /api/drugs/{id}/pdb` — Returns PDB 3D structure for WebGL rendering.
- `POST /api/compare` — Compares two candidate drugs side-by-side.
- `POST /api/chat` — Research Q&A chatbot response.
- `POST /api/export-pdf` — Generates and downloads PDF research report.
- `POST /api/feedback` — Submits user feedback for active learning loop.
- `POST /api/auth/register` — Creates an account and returns an access token.
- `POST /api/auth/login` — Exchanges email and password for an access token.
- `GET /api/auth/me` — Returns the account the bearer token belongs to.
- `GET /api/history` — A page of the caller's past pipeline runs.
- `GET /api/history/stats` — Dashboard aggregates over that history.
- `DELETE /api/history/{id}` — Removes one of the caller's entries.

---

## Configuration

Copy `backend/.env.example` to `backend/.env` and fill it in once:

```bash
cd backend
cp .env.example .env        # Copy-Item .env.example .env on PowerShell
```

The backend reads that file at startup, so every terminal you launch it from
picks up the same settings. **A real environment variable always overrides the
file**, which is what keeps deployment correct: Render sets `DATABASE_URL` and
`JWT_SECRET` in the process environment and no `.env` file exists there, so the
file can never shadow production.

`.env` is covered by `.gitignore`; `.env.example` is committed as documentation
of the keys, with no values.

---

## Authentication

Email and password accounts, using bcrypt for password storage and stateless
JWTs for sessions.

### Signing in is optional, by design

The discovery pipeline works for anonymous visitors. Signing in adds
attribution and history on top; it does not unlock the core feature. Two
dependencies express this:

- `get_current_user` — 401 without a valid token. Used by endpoints that make
  no sense without an account.
- `get_optional_user` — resolves a token if one is present and returns `None`
  otherwise. Used by `/api/search` and `/api/feedback`, so an examiner can type
  a disease and see results immediately.

### How passwords are stored

Never in readable form. Each password is hashed with **bcrypt**, a deliberately
slow algorithm with a per-user random salt embedded in the output, so two
identical passwords produce different hashes and a stolen database cannot be
attacked with a precomputed rainbow table.

Passwords are SHA-256 pre-hashed before bcrypt sees them. bcrypt reads only the
first 72 bytes of its input; feeding it a fixed-length digest means a long
passphrase is honoured in full rather than silently truncated.

### How sessions work

`POST /api/auth/login` returns an HS256 JWT containing the user id and an
expiry. The frontend stores it and sends it as `Authorization: Bearer <token>`
on every request. Verification is a signature check, with no database lookup
for the token itself — which matters on a free-tier database.

Signing out discards the token client-side; there is no server call, because a
stateless token has no server-side record to delete. The trade-off is that a
token stays valid until it expires, which is why the lifetime is bounded.

### Security decisions worth defending

| Decision | Reason |
| --- | --- |
| Same error for unknown email and wrong password | Otherwise anyone can enumerate which addresses have accounts |
| A hash is computed even when the email is unknown | Equalises response time, so timing does not leak the same information |
| Duplicate email caught by the database constraint, not a prior `SELECT` | A check-then-insert loses the race between two simultaneous signups |
| Email lowercased on write, with a unique index | `Alice@x.com` and `alice@x.com` cannot both register |
| Minimum length only, no complexity rules | Follows NIST SP 800-63B; forced symbols produce `Password1!`, which is weaker than a long ordinary phrase |
| Token validated against the server on page load | A stored token is not evidence the account still exists |

### Environment variables

| Variable | Where | Notes |
| --- | --- | --- |
| `JWT_SECRET` | Render → Environment → **Secret** | The signing key. Anyone holding it can forge a token for any user. If unset, a random key is generated at startup and every restart signs everyone out — acceptable locally, not in production. |
| `JWT_EXPIRE_MINUTES` | optional | Session lifetime. Defaults to 7 days. |
| `LOG_LEVEL` | optional | Defaults to `INFO`. |

Generate a secret with:

```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

---

## Database

PostgreSQL, accessed with SQLAlchemy 2.0 and versioned with Alembic.

### The application runs with or without it

If `DATABASE_URL` is not set the API starts anyway and persistence becomes a
no-op: search, docking, the 3D viewer, the chatbot and the PDF export all work
exactly as before. Only accounts and history are unavailable. This is
deliberate — nobody on the team is blocked waiting for credentials, local
development works offline, and a database outage degrades the deployed site
instead of breaking it. `GET /api/health` reports which mode you are in.

### Schema

| Table | Purpose |
|---|---|
| `users` | Accounts. Passwords stored as bcrypt hashes, never plaintext. |
| `search_history` | Every pipeline run, with the resolved disease, result count and measured duration. |
| `feedback` | Expert thumbs up/down. Previously `/api/feedback` returned success and discarded the data. |

Design decisions worth noting:

- Foreign keys use `ON DELETE CASCADE`, so removing a user removes their data
  rather than leaving orphaned rows.
- `user_id` is nullable throughout. Anonymous visitors can search and vote;
  their rows simply have no owner. Gating the core feature behind a login
  would make the product worse and the demo harder.
- A composite index on `(user_id, created_at DESC)` matches exactly what the
  history query filters and sorts by. An index that does not serve a real
  query is decoration.
- `UNIQUE (user_id, drug_id)` gives one vote per drug per signed-in user.
  Changing your mind updates the row instead of adding a second one.

### Local development

Start a PostgreSQL container and apply the migrations:

```bash
docker compose up -d

cd backend
export DATABASE_URL=postgresql://postgres:postgres@localhost:5433/drugrepurposing
alembic upgrade head
```

Port 5433 is used so this never clashes with a PostgreSQL already installed on
your machine. On Windows PowerShell, use
`$env:DATABASE_URL="postgresql://postgres:postgres@localhost:5433/drugrepurposing"`.

### Production

Set `DATABASE_URL` in the Render dashboard to the Neon **pooled** connection
string — the one with `-pooler` in the hostname. Pooling matters because the
service can restart or run more than one instance, and each would otherwise
open its own connections and exhaust the limit.

The credential lives only in Render's environment settings. It is never
committed, and `.gitignore` covers `.env` files so it cannot be added by
accident.

### Timeouts

Every wait has a ceiling, because each one defaults to *forever* and a request
that waits forever is indistinguishable from a crashed server:

| Setting | Default | What it bounds |
| --- | --- | --- |
| `connect_timeout` | 10s | Opening a connection. psycopg2 has none by default, so a database that accepts the TCP connection but never completes the handshake hangs the request permanently. |
| `statement_timeout` | 15s | A query that has started but will not finish. Applied per transaction with `SET LOCAL` — see below. |
| `pool_timeout` | 15s | Waiting for a free connection. Without it, once every connection is held by a stalled query, every later request queues behind them and the whole API stops responding. |
| TCP keepalives | 30s idle | Detecting a silently dropped link rather than waiting on it. |
| axios `timeout` | 45s | The browser's wait, set above the worst legitimate cold start so a real wait completes and a real failure surfaces. |

`/api/health` reports the reason when the database is unreachable, not just
`reachable: false`. Any `user:password` pair is stripped from that text before
it leaves the server — a useless error message is a problem, but the fix for it
must not be a leaked credential.

### Why the query timeout is not set at connection time

The obvious way to set `statement_timeout` is a libpq connection option:
`options=-c statement_timeout=15000`. Against a direct Postgres connection that
works. Against the **pooled** endpoint it fails outright:

```
ERROR: unsupported startup parameter: options
```

A pooled connection string (the `-pooler` hostname) does not reach Postgres
directly. It reaches **PgBouncer**, which multiplexes many client connections
onto a small number of real database connections — which is what lets a free
tier serve more than a handful of clients. The cost is that some Postgres
features do not pass through it, and arbitrary server startup parameters are
one of them.

So the timeout is applied per transaction instead, with
`SET LOCAL statement_timeout`. `SET LOCAL` is scoped to the current transaction
and reset when it ends, which is precisely what makes it correct here: under
transaction pooling the next transaction may land on a different backend
connection, so a session-wide `SET` would either leak into unrelated work or be
silently lost.

Everything else in `connect_args` — `connect_timeout`, the TCP keepalives — is
a *client-side* libpq setting handled locally and never sent to the server, so
it passes through the pooler untouched.

### Migrations

Never create tables by hand. Every schema change is a versioned file committed
to the repository:

```bash
alembic revision --autogenerate -m "describe the change"
alembic upgrade head      # apply
alembic downgrade -1      # roll back one
```

This means the schema matches the code at every commit, teammates get your
changes with one command, and changes can be reversed.

---

## Search history & the research dashboard

The **My Research** tab (visible once signed in) shows every pipeline run
recorded against the account, plus aggregates over them.

### The aggregates are computed in SQL, not in the browser

Counting, grouping and taking a median are what a database is for. Fetching
every row to loop over it in JavaScript would be slower and would get worse as
the table grows. Four queries back the whole dashboard:

| Query | Technique |
| --- | --- |
| Totals | `COUNT`, `COUNT(DISTINCT …)`, `SUM` in one pass |
| Typical runtime | `PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY duration_ms)` |
| Daily activity | `generate_series` `LEFT JOIN`ed to the table |
| Most investigated | `GROUP BY … ORDER BY COUNT(*) DESC LIMIT 5` |

Two of those are worth being able to explain:

- **`generate_series` with a `LEFT JOIN`** produces one row per day whether or
  not anything happened that day. Without it, days with no searches would simply
  be absent from the result, and a chart drawn from those rows would silently
  close the gaps — showing continuous activity that never happened.
- **`PERCENTILE_CONT`, not `AVG`.** One run that happened while an external API
  was timing out would drag a mean upwards and misrepresent typical
  performance. A median ignores it.

### Ownership is enforced in the WHERE clause

`DELETE FROM search_history WHERE id = :id AND user_id = :user_id`. The user id
comes from the verified token, never from a request parameter, and it is part of
the query rather than a check performed after loading the row — so there is no
window in which someone else's row is in hand. A miss returns 404 whether the
entry does not exist or belongs to somebody else, so ids cannot be probed.

### The chart palette was validated, not chosen by eye

The dashboard charts are single-hue, because colour there encodes magnitude
rather than identity. The instinctive alternative — green for supported votes,
red for rejected — was measured and rejected: that pair separates by roughly
ΔE 5 under deuteranopia against these surfaces, well under the threshold of 8 at
which two colours can be reliably told apart. The supported/rejected split is
drawn instead as one proportion meter with icons and written counts, so nothing
depends on distinguishing two hues.

Both steps (`#4f46e5` light, `#7079f5` dark) were checked against the actual
card surfaces they render on for lightness band and 3:1 contrast.

---

## Background Media

The application renders a full-screen photographic (or video) backdrop behind
every page, with a readability scrim over it.

### Replacing the image

Drop your own file at `frontend/public/backdrop.jpg`. That is the whole change
— no code edit needed. The one shipped with the repository is a generated
placeholder (a defocused microscopy field); replace it with a real photograph.

**Free, commercially usable sources** (no attribution required):

- [Pexels](https://www.pexels.com) — photos and video
- [Pixabay](https://pixabay.com) — photos and video
- [Unsplash](https://unsplash.com) — photos
- [Coverr](https://coverr.co) and [Mixkit](https://mixkit.co) — video loops
  intended for website backgrounds

Useful search terms: *laboratory*, *microscope*, *pipette*, *petri dish*,
*medical research*, *dna helix*, *scientist lab coat*.

**Target: under 400 KB, 1920x1080.** A full-resolution download is often 5 MB
and will make the site feel slow on the free hosting tier. Compress it at
[squoosh.app](https://squoosh.app) — WebP at quality 75 is usually
indistinguishable and a fraction of the size.

### Using a video instead

1. Put the file at `frontend/public/backdrop.mp4`
2. Set `VITE_BACKDROP_VIDEO=/backdrop.mp4` in `frontend/.env.local`, and in the
   Vercel environment variables for the deployed site

Keep it short, silent and small — a 10-15 second loop, 1280x720, under 5 MB:

```bash
ffmpeg -i input.mp4 -t 12 -an -vf "scale=1280:-2" -c:v libx264 \
  -crf 30 -preset slow -movflags +faststart public/backdrop.mp4
```

`-an` strips the audio track (a background video must never have sound),
and `-movflags +faststart` lets it begin playing before the whole file has
downloaded.

The still image is used as the video's poster frame, so it is worth keeping
both even when the video is enabled.

### Tuning readability

`--backdrop-veil` in `frontend/src/index.css` controls how much of the page
background is laid over the media — the single trade-off between seeing the
picture and being able to read the text. Light mode needs more of it than dark
mode. Raise it if your image is busy or high-contrast; lower it to let more
through.

### Switching back to the generated molecular field

`frontend/src/components/AmbientBackdrop.jsx` draws an animated 3D field of
molecular nodes instead, with no image asset at all. To use it, import it in
`frontend/src/App.jsx` in place of `MediaBackdrop` and swap the tag.

---

## License & Citation
Developed for academic major project submission at GRIET Hyderabad.

---

## Live Deployment

- **Frontend:** https://drug-repurposing-three.vercel.app (Vercel)
- **Backend API:** https://drug-repurposing-api-zthi.onrender.com (Render)
- **Database:** Neon Serverless Postgres, Singapore region

Deployments are automatic: any push to the `develop` branch rebuilds and
redeploys the frontend on Vercel.



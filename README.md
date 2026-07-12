# RiskWatch // Cybersecurity Awareness & Live Event Console

A real-time, interactive cybersecurity-themed presentation platform designed to walk groups of users through financial threat scenarios. The system contains two main interfaces:

- **User Terminal Portal (`/`)**: A mobile-optimized terminal console where **Operators** register with their names and expand threat dossiers. If the presenter enforces the focus lock, audience screens synchronize instantly, allowing them to expand and report scans only on the active focus topic.
- **Presenter SOC Console (`/admin`)**: A desktop-only command center displaying:
  - **Live Presentation Focus Controls**: Select active scenarios and advance focus step-by-step.
  - **Faced Focused Threat Tally**: Visual display of glowing operator badges representing members who faced the focused threat.
  - **Active Session Telemetry**: High-frequency status bar updates.
  - **Operator Scans Sonar Chart**: Clickable polar area chart segments showing logs dossiers.
  - **Threat Vector Matrix**: Dynamic horizontal matrix mapping threat rows and operator columns, highlighting clicked items with skull emojis (`💀`).
  - **Real-Time Event Logs**: Stream of chronological handshakes.

---

## 1. Stack and Libraries
- **Backend**: Node.js + Express + SQLite (`better-sqlite3`)
- **Frontend**: Vanilla HTML5 + CSS + JavaScript
- **Analytics**: Chart.js (configured locally via jsDelivr UMD bundle)
- **Security**: JSON Web Tokens (JWT) for session authentication, `bcryptjs` for password hashing, and input validation filters.

---

## 2. Quick Start & Execution

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Initialize Environment Configuration**:
   ```bash
   cp .env.example .env
   ```
   *Note: On startup, the server automatically reads credentials from `.env` and synchronizes them with the database. If you modify `ADMIN_DEFAULT_PASSWORD` in `.env`, the database admin account will automatically update to match on next server boot.*

3. **Start the Server**:
   ```bash
   npm start
   ```

4. **Access the Portals**:
   - **User Terminal Portal**: `http://localhost:3000/`
   - **Presenter Console**: `http://localhost:3000/admin` (Requires desktop window width of at least ~1000px).

---

## 3. Real-Time Presentation Mechanics

### Presenter Focus Lock
- The presenter can check **Enforce Presenter Focus Lock** and select a card.
- User portals query the state every 3 seconds. Any non-focused cards immediately lock, gray out (`opacity: 0.45`), collapse their details, block click events, and display `🔒 Presenter Focus Locked`.
- Unchecking the box instantly releases all cards back to free-exploration mode.

### Threat Vector Matrix
- Located in the bottom row of the presenter panel.
- Maps threats (rows) against all registered operator names (columns).
- Cells dynamically render `💀` if the operator clicked that threat card during the session; otherwise, a placeholder dot `•` is shown.
- The threat column is pinned sticky (`position: sticky; left: 0`), allowing horizontal scrolling through large audience lists while maintaining alignment with threat names.

---

## 4. API Endpoints Reference

### Authentication Services (`/api/auth`)
* `POST /register`: Registers a new user with `{ username, password, name }`. Returns JWT token.
* `POST /login`: Authenticates `{ username, password }`. Returns JWT token and role.

### User Card Access (`/api/risks`)
* `GET /`: Fetches all 10 threat cards, active sessions count, `activeFocusId`, and `focusLocked` state.
* `POST /click`: Logs a click/scan event for the authenticated user and specified card ID.

### Admin Operations (`/api/admin`)
* `GET /summary`: Compiles aggregate click counts and active sessions.
* `GET /users-activity`: Returns connected operators, threat cards list, and 2D matrix logs.
* `GET /recent`: Fetches a chronological stream of the latest 15 scan events.
* `POST /clear-logs`: Purges the click database, resetting charts and matrix grids instantly.
* `GET /event-focus`: Returns `{ activeFocusId, focusLocked }`.
* `POST /event-focus`: Updates `{ activeFocusId, focusLocked }` in memory.

---

## 5. Project Directory Structure
```
server.js            Express app entry & configuration loader
db.js                 SQLite database tables seeding and startup credentials sync
design.md             Detailed architectural design specs and schema contracts
middleware/auth.js    JWT token validation & admin authorization checks
routes/               Routing modules for auth, risks, click logs, and admin analytics
public/index.html     User terminal card portal UI
public/admin.html     Admin presenter command console UI
public/css/           Custom layouts and styles for user and admin panels
public/js/            Client logic, polling, and charts controllers
```

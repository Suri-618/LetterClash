# Letter Clash ⚔️

**A real-time multiplayer arcade fighting game where words become weapons and reaction speed decides the winner.**

<p align="center">
  <a href="https://letter-clash-game.vercel.app/">🎮 Play Letter Clash</a> ·
  <a href="https://github.com/Suri-618/LetterClash">📂 GitHub Repository</a>
</p>

---

## 🎮 About the Game

Letter Clash is a browser-based multiplayer reaction game inspired by classic arcade fighting games. Challenge another player in a real-time duel where both fighters compete to enter the displayed letter before the round timer expires.

Every successful hit reduces your opponent's health. Keep your reactions sharp, survive the rounds, and knock out your opponent!

## ✨ Features

- **Real-time Multiplayer:** Create a private room or join a friend using a six-character room code.
- **Fast-Paced Battles:** Compete in timed letter-reaction rounds.
- **Fighter Selection:** Choose from four unique characters — Kai, Maya, Col. Syntax, and Void Shadow.
- **Animated Fighters:** Character sprite animations for idle, punch, and hit states.
- **Arcade Battle Effects:** Health bars, countdowns, impact effects, and knockout screens.
- **Player Accounts:** Register and log in with an email and password.
- **Guest Play:** Enter the arena without creating a registered account.
- **Player Profiles:** Track wins, losses, matches played, and rating.
- **Global Leaderboard:** Compare player rankings and competitive statistics.
- **Match History:** Review recently completed matches.
- **Reconnect Support:** Resume a disconnected match during the reconnect grace period.
- **Responsive Interface:** Play through a modern browser interface.

## 🕹️ Gameplay

1. Create a room and share its room code, or join an existing room.
2. Both players enter the battle arena.
3. A countdown begins before each round.
4. A target letter appears on the screen.
5. Type the displayed letter as quickly as possible.
6. The first valid response lands a hit and damages the opponent.
7. The battle continues until a fighter's health reaches zero.

**Default battle settings**

| Setting | Value |
|---|---:|
| Starting health | 200 HP |
| Room code | 6 characters |
| Countdown | 3 seconds |
| Round duration | 2.5 seconds |
| Next-round delay | 1.8 seconds |
| Disconnect grace period | 12 seconds |

## 🥊 Fighters

| Fighter | Identity |
|---|---|
| Kai | The Lexicon |
| Maya | The Cipher |
| Col. Syntax | Iron Wall |
| Void Shadow | The Forbidden |

Each fighter has a distinct visual identity and character-specific ability descriptions in the selection interface. Special combat mechanics may evolve as development continues.

## 🛠️ Tech Stack

### Frontend
- React 19
- Vite
- JavaScript (ES Modules)
- React Router
- Socket.IO Client
- Three.js
- React Three Fiber
- React Three Drei
- Lenis

### Backend
- Node.js
- Express 5
- Socket.IO
- MongoDB
- Mongoose
- JSON Web Tokens (JWT)
- bcryptjs

### Deployment
- Frontend: Vercel
- Backend: Render
- Database: MongoDB Atlas

## 🏗️ Project Structure

```text
LetterClash/
│
├── client/
│   ├── public/
│   │   ├── images/
│   │   └── sprites/
│   │
│   ├── src/
│   │   ├── fight/
│   │   ├── App.jsx
│   │   ├── Dashboard.jsx
│   │   ├── Lobby.jsx
│   │   ├── FightScreen.jsx
│   │   ├── Leaderboard.jsx
│   │   ├── Profile.jsx
│   │   ├── AuthPage.jsx
│   │   ├── ArcadeFighter.jsx
│   │   ├── useGameSocket.js
│   │   ├── api.js
│   │   └── audio.js
│   │
│   ├── package.json
│   └── vite.config.js
│
├── server/
│   ├── game/
│   │   ├── persistence.js
│   │   ├── persistence.test.js
│   │   ├── rules.js
│   │   └── rules.test.js
│   │
│   ├── lib/
│   │   └── rateLimit.js
│   │
│   ├── middleware/
│   │   └── auth.js
│   │
│   ├── models/
│   │   ├── Player.js
│   │   └── Match.js
│   │
│   ├── routes/
│   │   └── auth.js
│   │
│   ├── test/
│   │   └── integration.test.js
│   │
│   ├── db.js
│   ├── index.js
│   └── package.json
│
└── README.md
```

## ⚙️ Run Locally

### Prerequisites

- Node.js and npm
- MongoDB Atlas account or a MongoDB connection
- Git

### 1. Clone the repository

```bash
git clone https://github.com/Suri-618/LetterClash.git
cd LetterClash
```

### 2. Configure the backend

```bash
cd server
npm install
```

Create a `.env` file inside the `server` folder:

```env
PORT=3001
MONGODB_URI=your_mongodb_connection_string
JWT_SECRET=your_secure_random_secret
CLIENT_URL=http://localhost:5173
```

Start the backend:

```bash
npm run dev
```

The backend runs on `http://localhost:3001` by default.

### 3. Configure the frontend

Open another terminal:

```bash
cd client
npm install
```

Create a `.env` file inside the `client` folder:

```env
VITE_SERVER_URL=http://localhost:3001
```

Start the frontend:

```bash
npm run dev
```

Open the local Vite URL shown in your terminal, usually:

```text
http://localhost:5173
```

## 🔐 Environment Variables

### Backend (`server/.env`)

| Variable | Description |
|---|---|
| `PORT` | Backend server port; defaults to `3001` |
| `MONGODB_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret used to sign authentication tokens |
| `CLIENT_URL` | Allowed frontend origin for CORS |

### Frontend (`client/.env`)

| Variable | Description |
|---|---|
| `VITE_SERVER_URL` | Backend server URL |

Never commit `.env` files or expose your database credentials and JWT secret.

## 🧪 Testing

Run backend unit tests:

```bash
cd server
npm test
```

Run integration tests:

```bash
npm run test:integration
```

Run all backend tests:

```bash
npm run test:all
```

Run frontend lint checks:

```bash
cd client
npm run lint
```

## 🌐 Deployment

The project is deployed using separate frontend and backend services.

| Component | Platform |
|---|---|
| Frontend | Vercel |
| Backend | Render |
| Database | MongoDB Atlas |

For production deployment, configure the frontend's `VITE_SERVER_URL` with the deployed backend URL. Set the backend's `CLIENT_URL` to the deployed frontend origin and configure `MONGODB_URI` and `JWT_SECRET` in the backend hosting environment.

**Live Demo:** https://letter-clash-game.vercel.app/

## 🔒 Security

The backend includes:
- Password hashing with bcryptjs.
- JWT-based authentication.
- Authentication rate limiting.
- Guest profile creation limits.
- Server-side validation of submitted game actions.
- Match persistence safeguards to prevent duplicate match records.

## 🚀 Future Improvements

- More fighters and visual effects.
- Additional combat mechanics and character abilities.
- More multiplayer modes.
- Improved matchmaking and competitive features.
- Additional battle arenas and animations.

## 👨‍💻 Developer

**Surendra Kumar Battagani**

- GitHub: https://github.com/Suri-618
- LinkedIn: https://www.linkedin.com/in/surendra-kumar-202b76337/

---

<p align="center">
  <b>Choose your fighter. Trust your reflexes. Win the clash.</b>
</p>
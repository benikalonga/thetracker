# TheTracker

**Field team tracking for companies whose people visit customers.**

TheTracker gives sales reps, collectors and service agents a mobile app for planning the day, proving each visit
happened on site, and recording what came of it. Managers get a web console with a live map, route planning, visit
review and performance reports. The mobile app keeps working when the network drops and catches up when it returns.

| Part | What it is | Stack |
|---|---|---|
| [`mobile/`](mobile) | App for field agents (iOS and Android) | Expo, React Native, TypeScript, React Navigation, Zustand, react-native-maps |
| [`console/`](console) | Web console for managers and admins | Next.js 14, TypeScript, Tailwind CSS, Leaflet and OpenStreetMap |
| [`api/`](api) | REST API, live updates and scheduled jobs | Node.js, Express, TypeScript, Prisma, MySQL 8, Socket.IO, Zod |

## What it does

### For field agents

- **Today screen:** shift clock, progress against a daily visit target, distance driven, order value, next stops and tasks due.
- **Customers:** search by name, city, phone or code. Sort by nearest, A–Z or longest since a visit. Filter by status, favorites or visit due.
- **Map:** customers colored by status, with a card for directions or details.
- **Add and edit customers:** drop a pin on the map, and the address fills itself in.
- **Verified check-ins:** a visit counts as on site only inside the customer's geofence. From farther away, the agent gives a reason and the visit goes to a manager for review.
- **Visit outcomes:** order, payment, service, follow-up, not available or not interested, with value and notes. Choosing a follow-up date creates a task.
- **Route planning:** build the day, find the shortest order, reorder or skip stops with a reason, and open the route in Maps.
- **Tasks:** overdue, today and upcoming, including tasks assigned by a manager.
- **One-tap contact:** call, text, WhatsApp, email, directions and share.
- **Customer history:** visits, notes, open tasks and lifetime order value, plus the last five customers viewed.
- **Offline first:** customers, tasks and the day's plan are stored on the phone. Actions queue with their real time and are sent in order later. A sync center shows what is waiting or failed.
- **My performance:** visits per day, outcomes, on-site percentage and average visit length over 7, 30 or 90 days.

### For managers

- **Overview:** who is on shift, today's visits and orders, reviews waiting, overdue tasks and a 14-day trend.
- **Live map:** agents move in real time, with current visit, battery and last-seen time. Select an agent to replay their route for any day.
- **Visit review:** approve or reject off-site check-ins, and the agent is told the result.
- **Route plans:** set each agent's stops for any upcoming day, in the shortest order if you like.
- **Customers:** assign in bulk, import and export CSV, and view them on a map.
- **Tasks, team and reports:** assign work, manage accounts and targets, and export per-agent performance.
- **Audit log and settings:** see who changed what, and set the geofence radius, update interval and how long location history is kept.

### Built in

- **Privacy:** location is stored and shown only during a shift, and agents can turn sharing off. A forgotten shift closes itself after 16 hours. Old route points are deleted on a schedule.
- **Automatic upkeep:** customers who go unvisited become "at risk", due tasks trigger one reminder each, and expired sessions are removed.
- **Security:** passwords are hashed with bcrypt, access tokens are short-lived, refresh tokens rotate and work once, accounts lock after repeated failures, and every record is checked against the signed-in person's team.
- **Reliable retries:** offline records use client-generated ids, so sending one twice cannot create a duplicate. The database itself allows only one open visit and one open shift per agent.

## Run it locally

You need Node.js 20 or newer and MySQL 8. The mobile app also needs Xcode or Android Studio.

### 1. API

```bash
cd api
cp .env.example .env     # set DATABASE_URL and two different 32+ character JWT secrets
npm install
npx prisma db push
SEED_PASSWORD='YOUR_PASSWORD' npm run db:seed   # optional demo data
npm run dev              # http://localhost:4000/api/health
```

Without demo data, create your first account:

```bash
npm run user:admin -- YOUR_EMAIL@fakeemail.com 'YOUR_PASSWORD' "YOUR_NAME"
```

The demo data adds `your_admin_email@fakeemail.com`, `your_manager_email@fakeemail.com` and `your_agent_email@fakeemail.com`, all using your `SEED_PASSWORD`.

### 2. Manager console

```bash
cd console
cp .env.example .env.local
npm install
npm run dev              # http://localhost:3000
```

### 3. Mobile app

```bash
cd mobile
cp .env.example .env     # a real phone needs your computer's LAN address, not localhost
npm install
npx expo run:ios         # or: npx expo run:android
```

The demo customers are around latitude 0, longitude 0, so set the simulator there to test check-ins:

```bash
xcrun simctl location booted set 0,0
```

Android needs a Google Maps key in `android.config.googleMaps.apiKey` in `mobile/app.json`. iOS uses Apple Maps and needs no key.

## Tests

```bash
cd api
npm test                 # route optimizer, geofence, distance and time rules
npm run typecheck
```

## Deploy

```bash
cp .env.example .env     # fill in every value
docker compose up -d --build
```

Put the API and console behind HTTPS, then set `PUBLIC_API_URL` and `CONSOLE_URL` to their public addresses. Build the mobile app with `EXPO_PUBLIC_API_URL` set to the same API address.

More detail is in the [API reference](docs/API.md).

## Current limits

- Location updates while the app is open. Tracking with the app in the background is not built yet.
- Notifications appear in the app inbox. Push notifications are not built yet.
- Visit photos are not supported yet.

## License

MIT. See [LICENSE](LICENSE).

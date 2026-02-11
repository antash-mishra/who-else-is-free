# Build Commands
- Frontend (React Native): `npm start` (Expo), `npm run android`, `npm run ios`, `npm run web`
- Frontend tests: `npm test`
- Backend (Go): `cd server && go run .`
- Backend tests: `cd server && go test ./...`

# Architecture
- **Frontend**: React Native Expo app (TypeScript) in `src/` with root entry in `App.tsx`
- **Backend**: Go (Gin) HTTP server in `server/` with SQLite database
- **API**: RESTful endpoints plus WebSocket chat (`/api/ws`)
- **State**: React Context via `AuthContext`, `EventsContext`, and `ChatContext`

# Code Style Guidelines
- **Imports**: React → external libs → internal (@ aliases)
- **Types**: Strict TypeScript, interfaces for props/state
- **Naming**: camelCase vars/functions, PascalCase components
- **Error Handling**: try/catch with console.error/warn
- **Async**: Proper await/error handling in functions
- **Components**: Functional with hooks, typed navigation props

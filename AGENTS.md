# Build Commands
- Frontend (React Native): `npm start` (Expo), `npm run android/ios/web`
- Backend (Go): `cd server && go run main.go`

# Architecture
- **Frontend**: React Native Expo app (TypeScript) in `src/`
- **Backend**: Go HTTP server in `server/` with SQLite database
- **API**: RESTful endpoints with WebSocket chat support
- **State**: React Context for auth/events management

# Code Style Guidelines
- **Imports**: React → external libs → internal (@ aliases)
- **Types**: Strict TypeScript, interfaces for props/state
- **Naming**: camelCase vars/functions, PascalCase components
- **Error Handling**: try/catch with console.error/warn
- **Async**: Proper await/error handling in functions
- **Components**: Functional with hooks, typed navigation props

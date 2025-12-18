# Syrus Mentor Backend

Node/Express service with a Discord bot to relay mentor requests.

## Local development
- `cd backend`
- `npm install`
- Create a `.env` file with the environment variables below
- `npm start` (defaults to port 4000)

## Deploying to Render
- Render picks up `render.yaml` and provisions a Node web service from `backend/`.
- The service runs `npm install` then `npm start`, with health checks on `/health`.
- Push changes to your repo, then in Render choose **New > Blueprint** and connect the repository.
- Set the environment variables in Render (the blueprint marks secrets with `sync: false`).
- Render supplies `PORT`; no extra config is required for binding.

## Environment variables
- `DISCORD_BOT_TOKEN` (required): Discord bot token.
- `DISCORD_GENERAL_CHANNEL_ID` or `DISCORD_CHANNEL_ID` (required): Target channel for mentor requests.
- `ALLOWED_ORIGINS` (optional): Comma-separated origins allowed by CORS.
- `PORT` (provided by Render locally overridden to 4000): Port Express listens on.

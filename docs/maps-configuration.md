# Maps & Geolocation Configuration

## Architecture & Provider Adapter

The mapping layer is abstracted behind a provider adapter selected via environment variables.

### Supported Providers

1. **`osm_osrm` (Default / Development)**:
   - Keyless vector basemap using Carto Positron (`cartocdn.com`).
   - Turn-by-turn road routing via the public OSRM driving service.
   - Requires zero API keys or external billing.
2. **`google` (Recommended for Production in India)**:
   - Basemap and live traffic layers from Google Maps Platform.
   - Address search via Places API.
3. **`mapbox` (Alternative Vector Provider)**:
   - Uber-style 3D neutral vector tiles via Mapbox GL JS.

## Configuring API Keys

To switch from the default keyless mode to a commercial provider, update your environment configuration without code modifications.

### Option 1: Google Maps Platform

1. In Google Cloud Console, enable:
   - Maps JavaScript API
   - Places API (New)
   - Directions API
2. Create an API key and restrict it to HTTP referrers:
   - `http://localhost:5173/*`
   - `http://localhost:5500/*`
   - `https://yourdomain.com/*`
3. Add the key to `apps/web/.env` and the root `.env`:
   ```env
   VITE_MAP_PROVIDER=google
   VITE_GOOGLE_MAPS_API_KEY=AIzaSy...your_key_here
   GOOGLE_MAPS_API_KEY=AIzaSy...your_key_here
   ```

### Option 2: Mapbox GL JS

1. In your Mapbox account dashboard, generate an access token.
2. Restrict URL referrers to your domains.
3. Add the token to `apps/web/.env` and the root `.env`:
   ```env
   VITE_MAP_PROVIDER=mapbox
   VITE_MAPBOX_TOKEN=pk.eyJ1...your_token_here
   MAPBOX_TOKEN=pk.eyJ1...your_token_here
   ```

## Production Startup Validation

When running with `NODE_ENV=production`:
- If `MAP_PROVIDER=google` and `GOOGLE_MAPS_API_KEY` is empty, the server halts with exit code 1.
- If `MAP_PROVIDER=mapbox` and `MAPBOX_TOKEN` is empty, the server halts with exit code 1.
- In `development` mode, missing keys log a single developer notice and gracefully use the keyless `osm_osrm` adapter.

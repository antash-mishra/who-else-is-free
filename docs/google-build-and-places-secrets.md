# Google Build And Places Secrets

This app uses two separate Google configurations:

- Android/iOS native app config: Firebase client files consumed by `app.config.js`.
- Places search: the Go server proxies Google Places API calls with `GOOGLE_PLACES_API_KEY`.

Do not treat an EAS build warning about `google-services.json` as proof that Places is broken. The app calls `/api/places/*`, and those endpoints depend on the Fly server secret, not the EAS build environment.

## EAS Build Client Files

`app.config.js` reads these file environment variables:

- Android: `GOOGLE_SERVICES_JSON`
- iOS: `GOOGLE_SERVICE_INFO_PLIST`

The local fallback files are gitignored:

- `google-services.json`
- `GoogleService-Info.plist`

Check the preview environment:

```sh
eas env:list --environment preview
```

Expected preview entries include:

- `GOOGLE_SERVICES_JSON=*****`
- `GOOGLE_MAPS_API_KEY`
- `GOOGLE_PLACES_API_KEY`

Create or replace the Android Firebase file variable:

```sh
eas env:create --name GOOGLE_SERVICES_JSON --type file --value ./google-services.json --visibility secret --environment preview --force
```

Expo recommends using file environment variables for gitignored Google service files. Secret variables are not readable outside EAS servers, so local EAS CLI config resolution can still print:

```txt
File specified via "android.googleServicesFile" field in your app.json is not checked in to your repository and won't be uploaded to the builder.
```

That warning is expected when the remote EAS builder has the secret file variable. If the remote build later fails while copying `google-services.json`, recreate the file variable or temporarily use `--visibility sensitive` only when you need EAS CLI to resolve the file locally.

## Places API Server Key

The mobile app uses `src/hooks/usePlacesAutocomplete.ts`, which calls:

- `GET https://who-else-is-free-server.fly.dev/api/places/autocomplete`
- `GET https://who-else-is-free-server.fly.dev/api/places/details`

Those endpoints use `GOOGLE_PLACES_API_KEY` from the Fly app, not from EAS.

Verify the deployed endpoint:

```sh
curl -i 'https://who-else-is-free-server.fly.dev/api/places/autocomplete?input=coffee'
```

If the response contains `API key expired. Please renew the API key.`, create or renew a Google Cloud API key with Places API (New) enabled, then rotate the Fly secret:

```sh
fly secrets set GOOGLE_PLACES_API_KEY='<new-google-places-key>' -a who-else-is-free-server
```

Update local development separately in `server/.env`:

```sh
GOOGLE_PLACES_API_KEY=<new-google-places-key>
```

After rotation, verify the endpoint again. A healthy response returns HTTP 200 with a `predictions` array.

## Why Local Emulator Can Differ

Local emulator testing can succeed while a preview build fails when it is not hitting the same runtime:

- A dev session may point the app at a local server with `EXPO_PUBLIC_API_BASE_URL=http://10.0.2.2:8080`.
- The local server loads `.env` first, then `server/.env`, so it can use a newer local key than Fly.
- Metro/dev-client sessions can keep an older bundle or environment until the server and app are restarted.

To compare like for like, verify the exact URL the app is calling and test that endpoint with `curl`. The current fallback in `src/api/config.ts` is the Fly server unless `EXPO_PUBLIC_API_BASE_URL` is set.

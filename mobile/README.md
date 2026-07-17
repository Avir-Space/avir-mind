# avir-mind-mobile

AVIR Mind mobile app — **Expo / React Native**, TypeScript strict. A different UI
on the **same public API and same policies** as the web app; it has no signal
engine, no data model, and no auth scheme of its own.

## v0.1 (this scaffolding)
- Login (password + SSO redirect via `signInWithSSO`)
- 2FA challenge (Supabase MFA TOTP)
- Home: top 5 active signals for the user's fleet (via `GET /v1/signals`)
- Signal detail (read-only) + basic offline handling (keeps last fetch)

## Run
```bash
npm install
# set expo.extra.supabaseUrl / supabaseAnonKey / apiBaseUrl in app.json
npx expo start           # scan the QR with Expo Go
```

## Deferred (future phases)
Task create/complete, full aircraft/component browsing, drag-drop, crew tools,
Expo Push notifications, app-store submission.

## Note
This lives in the monorepo under `mobile/` for Phase 13 delivery; extract to a
standalone `avir-mind-mobile` repo before app-store work. It consumes the
published `@avir-space/sdk` (or the API directly, as here).

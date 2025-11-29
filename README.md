# PCU Maps Directory

Guidance for launching the directory and provisioning the very first administrator account.

## Prerequisites
- Firebase project with Authentication and Realtime Database enabled.
- Valid Firebase client configuration copied into `includes/firebaseConfig.js`.
- Git and Node.js (only needed if you plan on running local tooling). The app itself is static.

## First Admin Registration Flow
The site locks self-registration once any account exists in the `users/` node of the Realtime Database. Follow these steps to bootstrap the first admin cleanly:

1. **Deploy or serve the site** so the `/login/register.html` page is reachable.
2. **Verify the database is empty:** in Firebase Console → Realtime Database → `users/`, delete any leftover entries. The register page will refuse access if records remain.
3. **Open `/login/register.html` in the browser** before anyone else signs up.
4. **Submit the registration form** with the new admin’s `@pcu.edu.ph` email and password.
	- Because the database was empty, this account is tagged as `bootstrapAdmin`, gets the `admin` role, and inherits full permissions automatically.
5. **Sign in at `/index.html`** using the same credentials to confirm admin access.
6. **Set up additional accounts** from `pages/account_management.html`. All future self-registrations are blocked until you explicitly provision or link users there.

## Troubleshooting
- Stuck in a redirect to login while registering: ensure the `users/` node is truly empty and that there are no console errors about Firebase initialization.
- First account registered as a regular user: clear the `users/` node, reload the register page, and redo the signup so the bootstrap flag is applied.
- Need to allow another self-registration later: temporarily delete all entries in `users/` (not recommended) or create an admin tool to toggle the gate.

## Repository Notes
- The Firebase client keys are intended to be public; secure access is enforced via Firebase Auth and database security rules.
- Keep service-account credentials or other private secrets **out** of the repo. If you introduce server-side automation, load those values from environment variables instead.

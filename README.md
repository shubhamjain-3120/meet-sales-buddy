# Meet Sales Buddy

A small, private coordination strip for two sales partners on Google Meet. MIT licensed. Each pair brings its own Ably app.

The bundled Ably SDK is separately licensed under Apache 2.0; its license is included in the built extension.

```text
| ● | Claim ` | Alex: Ask about team size. | ˅ | Message partner… ↵ |
```

Press **Claim** or tap **backtick** outside a text field while the Meet tab has focus. The strip turns green immediately and returns to normal after five seconds. New text briefly highlights in blue for 1.5 seconds and keeps your draft and focus. Enter sends. The chevron shows only the five newest messages, oldest to newest, and closes the panel after 30 seconds.

The dot is green only while both the connection and partner presence are available. Red means the partner isn't available or the connection is down; hover for details and click to open settings. Claims are disabled without a partner. “Sent” means Ably accepted a message; “Delivered” means your partner's extension acknowledged it. Failed sends restore the draft. Claims that aren't acknowledged within four seconds show an error, and offline claims aren't queued for later.

## Build and install

Requires Node.js 22+ and Chrome 120+.

```sh
npm ci
npm run build
```

Open `chrome://extensions`, enable **Developer mode**, choose **Load unpacked**, and select the `extension/` folder. Repeat on your partner's computer. Open the extension's toolbar icon for setup. Rebuild and reload the extension after code changes.

If an agent's browser tool blocks Chrome internal pages or extension installation, the owner must perform those steps. The agent can prepare the built folder and private setup details locally; it must respect its tool's restrictions.

## One-time Ably setup (one of you)

1. Create an app in your [Ably dashboard](https://ably.com/dashboard). Create an API key with **publish, subscribe, presence, and history** permissions, restricted to `sales-buddy:*` channels.
2. Under **Rules**, create a rule with match expression `sales-buddy:*` and enable **Persist all messages**. Message history after a page reload or connection interruption follows your Ably account's retention; messages are not archived elsewhere.
3. Copy `auth/.env.example` to `.env` in the repo root. Set your full `ABLY_API_KEY`, a random `SESSION_SECRET`, and a different random `SETUP_KEY`. Generate each secret separately:

   ```sh
   node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))'
   ```

4. Start the included token service:

   ```sh
   node --env-file=.env auth/server.js
   ```

5. For two laptops, deploy the token service to **Cloudflare Workers**, using the steps below. The local default, `http://localhost:8787`, is for development on one computer; your co-founder cannot reach your localhost. A conventional Node host also works: start `npm run auth`, set `AUTH_HOST=0.0.0.0`, and use the host's `PORT` (or `AUTH_PORT`). No database is needed.
6. Open extension settings, choose **Create pairing**, and enter your name, token-service URL, and setup key. The extension asks for access only to that service's origin. Copy the private invite to your co-founder.
7. Your co-founder chooses **Join with invite**, enters their name, and pastes it. They do not need an Ably account or setup key.

Invites expire after 24 hours. Established pairings are remembered across browser restarts and future calls. Names come from setup, not Google. The creator can generate a fresh invite in settings if needed. The Ably app, token service, and pairing are one-time setup; tokens renew automatically while the service is available.

## Cloudflare deployment

The included Worker reuses the Node token server through Cloudflare's [Node HTTP adapter](https://developers.cloudflare.com/workers/runtime-apis/nodejs/http/). Ably continues to relay all messages. The token service fits typical two-person use well within the [Workers Free request allowance](https://developers.cloudflare.com/workers/platform/pricing/); select the Free plan and do not enable a paid upgrade for this setup.

1. Authenticate Wrangler with your Cloudflare account:

   ```sh
   npx wrangler whoami
   # Only if not authenticated:
   npx wrangler login --scopes account:read user:read workers_scripts:write
   ```

2. If you belong to multiple accounts, select the intended account by setting `CLOUDFLARE_ACCOUNT_ID` in your shell. Review the Worker name in `wrangler.jsonc`. Reuse an existing Worker for this installation; don't overwrite a Worker belonging to another project.
3. Deploy the service:

   ```sh
   npm run auth:deploy
   ```

   Its initial `/health` returns HTTP 503 until the secrets are configured. This is expected.

4. Add the three secrets from your local `.env` to that Worker:

   ```sh
   npx wrangler secret put ABLY_API_KEY
   npx wrangler secret put SESSION_SECRET
   npx wrangler secret put SETUP_KEY
   ```

   Each command prompts for the value. For agent-driven setup, Wrangler also supports `secret bulk` with an owner-readable temporary JSON file containing exactly these three fields; keep it under ignored `artifacts/` and remove that temporary file afterwards. Never put secrets in `wrangler.jsonc`, command arguments, screenshots, chat, Git, or the extension. Keep the local `.env` protected and preserve `SESSION_SECRET` and `SETUP_KEY` when redeploying.

5. Save the returned HTTPS `workers.dev` URL as `TOKEN_SERVICE_URL` in your local `.env`, then verify:

   ```sh
   npm run verify:relay
   ```

   This creates a separate test pairing and verifies the hosted token service, real Ably authentication, partner presence, text and claim delivery, and history. It uses two clients on the current computer; it doesn't prove two-laptop latency. Test traffic stays in its own channel and expires under your Ably retention settings.

6. Use that HTTPS URL and your `SETUP_KEY` in **Create pairing** in the extension. Your co-founder uses only the resulting invite.

## Setup with an AI agent

Give your agent this instruction:

> Read README.md and set up Meet Sales Buddy using my Ably app and Cloudflare Workers Free account. Build the extension, configure the dedicated Ably key and persistence rule, deploy the included token service, run the live relay check, and help me install and pair the extension. Reuse my existing setup and preserve its secrets. Ask me to complete account login or permissions when your tools require it.

The agent needs this repository, Node.js 22+, browser or CLI access to the relevant accounts, and access to the local secrets file. A README alone cannot supply account access. Account sign-in, required authorization prompts, and extension installation may need the owner to participate.

Suggested order:

1. Read applicable repository instructions. Check for an existing `.env`, Worker, extension pairing, and `artifacts/setup.json` before creating replacements. Don't regenerate secrets or pairing credentials on every run.
2. Run `npm ci`, `npm run build`, `npm test`, and `npm run check`. The directory loaded in Chrome must be the built `extension/` folder from the working checkout.
3. Verify the dedicated Ably key has **only** publish, subscribe, presence, and history, with **Only channels** set to `sales-buddy:*`. Verify the **Persist all messages** rule. Do not use the app's Root key.
4. Store the full key and stable random secrets in an ignored, owner-readable `.env`. Keep values out of command output. If a deployed setup exists but its original secrets are missing locally, obtain them from the owner rather than replacing them.
5. Follow the Cloudflare deployment steps. Deploy and verify before configuring the extension. Keep free-account limits; don't add a database, another relay, paid plan, or domain unless requested.
6. Run `npm run verify:relay`. Then install in the owner's intended Chrome profile, create the pairing once, and provide the invite locally for the owner to send. A saved profile alone is insufficient: open Meet and confirm that Ably connects without an authentication error. The partner dot turns green after the co-founder joins and opens Meet.
7. Record the app, Worker name, public endpoint, installation path, and verification result in ignored `artifacts/setup.json`, without keys, tokens, pairing credentials, or invites. Report remaining owner/co-founder steps accurately.

## System flow and privacy

```text
Extension settings → your token service → signed pairing credential
Meet extension → your token service → 1-hour, channel-scoped Ably token
Your Meet strip ⇄ Ably ⇄ partner's Meet strip
```

The full Ably API key remains on your token service. The setup key is never saved in the extension. A signed, long-lived pairing credential is stored in Chrome's local extension storage, restricted to trusted extension contexts. Meet content scripts receive only profile/channel metadata and short-lived Ably tokens. Invites are bearer secrets: anyone holding one can join as the guest. There are two logical identities per pair; multiple tabs or connections using the same identity are allowed.

Use a stable `SESSION_SECRET` across deployments. Rotating it revokes all pairing credentials and invites from that service; already issued Ably tokens can remain valid for up to one hour. Removing a pairing only removes it from that browser. It does not revoke credentials copied elsewhere. This MVP doesn't include per-user revocation or an administration dashboard.

Messages use encrypted transport, but are **not end-to-end encrypted**. Ably can process and retain them. Ably manages message relay, presence, ordering, and connection recovery. Presence can take time to reflect an abrupt network loss; claim acknowledgements catch missing recipients. Recent retained text is loaded on connection and on a reconnect without continuity. Past claims never replay from history.

### Screen sharing

This version is **Option 1**, an injected strip on Meet. It will appear if you share that Meet tab/window or your entire desktop with Meet visible. Keep Meet in a separate window and share only the demo tab/window. It doesn't follow you onto other tabs, hide automatically, or provide capture protection. The macOS floating/capture-protected option (Option 3) is deferred until this version is approved and tested.

## Preview and validation

```sh
npm run preview
# Open http://127.0.0.1:4173 — a local interaction mock, no Ably account needed.
npm test
npm run check
npx playwright install chromium
npm run test:browser
```

Unit tests cover private pairing/token scopes, invite expiry, persistent credentials, delivery states, disconnects, claim acknowledgements, stale claims, history recovery, shortcut guards, and timers. Browser tests exercise the strip, typing, draft preservation, history, and layout. A real two-laptop Ably test requires your configured service/app; mocked tests don't prove live network latency.

The repo includes deployment commands; it doesn't deploy automatically on installation, publish to the Chrome Web Store, or implement Option 3.

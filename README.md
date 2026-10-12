# Meet Sales Buddy

A private Google Meet strip for your sales team. One permanent room, owned by you; invite each collaborator once. MIT licensed. The bundled Ably SDK is Apache 2.0 licensed.

```text
| ● | Claim ` | Alex: Ask about team size. | ˅ | Message partner… ↵ |
```

- **Claim** or **backtick** outside a text field turns the strip green immediately, then returns to neutral after five seconds. Claim cancellation is excluded.
- Enter sends a message. New text highlights gently for 1.5 seconds, without changing your focus or draft. Your own messages also appear. “Sent” means Ably accepted it; recipient/read receipts aren't shown. Failed sends restore the draft.
- The chevron opens the latest five messages, oldest first, and closes after 30 seconds.
- The dot is green while connected and at least one **other member** is present in this Meet conversation. Your own extra tabs don't count. Claims are disabled when nobody else is present; an unacknowledged claim reports an error after four seconds.

## Your user flow

```text
Owner: Set up my room once → name + service URL + owner setup key
  → Create invite → copy code → send privately to one person
  → manage unused invites and room members in settings
Guest: Join with invite → name + complete code → membership saved
Next calls: open the same Meet URL → connect automatically
```

The room and memberships have **no automatic expiry**. Each invite is single-use and valid until used or revoked. Used invites cannot admit another person. Revoking an unused invite doesn't remove existing members; **Remove** revokes a member's access. If Ably's live cutoff fails, settings shows **Retry cutoff**. Renewal is denied immediately; an already issued token can last up to one hour until cutoff succeeds.

Removing setup from a browser doesn't delete the room or revoke that browser's membership. The owner can recover the same room with the setup key. A guest who loses their saved credential needs a new invite. Names are entered during setup, not taken from Google.

## Build and install

Requires Node.js **22.13+** and Chrome **120+**.

```sh
npm ci
npm run build
```

Open `chrome://extensions`, enable Developer mode, choose **Load unpacked**, and select this checkout's `extension/` folder. Do the same for collaborators. Open the extension toolbar icon for settings. Rebuild and reload after updates.

Browser automation tools may block Chrome internal pages. If so, the owner must install/reload manually; agents must respect the restriction. A zip distribution should contain only the built `extension/` folder, never `.env` or private setup files.

The strip is capped at 720 × 38 pixels and leaves space for Meet's header at laptop/desktop widths. In windows 960 pixels wide or smaller, it sits below the header instead. Long latest messages are truncated visually; open history to read them fully.

## Chrome Web Store preparation

Run `npm run store:prepare` to build `artifacts/chrome-store/meet-sales-buddy-store-0.2.1.zip`, icons, listing screenshots and public copy. The ZIP has its manifest at the root and excludes backend code, secrets and private setup files. See [store/README.md](store/README.md) for the submission checklist and [store/listing.md](store/listing.md) for permission/data disclosures.

The privacy policy is generated from `store/privacy.template.html` using the confirmed public publisher details in `store/publisher.json`. The existing Worker serves it at `/privacy`, independently of access-service authentication. Review the copy before submission. Reviewer instructions are prepared, but working reviewer access is intentionally not provisioned yet. The preparation script does not upload or submit anything to the store.

## Infrastructure setup

For this installation, the service URL is `https://meet-sales-buddy-tokens.jain31201522.workers.dev`. The owner setup key is in the protected local `artifacts/extension-setup.txt`. Collaborators only need their invite and the extension.

1. In the [Ably dashboard](https://ably.com/dashboard), use the dedicated app/key. Grant **publish, subscribe, presence, history**, restricted to `sales-buddy:*`. Enable **revocable tokens** before issuing tokens; see [Ably's revocation requirements](https://ably.com/docs/auth/revocation). Keep the Root key out of this app.
2. Under Rules, enable **Persist all messages** for `sales-buddy:*`. History follows Ably's retention; no separate message archive is stored.
3. For a new installation only, copy `auth/.env.example` to root `.env`. Set `ABLY_API_KEY`, stable `SESSION_SECRET`, and a separate stable `SETUP_KEY`. Generate each secret separately with `node -e 'console.log(require("crypto").randomBytes(32).toString("hex"))'`. Protect `.env` with owner-only permissions. Preserve existing secrets when updating.
4. Authenticate Cloudflare Wrangler with the narrow scopes needed for Workers and D1:

   ```sh
   npx wrangler whoami
   npx wrangler login --scopes account:read user:read workers_scripts:write d1:write
   npx wrangler d1 list
   ```

5. Reuse the installation's existing Worker and D1 database. For a fresh install, create a dedicated database with `npx wrangler d1 create meet-sales-buddy-room`. In `wrangler.jsonc`, bind it as `DB`, with its real `database_id`, `database_name`, and `migrations_dir: "auth/migrations"`. Never bind an unrelated database.
6. Apply the schema, then deploy:

   ```sh
   npx wrangler d1 migrations apply meet-sales-buddy-room --remote
   npm run auth:deploy
   ```

7. For a fresh Worker, set `ABLY_API_KEY`, `SESSION_SECRET`, and `SETUP_KEY` with `npx wrangler secret put NAME`. Existing deployments retain their secrets; don't rotate them. Keep values out of command arguments, logs, screenshots, chat and Git. `/health` returns 503 until both secrets and the migrated database are available.
8. Use the returned HTTPS URL in owner settings. Keep the Free plan; do not enable a paid upgrade. Usage consumes [Workers](https://developers.cloudflare.com/workers/platform/pricing/), [D1](https://developers.cloudflare.com/d1/platform/pricing/), and Ably allowances.

## Existing pairing upgrade

After upgrading the server and extension, **the existing owner should open settings first**. Their saved owner credential adopts that old pairing as the permanent room. The existing guest can then upgrade automatically. Further collaborators receive new single-use invites. Other old pairings aren't merged into this room.

Keep the original `SESSION_SECRET`, `SETUP_KEY`, and Ably key. Do not create a synthetic production owner to test deployment: the first successful owner setup establishes the single room. If no pairing was saved, set up using your real name and existing owner setup key.

## System responsibilities

```text
Settings → Cloudflare Worker → D1: one room, members, hashed invites
Meet background → Worker → D1 access check → 1-hour scoped Ably token
Meet strip ⇄ Ably ⇄ all members on the same Meet URL
```

D1 owns access state. Chrome stores a permanent signed member credential in trusted extension storage; content scripts receive profile metadata and short-lived Ably tokens. The full Ably key stays server-side. Invite codes are bearer secrets, and stored only as hashes on the server. Codes are displayed only when created.

Ably owns message relay, history, presence, and reconnect recovery. Messages/claims don't pass through the Worker or D1. Removal marks membership revoked first, then invalidates that member's Ably tokens. Tokens renew automatically; their one-hour expiry doesn't require repeating setup. Revocable tokens can add a small cost on initial connection and authentication, not an extra app-server round trip per message.

The permanent room is independent of Meet, but **each Meet URL has its own conversation channel**. All members must open the same Meet URL. `lookup/...` and a resolved call-code URL are different channels, even if Google sends them into the same underlying meeting. Presence may take time to reflect abrupt network loss. Simultaneous claims converge using server timestamps and a deterministic tie-break; old claims never replay from history.

Messages use encrypted transport, **not end-to-end encryption**; Ably can process and retain them. Rotating `SESSION_SECRET` invalidates saved memberships; already issued Ably tokens require revocation or expiry. Never delete/reset the access database as a routine upgrade.

## Local development and validation

```sh
npm run auth          # localhost:8787, persistent SQLite in .wrangler/room.sqlite
npm run preview       # localhost:4173, interaction demo without Ably
npm test
npm run build
npm run check
npm run test:browser
npm run verify:relay
```

The relay check uses your Ably key with **an isolated in-memory access database**, three temporary identities and a private test channel. It checks live group relay, presence, claims, history, call isolation and revocation. It never initializes or changes the hosted room. A single-machine latency sample doesn't establish two-laptop performance. Production health can be checked separately at `SERVICE_URL/health`.

Unit/browser tests cover singleton recovery, permanent membership, invite races/reuse/revocation, permissions, member cutoff/retry, legacy migration, group presence, Sent/Failed states, claim timing/order, history pagination, focus preservation and shortcut guards.

## AI agent setup/update runbook

Read applicable repository instructions first. Inspect the existing `.env`, `wrangler.jsonc`, deployed Worker/database and `artifacts/setup.json` before provisioning replacements. Build and validate, configure the dedicated Ably key, apply migrations, deploy to the same Worker, and run the isolated relay check. Preserve secrets and production access state. Never test by creating a fake production owner. Record only non-secret deployment/validation metadata; provide setup keys privately in protected local files. Account login, browser permissions and extension installation can require owner participation.

## Screen sharing

This is **Option 1**, a strip inside Meet. It appears if you share that Meet tab/window or a full desktop with Meet visible. Keep Meet in a separate window and share only the demo tab/window. It doesn't follow other tabs or provide capture protection. The macOS floating/capture-protected Option 3 remains deferred until this version is approved.

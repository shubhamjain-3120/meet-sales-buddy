# Chrome Web Store listing draft

Name: Meet Sales Buddy

Summary: Private claims and messages for your team on Google Meet.

Category: Workflow & Planning (choose the nearest productivity category offered by the dashboard)

Language: English

Distribution recommendation: Unlisted. Anyone with the installation URL can install; room membership still requires an invite. Distribution has not been submitted or selected on the dashboard.

## Detailed description

Coordinate with your teammates during Google Meet sales calls.

Meet Sales Buddy puts a compact strip at the top of your Meet call so you can claim the next question and exchange quick messages with your collaborators.

• Claim a question with one click or the backtick shortcut. The strip turns green immediately and returns to neutral after five seconds.
• Type a short message and press Enter. The latest message stays visible, including your own messages.
• New messages highlight gently without moving your focus or interrupting your draft.
• Open the chevron to see the latest five messages. History closes automatically after 30 seconds.
• A green connection dot means at least one other room member is present in the same Meet conversation.
• Set up one permanent room and create a separate, single-use invite for each collaborator. Invites stay valid until used or revoked; memberships stay saved until removed.
• Manage invites and member access in extension settings.

The strip appears only on Google Meet call pages. Messages are separated by Meet URL, so collaborators should open the same call URL.

This extension requires access to an owner's configured room service. The owner configures the service once; invited members join using their name and a private invite code. Installing the extension alone does not grant room access.

Screen sharing: the strip is visible when sharing the Meet tab/window or your full desktop with Meet visible. Keep Meet in a separate window and share the demo tab/window when you want to keep coordination off the shared surface.

Privacy: messages and presence are relayed through Ably; membership and invitation records are managed through Cloudflare Workers and D1. Messages are not end-to-end encrypted. The extension does not record audio/video or read Google Meet chat. See the privacy policy for details.

Meet Sales Buddy is an independent tool and is not affiliated with Google.

## Privacy practices: single purpose

Help invited teammates coordinate who will answer a question and exchange short messages during a Google Meet call through a compact in-call strip.

## Permission justifications

storage:
Saves the member's chosen name, service URL, room/member identifiers, role and signed membership credential locally so setup survives browser restarts. The permanent credential is restricted to trusted extension contexts and is not exposed to Meet page scripts.

https://meet.google.com/*:
Loads the coordination strip on Google Meet call routes, determines the current call identifier to select its conversation channel, handles the backtick shortcut outside editable fields, and refreshes the strip when membership changes. It does not read meeting audio/video, Google Meet chat or unrelated page content.

Optional https://*/*:
Allows the user to grant access to the particular HTTPS access-service origin they enter, or the origin encoded in their private invite. Only that selected origin is requested at setup, and the background sends membership/invitation requests and obtains scoped Ably tokens there. The wildcard supports configured service URLs; it is not used to inject scripts or read arbitrary websites.

Optional http://localhost/* and http://127.0.0.1/*:
Allows an explicitly selected local development access service. HTTP is rejected for all other hosts. No scripts are injected into these service pages.

## Remote code declaration

No remotely hosted executable code. The extension bundles the Ably SDK and all executable UI code locally. Cloudflare provides access checks and token responses; Ably provides realtime data. API data is not evaluated as JavaScript.

## Data categories to disclose

Confirm these against the actual dashboard labels before certifying:

- Personally identifiable information: user-entered names and unique member identifiers.
- Authentication information: saved membership credentials, invitation codes and short-lived service tokens.
- Personal communications: messages, sender information and question claims.
- Web history / browsing activity: the current Meet call path is transmitted as a conversation identifier; no general browsing history is collected.
- User activity: explicit claim and presence events and message interaction timestamps used for coordination.

Do not select unrelated categories such as payment, health, location tracking or website-content scraping. Providers receive connection IP/metadata as described in the policy; assess any location-data wording shown by the dashboard accordingly.

Certifications:
Only certify the dashboard statements after reviewing this policy and the deployed behavior. Data is used for the disclosed single purpose and is not sold, used for advertising or used to determine creditworthiness or lending decisions.

## URLs and contact

Privacy URL: https://meet-sales-buddy-tokens.jain31201522.workers.dev/privacy (live and verified; check again before future submissions)

Publisher: Shubham Jain

Support email: svpj3110@gmail.com

## Required files

- meet-sales-buddy-store-0.2.1.zip — extension manifest at the archive root
- icon-128.png — PNG store icon with transparent padding
- promo-440x280.png — small promotional image
- screenshot-01-messages.png — 1280×800
- screenshot-02-claim.png — 1280×800
- screenshot-03-history.png — 1280×800
- screenshot-04-members.png — 1280×800

The call background shown in the screenshots is a labelled preview; the strip and settings use the actual extension UI with fictional example data. No customer content or real invites appear.

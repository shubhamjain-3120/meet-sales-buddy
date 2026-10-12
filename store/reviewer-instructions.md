# Reviewer instructions draft

Full testing needs two separate Chrome profiles or two computers so there are two distinct member identities on the same Google Meet call. Microphone/camera access is unnecessary for testing this extension.

## Review service and credentials — not yet provisioned

The owner requested instructions only for now. No reviewer service, credentials or room have been created. Before submission, arrange working reviewer access and insert its service URL and setup details in the Developer Dashboard's private Test instructions field.

An isolated reviewer service with its own room, database and signing/setup secrets is recommended if reviewer access is provisioned later. The walkthrough below assumes that isolated setup.

The service URL and reviewer setup key must be inserted after deployment and verification. Do not use the production owner's setup key or production invitation codes. The private credential sheet is excluded from the extension ZIP and public listing assets.

## Owner setup

1. Install the submitted extension. Click its toolbar icon to open settings.
2. Choose Set up my room. Enter "Review owner", the review service URL and review setup key.
3. Accept the extension's access request for that service origin. Click Set up my room.
4. Click Create invite. Copy the complete code. Use a separate code for each additional member.

## Member setup

1. Install the extension in another Chrome profile or on another computer.
2. Open settings, choose Join with invite, enter "Review member", and paste the full invite code.
3. Accept access to the service origin and click Join room. No Ably account or key is required.

## In-call behavior

1. Create a Google Meet call and open the exact same Meet URL in both profiles. The extension does not appear on Meet's home page.
   The strip is at most 720 × 38 pixels. At widths of 960 pixels or smaller it moves below the Meet header; it does not change Meet's layout.
2. Once both profiles connect, their dot is green. A lone member's dot is red. The same identity in another tab does not count as another member.
3. Click Claim in either profile, or press backtick with focus outside a text field. Both strips turn green and display the claimant, then return to neutral after five seconds. Backtick inside an editable field does not claim. There is no claim-cancel toggle.
4. Type a short message and press Enter. Both members see it; the sender sees Sent after relay acceptance. This is not a read receipt. The latest message highlights briefly and does not move focus or change a draft.
5. Send six messages, then open the chevron. Only the latest five appear. The panel auto-closes after 30 seconds.
6. Add a third profile using another invite. Group messages reach it; presence remains green when one of the other profiles closes normally and another stays online.
7. Open another Meet URL. Its messages and presence are separate from the first call.

## Invitations and removal

- A used invite cannot join another identity. Unused invites do not expire automatically; owner settings can revoke them.
- Owner settings show invites and members. Remove a review member to deny further authentication and revoke its active Ably tokens. A new invite is needed to join again. If live cutoff fails, the owner sees Retry cutoff.
- Restarting Chrome remembers the saved membership. Remove setup from this browser clears local setup; it does not erase the room. Owner setup with the same review key recovers the same room.

## Data and network use

All JavaScript, including the Ably SDK, is packaged locally. The background calls the chosen service for setup, invite/member management and tokens. Messages, claims, presence and history communicate directly with Ably. The Meet call identifier selects the channel. The extension does not read Meet chat or meeting audio/video.

Network access to the review service and Ably is required. An unavailable connection makes the dot red; offline claims/messages are not queued. Ably presence after an abrupt network loss can take time to update.

## Screen sharing

This version injects the strip into the Meet page and does not provide screen-capture protection. It is visible when the Meet tab/window or a desktop containing it is shared. Sharing a separate demo tab/window keeps the strip outside that shared surface.

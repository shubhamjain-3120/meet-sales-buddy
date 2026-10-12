# Store submission package

The store preparation script produces reviewable artifacts without uploading or submitting to the Chrome Web Store. Run `npm run store:prepare` after building the extension.

Outputs are in ignored `artifacts/chrome-store/`. The extension ZIP contains `manifest.json` at the root, bundled JavaScript, existing options/UI files, icons and licenses. Public listing copy/images and the policy are separate files. Private reviewer credentials are never placed in this directory's public assets or the extension ZIP.

The source icon is a green speech bubble with two dots. Listing screenshots show the actual extension UI with fictional data on a clearly labelled call preview. Store distribution recommendation is Unlisted; the dashboard choice is the owner's decision.

Before submission:

1. Confirm publisher and public support email in `store/publisher.json`.
2. Review listing text, images, privacy disclosures and reviewer instructions.
3. Publish/verify the policy URL on the existing access Worker.
4. Reviewer access is intentionally not provisioned, by owner request. Arrange working test access before submission; the prepared instructions alone do not supply it. If later approved, an isolated service should use separate signing/setup secrets and be verified there.
5. Put the private reviewer service URL/setup key only in the dashboard's Test instructions field.
6. Upload the ZIP, complete listing/privacy/distribution fields, and submit only after owner approval.

Installing the store package can use a different extension ID than an unpacked copy. Local setup is tied to that extension ID. The owner can recover the same room using the existing setup key; other members can join with new invites. Keep the same store item for future updates to preserve its identity.

Sources: [packaging](https://developer.chrome.com/docs/webstore/prepare), [images](https://developer.chrome.com/docs/webstore/images), [privacy](https://developer.chrome.com/docs/webstore/cws-dashboard-privacy), [review instructions](https://developer.chrome.com/docs/webstore/cws-dashboard-test-instructions).

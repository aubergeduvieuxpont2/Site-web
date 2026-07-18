# email-ingest

Cloudflare Email Worker: `bookings@aubergeduvieuxpont.ca` → forward OTA mail
to the backup mailbox → parse Airbnb/Expedia booking confirmations → create
the reservation (+ HubSpot sync) through the API's internal endpoint. Unknown
senders are rejected (spam protection).

## One-time Cloudflare setup (dashboard, manual)

1. **Enable Email Routing** on the `aubergeduvieuxpont.ca` zone
   (Email → Email Routing → enable; this adds MX/SPF records — check no other
   mail service uses the apex domain first).
2. **Verify the destination address**: add `aubergeduvieuxpont2@hotmail.com`
   as a destination and click the verification email it receives.
   `message.forward()` to an unverified address fails (the handler then lets
   Cloudflare retry, so nothing is lost — but nothing is delivered either).
3. Deploy this worker: `npm run deploy:email-ingest` (root).
4. **Create the routing rule**: custom address `bookings@aubergeduvieuxpont.ca`
   → action *Send to Worker* → `site-web-email-ingest`.
5. **Point the OTAs at it**: change the notification/contact email to
   `bookings@aubergeduvieuxpont.ca` in Airbnb host settings and Expedia
   Partner Central.
6. Test: resend/forward a booking confirmation to `bookings@…` and check the
   admin «Emails OTA» tab plus the backup mailbox.

## Behaviour

- Mail from recognized OTA senders (airbnb.com/.ca, expedia/expediagroup/
  expediamail/expediapartnercentral.com) is forwarded to `FORWARD_TO`
  (wrangler var) before any booking parsing.
- Mail from `DEV_SENDER` (wrangler var — the operator's own address) is
  **processed but NOT forwarded**: the provider is inferred from the subject
  («Réservation confirmée» → Airbnb, "New Booking" → Expedia), so forwarding
  a real OTA email from that mailbox exercises the full pipeline. Unrelated
  subjects from `DEV_SENDER` are rejected like any stranger.
- All other senders are **rejected at SMTP time** (no forward, no processing)
  — bookings@ is only ever given to the OTAs, so anything else is spam.
- Airbnb: only «Réservation confirmée» creates a reservation (no guest email
  in these emails → no HubSpot sync). Pending requests are logged `ignored`.
- Expedia: "New Booking" creates a reservation with the relay guest email
  (synced to HubSpot). Modify/cancel notifications are logged `ignored`.
- Dedupe: `(source, external_ref)` unique — resent confirmations log
  `duplicate` and change nothing.
- Parse failures are logged `parse_failed` and visible in the admin; OTA
  emails are additionally in the backup mailbox.

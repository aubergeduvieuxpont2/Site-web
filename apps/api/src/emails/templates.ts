// Email template registry. The Handlebars templates themselves are precompiled
// at build time into ./precompiled.ts (see scripts/precompile-emails.mjs); this
// module owns the shared types and the committed sample data used by the preview.
import welcomeSample from "../../emails/samples/welcome.json";
import passwordResetSample from "../../emails/samples/password-reset.json";
import reservationConfirmationSample from "../../emails/samples/reservation-confirmation.json";
import reservationCancellationSample from "../../emails/samples/reservation-cancellation.json";
import invoiceReceiptSample from "../../emails/samples/invoice-receipt.json";
import reviewRequestSample from "../../emails/samples/review-request.json";
import roomAssignedSample from "../../emails/samples/room-assigned.json";
import otaWelcomeSample from "../../emails/samples/ota-welcome.json";
import emailVerificationSample from "../../emails/samples/email-verification.json";
import emailChangeAlertSample from "../../emails/samples/email-change-alert.json";
import emailChangeConfirmSample from "../../emails/samples/email-change-confirm.json";

export type Locale = "fr" | "en";
export type TemplateKey =
  | "welcome"
  | "password-reset"
  | "reservation-confirmation"
  | "reservation-cancellation"
  | "invoice-receipt"
  | "review-request"
  | "room-assigned"
  | "ota-welcome"
  | "email-verification"
  | "email-change-alert"
  | "email-change-confirm";

export const SAMPLES: Record<TemplateKey, Record<string, unknown>> = {
  welcome: welcomeSample,
  "password-reset": passwordResetSample,
  "reservation-confirmation": reservationConfirmationSample,
  "reservation-cancellation": reservationCancellationSample,
  "invoice-receipt": invoiceReceiptSample,
  "review-request": reviewRequestSample,
  "room-assigned": roomAssignedSample,
  "ota-welcome": otaWelcomeSample,
  "email-verification": emailVerificationSample,
  "email-change-alert": emailChangeAlertSample,
  "email-change-confirm": emailChangeConfirmSample,
};

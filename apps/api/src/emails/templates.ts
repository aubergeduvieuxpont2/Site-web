import baseTpl from "../../emails/base.hbs";
import headerFr from "../../emails/partials/header.fr.hbs";
import headerEn from "../../emails/partials/header.en.hbs";
import footerFr from "../../emails/partials/footer.fr.hbs";
import footerEn from "../../emails/partials/footer.en.hbs";

import welcomeFr from "../../emails/templates/welcome.fr.hbs";
import welcomeEn from "../../emails/templates/welcome.en.hbs";
import passwordResetFr from "../../emails/templates/password-reset.fr.hbs";
import passwordResetEn from "../../emails/templates/password-reset.en.hbs";
import reservationConfirmationFr from "../../emails/templates/reservation-confirmation.fr.hbs";
import reservationConfirmationEn from "../../emails/templates/reservation-confirmation.en.hbs";
import reservationCancellationFr from "../../emails/templates/reservation-cancellation.fr.hbs";
import reservationCancellationEn from "../../emails/templates/reservation-cancellation.en.hbs";
import invoiceReceiptFr from "../../emails/templates/invoice-receipt.fr.hbs";
import invoiceReceiptEn from "../../emails/templates/invoice-receipt.en.hbs";
import reviewRequestFr from "../../emails/templates/review-request.fr.hbs";
import reviewRequestEn from "../../emails/templates/review-request.en.hbs";

import welcomeSample from "../../emails/samples/welcome.json";
import passwordResetSample from "../../emails/samples/password-reset.json";
import reservationConfirmationSample from "../../emails/samples/reservation-confirmation.json";
import reservationCancellationSample from "../../emails/samples/reservation-cancellation.json";
import invoiceReceiptSample from "../../emails/samples/invoice-receipt.json";
import reviewRequestSample from "../../emails/samples/review-request.json";

export type Locale = "fr" | "en";
export type TemplateKey =
  | "welcome"
  | "password-reset"
  | "reservation-confirmation"
  | "reservation-cancellation"
  | "invoice-receipt"
  | "review-request";

export const BASE = baseTpl;

export const PARTIALS: Record<Locale, { header: string; footer: string }> = {
  fr: { header: headerFr, footer: footerFr },
  en: { header: headerEn, footer: footerEn },
};

export const TEMPLATES: Record<TemplateKey, Record<Locale, string>> = {
  welcome: { fr: welcomeFr, en: welcomeEn },
  "password-reset": { fr: passwordResetFr, en: passwordResetEn },
  "reservation-confirmation": { fr: reservationConfirmationFr, en: reservationConfirmationEn },
  "reservation-cancellation": { fr: reservationCancellationFr, en: reservationCancellationEn },
  "invoice-receipt": { fr: invoiceReceiptFr, en: invoiceReceiptEn },
  "review-request": { fr: reviewRequestFr, en: reviewRequestEn },
};

export const SAMPLES: Record<TemplateKey, Record<string, unknown>> = {
  welcome: welcomeSample,
  "password-reset": passwordResetSample,
  "reservation-confirmation": reservationConfirmationSample,
  "reservation-cancellation": reservationCancellationSample,
  "invoice-receipt": invoiceReceiptSample,
  "review-request": reviewRequestSample,
};

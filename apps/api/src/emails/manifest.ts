import type { TemplateKey } from "./templates";

export interface ManifestEntry {
  name: { fr: string; en: string };
  subject: { fr: string; en: string };
  sampleFile: string;
  requiredFields: string[];
}

export const MANIFEST: Record<TemplateKey, ManifestEntry> = {
  welcome: {
    name: { fr: "Bienvenue", en: "Welcome" },
    subject: { fr: "Bienvenue chez L'Auberge du Vieux Pont", en: "Welcome to L'Auberge du Vieux Pont" },
    sampleFile: "welcome.json",
    requiredFields: ["firstName", "loginUrl"],
  },
  "password-reset": {
    name: { fr: "Réinitialisation de mot de passe", en: "Password Reset" },
    subject: { fr: "Réinitialisation de votre mot de passe", en: "Reset your password" },
    sampleFile: "password-reset.json",
    requiredFields: ["firstName", "resetUrl", "expiryHours"],
  },
  "reservation-confirmation": {
    name: { fr: "Confirmation de réservation", en: "Reservation Confirmation" },
    subject: { fr: "Votre réservation #{{confirmationCode}}", en: "Your booking #{{confirmationCode}}" },
    sampleFile: "reservation-confirmation.json",
    requiredFields: [
      "confirmationCode",
      "name",
      "checkIn",
      "checkOut",
      "guests",
      "roomLabel",
      "nightlyPrice",
      "nights",
      "subtotal",
      "accommodationTax",
      "tps",
      "tvq",
      "total",
      "manageUrl",
      "accommodationTaxRate",
      "tpsRate",
      "tvqRate",
    ],
  },
  "reservation-cancellation": {
    name: { fr: "Annulation de réservation", en: "Reservation Cancellation" },
    subject: { fr: "Annulation de votre réservation #{{confirmationCode}}", en: "Cancellation of your booking #{{confirmationCode}}" },
    sampleFile: "reservation-cancellation.json",
    requiredFields: ["confirmationCode", "name", "checkIn", "checkOut", "contactEmail"],
  },
  "invoice-receipt": {
    name: { fr: "Reçu de facture", en: "Invoice Receipt" },
    subject: { fr: "Facture #{{invoiceNumber}}", en: "Invoice #{{invoiceNumber}}" },
    sampleFile: "invoice-receipt.json",
    requiredFields: ["invoiceNumber", "name", "checkIn", "checkOut", "lineItems", "subtotal", "accommodationTax", "tps", "tvq", "total", "paymentDate", "accommodationTaxRate", "tpsRate", "tvqRate"],
  },
  "review-request": {
    name: { fr: "Demande d'avis", en: "Review Request" },
    subject: { fr: "Partagez votre avis sur votre séjour", en: "Share your feedback on your stay" },
    sampleFile: "review-request.json",
    requiredFields: ["firstName", "checkIn", "checkOut", "roomLabel", "reviewUrl"],
  },
  "room-assigned": {
    name: { fr: "Chambre assignée", en: "Room Assigned" },
    subject: { fr: "Votre chambre pour la réservation #{{confirmationCode}}", en: "Your room for booking #{{confirmationCode}}" },
    sampleFile: "room-assigned.json",
    // `passkey` is intentionally NOT required — it is referenced only inside
    // {{#if passkeyEnabled}}, so a room with no pass-key still renders.
    requiredFields: ["name", "roomLabel", "checkIn", "checkOut", "passkeyEnabled"],
  },
  "ota-welcome": {
    name: { fr: "Bienvenue OTA", en: "OTA Welcome" },
    subject: {
      fr: "Votre réservation #{{confirmationCode}} — créez votre espace client",
      en: "Your reservation #{{confirmationCode}} — set up your guest account",
    },
    sampleFile: "ota-welcome.json",
    requiredFields: ["firstName", "confirmationCode", "checkIn", "checkOut", "setPasswordUrl"],
  },
  "email-verification": {
    name: { fr: "Confirmation d'adresse courriel", en: "Email Verification" },
    subject: { fr: "Confirmez votre adresse courriel", en: "Confirm your email address" },
    sampleFile: "email-verification.json",
    requiredFields: ["firstName", "verifyUrl", "expiryHours"],
  },
  "email-change-alert": {
    name: { fr: "Alerte de changement d'adresse", en: "Email Change Alert" },
    subject: { fr: "Votre adresse courriel a été modifiée", en: "Your email address was changed" },
    sampleFile: "email-change-alert.json",
    requiredFields: ["firstName", "newEmail"],
  },
  "email-change-confirm": {
    name: { fr: "Confirmation de changement d'adresse", en: "Email Change Confirmation" },
    subject: { fr: "Confirmez le changement de votre adresse courriel", en: "Confirm your email change" },
    sampleFile: "email-change-confirm.json",
    requiredFields: ["firstName", "newEmail", "confirmUrl", "expiryHours"],
  },
};

export const TEMPLATE_KEYS: TemplateKey[] = [
  "welcome",
  "password-reset",
  "reservation-confirmation",
  "reservation-cancellation",
  "invoice-receipt",
  "review-request",
  "room-assigned",
  "ota-welcome",
  "email-verification",
  "email-change-alert",
  "email-change-confirm",
];

export function isTemplateKey(value: unknown): value is TemplateKey {
  return typeof value === "string" && TEMPLATE_KEYS.includes(value as TemplateKey);
}

export function isLocale(value: unknown): value is "fr" | "en" {
  return value === "fr" || value === "en";
}

import { describe, it, expect } from "vitest";
import { classify } from "../src/classify";

describe("classify", () => {
  it("recognizes an Airbnb confirmation as a booking", () => {
    expect(
      classify("automated@airbnb.com", "Réservation confirmée : Jean Tremblay arrive le 30 juil."),
    ).toEqual({ kind: "booking", provider: "airbnb" });
  });

  it("tolerates a forward prefix in the subject", () => {
    expect(
      classify("automated@airbnb.com", "FW: Réservation confirmée : Jean Tremblay arrive le 30 juil."),
    ).toEqual({ kind: "booking", provider: "airbnb" });
  });

  it("ignores an Airbnb pending request", () => {
    const c = classify(
      "automated@airbnb.com",
      "En attente : demande de réservation concernant l'annonce Auberge du vieux pont pour 30–31 juil. 2026",
    );
    expect(c.kind).toBe("ignored");
    if (c.kind === "ignored") expect(c.provider).toBe("airbnb");
  });

  it("recognizes an Expedia new booking", () => {
    expect(classify("booknotif@expedia.com", "Expedia - New Booking - Arriving on 5 Sep 2026")).toEqual({
      kind: "booking",
      provider: "expedia",
    });
  });

  it("ignores Expedia modifications/cancellations", () => {
    expect(classify("booknotif@expedia.com", "Expedia - Cancelled Booking - 2511634261").kind).toBe("ignored");
    expect(classify("booknotif@expedia.com", "Expedia - Modified Booking - 2511634261").kind).toBe("ignored");
  });

  it("matches expediagroup.com and subdomain senders", () => {
    expect(classify("booknotif@mail.expediagroup.com", "Expedia - New Booking - Arriving on 5 Sep 2026").kind).toBe(
      "booking",
    );
    expect(classify("express@mail.airbnb.com", "Réservation confirmée : X arrive le 1 août").kind).toBe("booking");
  });

  it("returns unknown for anything else, including lookalike domains", () => {
    expect(classify("newsletter@example.com", "Réservation confirmée : piège")).toEqual({ kind: "unknown" });
    expect(classify("automated@airbnb.com.evil.io", "Réservation confirmée : piège")).toEqual({ kind: "unknown" });
    expect(classify("notairbnb.com@gmail.com", "Réservation confirmée : piège")).toEqual({ kind: "unknown" });
  });
});

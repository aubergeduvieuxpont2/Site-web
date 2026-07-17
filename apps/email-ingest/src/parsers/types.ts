export type ParsedBooking = {
  source: "airbnb" | "expedia";
  externalRef: string;
  firstName: string;
  lastName: string | null;
  guestEmail: string | null;
  phone: string | null;
  checkIn: string; // YYYY-MM-DD
  checkOut: string; // YYYY-MM-DD
  guests: number;
  listingName: string | null;
};

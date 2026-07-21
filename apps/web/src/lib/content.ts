/**
 * Site content for L'Auberge du Vieux Pont — Saint-Raymond, Québec.
 * Real location details; copy written for the target market:
 * industrial workers — forestry crews and hydro-electric sector workers.
 */

export const SITE = {
  name: "L'Auberge du Vieux Pont",
  shortName: "Le Vieux Pont",
  tagline: "Pas de luxe — tout le confort fonctionnel.",
  established: "1972",
  region: "Saint-Raymond · Portneuf · Québec",
  address: {
    street: "111, avenue Saint-Michel",
    city: "Saint-Raymond",
    province: "Québec",
    postal: "G3L 0H8",
    country: "Canada",
  },
  phone: "418 655-1212",
  phoneHref: "tel:+14186551212",
  email: "info@aubergeduvieuxpont.ca",
  citq: "304542",
  coords: { lat: 46.9, lng: -71.84 },
  // Canonical production origin — the base for canonical URLs, Open Graph
  // URLs and absolute image URLs in structured data. No trailing slash.
  url: "https://www.aubergeduvieuxpont.ca",
} as const;

/**
 * Derive a `tel:` href from a human-formatted phone string. Non-digits are
 * stripped; a 10-digit number is assumed North-American (`tel:+1…`), anything
 * else is prefixed with a bare `+`. Falls back to the static `SITE.phoneHref`
 * when the input is empty so a missing/blank configured value is safe.
 */
export function phoneToHref(phone: string | null | undefined): string {
  const digits = (phone ?? "").replace(/\D/g, "");
  if (!digits) return SITE.phoneHref;
  return digits.length === 10 ? `tel:+1${digits}` : `tel:+${digits}`;
}

/**
 * Frequently-asked questions surfaced on the home page and emitted as
 * `FAQPage` structured data. The visible copy and the JSON-LD are built from
 * this single source so they always match (a Google rich-result requirement).
 */
export type Faq = { question: string; answer: string };

export const FAQ: Faq[] = [
  {
    question: "Où se trouve L'Auberge du Vieux Pont ?",
    answer:
      "Au 111, avenue Saint-Michel à Saint-Raymond, dans Portneuf (Québec), au bord de la rivière Sainte-Anne — à environ 30 minutes des principaux chantiers forestiers de la région.",
  },
  {
    question: "Offrez-vous des tarifs d'entreprise pour les équipes ?",
    answer:
      "Oui. Nous proposons des ententes contractuelles avantageuses pour les équipes de foresterie et du secteur hydroélectrique. Écrivez-nous à info@aubergeduvieuxpont.ca pour obtenir un tarif de groupe.",
  },
  {
    question: "Peut-on arriver tard ou loger pour un quart de nuit ?",
    answer:
      "Oui. Nos chambres sont insonorisées et équipées de rideaux occultants, pensées pour les travailleurs de quart qui doivent dormir le jour.",
  },
  {
    question: "Y a-t-il du rangement pour l'équipement et les outils ?",
    answer:
      "Oui : un local de stockage sécurisé verrouillé, un dépôt de recharge pour outils et radios, et une salle de séchage pour les vêtements et bottes de travail.",
  },
  {
    question: "Quels services sont inclus et à partir de quel tarif ?",
    answer:
      "Les chambres débutent à 89 $ la nuit. La cuisine partagée, la buanderie, le café en libre-service et le WiFi sont inclus.",
  },
];

export const DEFAULTS = {
  nightlyPrice: 89,
  contactEmail: "info@aubergeduvieuxpont.ca",
  publicRoomCount: 12,
  tps: 5,
  tvq: 9.975,
  accommodationTax: 3.5,
} as const;

export type NavLink = { label: string; href: string; code: string };

export const NAV: NavLink[] = [
  { label: "Accueil", href: "/", code: "00" },
  { label: "Le site", href: "/le-site", code: "01" },
  { label: "À propos", href: "/a-propos", code: "02" },
  { label: "Contact", href: "/contact", code: "03" },
];

export type Room = {
  id: string;
  code: string;
  name: string;
  kind: string;
  capacity: string;
  beds: string;
  size: string;
  blurb: string;
  specs: string[];
  seed: string;
  // RoomCard spec fields
  slug: string;
  description: string;
  imgKey: string;
  picsumSeed: number;
};

export const ROOMS: Room[] = [
  {
    id: "chambre-quart",
    code: "QRT-02",
    name: "La Chambre du Quart",
    kind: "Privée · insonorisée",
    capacity: "1 à 2",
    beds: "1 lit queen",
    size: "16 m²",
    blurb: "La chambre idéale pour les travailleurs de quart de nuit.",
    specs: [
      "Insonorisation murale complète",
      "Rideaux occultants intégrals",
      "Réfrigérateur + cafetière",
      "Bureau de travail + WiFi dédié",
    ],
    seed: "shift-quarters",
    slug: "chambre-quart",
    description:
      "Isolée et calme pour un repos ininterrompu après un quart de travail, avec insonorisation optimale.",
    imgKey: "bedroom.jpg",
    picsumSeed: 17,
  },
  {
    id: "refuge-rider",
    code: "RDR-04",
    name: "La Chambre de la Rivière",
    kind: "Privée · vue rivière",
    capacity: "1 à 2",
    beds: "1 lit queen",
    size: "18 m²",
    blurb:
      "Terrasse privée sur la rivière Sainte-Anne avec accès direct. Séchoir à vêtements de travail, recharge pour outils et radios, refuge idéal entre deux quarts.",
    specs: [
      "Terrasse privée, vue rivière",
      "Séchoir à vêtements de travail",
      "Recharge outils et radios",
      "Réfrigérateur + cafetière",
    ],
    seed: "riverside-suite",
    slug: "refuge-rider",
    description:
      "Terrasse privée sur la rivière Sainte-Anne avec accès direct. Séchoir à vêtements de travail, recharge pour outils et radios, refuge idéal entre deux quarts.",
    imgKey: "balcony.jpg",
    picsumSeed: 85,
  },
  {
    id: "gite-familial",
    code: "FAM-08",
    name: "Le Gîte Familial",
    kind: "Privée · groupe",
    capacity: "Jusqu'à 5",
    beds: "1 queen + 3 simples",
    size: "32 m²",
    blurb:
      "De l'espace pour la tribu. Kitchenette complète, coin repas et rangement pour tout l'équipement de la semaine.",
    specs: [
      "Kitchenette complète",
      "Coin repas pour 5",
      "Grand rangement à équipement",
      "Salle de bain privée",
    ],
    seed: "group-lodge",
    slug: "gite-familial",
    description:
      "De l'espace pour la tribu. Kitchenette complète, coin repas et rangement pour tout l'équipement de la semaine.",
    imgKey: "living-dining.jpg",
    picsumSeed: 63,
  },
];

/**
 * Property overview areas for the public `#chambres` section. A real-estate
 * style survey of the auberge grouped by physical area rather than by bookable
 * room. Each image `key` is a fixed R2 asset key (served through `/img/{key}`,
 * with a graceful picsum fallback); `alt`/`caption` are descriptive French.
 * Layout in the page is chosen from `images.length` (1 → editorial split,
 * 3 → equal grid, 5 → lead panel + 2×2 grid).
 */
export type PropertyImage = { key: string; alt: string; caption: string };
export type PropertyArea = {
  id: string;
  label: string;
  blurb: string;
  images: PropertyImage[];
};

export const PROPERTY_AREAS: PropertyArea[] = [
  {
    id: "repas-cuisine",
    label: "Repas & cuisine",
    blurb:
      "Cuisine complète et coin repas partagés — de quoi préparer un souper d'équipe ou une boîte à lunch avant le départ.",
    images: [
      {
        key: "dining.jpg",
        alt: "Coin repas commun avec grande table de bois",
        caption: "Salle à manger commune",
      },
      {
        key: "kitchen.jpg",
        alt: "Cuisine partagée entièrement équipée",
        caption: "Cuisine partagée · accès libre",
      },
      {
        key: "living-dining.jpg",
        alt: "Espace ouvert reliant la cuisine et le coin repas",
        caption: "Aire ouverte cuisine-repas",
      },
    ],
  },
  {
    id: "salon",
    label: "Salon",
    blurb:
      "Un salon commun pour décompresser entre deux quarts, radio et outils rangés au vestiaire.",
    images: [
      {
        key: "lounge.jpg",
        alt: "Salon commun avec fauteuils et éclairage tamisé",
        caption: "Salon commun",
      },
    ],
  },
  {
    id: "chambre",
    label: "Chambre",
    blurb:
      "Chambres insonorisées et rideaux occultants — pensées pour ceux qui dorment le jour.",
    images: [
      {
        key: "bedroom.jpg",
        alt: "Chambre privée avec lit queen et rideaux occultants",
        caption: "Chambre type · insonorisée",
      },
    ],
  },
  {
    id: "salle-de-bain",
    label: "Salle de bain",
    blurb:
      "Salles de bain entretenues, calibrées pour un va-et-vient d'équipe aux heures de pointe.",
    images: [
      {
        key: "bathroom-1.jpg",
        alt: "Salle de bain avec douche et lavabo",
        caption: "Salle de bain · douche",
      },
      {
        key: "bathroom-2.jpg",
        alt: "Salle de bain avec baignoire",
        caption: "Salle de bain · baignoire",
      },
      {
        key: "bathroom-3.jpg",
        alt: "Salle d'eau compacte avec lavabo",
        caption: "Salle d'eau",
      },
    ],
  },
  {
    id: "buanderie",
    label: "Buanderie",
    blurb:
      "Buanderie et salle de séchage à l'arrière pour les vêtements et les bottes de travail.",
    images: [
      {
        key: "laundry.jpg",
        alt: "Buanderie avec laveuse, sécheuse et espace de séchage",
        caption: "Buanderie · salle de séchage",
      },
    ],
  },
  {
    id: "exterieur",
    label: "Extérieur",
    blurb:
      "Sur la rivière Sainte-Anne, au pied du vieux pont — pierre, bois et fer forgé depuis 1972.",
    images: [
      {
        key: "auberge-exterior.jpg",
        alt: "Vue extérieure de l'Auberge du Vieux Pont",
        caption: "L'auberge sur la Sainte-Anne",
      },
      {
        key: "auberge-porch.jpg",
        alt: "Galerie couverte à l'entrée de l'auberge",
        caption: "Galerie d'entrée",
      },
      {
        key: "balcony.jpg",
        alt: "Terrasse privée donnant sur la rivière",
        caption: "Terrasse · vue rivière",
      },
      {
        key: "bridge.jpg",
        alt: "Le vieux pont enjambant la rivière Sainte-Anne",
        caption: "Le vieux pont · Saint-Raymond",
      },
      {
        key: "village-river.jpg",
        alt: "Le village de Saint-Raymond au bord de la rivière",
        caption: "Saint-Raymond · Portneuf",
      },
    ],
  },
];

export type Amenity = { code: string; title: string; text: string; icon: string };

export const AMENITIES: Amenity[] = [
  {
    code: "A-01",
    title: "Stockage sécurisé",
    text: "Local verrouillé pour équipement et outils lourds.",
    icon: "lock",
  },
  {
    code: "A-02",
    title: "Recharge outils & radios",
    text: "Dépôt de recharge pour outils sans fil et radios de communication.",
    icon: "bolt",
  },
  {
    code: "A-03",
    title: "Salle de séchage",
    text: "Séchage des vêtements et bottes de travail après les quarts.",
    icon: "wrench",
  },
  {
    code: "A-04",
    title: "Café en libre-service",
    text: "Accès à du café disponible à toute heure.",
    icon: "coffee",
  },
  {
    code: "A-05",
    title: "Chambres insonorisées",
    text: "Repos réparateur garanti, même pour ceux qui dorment de jour.",
    icon: "moon",
  },
  {
    code: "A-06",
    title: "Tarifs entreprise",
    text: "Ententes contractuelles avantageuses pour les équipes et les chantiers.",
    icon: "tag",
  },
  {
    code: "A-07",
    title: "Cuisine partagée",
    text: "Cuisine complète, buanderie et salon commun en accès libre.",
    icon: "pot",
  },
  {
    code: "A-08",
    title: "Proximité des chantiers",
    text: "À proximité des principaux chantiers forestiers et lignes du réseau hydroélectrique.",
    icon: "trail",
  },
];

export type Attraction = {
  code: string;
  name: string;
  category: string;
  distance: string;
  grade: string;
  text: string;
  seed: string;
};

export const ATTRACTIONS: Attraction[] = [
  {
    code: "T-01",
    name: "Épicerie et dépanneur",
    category: "Services",
    distance: "5 min à pied",
    grade: "Services",
    text: "Provisions essentielles et denrées de dernière minute au cœur du village.",
    seed: "grocery",
  },
  {
    code: "T-02",
    name: "Quincaillerie Lafontaine",
    category: "Services",
    distance: "8 min à pied",
    grade: "Services",
    text: "Outils, pièces et fournitures pour les réparations et entretien d'équipement.",
    seed: "hardware",
  },
  {
    code: "T-03",
    name: "Station-service",
    category: "Services",
    distance: "12 min",
    grade: "Services",
    text: "Carburant et services routiers sur la route vers les chantiers.",
    seed: "fuel",
  },
  {
    code: "T-04",
    name: "Restaurants et casse-croûte",
    category: "Services",
    distance: "Divers",
    grade: "Services",
    text: "Options de repas du repas chaud rapide aux formules équipe dans le secteur.",
    seed: "restaurants",
  },
  {
    code: "T-05",
    name: "Clinique et pharmacie",
    category: "Services",
    distance: "10 min",
    grade: "Services",
    text: "Services médicaux et pharmaceutiques accessibles en cas de besoin.",
    seed: "clinic",
  },
  {
    code: "T-06",
    name: "Rivière Sainte-Anne",
    category: "Repos",
    distance: "Sur place",
    grade: "Repos",
    text: "Repos et détente au bord de la rivière lors des jours de congé.",
    seed: "river",
  },
];

export type Stat = { value: number; suffix: string; label: string; localize?: boolean };

export const STATS: Stat[] = [
  { value: 30, suffix: " min", label: "des principaux chantiers forestiers" },
  { value: 1972, suffix: "", label: "année de fondation" },
  { value: 12, suffix: " chambres", label: "disponibles pour l'équipe" },
  { value: 24, suffix: " h", label: "stockage sécurisé" },
];

export type PolicySection = { code: string; title: string; items: string[] };

export const POLICIES: PolicySection[] = [
  {
    code: "P-01",
    title: "Arrivée et départ",
    items: [
      "Arrivée à partir de 15 h 00. Départ avant 11 h 00.",
      "Arrivée tardive possible sur préavis — boîte à clés sécurisée disponible.",
      "Pièce d'identité avec photo exigée à l'enregistrement.",
    ],
  },
  {
    code: "P-02",
    title: "Équipement de travail",
    items: [
      "L'équipement se range au local sécurisé, jamais dans les aires communes.",
      "Salle de séchage à l'arrière pour vêtements et bottes de travail.",
      "L'auberge n'est pas responsable de l'équipement laissé hors du local verrouillé.",
    ],
  },
  {
    code: "P-03",
    title: "Heures de repos",
    items: [
      "Heures de silence de 22 h 00 à 7 h 00, par respect pour les travailleurs de quart.",
      "Les chambres insonorisées restent un espace de repos en tout temps.",
    ],
  },
  {
    code: "P-04",
    title: "Annulation",
    items: [
      "Annulation gratuite jusqu'à 48 h avant l'arrivée.",
      "Annulation tardive : première nuit facturée.",
      "Tarifs entreprise : conditions selon l'entente contractuelle.",
    ],
  },
  {
    code: "P-05",
    title: "Animaux et chantiers",
    items: [
      "Animaux acceptés dans le Gîte Familial, sur réservation.",
      "Bottes de travail et équipement boueux tolérés — c'est fait pour ça.",
    ],
  },
];

export const PRIVACY: PolicySection[] = [
  {
    code: "C-01",
    title: "Renseignements collectés",
    items: [
      "Nom, coordonnées et informations de réservation, uniquement pour gérer votre séjour.",
      "Aucune revente ni partage à des fins publicitaires.",
    ],
  },
  {
    code: "C-02",
    title: "Utilisation et conservation",
    items: [
      "Vos données servent à confirmer la réservation et à respecter nos obligations légales.",
      "Conservation limitée à la durée requise par la loi québécoise.",
    ],
  },
  {
    code: "C-03",
    title: "Vos droits",
    items: [
      "Accès, rectification ou suppression sur demande écrite à l'auberge.",
      "Pour toute question : info@aubergeduvieuxpont.ca.",
    ],
  },
];

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
} as const;

export const DEFAULTS = {
  nightlyPrice: 89,
  contactEmail: "info@aubergeduvieuxpont.ca",
  marketingRoomCount: 12,
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
    blurb:
      "Conçue pour ceux qui dorment le jour. Murs insonorisés, rideaux occultants, et un petit-déjeuner servi avant l'aube pour les horaires de quart.",
    specs: [
      "Insonorisation murale complète",
      "Rideaux occultants intégrals",
      "Réfrigérateur + cafetière",
      "Bureau de travail + WiFi dédié",
    ],
    seed: "shift-quarters",
    slug: "chambre-quart",
    description:
      "Conçue pour ceux qui dorment le jour. Murs insonorisés, rideaux occultants, et un petit-déjeuner servi avant l'aube pour les horaires de quart.",
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
    title: "Petit-déjeuner matinal",
    text: "Service avant l'aube, calibré sur les horaires de quart et de départ.",
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

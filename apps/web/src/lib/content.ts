/**
 * Site content for L'Auberge du Vieux Pont — Saint-Raymond, Québec.
 * Real location details; copy written for the target market:
 * blue-collar workers and weekend mountain-bike warriors.
 */

export const SITE = {
  name: "L'Auberge du Vieux Pont",
  shortName: "Le Vieux Pont",
  tagline: "L'utilité industrielle rencontre l'hospitalité rurale.",
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
  email: "aubergeduvieuxpont@hotmail.com",
  coords: { lat: 46.9, lng: -71.84 },
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
  priceFrom: number;
  blurb: string;
  specs: string[];
  seed: string;
  // RoomCard spec fields
  slug: string;
  description: string;
  pricePerNight: number;
  imgKey: string;
  picsumSeed: number;
};

export const ROOMS: Room[] = [
  {
    id: "dortoir-equipe",
    code: "DOR-06",
    name: "Le Dortoir de l'Équipe",
    kind: "Dortoir partagé",
    capacity: "Jusqu'à 6",
    beds: "6 lits superposés",
    size: "24 m²",
    priceFrom: 39,
    blurb:
      "Pour les crews et les pelotons. Six couchettes robustes, casiers cadenassables, et un plancher qui se lave à grande eau après une journée dans la boue.",
    specs: [
      "Casiers individuels verrouillables",
      "Prises de recharge à chaque lit",
      "Plancher de béton scellé, lavable",
      "Salle de bain commune attenante",
    ],
    seed: "bunkroom",
    slug: "dortoir-equipe",
    description:
      "Pour les crews et les pelotons. Six couchettes robustes, casiers cadenassables, et un plancher qui se lave à grande eau après une journée dans la boue.",
    pricePerNight: 39,
    imgKey: "bunkroom",
    picsumSeed: 42,
  },
  {
    id: "chambre-quart",
    code: "QRT-02",
    name: "La Chambre du Quart",
    kind: "Privée · insonorisée",
    capacity: "1 à 2",
    beds: "1 lit queen",
    size: "16 m²",
    priceFrom: 89,
    blurb:
      "Conçue pour ceux qui dorment le jour. Murs insonorisés, rideaux occultants, et un petit-déjeuner servi avant l'aube pour les horaires de quart.",
    specs: [
      "Insonorisation murale complète",
      "Rideaux occultants intégraux",
      "Réfrigérateur + cafetière",
      "Bureau de travail + WiFi dédié",
    ],
    seed: "shiftroom",
    slug: "chambre-quart",
    description:
      "Conçue pour ceux qui dorment le jour. Murs insonorisés, rideaux occultants, et un petit-déjeuner servi avant l'aube pour les horaires de quart.",
    pricePerNight: 89,
    imgKey: "shiftroom",
    picsumSeed: 17,
  },
  {
    id: "refuge-rider",
    code: "RDR-04",
    name: "Le Refuge du Rider",
    kind: "Privée · vue rivière",
    capacity: "1 à 2",
    beds: "1 lit queen",
    size: "18 m²",
    priceFrom: 109,
    blurb:
      "Terrasse privée sur la rivière Sainte-Anne, support à vélo dans la chambre et accès direct au lave-vélo. Roulez, rincez, reposez.",
    specs: [
      "Terrasse privée, vue rivière",
      "Support à vélo intérieur",
      "Accès station de lavage vélo",
      "Réfrigérateur + cafetière",
    ],
    seed: "riverroom",
    slug: "refuge-rider",
    description:
      "Terrasse privée sur la rivière Sainte-Anne, support à vélo dans la chambre et accès direct au lave-vélo. Roulez, rincez, reposez.",
    pricePerNight: 109,
    imgKey: "riverroom",
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
    priceFrom: 149,
    blurb:
      "De l'espace pour la tribu. Kitchenette complète, coin repas et rangement pour tout l'attirail de la fin de semaine.",
    specs: [
      "Kitchenette complète",
      "Coin repas pour 5",
      "Grand rangement à équipement",
      "Salle de bain privée",
    ],
    seed: "familyroom",
    slug: "gite-familial",
    description:
      "De l'espace pour la tribu. Kitchenette complète, coin repas et rangement pour tout l'attirail de la fin de semaine.",
    pricePerNight: 149,
    imgKey: "familyroom",
    picsumSeed: 63,
  },
];

export type Amenity = { code: string; title: string; text: string; icon: string };

export const AMENITIES: Amenity[] = [
  {
    code: "A-01",
    title: "Stockage sécurisé",
    text: "Local verrouillé pour vélos et équipement lourd, surveillé jour et nuit.",
    icon: "lock",
  },
  {
    code: "A-02",
    title: "Recharge e-bike",
    text: "Stations de recharge dédiées pour vélos électriques et outils.",
    icon: "bolt",
  },
  {
    code: "A-03",
    title: "Station de lavage",
    text: "Aire de lavage et atelier de réparation rapide à l'arrière du bâtiment.",
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
    title: "Accès aux sentiers",
    text: "Connexion directe au réseau de la Vallée Bras-du-Nord.",
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
    name: "Vallée Bras-du-Nord",
    category: "VTT · Randonnée · Canyoning",
    distance: "2 km",
    grade: "Tous niveaux → Expert",
    text: "Plus de 80 km de sentiers de vélo de montagne primés, du flow roulant aux descentes techniques. Le terrain de jeu principal.",
    seed: "valley",
  },
  {
    code: "T-02",
    name: "Secteur Shannahan",
    category: "Sentiers VTT",
    distance: "9 km",
    grade: "Intermédiaire → Expert",
    text: "Single tracks taillés dans la forêt, racines et roches. Le rendez-vous des riders de fin de semaine.",
    seed: "singletrack",
  },
  {
    code: "T-03",
    name: "Rivière Sainte-Anne",
    category: "Descente · Pêche",
    distance: "Sur place",
    grade: "Facile",
    text: "Elle coule sous le vieux pont. Kayak, baignade et pêche à deux pas de votre terrasse.",
    seed: "river",
  },
  {
    code: "T-04",
    name: "Maison Plamondon",
    category: "Patrimoine",
    distance: "8 min à pied",
    grade: "Facile",
    text: "Un arrêt patrimonial au cœur du village, pour les jours de repos entre deux sorties.",
    seed: "heritage",
  },
  {
    code: "T-05",
    name: "Via Ferrata du Bras-du-Nord",
    category: "Parcours suspendu",
    distance: "12 km",
    grade: "Intermédiaire",
    text: "Une paroi équipée au-dessus du canyon. Pour les fins de semaine où le vélo ne suffit pas.",
    seed: "ferrata",
  },
  {
    code: "T-06",
    name: "Ville de Québec",
    category: "Escapade urbaine",
    distance: "45 min",
    grade: "Facile",
    text: "Le Vieux-Québec à moins d'une heure quand l'asphalte appelle plus que la garnotte.",
    seed: "quebec",
  },
];

export type Stat = { value: number; suffix: string; label: string };

export const STATS: Stat[] = [
  { value: 80, suffix: " km", label: "de sentiers VTT à 2 km" },
  { value: 1972, suffix: "", label: "année de fondation" },
  { value: 32, suffix: " lits", label: "du dortoir à la chambre privée" },
  { value: 24, suffix: " h", label: "stockage surveillé" },
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
    title: "Vélos et équipement",
    items: [
      "Les vélos se rangent au local sécurisé, jamais dans les aires communes.",
      "Station de lavage à l'arrière — on rince avant de rentrer.",
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
      "Animaux acceptés dans les dortoirs et le Gîte Familial, sur réservation.",
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
      "Pour toute question : aubergeduvieuxpont@hotmail.com.",
    ],
  },
];

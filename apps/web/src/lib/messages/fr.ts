/**
 * French (fr) guest-facing message dictionary.
 * INV-key-parity: key set must stay identical to en.ts.
 * Structural fields (ids, hrefs, image keys, coordinates) remain in content.ts.
 */
export const fr = {
  layout: {
    skip_link: 'Passer au contenu principal',
  },

  nav: {
    home: 'Accueil',
    le_site: 'Le site',
    a_propos: 'À propos',
    contact: 'Contact',
    lesite: 'Le site',
    apropos: 'À propos',
    politiques: 'Politiques',
    confidentialite: 'Confidentialité',
    connexion: 'Connexion',
    profil: 'Profil',
    deconnexion: 'Déconnexion',
    deconnexion_aria: 'Se déconnecter',
    reserver: 'Réserver',
    reserver_chambre: 'Réserver une chambre',
    open_menu: 'Ouvrir le menu',
    close_menu: 'Fermer le menu',
  },

  footer: {
    aria: 'Pied de page',
    nav_aria: 'Navigation secondaire',
    phone_aria: 'Téléphone : %phone%',
    rights: 'Tous droits réservés.',
    links: {
      avis: 'Avis des clients',
      politiques: "Politiques de l'établissement",
      confidentialite: 'Politique de confidentialité',
    },
  },

  accueil: {
    seo: {
      title: 'Auberge du Vieux Pont — hébergement pour travailleurs de terrain',
      description:
        "Auberge à Saint-Raymond (Portneuf) pour les travailleurs de terrain — foresterie et secteur hydroélectrique. Chambres insonorisées, stockage d'équipement, tarifs d'entreprise, à 30 min des chantiers.",
    },
    hero: {
      heading: "L'art de recevoir les travailleurs de terrain",
      sub: "Une auberge de caractère pour les travailleurs de terrain — foresterie et secteur hydroélectrique.",
      scroll: 'Défiler',
      cta: {
        reserver: 'Réserver',
        lesite: 'Le site',
      },
    },
    stats: {
      ariaLabel: 'Chiffres clés',
    },
    rooms: {
      sectionLabel: 'Chambres',
      heading: 'Des espaces pensés pour vous',
      priceAriaLabel: 'Prix par nuit',
      priceUnit: '/nuit',
      customBadge: 'Tarif personnalisé',
      seeAll: 'Voir toutes les chambres',
    },
    amenities: {
      sectionLabel: "L'expérience",
      heading: 'Fait pour ceux qui bougent',
      body: "L'Auberge du Vieux Pont a été conçue pour les travailleurs de terrain. Stockage sécurisé, recharge d'outils et de radios, salle de séchage — tout est là pour que vous déposiez vos affaires et repartiez reposés.",
      imageAlt: "Intérieur de l'Auberge du Vieux Pont",
      cta: 'Découvrir le site',
    },
    faq: {
      sectionLabel: 'Questions fréquentes',
      heading: 'Bon à savoir avant de réserver',
    },
    cta: {
      sectionLabel: 'Réservation',
      heading: 'Planifiez votre séjour',
      body: "Groupes, équipes, travailleurs de quart — on a la chambre qu'il vous faut. Réservez directement par formulaire, sans intermédiaire.",
      btn: 'Réserver maintenant',
    },
  },

  stats: {
    '0': { suffix: ' min', label: 'des principaux chantiers forestiers' },
    '1': { label: 'année de fondation' },
    '2': { suffix: ' chambres', label: "disponibles pour l'équipe" },
    '3': { suffix: ' h', label: 'stockage sécurisé' },
  },

  amenities: {
    'A-01': { title: 'Stockage sécurisé' },
    'A-02': { title: 'Recharge outils & radios' },
    'A-03': { title: 'Salle de séchage' },
    'A-04': { title: 'Café en libre-service' },
    'A-05': { title: 'Chambres insonorisées' },
    'A-06': { title: 'Tarifs entreprise' },
    'A-07': { title: 'Cuisine partagée' },
    'A-08': { title: 'Proximité des chantiers' },
  },

  faq: {
    '0': {
      question: "Où se trouve L'Auberge du Vieux Pont ?",
      answer:
        "Au 111, avenue Saint-Michel à Saint-Raymond, dans Portneuf (Québec), au bord de la rivière Sainte-Anne — à environ 30 minutes des principaux chantiers forestiers de la région.",
    },
    '1': {
      question: "Offrez-vous des tarifs d'entreprise pour les équipes ?",
      answer:
        "Oui. Nous proposons des ententes contractuelles avantageuses pour les équipes de foresterie et du secteur hydroélectrique. Écrivez-nous à info@aubergeduvieuxpont.ca pour obtenir un tarif de groupe.",
    },
    '2': {
      question: "Peut-on arriver tard ou loger pour un quart de nuit ?",
      answer:
        "Oui. Nos chambres sont insonorisées et équipées de rideaux occultants, pensées pour les travailleurs de quart qui doivent dormir le jour.",
    },
    '3': {
      question: "Y a-t-il du rangement pour l'équipement et les outils ?",
      answer:
        "Oui : un local de stockage sécurisé verrouillé, un dépôt de recharge pour outils et radios, et une salle de séchage pour les vêtements et bottes de travail.",
    },
    '4': {
      question: "Quels services sont inclus et à partir de quel tarif ?",
      answer:
        "Les chambres débutent à 89 $ la nuit. La cuisine partagée, la buanderie, le café en libre-service et le WiFi sont inclus.",
    },
  },

  apropos: {
    seo: {
      title: 'À propos — Auberge du Vieux Pont',
      description:
        "L'Auberge du Vieux Pont à Saint-Raymond depuis 1972 — un hébergement pensé pour les équipes de foresterie et du secteur hydroélectrique de Portneuf.",
    },
    heading: 'Bâti pour ceux qui ne reculent devant rien.',
    lead: "Depuis un demi-siècle, l'Auberge du Vieux Pont loge les travailleurs, les pêcheurs et les équipes de terrain d'aujourd'hui. Même promesse : un repos honnête, sans flafla.",
    intro: {
      sectionLabel: 'À propos · Est. 1972',
    },
    histoire: {
      sectionLabel: "D'où l'on vient",
      heading: 'Une maison plantée au bord de la rivière.',
      p1: "Tout commence près du vieux pont Tessier, là où la rivière Sainte-Anne taille son chemin dans la roche de Portneuf. En 1972, la bâtisse ouvre ses portes pour loger ceux qui travaillaient fort : bûcherons, gens de chantier, pêcheurs venus tester l'eau froide au petit matin.",
      p2: "On n'a jamais cherché à impressionner. On a cherché à dépanner. Un lit propre, un repas chaud, un toit solide quand la journée finissait tard et que la suivante commençait tôt. C'est devenu notre réputation — et on ne l'a pas lâchée depuis.",
      p3: "Avec les années, le monde a changé de bottes. La foresterie s'est mécanisée et les chantiers du secteur hydroélectrique se sont développés partout en Portneuf. On a ajouté un séchage pour vêtements de travail, des bornes de recharge pour outils et radios, un local sécurisé renforcé. Mais l'esprit, lui, n'a pas bougé d'un pouce.",
      image: {
        alt: 'Le vieux pont Tessier sur la rivière Sainte-Anne en automne',
        caption: 'Le Pont Tessier, Saint-Raymond',
      },
    },
    quote: {
      text: "« On ne vend pas du luxe. On vend du repos qui tient la route. »",
      caption: 'La maison · depuis 1972',
    },
    valeurs: {
      sectionLabel: 'Nos principes',
      heading: 'Quatre principes qui ne se négocient pas.',
    },
    values: {
      '0': {
        title: 'Honnête',
        text: "On dit les choses comme elles sont. Pas de promesses gonflées, pas de frais cachés. Le prix affiché, c'est le prix payé.",
      },
      '1': {
        title: 'Robuste',
        text: "Bâti pour durer. Planchers de béton, casiers d'acier, murs qui encaissent les bottes pleines de boue sans broncher.",
      },
      '2': {
        title: 'Accessible',
        text: "Un tarif unique pour tous. Confort et repos pour chaque travailleur, peu importe le budget. Le repos n'est pas un luxe réservé.",
      },
      '3': {
        title: 'Ancré',
        text: "Saint-Raymond, c'est chez nous depuis 1972. On connaît la rivière, les chantiers et le monde qui y travaille.",
      },
    },
    ancrage: {
      sectionLabel: "Ce qu'on défend",
      heading: 'Ancrés à Saint-Raymond, les pieds dans la rivière.',
      p1: "On n'est pas une chaîne. On est une auberge de Portneuf, tenue par du monde d'ici, à deux pas des chantiers forestiers et des lignes du réseau hydroélectrique. La rivière Sainte-Anne coule sous nos fenêtres ; les principaux sites de travail sont à moins de 30 minutes.",
      p2: "Ça veut dire des conseils qui valent quelque chose, des horaires qui collent à la vraie vie, et l'assurance qu'on comprend ce que c'est qu'une longue journée de chantier — réelle et épuisante.",
      image: {
        alt: 'Le village de Saint-Raymond le long de la rivière Sainte-Anne',
        caption: 'Saint-Raymond · Portneuf',
      },
    },
    tags: {
      '0': 'Saint-Raymond',
      '1': 'Portneuf',
      '2': 'Vue rivière',
      '3': 'Foresterie',
    },
    cta: {
      eyebrow: 'Visite',
      heading: 'Venez voir par vous-même.',
      lead: "Le mieux pour comprendre ce qu'on est, c'est de pousser la porte. Appelez-nous ou écrivez-nous — on vous attend au bord du pont.",
      link: 'Nous joindre',
      ariaLabel: "Contacter l'auberge",
      phoneAriaLabel: "Appeler l'auberge",
    },
  },

  lesite: {
    seo: {
      title: 'Le site — Auberge du Vieux Pont',
      description:
        "Découvrez L'Auberge du Vieux Pont : chambres insonorisées, cuisine partagée, buanderie, salle de séchage et salon commun, sur la rivière Sainte-Anne à Saint-Raymond.",
    },
    inpageNav: {
      ariaLabel: 'Sur cette page',
    },
    nav: {
      chambres: 'Chambres',
      attraits: 'Attraits',
      lieu: 'Le lieu',
    },
    chambres: {
      sectionLabel: 'Hébergement',
      heading: 'Nos espaces',
      ariaLabel: 'Aperçu de la propriété',
      intro:
        "Chaque espace est calibré pour ceux qui arrivent couverts de boue et repartent reposés. Les chambres sont assignées à votre arrivée selon les besoins de votre équipe. Tarif unique :",
      cta: 'Réserver votre séjour',
    },
    price: {
      unit: '$/nuit',
    },
    attraits: {
      sectionLabel: 'Attraits',
      heading: 'Aux alentours',
    },
    lieu: {
      sectionLabel: 'Le lieu',
      heading: 'Un vieux pont sur la Sainte-Anne',
      p1: "Depuis 1972, l'Auberge du Vieux Pont domine la rivière Sainte-Anne au cœur de Saint-Raymond. Pierre, bois, fer forgé — les matériaux parlent d'eux-mêmes. À proximité des principaux chantiers forestiers et des lignes du réseau hydroélectrique de Portneuf.",
      p2: "Un endroit calibré pour ceux qui partent tôt et rentrent tard, avec du béton qu'on lave à grande eau.",
      image: {
        alt: "Vue extérieure de l'Auberge du Vieux Pont sur la rivière Sainte-Anne",
      },
      strip: {
        caption: 'Le pont et la Sainte-Anne · Saint-Raymond, Portneuf',
      },
      ctaBtn: 'Nous contacter',
    },
    cta: {
      sectionLabel: 'Réservation',
      heading: 'Prêt à réserver?',
      body: "Envoyez-nous votre demande — nous confirmons sous 24 h et adaptons l'hébergement à la taille de votre équipe.",
      btn: 'Réserver maintenant',
    },
  },

  areas: {
    'repas-cuisine': {
      label: 'Repas & cuisine',
      blurb:
        "Cuisine complète et coin repas partagés — de quoi préparer un souper d'équipe ou une boîte à lunch avant le départ.",
      images: {
        dining: { alt: 'Coin repas commun avec grande table de bois', caption: 'Salle à manger commune' },
        kitchen: { alt: 'Cuisine partagée entièrement équipée', caption: 'Cuisine partagée · accès libre' },
        'living-dining': { alt: 'Espace ouvert reliant la cuisine et le coin repas', caption: 'Aire ouverte cuisine-repas' },
      },
    },
    salon: {
      label: 'Salon',
      blurb: 'Un salon commun pour décompresser entre deux quarts, radio et outils rangés au vestiaire.',
      images: {
        lounge: { alt: 'Salon commun avec fauteuils et éclairage tamisé', caption: 'Salon commun' },
      },
    },
    chambre: {
      label: 'Chambre',
      blurb: 'Chambres insonorisées et rideaux occultants — pensées pour ceux qui dorment le jour.',
      images: {
        bedroom: { alt: 'Chambre privée avec lit queen et rideaux occultants', caption: 'Chambre type · insonorisée' },
      },
    },
    'salle-de-bain': {
      label: 'Salle de bain',
      blurb: "Salles de bain entretenues, calibrées pour un va-et-vient d'équipe aux heures de pointe.",
      images: {
        'bathroom-1': { alt: 'Salle de bain avec douche et lavabo', caption: 'Salle de bain · douche' },
        'bathroom-2': { alt: 'Salle de bain avec baignoire', caption: 'Salle de bain · baignoire' },
        'bathroom-3': { alt: "Salle d'eau compacte avec lavabo", caption: "Salle d'eau" },
      },
    },
    buanderie: {
      label: 'Buanderie',
      blurb: "Buanderie et salle de séchage à l'arrière pour les vêtements et les bottes de travail.",
      images: {
        laundry: { alt: 'Buanderie avec laveuse, sécheuse et espace de séchage', caption: 'Buanderie · salle de séchage' },
      },
    },
    exterieur: {
      label: 'Extérieur',
      blurb: "Sur la rivière Sainte-Anne, au pied du vieux pont — pierre, bois et fer forgé depuis 1972.",
      images: {
        'auberge-exterior': { alt: "Vue extérieure de l'Auberge du Vieux Pont", caption: "L'auberge sur la Sainte-Anne" },
        'auberge-porch': { alt: "Galerie couverte à l'entrée de l'auberge", caption: "Galerie d'entrée" },
        balcony: { alt: 'Terrasse privée donnant sur la rivière', caption: 'Terrasse · vue rivière' },
        bridge: { alt: 'Le vieux pont enjambant la rivière Sainte-Anne', caption: 'Le vieux pont · Saint-Raymond' },
        'village-river': { alt: 'Le village de Saint-Raymond au bord de la rivière', caption: 'Saint-Raymond · Portneuf' },
      },
    },
  },

  attractions: {
    'T-01': {
      name: 'Épicerie et dépanneur',
      distance: '5 min à pied',
      grade: 'Services',
      category: 'Services',
      text: 'Provisions essentielles et denrées de dernière minute au cœur du village.',
    },
    'T-02': {
      name: 'Quincaillerie Lafontaine',
      distance: '8 min à pied',
      grade: 'Services',
      category: 'Services',
      text: "Outils, pièces et fournitures pour les réparations et entretien d'équipement.",
    },
    'T-03': {
      name: 'Station-service',
      distance: '12 min',
      grade: 'Services',
      category: 'Services',
      text: 'Carburant et services routiers sur la route vers les chantiers.',
    },
    'T-04': {
      name: 'Restaurants et casse-croûte',
      distance: 'Divers',
      grade: 'Services',
      category: 'Services',
      text: 'Options de repas du repas chaud rapide aux formules équipe dans le secteur.',
    },
    'T-05': {
      name: 'Clinique et pharmacie',
      distance: '10 min',
      grade: 'Services',
      category: 'Services',
      text: 'Services médicaux et pharmaceutiques accessibles en cas de besoin.',
    },
    'T-06': {
      name: 'Rivière Sainte-Anne',
      distance: 'Sur place',
      grade: 'Repos',
      category: 'Repos',
      text: 'Repos et détente au bord de la rivière lors des jours de congé.',
    },
  },

  avis: {
    seo: {
      title: 'Avis des clients — Auberge du Vieux Pont',
      description: "Témoignages et avis de clients de l'Auberge du Vieux Pont à Saint-Raymond.",
    },
    sectionLabel: 'Avis',
    heading: 'Témoignages',
    label: 'Voir tous les avis',
    average: {
      ariaLabel: 'Note moyenne : %rating% sur 5',
    },
    review: {
      singular: 'avis',
      plural: 'avis',
    },
    loading: {
      ariaLabel: 'Chargement des avis…',
    },
    empty: {
      body: 'Aucun avis pour le moment. Revenez bientôt.',
    },
    card: {
      ariaLabel: 'Avis de %name%',
      ratingLabel: 'Note : %rating% sur 5',
    },
    sejours: {
      singular: '%count% séjour',
      plural: '%count% séjours',
    },
    nuits: {
      singular: '%count% nuit',
      plural: '%count% nuits',
    },
    stayOne: '1 séjour',
    stayMany: '%n% séjours',
    nightOne: '1 nuit',
    nightMany: '%n% nuits',
    ratingAriaLabel: 'Note : %rating% sur 5',
  },

  avisNouveau: {
    seo: {
      title: 'Laisser un avis — Auberge du Vieux Pont',
      description: "Partagez votre expérience à l'Auberge du Vieux Pont à Saint-Raymond.",
    },
    sectionLabel: 'Laisser un avis',
    subtitle: 'Votre expérience compte.',
    title: {
      default: 'Laisser un avis',
      withName: 'Avis de %name%',
    },
    stars: {
      ariaLabel: 'Note globale',
    },
    star: {
      ariaLabel: 'Étoile',
    },
    starLabel: {
      '1': 'Très mauvais',
      '2': 'Mauvais',
      '3': 'Correct',
      '4': 'Bon',
      '5': 'Excellent',
    },
    form: {
      ratingLabel: 'Votre note',
      bodyLabel: 'Votre commentaire',
      bodyPlaceholder: 'Partagez votre expérience…',
      submit: 'Soumettre',
      submitting: 'Envoi en cours…',
    },
    loading: {
      ariaLabel: 'Vérification de votre admissibilité…',
      text: 'Chargement…',
    },
    ineligible: {
      heading: 'Avis non disponible',
      body: "Vous devez avoir séjourné à l'auberge pour laisser un avis.",
      cta: 'Réserver un séjour',
    },
    success: {
      heading: 'Merci pour votre avis !',
      body: 'Votre avis a été soumis et sera publié après vérification.',
      cta: 'Voir les avis',
    },
    errors: {
      generic: 'Une erreur est survenue. Veuillez réessayer.',
      network: 'Connexion impossible. Veuillez réessayer.',
    },
  },

  confidentialite: {
    seo: {
      title: 'Confidentialité — Auberge du Vieux Pont',
      description:
        "Politique de confidentialité de l'Auberge du Vieux Pont : collecte de données, utilisation et droits des utilisateurs.",
    },
    sectionLabel: 'Confidentialité',
    heading: 'Protection de vos renseignements',
    lead: 'On collecte le strict nécessaire pour gérer votre séjour, rien de plus. Conforme à la loi québécoise.',
    closing: {
      title: 'Pour exercer vos droits',
      text: 'Accès, rectification ou suppression sur demande. Écrivez-nous directement.',
    },
  },

  privacy: {
    'C-01': {
      title: 'Renseignements collectés',
      items: {
        '0': 'Nom, coordonnées et informations de réservation, uniquement pour gérer votre séjour.',
        '1': 'Aucune revente ni partage à des fins publicitaires.',
      },
    },
    'C-02': {
      title: 'Utilisation et conservation',
      items: {
        '0': 'Vos données servent à confirmer la réservation et à respecter nos obligations légales.',
        '1': 'Conservation limitée à la durée requise par la loi québécoise.',
      },
    },
    'C-03': {
      title: 'Vos droits',
      items: {
        '0': "Accès, rectification ou suppression sur demande écrite à l'auberge.",
        '1': 'Pour toute question : info@aubergeduvieuxpont.ca.',
      },
    },
  },

  connexion: {
    seo: {
      title: 'Connexion — Auberge du Vieux Pont',
    },
    sectionLabel: 'Connexion',
    heading: 'Espace client',
    lead: 'Accédez à vos réservations ou créez votre espace.',
    login: {
      formAriaLabel: 'Formulaire de connexion',
      heading: 'Se connecter',
      submit: 'Se connecter',
      sending: 'Connexion…',
    },
    fields: {
      email: 'Courriel',
      emailPlaceholder: 'vous@exemple.com',
      password: 'Mot de passe',
      passwordHint: '8 caractères minimum',
      firstName: 'Prénom',
      firstNamePlaceholder: 'Ada',
      lastName: 'Nom de famille',
      lastNamePlaceholder: 'Lovelace',
      phone: 'Téléphone',
      phonePlaceholder: '+1 418 555-0100',
      optional: '(optionnel)',
      company: 'Employeur / entreprise',
      companyPlaceholder: 'Hydro-Québec',
    },
    errors: {
      invalidCredentials: 'Identifiants invalides.',
      network: 'Connexion impossible. Veuillez réessayer.',
      passwordTooShort: 'Le mot de passe doit contenir au moins 8 caractères.',
    },
    forgot: {
      trigger: 'Mot de passe oublié ?',
      regionAriaLabel: 'Réinitialisation du mot de passe',
      formAriaLabel: 'Formulaire de réinitialisation',
      emailLabel: 'Votre adresse courriel',
      submit: 'Envoyer',
      sending: 'Envoi…',
      successText:
        "Si cette adresse est associée à un compte, un administrateur pourra vous transmettre un lien de réinitialisation.",
    },
    register: {
      formAriaLabel: "Formulaire d'inscription",
      heading: 'Créer un compte',
      submit: 'Créer mon compte',
      sending: 'Création…',
      successNotice:
        "Un courriel de confirmation vous a été envoyé — cliquez le lien pour activer votre compte et retrouver vos réservations.",
    },
  },

  contact: {
    seo: {
      title: 'Contact — Auberge du Vieux Pont',
      description:
        "Contactez L'Auberge du Vieux Pont à Saint-Raymond : réservations, tarifs d'entreprise et demandes d'information. Téléphone 418 655-1212.",
    },
    hero: {
      sectionLabel: 'Réservation & contact',
      title: 'Écrivez-nous',
      lead: "Envoyez votre demande de réservation ou vos questions. Nous répondons à chaque message ; pour une réponse immédiate, appelez-nous.",
    },
    form: {
      sectionLabel: 'Demande de réservation',
      desc: "Les champs marqués d'un astérisque sont requis. Les dates et le nombre de personnes nous aident à préparer votre arrivée.",
      identityLabel: 'Réservation au nom de',
      firstName: 'Prénom',
      lastName: 'Nom',
      email: 'Courriel',
      checkIn: "Date d'arrivée",
      checkOut: 'Date de départ',
      guests: 'Nombre de personnes',
      roomCount: 'Nombre de chambres',
      message: 'Message',
      messagePlaceholder: 'Demandes spéciales, horaires, besoins particuliers…',
      rateLabel: 'Tarif',
      rateUnit: '/nuit',
      customRateBadge: 'Tarif personnalisé',
      customRateAriaLabel: 'Tarif personnalisé',
      weeklyRateLabel: 'Tarif semaine actif',
      weeklyRateUnit: '/semaine',
      maintenanceNotice: 'Réservations en pause — maintenance en cours.',
      sending: 'Envoi en cours…',
      submit: 'Envoyer la demande',
      errorCallout: 'En attendant, appelez-nous :',
    },
    estimate: {
      base: 'Base',
      hebergement: "Taxe d'hébergement",
      tps: 'TPS',
      tvq: 'TVQ',
      total: 'Total estimé',
    },
    availability: {
      unavailableTitle: 'Ces dates ne sont pas disponibles',
      error: 'Impossible de vérifier la disponibilité en ce moment. Votre demande sera examinée manuellement.',
    },
    success: {
      title: "C'est noté, %name%.",
      greeting: 'Merci, %name% !',
      body: 'Votre demande est enregistrée. Nous vous répondrons par courriel sous peu pour confirmer les détails de votre séjour.',
      nameFallback: 'là',
      urgentLabel: 'Une question pressante ?',
    },
    info: {
      coordonnees: 'Coordonnées',
      telephone: 'Téléphone',
      courriel: 'Courriel',
      horaires: 'Horaires',
    },
    hours: {
      checkIn: { label: 'Arrivée', value: 'dès 15 h' },
      checkOut: { label: 'Départ', value: 'avant 11 h' },
      reception: { label: 'Réception', value: '7 h – 22 h' },
    },
    strip: {
      text: 'Préférez-vous la voix ? Notre équipe répond du matin au soir.',
    },
    errors: {
      checkOutOrder: "La date de départ doit être postérieure à la date d'arrivée.",
      emailInvalid: 'Courriel invalide.',
      emailRequired: 'Le courriel est requis.',
      firstNameRequired: 'Le prénom est requis.',
      lastNameRequired: 'Le nom de famille est requis.',
      roomCountRequired: 'Au moins une chambre est requise.',
    },
  },

  politiques: {
    seo: {
      title: 'Politiques — Auberge du Vieux Pont',
      description:
        "Conditions de séjour, politiques d'annulation et règles de la maison à l'Auberge du Vieux Pont à Saint-Raymond.",
    },
    sectionLabel: "Politiques de l'établissement",
    heading: 'Les règles de la maison',
    lead: 'Claires et sans surprise. Conditions de séjour, accueil des équipes et respect mutuel.',
  },

  policies: {
    'P-01': {
      title: 'Arrivée et départ',
      items: {
        '0': 'Arrivée à partir de 15 h 00. Départ avant 11 h 00.',
        '1': 'Arrivée tardive possible sur préavis — boîte à clés sécurisée disponible.',
        '2': "Pièce d'identité avec photo exigée à l'enregistrement.",
      },
    },
    'P-02': {
      title: 'Équipement de travail',
      items: {
        '0': "L'équipement se range au local sécurisé, jamais dans les aires communes.",
        '1': "Salle de séchage à l'arrière pour vêtements et bottes de travail.",
        '2': "L'auberge n'est pas responsable de l'équipement laissé hors du local verrouillé.",
      },
    },
    'P-03': {
      title: 'Heures de repos',
      items: {
        '0': 'Heures de silence de 22 h 00 à 7 h 00, par respect pour les travailleurs de quart.',
        '1': 'Les chambres insonorisées restent un espace de repos en tout temps.',
      },
    },
    'P-04': {
      title: 'Annulation',
      items: {
        '0': "Annulation gratuite jusqu'à 48 h avant l'arrivée.",
        '1': 'Annulation tardive : première nuit facturée.',
        '2': "Tarifs entreprise : conditions selon l'entente contractuelle.",
      },
    },
    'P-05': {
      title: 'Animaux et chantiers',
      items: {
        '0': 'Animaux acceptés dans le Gîte Familial, sur réservation.',
        '1': "Bottes de travail et équipement boueux tolérés — c'est fait pour ça.",
      },
    },
  },

  profil: {
    seo: {
      title: 'Profil — Auberge du Vieux Pont',
    },
    loading: {
      ariaLabel: 'Chargement du profil…',
    },
    error: {
      label: 'ERREUR',
      backHome: '← Accueil',
    },
    roleLabel: 'Rôle',
    role: {
      admin: 'Administrateur',
      guest: 'Invité',
    },
    logout: {
      ariaLabel: 'Se déconnecter',
      text: 'Déconnexion',
    },
    info: {
      heading: 'Informations',
    },
    fields: {
      name: 'Nom',
      email: 'Courriel',
      role: 'Rôle',
      rate: 'Votre tarif',
    },
    rate: {
      unit: '$/nuit',
      customAriaLabel: 'Tarif personnalisé',
      custom: 'Tarif personnalisé',
    },
    admin: {
      link: 'Tableau de bord →',
    },
    reservations: {
      heading: 'Mes réservations',
    },
    reservations_aria: 'Vos réservations',
    col: {
      arrive: 'Arrivée',
      depart: 'Départ',
      people: 'Personnes',
      room: 'Chambre',
    },
    empty: 'Aucune réservation',
    password: {
      heading: 'Changer le mot de passe',
      current: 'Mot de passe actuel',
      new: 'Nouveau mot de passe',
      hint: '(8 caractères minimum)',
      errors: {
        tooShort: 'Le nouveau mot de passe doit contenir au moins 8 caractères.',
      },
      success: 'Mot de passe modifié avec succès.',
      submitAriaLabel: 'Modifier le mot de passe',
      submitting: 'Modification…',
      submit: 'Modifier le mot de passe',
    },
    email: {
      heading: "Changer l'adresse courriel",
      currentPrefix: 'Adresse actuelle : ',
      formAriaLabel: "Changer l'adresse courriel",
      new: 'Nouvelle adresse courriel',
      success:
        "Un lien de confirmation a été envoyé à votre nouvelle adresse — cliquez-le pour activer le changement.",
      submitAriaLabel: "Modifier l'adresse courriel",
      submitting: 'Modification…',
      submit: "Modifier l'adresse courriel",
    },
  },

  reinitialisation: {
    seo: {
      welcome: 'Créez votre espace client — Auberge du Vieux Pont',
      reset: 'Réinitialisation du mot de passe — Auberge du Vieux Pont',
    },
    sectionLabel: {
      welcome: 'Bienvenue',
      reset: 'Réinitialisation',
    },
    card: {
      tag: {
        welcome: 'BIENVENUE',
        reset: 'PASS-RESET',
      },
    },
    heading: {
      welcome: 'Bienvenue !',
      reset: 'Nouveau mot de passe',
    },
    subhead: {
      welcome: 'Choisissez votre mot de passe pour accéder à votre espace client.',
      reset: "Choisissez un mot de passe d'au moins 8 caractères.",
    },
    form: {
      ariaLabel: 'Formulaire de réinitialisation de mot de passe',
      newPassword: 'Nouveau mot de passe',
      hint: '8 caractères minimum',
      confirmPassword: 'Confirmer le mot de passe',
      submit: 'Réinitialiser le mot de passe',
      submitting: 'Envoi…',
    },
    errors: {
      short: 'Le mot de passe doit contenir au moins 8 caractères.',
      mismatch: 'Les mots de passe ne correspondent pas.',
      network: 'Connexion impossible. Veuillez réessayer.',
    },
    success: {
      heading: 'Mot de passe mis à jour',
      body: 'Votre mot de passe a été réinitialisé avec succès. Vous pouvez maintenant vous connecter avec vos nouveaux identifiants.',
      link: 'Se connecter',
    },
    error: {
      heading: 'Lien invalide ou expiré',
      body: "Ce lien de réinitialisation n'est plus valide ou a déjà été utilisé. Demandez un nouveau lien à un administrateur.",
      backLink: 'Retour à la connexion',
    },
  },

  verification: {
    seo: {
      title: 'Confirmation de votre adresse courriel — Auberge du Vieux Pont',
    },
    sectionLabel: 'Vérification',
    loading: {
      body: 'Confirmation de votre adresse courriel en cours…',
    },
    success: {
      heading: 'Adresse confirmée',
      body: {
        register:
          'Votre adresse courriel a été confirmée. Votre compte est maintenant activé et vous retrouvez vos réservations.',
        change:
          "Votre nouvelle adresse courriel%email% est maintenant active. Vous l'utiliserez désormais pour vous connecter.",
      },
      cta: 'Accéder à mon espace',
    },
    error: {
      heading: 'Lien invalide ou expiré',
      body: "Ce lien de confirmation n'est plus valide ou a déjà été utilisé. Connectez-vous pour demander un nouveau lien.",
      backLink: 'Retour à la connexion',
    },
  },
};

export type Messages = typeof fr;

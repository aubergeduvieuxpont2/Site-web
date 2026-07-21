/**
 * English (en) guest-facing message dictionary.
 * INV-key-parity: key set must stay identical to fr.ts.
 */
import type { Messages } from './fr.js';

export const en: Messages = {
  layout: {
    skip_link: 'Skip to main content',
  },

  nav: {
    home: 'Home',
    le_site: 'The property',
    a_propos: 'About',
    contact: 'Contact',
    lesite: 'The property',
    apropos: 'About',
    politiques: 'Policies',
    confidentialite: 'Privacy',
    connexion: 'Log in',
    profil: 'Profile',
    deconnexion: 'Log out',
    deconnexion_aria: 'Log out',
    reserver: 'Book',
    reserver_chambre: 'Book a room',
    open_menu: 'Open menu',
    close_menu: 'Close menu',
  },

  footer: {
    aria: 'Footer',
    nav_aria: 'Secondary navigation',
    phone_aria: 'Phone: %phone%',
    rights: 'All rights reserved.',
    links: {
      avis: 'Guest reviews',
      politiques: 'House rules',
      confidentialite: 'Privacy policy',
    },
  },

  accueil: {
    seo: {
      title: "Auberge du Vieux Pont — lodging for field workers",
      description:
        "Inn in Saint-Raymond (Portneuf) for field workers — forestry and hydroelectric sector. Soundproofed rooms, equipment storage, corporate rates, 30 min from job sites.",
    },
    hero: {
      heading: "Where field workers come to rest",
      sub: "A character inn for field workers — forestry and hydroelectric sector.",
      scroll: 'Scroll',
      cta: {
        reserver: 'Book',
        lesite: 'The property',
      },
    },
    stats: {
      ariaLabel: 'Key figures',
    },
    rooms: {
      sectionLabel: 'Rooms',
      heading: 'Spaces built for you',
      priceAriaLabel: 'Price per night',
      priceUnit: '/night',
      customBadge: 'Custom rate',
      seeAll: 'See all rooms',
    },
    amenities: {
      sectionLabel: 'The experience',
      heading: 'Built for people on the move',
      body: "The Auberge du Vieux Pont was designed for field workers. Secure storage, tool and radio charging, drying room — everything you need to drop your gear and leave rested.",
      imageAlt: "Interior of the Auberge du Vieux Pont",
      cta: 'Explore the property',
    },
    faq: {
      sectionLabel: 'Frequently asked questions',
      heading: 'Good to know before you book',
    },
    cta: {
      sectionLabel: 'Booking',
      heading: 'Plan your stay',
      body: "Groups, crews, shift workers — we have the room you need. Book directly by form, no middleman.",
      btn: 'Book now',
    },
  },

  stats: {
    '0': { suffix: ' min', label: 'from main forestry job sites' },
    '1': { label: 'year founded' },
    '2': { suffix: ' rooms', label: 'available for your crew' },
    '3': { suffix: ' h', label: 'secure storage' },
  },

  amenities: {
    'A-01': { title: 'Secure Storage' },
    'A-02': { title: 'Tool & Radio Charging' },
    'A-03': { title: 'Drying Room' },
    'A-04': { title: 'Self-serve Coffee' },
    'A-05': { title: 'Soundproofed Rooms' },
    'A-06': { title: 'Corporate Rates' },
    'A-07': { title: 'Shared Kitchen' },
    'A-08': { title: 'Near Job Sites' },
  },

  faq: {
    '0': {
      question: "Where is the Auberge du Vieux Pont located?",
      answer:
        "At 111 avenue Saint-Michel in Saint-Raymond, in the Portneuf region (Québec), on the banks of the Sainte-Anne River — about 30 minutes from the main forestry job sites in the area.",
    },
    '1': {
      question: "Do you offer corporate rates for crews?",
      answer:
        "Yes. We offer competitive contract arrangements for forestry and hydroelectric sector teams. Write to us at info@aubergeduvieuxpont.ca for a group rate.",
    },
    '2': {
      question: "Can we arrive late or stay for a night shift?",
      answer:
        "Yes. Our rooms are soundproofed and fitted with blackout curtains, designed for shift workers who need to sleep during the day.",
    },
    '3': {
      question: "Is there storage for equipment and tools?",
      answer:
        "Yes: a locked secure storage room, a charging station for cordless tools and radios, and a drying room for work clothes and boots.",
    },
    '4': {
      question: "What services are included and starting at what rate?",
      answer:
        "Rooms start at $89 per night. The shared kitchen, laundry, self-serve coffee and WiFi are all included.",
    },
  },

  apropos: {
    seo: {
      title: 'About — Auberge du Vieux Pont',
      description:
        "The Auberge du Vieux Pont in Saint-Raymond since 1972 — lodging designed for forestry and hydroelectric sector crews in Portneuf.",
    },
    heading: 'Built for those who never back down.',
    lead: "For half a century, the Auberge du Vieux Pont has housed workers, anglers and today's field crews. Same promise: honest rest, no frills.",
    intro: {
      sectionLabel: 'About · Est. 1972',
    },
    histoire: {
      sectionLabel: 'Where we come from',
      heading: 'A house planted on the riverbank.',
      p1: "It all starts near the old Tessier bridge, where the Sainte-Anne River carves its way through Portneuf rock. In 1972, the building opened its doors to house those who worked hard: loggers, site workers, anglers who came to test the cold water at dawn.",
      p2: "We never tried to impress. We tried to help. A clean bed, a hot meal, a solid roof when the day ended late and the next one started early. That became our reputation — and we haven't let it go since.",
      p3: "Over the years, the world changed boots. Forestry became mechanized and hydroelectric sector job sites spread across Portneuf. We added a work clothes drying room, charging stations for tools and radios, a reinforced secure storage room. But the spirit hasn't budged an inch.",
      image: {
        alt: 'The old Tessier bridge over the Sainte-Anne River in autumn',
        caption: 'Tessier Bridge, Saint-Raymond',
      },
    },
    quote: {
      text: "\"We don't sell luxury. We sell rest that holds up.\"",
      caption: 'The house · since 1972',
    },
    valeurs: {
      sectionLabel: 'Our principles',
      heading: 'Four principles that are non-negotiable.',
    },
    values: {
      '0': {
        title: 'Honest',
        text: "We say things as they are. No inflated promises, no hidden fees. The posted price is the price paid.",
      },
      '1': {
        title: 'Solid',
        text: "Built to last. Concrete floors, steel lockers, walls that take muddy boots without flinching.",
      },
      '2': {
        title: 'Accessible',
        text: "A flat rate for everyone. Comfort and rest for every worker, regardless of budget. Rest is not a reserved luxury.",
      },
      '3': {
        title: 'Rooted',
        text: "Saint-Raymond has been home since 1972. We know the river, the job sites and the people who work there.",
      },
    },
    ancrage: {
      sectionLabel: 'What we stand for',
      heading: 'Rooted in Saint-Raymond, feet in the river.',
      p1: "We're not a chain. We're a Portneuf inn, run by local people, a stone's throw from forestry job sites and hydroelectric network lines. The Sainte-Anne River flows under our windows; the main work sites are less than 30 minutes away.",
      p2: "That means advice worth something, schedules that fit real life, and the assurance that we understand what a long day on a job site means — real and exhausting.",
      image: {
        alt: 'The village of Saint-Raymond along the Sainte-Anne River',
        caption: 'Saint-Raymond · Portneuf',
      },
    },
    tags: {
      '0': 'Saint-Raymond',
      '1': 'Portneuf',
      '2': 'River view',
      '3': 'Forestry',
    },
    cta: {
      eyebrow: 'Visit',
      heading: 'Come see for yourself.',
      lead: "The best way to understand who we are is to walk through the door. Call us or write to us — we'll be waiting by the bridge.",
      link: 'Contact us',
      ariaLabel: 'Contact the inn',
      phoneAriaLabel: 'Call the inn',
    },
  },

  lesite: {
    seo: {
      title: 'The property — Auberge du Vieux Pont',
      description:
        "Explore the Auberge du Vieux Pont: soundproofed rooms, shared kitchen, laundry, drying room and common lounge, on the Sainte-Anne River in Saint-Raymond.",
    },
    inpageNav: {
      ariaLabel: 'On this page',
    },
    nav: {
      chambres: 'Rooms',
      attraits: 'Nearby',
      lieu: 'The location',
    },
    chambres: {
      sectionLabel: 'Accommodation',
      heading: 'Our spaces',
      ariaLabel: 'Property overview',
      intro:
        "Every space is calibrated for those who arrive covered in mud and leave rested. Rooms are assigned on arrival based on your crew's needs. Flat rate:",
      cta: 'Book your stay',
    },
    price: {
      unit: '$/night',
    },
    attraits: {
      sectionLabel: 'Nearby',
      heading: 'Around us',
    },
    lieu: {
      sectionLabel: 'The location',
      heading: 'An old bridge on the Sainte-Anne',
      p1: "Since 1972, the Auberge du Vieux Pont has overlooked the Sainte-Anne River in the heart of Saint-Raymond. Stone, wood, wrought iron — the materials speak for themselves. Close to the main forestry job sites and the Portneuf hydroelectric network lines.",
      p2: "A place calibrated for those who leave early and get back late, with concrete you can hose down.",
      image: {
        alt: "Exterior view of the Auberge du Vieux Pont on the Sainte-Anne River",
      },
      strip: {
        caption: 'The bridge and the Sainte-Anne · Saint-Raymond, Portneuf',
      },
      ctaBtn: 'Contact us',
    },
    cta: {
      sectionLabel: 'Booking',
      heading: 'Ready to book?',
      body: "Send us your request — we confirm within 24 h and adapt the accommodation to your crew size.",
      btn: 'Book now',
    },
  },

  areas: {
    'repas-cuisine': {
      label: 'Dining & Kitchen',
      blurb:
        "Full kitchen and shared dining area — enough to prepare a crew dinner or a lunch box before departure.",
      images: {
        dining: { alt: 'Common dining area with large wooden table', caption: 'Common dining room' },
        kitchen: { alt: 'Fully equipped shared kitchen', caption: 'Shared kitchen · open access' },
        'living-dining': { alt: 'Open space connecting the kitchen and dining area', caption: 'Open kitchen-dining area' },
      },
    },
    salon: {
      label: 'Lounge',
      blurb: 'A common lounge to decompress between shifts, radio and tools stowed in the cloakroom.',
      images: {
        lounge: { alt: 'Common lounge with armchairs and soft lighting', caption: 'Common lounge' },
      },
    },
    chambre: {
      label: 'Bedroom',
      blurb: 'Soundproofed rooms with blackout curtains — designed for those who sleep during the day.',
      images: {
        bedroom: { alt: 'Private room with queen bed and blackout curtains', caption: 'Standard room · soundproofed' },
      },
    },
    'salle-de-bain': {
      label: 'Bathroom',
      blurb: "Well-maintained bathrooms, calibrated for crew traffic at peak hours.",
      images: {
        'bathroom-1': { alt: 'Bathroom with shower and sink', caption: 'Bathroom · shower' },
        'bathroom-2': { alt: 'Bathroom with bathtub', caption: 'Bathroom · bathtub' },
        'bathroom-3': { alt: 'Compact washroom with sink', caption: 'Washroom' },
      },
    },
    buanderie: {
      label: 'Laundry',
      blurb: "Laundry room and drying area at the back for work clothes and boots.",
      images: {
        laundry: { alt: 'Laundry room with washer, dryer and drying space', caption: 'Laundry · drying room' },
      },
    },
    exterieur: {
      label: 'Exterior',
      blurb: "On the Sainte-Anne River, at the foot of the old bridge — stone, wood and wrought iron since 1972.",
      images: {
        'auberge-exterior': { alt: "Exterior view of the Auberge du Vieux Pont", caption: "The inn on the Sainte-Anne" },
        'auberge-porch': { alt: "Covered porch at the inn entrance", caption: "Entrance porch" },
        balcony: { alt: 'Private terrace overlooking the river', caption: 'Terrace · river view' },
        bridge: { alt: 'The old bridge spanning the Sainte-Anne River', caption: 'The old bridge · Saint-Raymond' },
        'village-river': { alt: 'The village of Saint-Raymond on the riverbank', caption: 'Saint-Raymond · Portneuf' },
      },
    },
  },

  attractions: {
    'T-01': {
      name: 'Grocery & Convenience Store',
      distance: '5 min walk',
      grade: 'Services',
      category: 'Services',
      text: 'Essential provisions and last-minute groceries in the heart of the village.',
    },
    'T-02': {
      name: 'Lafontaine Hardware',
      distance: '8 min walk',
      grade: 'Services',
      category: 'Services',
      text: "Tools, parts and supplies for equipment repairs and maintenance.",
    },
    'T-03': {
      name: 'Service Station',
      distance: '12 min',
      grade: 'Services',
      category: 'Services',
      text: 'Fuel and road services on the route to job sites.',
    },
    'T-04': {
      name: 'Restaurants & Snack Bars',
      distance: 'Various',
      grade: 'Services',
      category: 'Services',
      text: 'Meal options from a quick hot meal to crew-style packages in the area.',
    },
    'T-05': {
      name: 'Clinic & Pharmacy',
      distance: '10 min',
      grade: 'Services',
      category: 'Services',
      text: 'Medical and pharmaceutical services accessible when needed.',
    },
    'T-06': {
      name: 'Sainte-Anne River',
      distance: 'On site',
      grade: 'Rest',
      category: 'Rest',
      text: 'Rest and relaxation by the river on days off.',
    },
  },

  avis: {
    seo: {
      title: 'Guest reviews — Auberge du Vieux Pont',
      description: "Testimonials and guest reviews of the Auberge du Vieux Pont in Saint-Raymond.",
    },
    sectionLabel: 'Reviews',
    heading: 'Testimonials',
    label: 'See all reviews',
    average: {
      ariaLabel: 'Average rating: %rating% out of 5',
    },
    review: {
      singular: 'review',
      plural: 'reviews',
    },
    loading: {
      ariaLabel: 'Loading reviews…',
    },
    empty: {
      body: 'No reviews yet. Check back soon.',
    },
    card: {
      ariaLabel: "Review by %name%",
      ratingLabel: 'Rating: %rating% out of 5',
    },
    sejours: {
      singular: '%count% stay',
      plural: '%count% stays',
    },
    nuits: {
      singular: '%count% night',
      plural: '%count% nights',
    },
    stayOne: '1 stay',
    stayMany: '%n% stays',
    nightOne: '1 night',
    nightMany: '%n% nights',
    ratingAriaLabel: 'Rating: %rating% stars out of 5',
  },

  avisNouveau: {
    seo: {
      title: 'Leave a review — Auberge du Vieux Pont',
      description: "Share your experience at the Auberge du Vieux Pont in Saint-Raymond.",
    },
    sectionLabel: 'Leave a review',
    subtitle: 'Your experience matters.',
    title: {
      default: 'Leave a review',
      withName: "Review by %name%",
    },
    stars: {
      ariaLabel: 'Overall rating',
    },
    star: {
      ariaLabel: 'Star',
    },
    starLabel: {
      '1': 'Very poor',
      '2': 'Poor',
      '3': 'Average',
      '4': 'Good',
      '5': 'Excellent',
    },
    form: {
      ratingLabel: 'Your rating',
      bodyLabel: 'Your comment',
      bodyPlaceholder: 'Share your experience…',
      submit: 'Submit',
      submitting: 'Submitting…',
    },
    loading: {
      ariaLabel: 'Checking your eligibility…',
      text: 'Loading…',
    },
    ineligible: {
      heading: 'Review unavailable',
      body: "You must have stayed at the inn to leave a review.",
      cta: 'Book a stay',
    },
    success: {
      heading: 'Thank you for your review!',
      body: 'Your review has been submitted and will be published after verification.',
      cta: 'See reviews',
    },
    errors: {
      generic: 'An error occurred. Please try again.',
      network: 'Connection failed. Please try again.',
    },
  },

  confidentialite: {
    seo: {
      title: 'Privacy — Auberge du Vieux Pont',
      description:
        "Privacy policy of the Auberge du Vieux Pont: data collection, use and user rights.",
    },
    sectionLabel: 'Privacy',
    heading: 'Privacy policy',
    lead: 'Your personal data, its use and your rights.',
    closing: {
      title: 'Questions?',
      text: 'For any privacy-related questions, write to us at info@aubergeduvieuxpont.ca.',
    },
  },

  privacy: {
    'C-01': {
      title: 'Information collected',
      items: {
        '0': 'Name, contact details and booking information, solely to manage your stay.',
        '1': 'No resale or sharing for advertising purposes.',
      },
    },
    'C-02': {
      title: 'Use and retention',
      items: {
        '0': 'Your data is used to confirm the booking and meet our legal obligations.',
        '1': 'Retention limited to the period required by Quebec law.',
      },
    },
    'C-03': {
      title: 'Your rights',
      items: {
        '0': 'Access, correction or deletion on written request to the inn.',
        '1': 'For any questions: info@aubergeduvieuxpont.ca.',
      },
    },
  },

  connexion: {
    seo: {
      title: 'Log in — Auberge du Vieux Pont',
    },
    sectionLabel: 'Log in',
    heading: 'Guest area',
    lead: 'Access your reservations or create your account.',
    login: {
      formAriaLabel: 'Log in form',
      heading: 'Log in',
      submit: 'Log in',
      sending: 'Logging in…',
    },
    fields: {
      email: 'Email',
      emailPlaceholder: 'you@example.com',
      password: 'Password',
      passwordHint: 'Minimum 8 characters',
      firstName: 'First name',
      firstNamePlaceholder: 'Ada',
      lastName: 'Last name',
      lastNamePlaceholder: 'Lovelace',
      phone: 'Phone',
      phonePlaceholder: '+1 418 555-0100',
      optional: '(optional)',
      company: 'Employer / company',
      companyPlaceholder: 'Hydro-Québec',
    },
    errors: {
      invalidCredentials: 'Invalid credentials.',
      network: 'Connection failed. Please try again.',
      passwordTooShort: 'Password must be at least 8 characters.',
    },
    forgot: {
      trigger: 'Forgot your password?',
      regionAriaLabel: 'Password reset',
      formAriaLabel: 'Reset form',
      emailLabel: 'Your email address',
      submit: 'Send',
      sending: 'Sending…',
      successText:
        "If this address is associated with an account, an administrator will be able to send you a reset link.",
    },
    register: {
      formAriaLabel: "Sign-up form",
      heading: 'Create an account',
      submit: 'Create my account',
      sending: 'Creating…',
      successNotice:
        "A confirmation email has been sent to you — click the link to activate your account and access your reservations.",
    },
  },

  contact: {
    seo: {
      title: 'Contact — Auberge du Vieux Pont',
      description:
        "Contact the Auberge du Vieux Pont in Saint-Raymond: reservations, corporate rates and inquiries. Phone 418 655-1212.",
    },
    hero: {
      sectionLabel: 'Booking & contact',
      title: 'Write to us',
      lead: "Send your booking request or questions. We reply to every message; for an immediate response, call us.",
    },
    form: {
      sectionLabel: 'Booking request',
      desc: "Fields marked with an asterisk are required. Dates and number of people help us prepare your arrival.",
      identityLabel: 'Booking under the name of',
      firstName: 'First name',
      lastName: 'Last name',
      email: 'Email',
      checkIn: "Check-in date",
      checkOut: 'Check-out date',
      guests: 'Number of guests',
      roomCount: 'Number of rooms',
      message: 'Message',
      messagePlaceholder: 'Special requests, schedules, specific needs…',
      rateLabel: 'Rate',
      rateUnit: '/night',
      customRateBadge: 'Custom rate',
      customRateAriaLabel: 'Custom rate applied',
      weeklyRateLabel: 'Weekly rate active',
      weeklyRateUnit: '/week',
      maintenanceNotice: 'Reservations are temporarily suspended. Please try again soon.',
      sending: 'Sending…',
      submit: 'Send request',
      errorCallout: 'In the meantime, call us:',
    },
    estimate: {
      base: 'Base',
      hebergement: 'Accommodation tax',
      tps: 'GST',
      tvq: 'QST',
      total: 'Estimated total',
    },
    availability: {
      unavailableTitle: 'These dates are not available',
      error: 'Unable to check availability right now. Your request will be reviewed manually.',
    },
    success: {
      title: "Got it, %name%.",
      greeting: 'Thank you, %name%!',
      body: 'Your request has been received. We will reply by email shortly to confirm your stay details.',
      nameFallback: 'there',
      urgentLabel: 'Urgent question?',
    },
    info: {
      coordonnees: 'Contact info',
      telephone: 'Phone',
      courriel: 'Email',
      horaires: 'Hours',
    },
    hours: {
      checkIn: { label: 'Check-in', value: 'from 3:00 PM' },
      checkOut: { label: 'Check-out', value: 'before 11:00 AM' },
      reception: { label: 'Reception', value: '7 AM – 10 PM' },
    },
    strip: {
      text: 'Prefer to talk? Our team is available morning to evening.',
    },
    errors: {
      checkOutOrder: "Check-out date must be after check-in date.",
      emailInvalid: 'Invalid email address.',
      emailRequired: 'Email is required.',
      firstNameRequired: 'First name is required.',
      lastNameRequired: 'Last name is required.',
      roomCountRequired: 'At least one room is required.',
    },
  },

  politiques: {
    seo: {
      title: 'Policies — Auberge du Vieux Pont',
      description:
        "Stay conditions, cancellation policies and house rules at the Auberge du Vieux Pont in Saint-Raymond.",
    },
    sectionLabel: 'House rules',
    heading: 'House rules',
    lead: 'Clear and no surprises. Stay conditions, crew accommodation and mutual respect.',
  },

  policies: {
    'P-01': {
      title: 'Check-in and check-out',
      items: {
        '0': 'Check-in from 3:00 PM. Check-out before 11:00 AM.',
        '1': 'Late check-in possible with advance notice — secure key box available.',
        '2': "Photo ID required at check-in.",
      },
    },
    'P-02': {
      title: 'Work equipment',
      items: {
        '0': "Equipment goes in the secure storage room, never in common areas.",
        '1': "Drying room at the back for work clothes and boots.",
        '2': "The inn is not responsible for equipment left outside the locked storage room.",
      },
    },
    'P-03': {
      title: 'Rest hours',
      items: {
        '0': 'Quiet hours from 10:00 PM to 7:00 AM, out of respect for shift workers.',
        '1': 'Soundproofed rooms remain a rest space at all times.',
      },
    },
    'P-04': {
      title: 'Cancellation',
      items: {
        '0': "Free cancellation up to 48 h before arrival.",
        '1': 'Late cancellation: first night charged.',
        '2': "Corporate rates: conditions per contract agreement.",
      },
    },
    'P-05': {
      title: 'Pets and job sites',
      items: {
        '0': 'Pets accepted in the Gîte Familial, on reservation.',
        '1': "Work boots and muddy equipment tolerated — that's what we're here for.",
      },
    },
  },

  profil: {
    seo: {
      title: 'Profile — Auberge du Vieux Pont',
    },
    loading: {
      ariaLabel: 'Loading profile…',
    },
    error: {
      label: 'ERROR',
      backHome: '← Home',
    },
    roleLabel: 'Role',
    role: {
      admin: 'Administrator',
      guest: 'Guest',
    },
    logout: {
      ariaLabel: 'Log out',
      text: 'Log out',
    },
    info: {
      heading: 'Information',
    },
    fields: {
      name: 'Name',
      email: 'Email',
      role: 'Role',
      rate: 'Your rate',
    },
    rate: {
      unit: '$/night',
      customAriaLabel: 'Custom rate',
      custom: 'Custom rate',
    },
    admin: {
      link: 'Dashboard →',
    },
    reservations: {
      heading: 'My reservations',
    },
    reservations_aria: 'Your reservations',
    col: {
      arrive: 'Check-in',
      depart: 'Check-out',
      people: 'Guests',
      room: 'Room',
    },
    empty: 'No reservations',
    password: {
      heading: 'Change password',
      current: 'Current password',
      new: 'New password',
      hint: '(minimum 8 characters)',
      errors: {
        tooShort: 'New password must be at least 8 characters.',
      },
      success: 'Password changed successfully.',
      submitAriaLabel: 'Change password',
      submitting: 'Changing…',
      submit: 'Change password',
    },
    email: {
      heading: "Change email address",
      currentPrefix: 'Current address: ',
      formAriaLabel: "Change email address",
      new: 'New email address',
      success:
        "A confirmation link has been sent to your new address — click it to activate the change.",
      submitAriaLabel: "Change email address",
      submitting: 'Changing…',
      submit: "Change email address",
    },
  },

  reinitialisation: {
    seo: {
      welcome: 'Create your guest account — Auberge du Vieux Pont',
      reset: 'Password reset — Auberge du Vieux Pont',
    },
    sectionLabel: {
      welcome: 'Welcome',
      reset: 'Reset',
    },
    card: {
      tag: {
        welcome: 'WELCOME',
        reset: 'PASS-RESET',
      },
    },
    heading: {
      welcome: 'Welcome!',
      reset: 'New password',
    },
    subhead: {
      welcome: 'Choose your password to access your guest area.',
      reset: "Choose a password of at least 8 characters.",
    },
    form: {
      ariaLabel: 'Password reset form',
      newPassword: 'New password',
      hint: 'Minimum 8 characters',
      confirmPassword: 'Confirm password',
      submit: 'Reset password',
      submitting: 'Sending…',
    },
    errors: {
      short: 'Password must be at least 8 characters.',
      mismatch: 'Passwords do not match.',
      network: 'Connection failed. Please try again.',
    },
    success: {
      heading: 'Password updated',
      body: 'Your password has been reset successfully. You can now log in with your new credentials.',
      link: 'Log in',
    },
    error: {
      heading: 'Invalid or expired link',
      body: "This reset link is no longer valid or has already been used. Ask an administrator for a new link.",
      backLink: 'Back to login',
    },
  },

  verification: {
    seo: {
      title: 'Email address confirmation — Auberge du Vieux Pont',
    },
    sectionLabel: 'Verification',
    loading: {
      body: 'Confirming your email address…',
    },
    success: {
      heading: 'Address confirmed',
      body: {
        register:
          'Your email address has been confirmed. Your account is now active and you can access your reservations.',
        change:
          "Your new email address%email% is now active. You will use it to log in from now on.",
      },
      cta: 'Access my area',
    },
    error: {
      heading: 'Invalid or expired link',
      body: "This confirmation link is no longer valid or has already been used. Log in to request a new link.",
      backLink: 'Back to login',
    },
  },
};

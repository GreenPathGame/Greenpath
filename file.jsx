import React, { useMemo, useState, useEffect, useRef, useContext, useCallback, createContext } from "react";
import { translate, LANGUAGE_META } from "./i18n.js";
import NatureScene, { NATURE_SCENE_CSS } from "./NatureScene.jsx";
import trGr from "./translations/gr.js";
import trIt from "./translations/it.js";
import trRo from "./translations/ro.js";
import trCz from "./translations/cz.js";
import { auth, db } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  onAuthStateChanged,
  signOut,
  deleteUser,
} from "firebase/auth";
import { doc, getDoc, setDoc } from "firebase/firestore";

/* ═══════════════════════════════════════════════════
   ASSET PATH HELPER
   Computes the correct base folder from the page's own
   current URL at runtime, so images resolve correctly
   no matter what subpath the app is served from (and
   regardless of trailing-slash quirks / redirects).
═══════════════════════════════════════════════════ */
const ASSET_BASE = (() => {
  if (typeof window === "undefined") return "";
  const p = window.location.pathname;
  return p.endsWith("/") ? p : p.slice(0, p.lastIndexOf("/") + 1);
})();
function asset(name) { return ASSET_BASE + name; }

/* ═══════════════════════════════════════════════════
   RESPONSIVE HELPER
   "Mobile" = the stacked (one column) quiz layout. Used on
   phones and on portrait tablets, where a side-by-side layout
   would squeeze the question into a narrow, small-text column.
═══════════════════════════════════════════════════ */
const MOBILE_BREAKPOINT = 640;
const PORTRAIT_TABLET_MAX = 1024;
function isStackedLayout() {
  if (typeof window === "undefined") return false;
  const w = window.innerWidth, h = window.innerHeight;
  return w <= MOBILE_BREAKPOINT || (w <= PORTRAIT_TABLET_MAX && h > w);
}
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(isStackedLayout);
  useEffect(() => {
    const onResize = () => setIsMobile(isStackedLayout());
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return isMobile;
}

/* ═══════════════════════════════════════════════════
   LANGUAGE / TRANSLATION HELPERS
   The selected language id flows down through context;
   components call t("key") for UI text, and modules and
   questions are localized just before they're rendered
   (English in this file is the source of truth and the
   fallback for anything missing).
═══════════════════════════════════════════════════ */
const LangCtx = createContext("en");
function useT() {
  const lang = useContext(LangCtx);
  return useCallback((key, vars) => translate(lang, key, vars), [lang]);
}
const CONTENT_TR = { gr: trGr, it: trIt, ro: trRo, cz: trCz };
function localizeModule(mod, lang) {
  const tr = CONTENT_TR[lang]?.modules?.[mod.id];
  return tr ? { ...mod, ...tr } : mod;
}
function localizeQuestion(q, lang) {
  const tr = CONTENT_TR[lang]?.questions?.[q.id];
  if (!tr) return q;
  return {
    ...q,
    text: tr.text ?? q.text,
    explanation: tr.explanation ?? q.explanation,
    options: tr.options?.length === q.options.length ? tr.options : q.options,
  };
}
const LANG_STORAGE_KEY = "greenpath.lang";
function initialLanguageId() {
  try {
    const saved = localStorage.getItem(LANG_STORAGE_KEY);
    if (saved && LANGUAGE_META[saved]) return saved;
  } catch { /* storage unavailable */ }
  const nav = (typeof navigator !== "undefined" && navigator.language || "en").slice(0, 2).toLowerCase();
  const byHtml = Object.entries(LANGUAGE_META).find(([, m]) => m.htmlLang === nav);
  return byHtml ? byHtml[0] : "en";
}
function rememberLanguage(id) {
  try { localStorage.setItem(LANG_STORAGE_KEY, id); } catch { /* storage unavailable */ }
}

/* ═══════════════════════════════════════════════════
   ACCOUNTS: Firebase Auth + Firestore, so a username is
   unique across every device, not just one browser. Auth
   needs an email, so usernames are mapped to a fake
   "@gardenquest.local" address under the hood; the UI
   only ever shows the username.
═══════════════════════════════════════════════════ */
const USERNAME_RE = /^[a-z0-9_.-]{3,20}$/;
// Limits match firestore.rules, so nothing the form accepts is refused by the database.
const FULLNAME_MAX = 60;
const PASSWORD_MIN = 6, PASSWORD_MAX = 128;
// Trims, removes invisible control characters and collapses runs of spaces.
function cleanFullName(raw) {
  // eslint-disable-next-line no-control-regex -- removing control characters is the point
  return raw.replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069]/g, "").replace(/\s+/g, " ").trim();
}
function usernameToEmail(username) { return `${username}@gardenquest.local`; }

// Returns an i18n key (see i18n.js), translated where it's shown.
function friendlyAuthError(err) {
  switch (err?.code) {
    case "auth/email-already-in-use": return "auth.errTaken";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found": return "auth.errIncorrect";
    case "auth/weak-password": return "auth.errPassword";
    case "auth/network-request-failed": return "auth.errNetwork";
    case "auth/too-many-requests": return "auth.errTooMany";
    case "auth/invalid-email": return "auth.errUsername";
    default: return "auth.errGeneric";
  }
}

async function registerUser(username, password, fullName) {
  const cred = await createUserWithEmailAndPassword(auth, usernameToEmail(username), password);
  try {
    await updateProfile(cred.user, { displayName: fullName });
    await setDoc(doc(db, "users", cred.user.uid), { username, fullName, progress: null });
  } catch (err) {
    // Don't leave a half-made account behind (it would block the username forever).
    await deleteUser(cred.user).catch(()=>{});
    throw err;
  }
  return { uid: cred.user.uid, username, fullName, progress: null };
}

async function loginUser(username, password) {
  const cred = await signInWithEmailAndPassword(auth, usernameToEmail(username), password);
  const record = await fetchUserRecord(cred.user.uid);
  return {
    uid: cred.user.uid,
    username,
    fullName: record?.fullName || cred.user.displayName || username,
    progress: record?.progress || null,
  };
}

async function fetchUserRecord(uid) {
  const snap = await getDoc(doc(db, "users", uid));
  return snap.exists() ? snap.data() : null;
}

async function saveProgress(uid, progress) {
  await setDoc(doc(db, "users", uid), { progress }, { merge: true });
}

function logoutUser() { return signOut(auth); }

/* ═══════════════════════════════════════════════════
   DATA
═══════════════════════════════════════════════════ */
// `label` is each language's own name, so players can always find theirs.
const LANGUAGES = [
  { id: "en", label: LANGUAGE_META.en.native, flag: "🇬🇧", color: "#8b5cf6" },
  { id: "gr", label: LANGUAGE_META.gr.native, flag: "🇬🇷", color: "#3b82f6" },
  { id: "it", label: LANGUAGE_META.it.native, flag: "🇮🇹", color: "#22c55e" },
  { id: "ro", label: LANGUAGE_META.ro.native, flag: "🇷🇴", color: "#f59e0b" },
  { id: "cz", label: LANGUAGE_META.cz.native, flag: "🇨🇿", color: "#ef4444" },
];

const CHARACTERS = [
  { id:"Manos", name:"Manos", culture:"Greek",    color:"#3b82f6",
    idle:asset("Manos.png"), happy:asset("happy_Manos.png"), sad:asset("sad_Manos.png"),
    bubble:{ idle:"Let's learn together!", happy:"Yay! Correct!", sad:"Try again!" } },
  { id:"Roxana",  name:"Roxana",  culture:"Romanian", color:"#f59e0b",
    idle:asset("Roxana.png"),  happy:asset("happy_Roxana.png"),  sad:asset("sad_Roxana.png"),
    bubble:{ idle:"Ready to learn?", happy:"Amazing!", sad:"Next one!" } },
  { id:"Rino", name:"Rino", culture:"Italian",  color:"#22c55e",
    idle:asset("Rino.png"), happy:asset("happy_Rino.png"), sad:asset("sad_Rino.png"),
    bubble:{ idle:"Let's make it fun!", happy:"Bravooo!", sad:"Keep going!" } },
  { id:"Jana",  name:"Jana",  culture:"Czech",    color:"#ef4444",
    idle:asset("Jana.png"),  happy:asset("happy_Jana.png"),  sad:asset("sad_Jana.png"),
    bubble:{ idle:"Let's study together!", happy:"Great job!", sad:"Continue!" } },
];


const MODULES = [
  // Topics 1-2 on the list: CZ Practice 1 (Forest-inspired edible wildlife gardens) + CZ Practice 2 (Traditional Seeds)
  {
    id: 1,
    title: "Wildlife Gardens",
    icon: "🌍",
    color: "#f59e0b",
    info: "Wildlife gardens are natural or semi-natural spaces where edible plants grow in harmony with local ecosystems, mimicking the layers and biodiversity of a forest with minimal human intervention. Traditional seeds are the hidden power behind these gardens saving, exchanging, and growing diverse local varieties preserves cultural heritage and strengthens climate resilience for generations to come.",
    // "DID YOU KNOW (GAME FACTS)" from the CZ info papers (Practice 1 + 2)
    facts: [
      "Local food reduces transport emissions significantly.",
      "Trees, shrubs, and perennial plants help retain water and reduce drought impacts.",
      "One seed can produce hundreds of new seeds in a single growing season.",
      "Growing diverse local plants supports pollinators such as bees, butterflies, and other beneficial insects.",
      "Biodiverse gardens with local trees, shrubs, and perennials are more resilient to climate change.",
      "Traditional seeds help preserve biodiversity and local food heritage.",
      "Saving local seeds supports climate-resilient agriculture and future food security.",
      "Exchanging seeds between gardeners and farmers has helped preserve traditional crops for generations.",
      "Many traditional seed varieties are naturally adapted to local climates and require fewer chemical inputs.",
      "Many Carpathian and Mediterranean plant varieties have been cultivated and passed down for hundreds of years.",
    ],
  },
  // Topics 3 & 7 on the list: IT Practice 1 (Handmade Sustainable Greenhouses) + IT Practice 2 (biological control against the Woolly aphid)
  // Title/icon/info confirmed against the manager's official info papers ("THEMATIC AREA: Seasonal agriculture
  // & Climate Resilience" / "MODULE TOPIC: Traditional agricultural practices and agroecology"): this used to
  // incorrectly say "Native Pollinators & Wildflowers"; swapped with Module 7 below, which had this title.
  {
    id: 2,
    title: "Traditional Agricultural Practices, Organic Gardening, Farming, and Agroecology",
    icon: "💧",
    color: "#06b6d4",
    info: "Sustainable mini-greenhouses (tunnel, hydroponic, passive solar or vertical) protect plants from cold, wind, rain and climate stress, helping grow food locally with low-impact materials. Integrated and biological pest control, such as encouraging ladybirds, lacewings and parasitoid wasps, manages pests like the woolly aphid (Eriosoma lanigerum) without relying mainly on chemical pesticides.",
    // "DID YOU KNOW (GAME FACTS)" from IT (TalentWay) Info Papers 1 + 2
    facts: [
      "Small-scale growing can reduce dependence on long-distance transport.",
      "Reused materials can make greenhouse systems cheaper and more sustainable.",
      "Vertical and hydroponic systems are useful where land or water is limited.",
      "Eriosoma lanigerum looks like small white cotton-like clusters on branches and leaves.",
      "Eriosoma lanigerum weakens trees by feeding on plant sap.",
      "Ladybirds, lacewings and parasitoid wasps can help control aphids naturally.",
    ],
  },
  // Topics 5-6 on the list: RO Practice 2 (Companion planting) + RO Practice 1 (Homemade natural pest control)
  {
    id: 3,
    title: "Organic Pest Control and Companion Planting",
    icon: "🌿",
    color: "#22c55e",
    info: "Homemade natural pest control uses plant-based preparations and natural ingredients such as garlic, nettles, chili peppers, or soap solutions to manage garden pests without synthetic chemicals. These methods are environmentally friendly, affordable, biodegradable, and help protect beneficial insects while supporting sustainable and organic gardening practices. Companion planting adds to this by pairing crops that protect each other: marigolds, basil, lavender, chives, garlic and nasturtiums repel unwanted insects, and classic combinations such as tomatoes with basil, carrots with onions and corn with beans improve resilience and productivity.",
    // "DID YOU KNOW (GAME FACTS)" from RO (Phoenix) Info Paper 1 + 2
    facts: [
      "In the Carpathian region, a nettle solution is used to repel aphids.",
      "In the Mediterranean regions, a garlic-based solution is used to repel aphids.",
      "In both the Carpathian and Mediterranean regions, a soft soap solution is used to repel aphids.",
      "Gardeners in both regions attract ladybugs and lacewings, natural enemies of aphids, by planting flowering herbs such as dill, fennel, coriander and yarrow.",
      "Maize, beans and pumpkins grow well together: maize supports the climbing beans, beans enrich the soil with nitrogen, and pumpkins cover the soil, reducing evaporation and weeds (Romania).",
      "Garlic or onions planted near carrots and cabbage deter carrot flies, cabbage pests and aphids with their strong scent (Romania, Czech Republic).",
      "Basil planted with tomatoes helps repel whiteflies and thrips, attracts pollinators and may improve tomato growth (Italy, Greece).",
      "In Greek olive groves, lavender, rosemary and thyme attract beneficial insects, conserve soil moisture and reduce erosion in hot, dry conditions.",
    ],
  },
  // Topics 8 & 11 on the list: GR clay pot crafting + stitching reusable bags from old fabrics
  {
    id: 4,
    title: "Reusable Alternatives for a Plastic-Free Kitchen",
    icon: "🌱",
    color: "#10b981",
    info: "Clay pot crafting revives the ancient art of shaping terracotta vessels for food storage durable, breathable containers for grains, legumes and pickles that keep food fresh for longer without a single scrap of plastic. Old clothes and linen scraps get a second life too, stitched into sturdy reusable bags for shopping, produce and bread reviving traditional sewing skills while replacing single-use plastic.",
    // "DID YOU KNOW (GAME FACTS)" from the GR Plastic-Free Kitchen info papers
    facts: [
      "In Maramureș, Romania, potters still craft clay jars for pickles and legumes.",
      "Clay's tiny pores let food breathe, slowing spoilage.",
      "In Greece, kitchen textiles were once handwoven and given as dowry gifts.",
      "Folk schools in Iași, Romania, turn fabric scraps into reusable kitchen cloths.",
      "Terracotta storage jars have been used around the Mediterranean for over 6,000 years.",
      "A single plastic bag can take up to 1,000 years to break down in landfill.",
    ],
  },
  // Topic 9 on the list: GR Traditional food pickling, sun-drying, and oil-based methods
  {
    id: 5,
    title: "Reducing Food Waste",
    icon: "🦋",
    color: "#3b82f6",
    info: "Traditional pickling, sun-drying and oil-based methods preserve seasonal produce without refrigeration vegetables are brined or soaked in vinegar, fruit and herbs are dried in the sun, and olives are stored in oil, saving surplus harvests from waste. These heritage skills need only glass jars, salt, vinegar, oil and plenty of sunshine, and they save the constant electricity that fridges and freezers consume.",
    // "DID YOU KNOW (GAME FACTS)" from the GR Reducing Food Waste info paper (Practice 1)
    facts: [
      "In Santorini, cherry tomatoes and capers are still sun-dried by youth cooperatives.",
      "Olives, herbs and vegetables keep for months stored in brine, vinegar or olive oil.",
      "Europe wastes around 88 million tonnes of food every year.",
    ],
  },
  // Topic 10 on the list: GR Making kitchen cleaners from citrus peels and vinegar
  // Title now follows the info paper's practice name (it used to read "Cultural Exchange and Culinary
  // Traditions", which is a thematic area, not this topic).
  {
    id: 6,
    title: "Kitchen Cleaners from Citrus Peels and Vinegar",
    icon: "🍋",
    color: "#8b5cf6",
    info: "Making kitchen cleaners from citrus peels and vinegar revives the age-old Mediterranean and Carpathian practice of using food scraps as powerful household cleaning agents. By infusing lemon, orange or grapefruit peels in white vinegar, a natural all-purpose cleaner is produced free of synthetic chemicals, plastic packaging and added cost.",
    // "DID YOU KNOW (GAME FACTS)" from the GR Reducing Food Waste info paper (Practice 2)
    facts: [
      "In traditional Greek kitchens, leftover lemon peels were turned into cleaning agents.",
      "Citrus peel steeped in vinegar for about two weeks makes a natural, all-purpose surface cleaner.",
      "A Cretan saying prizes knowing the worth of a tomato skin and a lemon peel.",
    ],
  },
  // Topic 4 on the list (CZ Practice LTTA Romania - Water Irrigation / Greywater Reuse) is merged into this
  // module. Its packaging/greenwashing content isn't one of the 11 listed topics. Title below is a best-effort
  // placeholder covering both sub-topics: not confirmed by the manager yet; worth double-checking with her.
  {
    id: 7,
    title: "Sustainable Packaging & Water Reuse",
    icon: "♻️",
    color: "#0ea5e9",
    info: "Sustainable packaging protects food, reduces waste and limits environmental impact, but not every “green” claim on it is reliable; official certifications matter more than colourful marketing. Reusing appropriately treated greywater (wastewater from showers, sinks, baths and laundry) for suitable non-drinking purposes like toilet flushing is another simple way to cut a household's environmental footprint.",
    // First four: "DID YOU KNOW (GAME FACTS)" from IT (TalentWay) Info Paper 3; the last restates the LTTA Romania explanations.
    facts: [
      "Not every “green” claim is true.",
      "Official certifications are more reliable than marketing words.",
      "The Green Dot does not always mean recyclable packaging.",
      "Smart packaging can reduce waste, damage and pollution.",
      "Greywater from washing, bathing and sinks can be treated and reused for non-drinking purposes such as toilet flushing.",
    ],
  },
  // RO info papers 3 + 4 (Institutul Postliceal "Phoenix"): Seasonal and Mindful Cooking: Preserving Cultural
  // Heritage. Replaces the earlier AI-drafted "Seasonal & Local Eating" placeholder, which had no source material.
  {
    id: 8,
    title: "Seasonal and Mindful Cooking: Preserving Cultural Heritage",
    icon: "🥫",
    color: "#ec4899",
    info: "Ancestral preserving techniques turn seasonal harvests into food for the winter. Romanian silvoița is a sugar-free plum jam, slow-boiled with the skins until thick and poured hot into sterilised jars; zacusca is a spread of roasted eggplants and peppers, onions, tomato juice and spices, simmered slowly and sealed in jars. Using local surplus and reusable jars cuts transport emissions, packaging and food waste.",
    // "DID YOU KNOW (GAME FACTS)" from RO info papers 3 + 4
    facts: [
      "In the Czech Republic, a similar slow-cooking technique is used to make švestková povidla (plum butter).",
      "In Mediterranean regions, grape must is slowly boiled into a thick, sweet syrup without added sugar.",
      "In Greece, melitzanosalata is a paste of baked eggplant, garlic, olive oil, lemon or vinegar and herbs.",
      "In Italy, Sicilian caponata slow-cooks eggplant, tomatoes, onions, peppers, celery, olives and capers.",
      "In the Czech Republic, the closest traditional product to zacusca is lečo, a stew-like vegetable dish preserved for the winter.",
    ],
  },
  // LTTA Italy info paper: From Herbs to Traditional Products
  {
    id: 9,
    title: "From Herbs to Traditional Products",
    icon: "🌼",
    color: "#a855f7",
    info: "Wild and garden herbs can be turned into teas, remedies and other traditional products. Sustainable harvesting means collecting only small amounts from abundant plants, using the right parts of each species, and drying herbs properly before storing them in clean, closed and labelled jars, so that plants keep growing for future generations.",
    // Restates the explanations in the LTTA Italy info paper
    facts: [
      "Collecting only small amounts from abundant plant populations lets herbs keep growing and reproducing.",
      "Depending on the species, leaves, flowers, seeds, roots or stems may be collected.",
      "Dried herbs keep their aroma longest in tightly closed, labelled glass jars stored somewhere cool, dry and dark.",
    ],
  },
  // Info Paper 4 (TalentWay, Italy): module topic "Eating with the Seasons: Local Ingredients and
  // Seasonal Recipes"; the paper's one practice is "Understanding compost pH".
  {
    id: 10,
    title: "Eating with the Seasons: Understanding Compost pH",
    icon: "🧪",
    color: "#84cc16",
    info: "Compost pH shows whether a compost extract is acidic, neutral or alkaline. Testing a sieved sample mixed with distilled water helps growers judge whether a compost suits their soil and plants, use nutrients better, avoid wasted inputs and return local organic residues to the garden instead of throwing them away.",
    // "DID YOU KNOW (GAME FACTS)" from Info Paper 4
    facts: [
      "pH 7 is neutral; values below 7 are acidic and values above 7 are alkaline.",
      "A change of one pH unit represents a tenfold change in acidity.",
      "The workshop test uses 10 g of sieved compost mixed with 50 mL of distilled water.",
    ],
  },
];

const QUESTIONS = [
  // MODULE 1: topics 1-2: CZ Forest-inspired edible wildlife gardens / Traditional Seeds
  {
    id: 5,
    module: 1,
    text: "What makes a garden more resilient to climate change?",
    options: ["One type of plant grown in rows.", "A biodiverse garden with trees, shrubs, flowers, herbs, and ground-cover plants.", "A concrete yard with decorative plants in pots."],
    answer: 1,
    explanation: "Diverse gardens are more resilient because they retain water, support wildlife, and adapt better to climate change."
  },
  {
    id: 6,
    module: 1,
    text: "Which choice helps reduce food transport emissions?",
    options: ["Imported packaged food", "Food grown in a local edible wildlife garden"],
    images: [asset("Garden1.png"), asset("Garden2.png")],
    answer: 1,
    explanation: "Local food travels shorter distances, reducing emissions, packaging waste, and energy use. Local food systems also support biodiversity and sustainable communities."
  },
  {
    id: 7,
    module: 1,
    text: "Which plant is most likely to improve soil naturally by fixing nitrogen?",
    options: ["Cherry", "Apple", "Pea"],
    answer: 2,
    explanation: "Peas belong to the legume family and naturally enrich the soil with nitrogen through beneficial bacteria living in their roots. This improves soil fertility, supports the growth of other plants, and reduces the need for chemical fertilisers."
  },
  {
    id: 16,
    module: 1,
    text: "Which garden has the greatest seed diversity?",
    options: ["A colourful garden with many different plants", "A large field growing only one crop", "A decorative lawn with no edible plants."],
    images: [asset("SeedDiversity1.png"), asset("SeedDiversity2.png"), asset("SeedDiversity3.png")],
    answer: 0,
    explanation: "A diverse garden provides a wide variety of food and seeds while preserving biodiversity, supporting pollinators and wildlife, and helping gardens better adapt to drought, pests, and climate change."
  },

  // MODULE 2: topics 3 & 7: IT Handmade Sustainable Greenhouses / biological control against the Woolly aphid
  {
    id: 23,
    module: 2,
    text: "Which mini-greenhouse grows plants without soil?",
    options: ["Tunnel greenhouse", "Vertical greenhouse", "Passive solar greenhouse", "Hydroponic greenhouse"],
    answer: 3,
    explanation: "Hydroponic greenhouses grow plants without soil. They use water and nutrients to support plant growth. This system can help save water and resources."
  },
  {
    id: 24,
    module: 2,
    text: "Is it TRUE OR FALSE that vertical greenhouses are useful in cities and small spaces.",
    options: ["True", "False"],
    answer: 0,
    explanation: "Vertical greenhouses are useful when space is limited. They allow plants to grow upwards instead of spreading horizontally. This makes them suitable for cities, schools and small areas."
  },
  {
    id: 26,
    module: 2,
    text: "What does Eriosoma lanigerum look like on trees?",
    options: ["Black spots on fruit", "Yellow dry leaves", "White cotton-like clusters", "Red marks on roots"],
    images: [asset("fruits.png"), asset("leaves.png"), asset("cotton.png"), asset("roots.png")],
    answer: 2,
    explanation: "Eriosoma lanigerum appears as small white cotton-like clusters. These clusters can be found on branches and leaves. Recognising them early helps detect infestations."
  },
  {
    id: 27,
    module: 2,
    text: "Is it TRUE OR FALSE that biological control uses beneficial insects to reduce pest populations.",
    options: ["True", "False"],
    answer: 0,
    explanation: "Biological control uses natural enemies of pests. Ladybirds, lacewings and parasitoid wasps can reduce aphid populations. This helps protect crops without relying mainly on chemicals."
  },

  // MODULE 3: topics 5-6: RO Companion planting / Homemade natural solutions to control plant pests
  {
    id: 1,
    module: 3,
    text: "Which of the following substances in our kitchen can help us eliminate pests in the garden?",
    options: ["Soap", "Sugar", "Flour", "Pepper"],
    answer: 0,
    explanation: "In both the Carpathian and Mediterranean regions, a soft soap solution is used to repel aphids, while nettle and garlic solutions serve the same purpose in other areas."
  },
  {
    id: 2,
    module: 3,
    text: "Is it TRUE OR FALSE that homemade natural pest-control methods completely replace chemical pesticides?",
    options: ["True", "False"],
    answer: 1,
    explanation: "Homemade natural pest control uses plant-based preparations and natural ingredients like garlic, nettles, and soap solutions instead of synthetic chemicals. It's affordable and biodegradable, but it supports sustainable gardening alongside other practices rather than replacing every chemical intervention outright."
  },
  {
    id: 3,
    module: 3,
    text: "Which companion plants also contribute to improving the taste of the plants they accompany?",
    options: ["Basil", "Marigold", "Garlic", "Nasturtium"],
    answer: 0,
    explanation: "Companion planting pairs crops that protect and enhance one another. The classic combination of tomatoes with basil improves both resilience and flavour."
  },
  {
    id: 4,
    module: 3,
    text: "Is it TRUE OR FALSE that carrots make a good pair with onions?",
    options: ["True", "False"],
    answer: 0,
    explanation: "Garlic or onions planted near carrots and cabbage have a strong scent that deters carrot flies, cabbage pests, and aphids, reducing pest damage naturally."
  },

  // MODULE 4: topics 8 & 11: GR Clay pot crafting for food storage / Stitching reusable bags from old fabrics
  {
    id: 12,
    module: 4,
    text: "For roughly how long have terracotta storage jars been used around the Mediterranean?",
    options: ["About 200 years", "About 1,000 years", "Over 6,000 years", "Only since the year 2000"],
    answer: 2,
    explanation: "Terracotta storage jars have been used around the Mediterranean for over 6,000 years."
  },
  {
    id: 13,
    module: 4,
    text: "Why does food often stay fresh longer in a clay pot?",
    options: ["The clay is completely airtight", "The porous clay lets food \"breathe\"", "It contains added preservatives", "It is always kept refrigerated"],
    answer: 1,
    explanation: "Clay's tiny pores let food breathe, slowing spoilage. It naturally regulates temperature and humidity inside the pot, keeping stored food fresh for longer."
  },
  {
    id: 14,
    module: 4,
    text: "How long can a single plastic bag take to break down in landfill?",
    options: ["A few weeks", "About 5 years", "Up to 1,000 years", "It never ends up in landfill"],
    answer: 2,
    explanation: "A single plastic bag can take up to 1,000 years to break down in landfill."
  },
  {
    id: 15,
    module: 4,
    text: "Turning old fabric into new bags is an example of what?",
    options: ["Downcycling into waste", "Upcycling and creative reuse", "Incineration", "Landfilling"],
    answer: 1,
    explanation: "Stitching reusable bags turns worn clothes, linen scraps and leftover textiles into sturdy bags for shopping, produce and bread. This simple upcycling craft revives traditional sewing skills and replaces single-use plastic bags with washable, long-lasting cloth."
  },

  // MODULE 5: topic 9: GR Traditional food pickling, sun-drying, and oil-based methods
  // id30/31 (pickling & oil preservation) are AI-drafted to fill the topic's gap after id10/11 moved to
  // Module 6: not sourced from the manager's info papers. Flag for her review/replacement.
  {
    id: 8,
    module: 5,
    text: "Which of these is a traditional way to preserve food without a fridge?",
    options: ["Sun-drying", "Microwaving", "Vacuum freezing", "Plastic wrapping"],
    answer: 0,
    explanation: "Sun-drying uses free solar energy instead of electric dryers or freezers, avoiding wasteful fossil-fuel emissions."
  },
  {
    id: 9,
    module: 5,
    text: "Is it TRUE OR FALSE that Europe wastes around 88 million tonnes of food each year?",
    options: ["True", "False"],
    answer: 0,
    explanation: "Europe wastes around 88 million tonnes of food every year."
  },
  {
    id: 30,
    module: 5,
    text: "Which liquid is traditionally used to pickle vegetables for long-term storage?",
    options: ["Vinegar brine", "Fresh milk", "Plain water", "Fruit juice"],
    answer: 0,
    explanation: "Pickling vegetables in a vinegar brine creates an acidic environment that stops harmful bacteria from growing, allowing vegetables to be safely stored for months without refrigeration."
  },
  {
    id: 31,
    module: 5,
    text: "Why were olives traditionally stored submerged in oil?",
    options: ["Oil adds sweetness", "Oil blocks the air and moisture that cause spoilage", "Oil makes olives ripen faster", "It was required by law"],
    answer: 1,
    explanation: "Submerging olives in oil creates a barrier that keeps out air and moisture, the two main causes of spoilage, letting them be preserved for long periods without refrigeration."
  },

  // MODULE 6: topic 10: GR Making kitchen cleaners from citrus peels and vinegar
  // id10/11 moved here from Module 5 per the manager's material. id17/18's explanations below are AI-drafted
  // (the manager's reply didn't cover these two): flag for her to confirm or replace.
  {
    id: 10,
    module: 6,
    text: "What two main ingredients make this natural kitchen cleaner?",
    options: ["Bleach and water", "Citrus peels and vinegar", "Soap and oil", "Salt and sugar"],
    answer: 1,
    explanation: "Leftover orange and lemon peels are steeped in vinegar for about two weeks to create a fragrant, all-purpose spray that replaces synthetic chemical cleaning products."
  },
  {
    id: 11,
    module: 6,
    text: "Why is reusing citrus peels good for the climate?",
    options: ["It creates more plastic", "It keeps scraps out of methane-producing landfill", "It uses more energy", "It needs refrigeration"],
    answer: 1,
    explanation: "Reusing citrus peels keeps valuable food scraps out of landfill, where they slowly rot and release harmful methane."
  },
  {
    id: 17,
    module: 6,
    text: "Which natural substance in citrus peel cuts through grease?",
    options: ["Chlorine", "D-limonene", "Baking powder", "Sugar"],
    answer: 1,
    explanation: "D-limonene is a natural oil found in citrus peel that dissolves grease and grime effectively, which is why citrus-based cleaners work so well without synthetic degreasers."
  },
  {
    id: 18,
    module: 6,
    text: "Turning citrus peels and vinegar into a kitchen cleaner is an example of what?",
    options: ["Landfilling food waste", "Incinerating food waste", "Circular, zero-waste reuse", "Single-use consumption"],
    answer: 2,
    explanation: "Instead of throwing citrus peels away, steeping them in vinegar turns a food scrap into a useful household product, a simple example of circular, zero-waste reuse that keeps waste out of landfill."
  },

  // MODULE 7: topic 4 (CZ Water Irrigation / Greywater Reuse) merged in below; the greenwashing/packaging
  // questions that were already here aren't one of the 11 listed topics.
  {
    id: 20,
    module: 7,
    text: "What should consumers check to avoid greenwashing?",
    options: ["Attractive colours", "Official certifications", "Generic green words", "Product size"],
    images: [asset("Attractive_colours.png"), asset("Official_certifications.png"), asset("Generic_green_words.png"), asset("Product_Size.png")],
    answer: 1,
    explanation: "Not every “green” claim is reliable. Consumers should check official certifications instead of marketing words. Recognised labels help build transparency and trust."
  },
  {
    id: 21,
    module: 7,
    text: "TRUE or FALSE: The Green Dot always means that packaging is recyclable.",
    options: ["True", "False"],
    answer: 1,
    explanation: "The Green Dot does not always mean packaging is recyclable. It shows that the producer contributes to a recovery system. Consumers should still verify the actual recycling information."
  },
  {
    id: 28,
    module: 7,
    text: "Which home uses water more sustainably?",
    options: [     
      "Collects and appropriately treats greywater and reuses it for toilet flushing.",
      "Leaves several taps running unnecessarily.",
      "Uses drinking water for every purpose and sends all used water directly away."
    ],
    images: [asset("1.png"), asset("2.png"), asset("3.png")],
    answer: 0,
    explanation: "Reusing appropriately treated greywater for suitable non-drinking purposes can reduce drinking-water consumption and support more sustainable water management."
  },
  {
    id: 29,
    module: 7,
    text: "What Is Greywater?",
    options: [
      "Clean drinking water from the tap that is safe for drinking, cooking, and other everyday household uses.",
      "Household wastewater from washing fruits and vegetables, showers, baths, sinks, and similar sources that may be reused after appropriate treatment.",
      "Wastewater containing toilet sewage."
    ],
    answer: 1,
    explanation: "Greywater comes from everyday household activities such as washing, bathing, and using sinks. If it is not heavily contaminated with harmful chemicals, it can be appropriately treated and reused for non-drinking purposes, helping to save drinking water."
  },

  // MODULE 8: RO info papers 3 + 4 (Seasonal and Mindful Cooking: Preserving Cultural Heritage).
  // Replaces the earlier AI-drafted placeholder questions (ids 32-35), which had no source material.
  {
    id: 36,
    module: 8,
    text: "What is the method for obtaining sugar-free plum jam?",
    options: ["Slow cooking", "Sun drying", "Baking", "Cooking over high heat", "Steaming"],
    answer: 0,
    explanation: "Silvoița, the Romanian sugar-free plum jam, is made by slowly boiling well-ripened plums, stirring constantly until they shrink into a dense paste, which is then placed hot in sterilised jars."
  },
  {
    id: 37,
    module: 8,
    text: "Is it TRUE or FALSE that the peel of the fruit is used to prepare sugar-free plum jam?",
    options: ["True", "False"],
    answer: 0,
    explanation: "The plums are cooked with their skins. Using the whole fruit preserves nutrients and flavour and avoids waste."
  },
  {
    id: 38,
    module: 8,
    text: "What is the most important reason to pass on the tradition?",
    options: ["To develop sustainable cooking skills", "To save money", "To learn to cook", "To eat together", "To exchange recipes"],
    answer: 0,
    explanation: "Passing recipes and practical skills from one generation to another keeps sustainable cooking alive: using local, seasonal produce, preserving surplus for the winter and reusing jars."
  },
  {
    id: 39,
    module: 8,
    text: "Is it TRUE or FALSE that carrots are an ingredient of zacusca?",
    options: ["True", "False"],
    answer: 1,
    explanation: "Zacusca is made with eggplants, kapia peppers or Romanian sweet red peppers (gogoșari), onions, tomato juice, sunflower oil and spices. There are no carrots in it."
  },

  // MODULE 9: LTTA Italy info paper: From Herbs to Traditional Products
  {
    id: 40,
    module: 9,
    text: "Which picture shows sustainable harvesting of wild herbs?",
    options: [
      "Pulling the entire plant out by its roots (from several plants)",
      "Cutting all flowering stems from a patch (nothing is left to regrow)",
      "Carefully collecting a small amount from an abundant population",
    ],
    images: [asset("herb_harvest_pull.jpg"), asset("herb_harvest_cutall.jpg"), asset("herb_harvest_sustainable.jpg")],
    answer: 2,
    explanation: "Collecting only small amounts from abundant plant populations allows herbs to continue growing and reproducing. It helps protect biodiversity and ensures that plants remain available for future generations."
  },
  {
    id: 41,
    module: 9,
    text: "What is one of the main benefits of using herbs in traditional medicine?",
    options: [
      "Herbal remedies are always safer and more effective than conventional medicines",
      "Herbs support health and well-being because they contain naturally occurring beneficial compounds",
      "All herbs have the same medicinal properties, regardless of their species",
    ],
    images: [asset("herb_benefit_safer.jpg"), asset("herb_benefit_compounds.jpg"), asset("herb_benefit_same.jpg")],
    answer: 1,
    explanation: "Herbs contain natural compounds that support health and well-being, for example respiratory health, digestion or liver function. Their specific effects vary according to the plant species, its chemical composition and the way it is prepared and used."
  },
  {
    id: 42,
    module: 9,
    text: "Which picture shows the correct way to store a prepared herbal product?",
    options: [
      "A closed but unlabelled container",
      "An open jar exposed to moisture",
      "A clean, tightly closed and labelled jar, stored away from sunlight",
    ],
    images: [asset("herb_store_unlabelled.jpg"), asset("herb_store_open.jpg"), asset("herb_store_labelled.jpg")],
    answer: 2,
    explanation: "Storing properly dried herbs in clean, tightly closed and labelled containers, preferably glass jars, preserves their quality, aroma and shelf life. Paper bags can also be used if kept in a cool, dry and dark place, protected from moisture."
  },
  {
    id: 43,
    module: 9,
    text: "You have collected more herbs than you need. What is the most sustainable approach?",
    options: [
      "Dry all the herbs immediately, even if some will never be used.",
      "Discard the extra herbs and collect fresh ones when needed.",
      "Use what you need, preserve or share the surplus with family and friends.",
    ],
    answer: 2,
    explanation: "Using, preserving or sharing surplus herbs reduces waste and makes better use of natural resources. Correctly identified, safely prepared and labelled herbal products also make thoughtful gifts. Sustainable harvesting means collecting only what is needed and letting plants regenerate."
  },
  {
    id: 44,
    module: 9,
    text: "Which parts of a herb can be collected for herbal products?",
    options: [
      "Only the leaves and flowers, as other parts of herbs are generally unsuitable.",
      "Leaves, flowers, seeds, roots or stems, depending on the plant species and intended use.",
      "Any part of a herb, as long as the plant is collected during the flowering season.",
    ],
    answer: 1,
    explanation: "Different herbs have different useful parts. Depending on the species, leaves, flowers, seeds, roots or stems may be collected. Correct identification and knowing which parts are safe to use are essential."
  },
  {
    id: 45,
    module: 9,
    text: "Why is it important to dry herbs properly before storing them?",
    options: [
      "Drying removes all microorganisms and guarantees that herbs remain safe indefinitely.",
      "Drying increases the concentration of every beneficial substance found in herbs.",
      "Drying reduces moisture, helping prevent mould growth and extend shelf life.",
    ],
    answer: 2,
    explanation: "Removing excess moisture limits microbial growth and deterioration. Herbs must still be stored correctly, and their quality decreases over time."
  },

  // MODULE 10: Info Paper 4 (TalentWay, Italy): Understanding compost pH
  {
    id: 46,
    module: 10,
    text: "What does a compost pH value above 7 indicate?",
    options: ["Acidic compost", "Neutral compost", "Alkaline compost", "Compost without nutrients"],
    answer: 2,
    explanation: "pH measures acidity or alkalinity. Values above 7 indicate alkaline conditions. Knowing compost pH helps growers make informed soil management decisions."
  },
  {
    id: 47,
    module: 10,
    text: "TRUE or FALSE: A compost pH test measures all the nutrients present in compost.",
    options: ["True", "False"],
    answer: 1,
    explanation: "A pH test measures acidity or alkalinity, not nutrient concentrations. It helps indicate conditions that can affect nutrient availability; additional tests are needed to measure specific nutrients."
  },
];

const PATH_NODES = [
  { x:50, y:93 }, // 0 = START
  { x:18, y:86 }, // 1
  { x:72, y:79 }, // 2
  { x:24, y:72 }, // 3
  { x:72, y:65 }, // 4
  { x:24, y:58 }, // 5
  { x:70, y:51 }, // 6
  { x:26, y:44 }, // 7
  { x:70, y:37 }, // 8
  { x:28, y:30 }, // 9
  { x:62, y:22 }, // 10 = last module = FINISH
];

function lerp(a,b,t){ return a+(b-a)*t; }
function easeInOut(t){ return t<0.5?2*t*t:-1+(4-2*t)*t; }

/* ═══════════════════════════════════════════════════
   GLOBAL STYLES
═══════════════════════════════════════════════════ */
function GlobalStyles() {
  return (
    <style>{`
      * { margin:0; padding:0; box-sizing:border-box; }
      body { font-family:'Nunito','Segoe UI',sans-serif; background:#2d7d32; -webkit-tap-highlight-color:transparent; }
      #root { min-height:100vh; }
      button { font-family:inherit; }
      .gp-btn:focus-visible, .gp-opt:focus-visible, .gp-node:focus-visible {
        outline:3px solid #fde047; outline-offset:2px;
      }
      /* Quiz columns scroll as a whole instead of squashing (and overlapping) their cards on short screens */
      .gp-col > * { flex-shrink:0; }
      .gp-input:focus { border-color:#4ade80 !important; box-shadow:0 0 0 3px rgba(74,222,128,0.18); }
      .gp-input::placeholder { color:#86a993; }
      .gp-lang-chip { transition:transform 0.15s, background 0.15s, border-color 0.15s; }
      .gp-lang-chip:hover { transform:translateY(-2px); }
      ${NATURE_SCENE_CSS}
      @media (prefers-reduced-motion: reduce) {
        *, *::before, *::after { animation-duration:0.01ms !important; animation-iteration-count:1 !important; transition-duration:0.01ms !important; }
      }

      @keyframes leafDrift  { 0%,100%{transform:translateY(0) rotate(-8deg)} 50%{transform:translateY(-14px) rotate(8deg)} }
      @keyframes charBob    { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-12px)} }
      @keyframes charIdle   { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
      @keyframes idleFloat  { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
      @keyframes walkBob    { 0%,100%{transform:translateY(0) rotate(-3deg)} 50%{transform:translateY(-9px) rotate(3deg)} }
      @keyframes birdFly    { 0%{transform:translateX(0) translateY(0)} 50%{transform:translateX(8px) translateY(-5px)} 100%{transform:translateX(0) translateY(0)} }
      @keyframes riverFlow  { 0%{stroke-dashoffset:0} 100%{stroke-dashoffset:-40} }
      @keyframes bridgeRock { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-1px)} }
      @keyframes pocketPop  { 0%{transform:scale(0) rotate(-30deg);opacity:1} 60%{transform:scale(1.3) rotate(10deg);opacity:1} 100%{transform:scale(0) rotate(30deg);opacity:0} }

      @keyframes waterShimmer { from{transform:translateX(-200%)} to{transform:translateX(200%)} }
      @keyframes waterRipple  { 0%,100%{transform:scaleX(1) scaleY(1)} 50%{transform:scaleX(1.15) scaleY(0.85)} }
      @keyframes mistFloat    { 0%,100%{opacity:0.08;transform:scaleX(1)} 50%{opacity:0.22;transform:scaleX(1.12)} }
      @keyframes wfStream     { 0%{transform:translateY(-8px);opacity:0.9} 100%{transform:translateY(4px);opacity:0.5} }
      @keyframes splash       { 0%,100%{transform:translateY(0) scale(1);opacity:0.7} 50%{transform:translateY(-7px) scale(0.7);opacity:0.1} }
      @keyframes dropFall     { 0%{opacity:0;transform:translateY(-30px)} 30%{opacity:1} 100%{opacity:0;transform:translateY(70px)} }

      @keyframes cloudPop     { 0%{transform:scale(0) translateY(10px);opacity:0} 70%{transform:scale(1.06) translateY(-3px)} 100%{transform:scale(1) translateY(0);opacity:1} }
      @keyframes slideInRight { from{transform:translateX(60px);opacity:0} to{transform:translateX(0);opacity:1} }
      @keyframes slideInLeft  { from{transform:translateX(-60px);opacity:0} to{transform:translateX(0);opacity:1} }
      @keyframes slideInUp    { from{transform:translateY(40px);opacity:0} to{transform:translateY(0);opacity:1} }
      @keyframes popIn        { 0%{transform:scale(0)} 70%{transform:scale(1.2)} 100%{transform:scale(1)} }
      @keyframes bubblePop    { from{opacity:0;transform:scale(0.9)} to{opacity:1;transform:scale(1)} }
      @keyframes bounceIn     { 0%{transform:scale(0)} 50%{transform:scale(1.3)} 80%{transform:scale(0.9)} 100%{transform:scale(1)} }

      @keyframes coinToChar {
        0%   { transform:translate(0,0) scale(0) rotate(0deg); opacity:0; }
        12%  { transform:translate(0,0) scale(1.5) rotate(0deg); opacity:1; }
        75%  { transform:translate(-110px, 30px) scale(1) rotate(-540deg); opacity:1; }
        88%  { transform:translate(-130px, 38px) scale(0.8) rotate(-630deg); opacity:0.9; }
        100% { transform:translate(-138px, 42px) scale(0) rotate(-720deg); opacity:0; }
      }
      @keyframes pocketGlow {
        0%   { opacity:0; transform:scale(0) translateY(0); }
        30%  { opacity:1; transform:scale(1.4) translateY(-8px); }
        60%  { opacity:1; transform:scale(1) translateY(-4px); }
        100% { opacity:0; transform:scale(0.5) translateY(0); }
      }

      @keyframes cBounce { 0%,100%{transform:translateY(0) scale(1)} 40%{transform:translateY(-22px) scale(1.1)} }
      @keyframes cShake  { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-9px)} 75%{transform:translateX(9px)} }
      @keyframes AristotleBounce { 0%,100%{transform:translateY(0) scale(1)} 40%{transform:translateY(-14px) scale(1.1)} }
      @keyframes AristotleShake  { 0%,100%{transform:translateX(0)} 25%{transform:translateX(-8px)} 75%{transform:translateX(8px)} }

      @keyframes nodePulse  { 0%,100%{transform:translate(-50%,-50%) scale(1);opacity:0.3} 50%{transform:translate(-50%,-50%) scale(1.5);opacity:0.08} }
      @keyframes celebPop   { 0%{transform:scale(0) rotate(-20deg);opacity:1} 50%{transform:scale(1.4) rotate(8deg);opacity:1} 100%{transform:scale(0.8);opacity:0} }
      @keyframes panelSlideUp { from{transform:translateY(30px);opacity:0} to{transform:translateY(0);opacity:1} }

      @keyframes AristotleWalkIn {
        0%   { right:-22%; opacity:0; }
        15%  { opacity:1; }
        60%  { right:10%; }
        80%  { right:8.5%; }
        90%  { right:9%; }
        100% { right:8%; }
      }
      @keyframes cloudAppear {
        0%   { opacity:0; transform:scale(0.6) translateY(16px); }
        60%  { transform:scale(1.05) translateY(-4px); }
        100% { opacity:1; transform:scale(1) translateY(0); }
      }
    `}</style>
  );
}

/* ═══════════════════════════════════════════════════
   SHARED UI
═══════════════════════════════════════════════════ */
function Btn({ children, onClick, color="#22c55e", style={}, disabled, type="button" }) {
  const [hov, setHov] = useState(false);
  return (
    <button type={type} onClick={onClick} disabled={disabled} className="gp-btn"
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{
        background: disabled?"#1e293b":hov?color:color+"cc",
        border:"none", borderRadius:14, padding:"13px 24px",
        color:disabled?"#475569":"#fff", fontSize:15, fontWeight:800,
        cursor:disabled?"default":"pointer", transition:"all 0.2s",
        transform:hov&&!disabled?"translateY(-2px)":"none",
        boxShadow:hov&&!disabled?`0 10px 28px ${color}55`:"none",
        fontFamily:"inherit", ...style,
      }}>{children}</button>
  );
}

function BackBtn({ onClick }) {
  const t = useT();
  return (
    <button type="button" onClick={onClick} className="gp-btn" style={{
      background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)",
      color:"#94a3b8", cursor:"pointer", fontSize:13, fontWeight:700,
      padding:"6px 14px", marginBottom:16, fontFamily:"inherit",
      borderRadius:10, transition:"all 0.15s",
    }}>{t("common.back")}</button>
  );
}

function CoinIcon({ size=28, style={} }) {
  return (
    <svg width={size} height={size} viewBox="0 0 40 40" style={{ display:"block", ...style }}>
      <defs>
        <radialGradient id="coinGrad" cx="35%" cy="30%" r="75%">
          <stop offset="0%" stopColor="#fff7cc"/>
          <stop offset="45%" stopColor="#ffd54a"/>
          <stop offset="100%" stopColor="#d68a12"/>
        </radialGradient>
      </defs>
      <circle cx="20" cy="20" r="18" fill="url(#coinGrad)" stroke="#b8720a" strokeWidth="2"/>
      <circle cx="20" cy="20" r="13" fill="none" stroke="#b8720a" strokeWidth="1.4" opacity="0.55"/>
      <polygon points="20,14 21.8,17.8 26,18.3 22.9,21.1 23.8,25.3 20,23.1 16.2,25.3 17.1,21.1 14,18.3 18.2,17.8"
        fill="#b8720a" opacity="0.85"/>
    </svg>
  );
}

function GardenWrap({ children, showWaterfall=true }) {
  return (
    <div style={{
      minHeight:"100dvh", width:"100%",
      background:"linear-gradient(180deg,#6bbde8 0%,#a8ddb5 32%,#4caf50 65%,#2d7d32 100%)",
      display:"flex", alignItems:"center", justifyContent:"center",
      fontFamily:"'Nunito','Segoe UI',sans-serif", padding:16,
      position:"relative", overflow:"hidden",
    }}>
      <NatureScene waterfall={showWaterfall}/>
      <div style={{ position:"absolute", bottom:0, left:0, right:0, height:"38%",
        background:"linear-gradient(180deg,transparent,#1b5e2066)", pointerEvents:"none", zIndex:0 }}/>
      {["🍃","🌸","🌼","🍀","🌺","🦋"].map((e,i)=>(
        <span key={i} style={{
          position:"absolute", pointerEvents:"none",
          left:`${8+i*15}%`, top:`${4+(i%3)*8}%`,
          fontSize:16+(i%3)*5, opacity:0.45,
          animation:`leafDrift ${4+i}s ease-in-out infinite`,
          animationDelay:`${i*0.7}s`, zIndex:0,
        }}>{e}</span>
      ))}
      <div style={{ position:"relative", zIndex:1, width:"100%", maxWidth:520 }}>
        {children}
      </div>
    </div>
  );
}

function Panel({ children, style={} }) {
  return (
    <div style={{
      background:"rgba(10,26,10,0.84)",
      backdropFilter:"blur(24px)",
      border:"1px solid rgba(74,222,128,0.2)",
      borderRadius:26, padding:"28px 24px",
      boxShadow:"0 32px 80px rgba(0,0,0,0.55), 0 0 0 1px rgba(74,222,128,0.08)",
      color:"#f1f5f9", position:"relative", overflow:"hidden",
      animation:"panelSlideUp 0.4s ease",
      ...style,
    }}>{children}</div>
  );
}

/* ═══════════════════════════════════════════════════
   AUTH SCREEN (register / login)
═══════════════════════════════════════════════════ */
const inputStyle = {
  background:"rgba(255,255,255,0.06)",
  border:"1px solid rgba(74,222,128,0.25)",
  borderRadius:12, padding:"12px 14px",
  color:"#f0fdf4", fontSize:16, fontFamily:"inherit", outline:"none",
  width:"100%", transition:"border-color 0.15s, box-shadow 0.15s",
};

/* Compact flag picker, so the very first screens are already in the player's language. */
function LanguageChips({ value, onChange }) {
  const t = useT();
  return (
    <div role="group" aria-label={t("lang.title")}
      style={{ display:"flex", justifyContent:"center", gap:6, flexWrap:"wrap", marginBottom:18 }}>
      {LANGUAGES.map(l => {
        const active = l.id === value;
        return (
          <button key={l.id} type="button" className="gp-btn gp-lang-chip"
            onClick={() => onChange(l)} aria-pressed={active} title={l.label}
            style={{
              display:"flex", alignItems:"center", gap:5, cursor:"pointer",
              background: active ? `${l.color}33` : "rgba(255,255,255,0.05)",
              border: `1.5px solid ${active ? l.color : "rgba(255,255,255,0.12)"}`,
              color: active ? "#f0fdf4" : "#94a3b8",
              borderRadius:999, padding:"4px 10px 4px 7px", fontSize:12, fontWeight:800,
            }}>
            <span style={{ fontSize:16, lineHeight:1 }}>{l.flag}</span>
            {l.id === "gr" ? "EL" : l.id === "cz" ? "CS" : l.id.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

function AuthScreen({ onAuth, languageId, onLanguageChange }) {
  const t = useT();
  const [showPw, setShowPw] = useState(false);
  const [mode, setMode] = useState("register"); // "register" | "login"
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const uname = username.trim().toLowerCase();

    if (mode === "register") {
      const name = cleanFullName(fullName);
      if (!name || !uname || !password) {
        setError("auth.errFill");
        return;
      }
      if (name.length > FULLNAME_MAX) {
        setError("auth.errName");
        return;
      }
      if (!USERNAME_RE.test(uname)) {
        setError("auth.errUsername");
        return;
      }
      if (password.length < PASSWORD_MIN || password.length > PASSWORD_MAX) {
        setError("auth.errPassword");
        return;
      }
      setBusy(true);
      try {
        const u = await registerUser(uname, password, name);
        onAuth(u);
      } catch (err) {
        setError(friendlyAuthError(err));
      } finally {
        setBusy(false);
      }
    } else {
      if (!uname || !password) {
        setError("auth.errFill");
        return;
      }
      if (!USERNAME_RE.test(uname) || password.length > PASSWORD_MAX) {
        setError("auth.errIncorrect");
        return;
      }
      setBusy(true);
      try {
        const u = await loginUser(uname, password);
        onAuth(u);
      } catch (err) {
        setError(friendlyAuthError(err));
      } finally {
        setBusy(false);
      }
    }
  }

  return (
    <GardenWrap>
      <Panel>
        <LanguageChips value={languageId} onChange={onLanguageChange}/>
        <div style={{ textAlign:"center", marginBottom:22 }}>
          <div style={{ fontSize:44, marginBottom:8 }}>{mode==="register" ? "🌱" : "🔐"}</div>
          <h1 style={{ fontSize:22, fontWeight:900, color:"#f0fdf4" }}>
            {mode==="register" ? t("auth.registerTitle") : t("auth.loginTitle")}
          </h1>
          <p style={{ color:"#86efac", fontSize:13, marginTop:4 }}>
            {mode==="register" ? t("auth.registerSub") : t("auth.loginSub")}
          </p>
        </div>

        <form onSubmit={handleSubmit} noValidate style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {mode==="register" && (
            <input
              type="text" placeholder={t("auth.fullName")} aria-label={t("auth.fullName")}
              autoComplete="name" className="gp-input" maxLength={FULLNAME_MAX + 10}
              value={fullName} onChange={e=>setFullName(e.target.value)}
              style={inputStyle}
            />
          )}
          <input
            type="text" placeholder={t("auth.username")} aria-label={t("auth.username")}
            autoComplete="username" className="gp-input" spellCheck={false} maxLength={20}
            value={username} onChange={e=>setUsername(e.target.value)}
            style={inputStyle} autoCapitalize="none"
          />
          <div style={{ position:"relative" }}>
            <input
              type={showPw ? "text" : "password"} placeholder={t("auth.password")} aria-label={t("auth.password")}
              autoComplete={mode==="register" ? "new-password" : "current-password"} className="gp-input"
              maxLength={PASSWORD_MAX}
              value={password} onChange={e=>setPassword(e.target.value)}
              style={{ ...inputStyle, paddingRight:46 }}
            />
            <button type="button" className="gp-btn" onClick={()=>setShowPw(v=>!v)}
              aria-label={showPw ? t("auth.hidePassword") : t("auth.showPassword")}
              title={showPw ? t("auth.hidePassword") : t("auth.showPassword")}
              style={{ position:"absolute", right:6, top:"50%", transform:"translateY(-50%)",
                background:"none", border:"none", cursor:"pointer", fontSize:17, padding:"4px 8px",
                opacity: showPw ? 1 : 0.6, borderRadius:8 }}>
              {showPw ? "🙈" : "👁️"}
            </button>
          </div>

          {error && (
            <div role="alert" style={{ color:"#fecaca", fontSize:13, textAlign:"center",
              background:"rgba(239,68,68,0.12)", border:"1px solid rgba(239,68,68,0.35)",
              borderRadius:10, padding:"8px 10px", lineHeight:1.45 }}>{t(error)}</div>
          )}

          <Btn type="submit" disabled={busy} style={{ width:"100%", marginTop:6 }} color="#22c55e">
            {busy ? t("auth.wait") : mode==="register" ? t("auth.create") : t("auth.login")}
          </Btn>
        </form>

        <div style={{ textAlign:"center", marginTop:16 }}>
          <button type="button" className="gp-btn"
            onClick={()=>{ setMode(m=>m==="register"?"login":"register"); setError(""); }}
            style={{ background:"none", border:"none", color:"#86efac",
              fontSize:13, cursor:"pointer", textDecoration:"underline", fontFamily:"inherit" }}
          >
            {mode==="register" ? t("auth.toLogin") : t("auth.toRegister")}
          </button>
        </div>

        <p style={{ marginTop:18, color:"#86a993", fontSize:11, textAlign:"center", lineHeight:1.5 }}>
          {t("auth.anyDevice")}
        </p>
      </Panel>
    </GardenWrap>
  );
}

/* ═══════════════════════════════════════════════════
   LOADING SCREEN
═══════════════════════════════════════════════════ */
function LoadingScreen({ onDone }) {
  const t = useT();
  const [progress, setProgress] = useState(0);

  const onDoneRef = useRef(onDone);
  useEffect(() => { onDoneRef.current = onDone; }, [onDone]);
  useEffect(() => {
    let doneTimer;
    const id = setInterval(() => {
      setProgress(p => {
        const next = p + 1.4;
        if (next >= 100) {
          clearInterval(id);
          clearTimeout(doneTimer);
          doneTimer = setTimeout(()=>onDoneRef.current(), 600);
          return 100;
        }
        return next;
      });
    }, 38);
    return () => { clearInterval(id); clearTimeout(doneTimer); };
  }, []);

  return (
    <div style={{
      position:"fixed", inset:0,
      background:"linear-gradient(180deg,#6bbde8 0%,#a8ddb5 35%,#4caf50 68%,#2d7d32 100%)",
      display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center",
      fontFamily:"'Nunito','Segoe UI',sans-serif", overflow:"hidden",
    }}>
      <NatureScene/>
      <div style={{ position:"absolute", bottom:0, left:0, right:0, height:"35%",
        background:"linear-gradient(180deg,transparent,#1b5e2066)", zIndex:0, pointerEvents:"none" }}/>
      {["🍃","🌸","🌼","🍀","🌺","🦋","🌿","🌻"].map((e,i)=>(
        <span key={i} style={{
          position:"absolute", zIndex:0, pointerEvents:"none",
          left:`${5+i*12}%`, top:`${3+(i%4)*7}%`,
          fontSize:16+(i%3)*5, opacity:0.4,
          animation:`leafDrift ${4+i}s ease-in-out infinite`,
          animationDelay:`${i*0.6}s`,
        }}>{e}</span>
      ))}

      {/* Soft light behind the centre so title and characters separate from the busy scenery */}
      <div style={{ position:"absolute", inset:0, zIndex:0, pointerEvents:"none",
        background:"radial-gradient(ellipse 60% 55% at 50% 50%, rgba(255,255,255,0.42) 0%, rgba(255,255,255,0.18) 45%, transparent 75%)" }}/>

      <div style={{ position:"relative", zIndex:1, display:"flex", flexDirection:"column", alignItems:"center",
        gap:"clamp(12px, 3.2vh, 34px)", width:"100%", maxWidth:900, padding:"0 12px" }}>

        <div style={{ textAlign:"center" }}>
          <div style={{ fontSize:"clamp(36px, min(7vw, 8vh), 64px)", lineHeight:1, marginBottom:4,
            filter:"drop-shadow(0 4px 12px rgba(0,0,0,0.35))" }}>🌿</div>
          <h1 style={{ fontSize:"clamp(32px, min(7vw, 8vh), 60px)", fontWeight:900, color:"white",
            textShadow:"0 3px 0 #166534, 0 6px 22px rgba(0,0,0,0.45)",
            letterSpacing:-0.5, lineHeight:1.05, marginBottom:"clamp(6px, 1.2vh, 10px)" }}>GreenPath</h1>
          <p style={{ display:"inline-block", color:"#f0fdf4", fontSize:"clamp(12px, 1.6vw, 15px)", fontWeight:800,
            background:"rgba(20,83,45,0.72)", borderRadius:999, padding:"4px 14px", marginBottom:6,
            boxShadow:"0 4px 14px rgba(0,0,0,0.18)" }}>
            {t("brand.tagline")}
          </p>
          <p style={{ color:"#14532d", fontSize:"clamp(12px, 1.5vw, 15px)", fontWeight:800,
            textShadow:"0 1px 0 rgba(255,255,255,0.7)" }}>
            {t("loading.tagline")}
          </p>
        </div>

        {/* Characters on bright stage cards: sized from both the width and height of the screen */}
        <div style={{
          display:"grid",
          gridTemplateColumns:`repeat(${CHARACTERS.length}, minmax(0, clamp(70px, min(19vw, 17vh), 165px)))`,
          justifyContent:"center",
          gap:"clamp(8px, 2.4vw, 28px)",
          width:"100%",
        }}>
          {CHARACTERS.map((c, i) => (
            <div key={c.id} style={{ display:"flex", flexDirection:"column", alignItems:"center", minWidth:0 }}>
              <div style={{
                position:"relative", width:"100%",
                background:"linear-gradient(180deg, rgba(255,255,255,0.92) 0%, rgba(255,255,255,0.72) 60%, rgba(240,253,244,0.85) 100%)",
                border:`3px solid ${c.color}`,
                borderRadius:"clamp(14px, 2vw, 22px)",
                padding:"clamp(6px, 1.2vw, 12px) clamp(4px, 1vw, 10px) clamp(4px, 0.8vw, 8px)",
                boxShadow:`0 10px 26px rgba(0,0,0,0.22), 0 0 0 4px ${c.color}33, inset 0 -18px 30px ${c.color}22`,
                overflow:"hidden",
              }}>
                {/* ground shadow */}
                <div style={{ position:"absolute", left:"18%", right:"18%", bottom:"6%", height:"7%",
                  borderRadius:"50%", background:"rgba(0,0,0,0.18)", filter:"blur(3px)" }}/>
                <img
                  src={c.idle}
                  alt={c.name}
                  draggable={false}
                  style={{
                    position:"relative",
                    width:"100%",
                    height:"auto", aspectRatio:"2 / 3",
                    objectFit:"contain",
                    display:"block",
                    animation:`charBob 2.2s ${i * 0.3}s ease-in-out infinite`,
                    filter:"drop-shadow(0 4px 6px rgba(0,0,0,0.25))",
                  }}
                />
              </div>
              <div style={{
                marginTop:"clamp(-12px, -1.2vw, -8px)", position:"relative",
                color:"#fff", background:c.color,
                fontWeight:900, fontSize:"clamp(11px, 1.5vw, 15px)",
                borderRadius:999, padding:"3px clamp(10px, 1.6vw, 16px)",
                boxShadow:"0 4px 12px rgba(0,0,0,0.25)", border:"2px solid rgba(255,255,255,0.9)",
                textShadow:"0 1px 2px rgba(0,0,0,0.35)", whiteSpace:"nowrap",
              }}>
                {c.name}
              </div>
            </div>
          ))}
        </div>

      <div style={{ width:"clamp(240px, 42vw, 400px)", textAlign:"center",
        background:"rgba(255,255,255,0.78)", borderRadius:18, padding:"10px 16px 8px",
        boxShadow:"0 8px 24px rgba(0,0,0,0.18)", border:"1px solid rgba(255,255,255,0.9)" }}>
        <div style={{ fontSize:"clamp(11px, 1.3vw, 13px)", color:"#14532d", fontWeight:900, marginBottom:8, letterSpacing:1.5 }}>
          {t("loading.label")}
        </div>
        <div role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)}
          style={{ height:"clamp(16px, 2.4vh, 22px)", borderRadius:999,
          background:"rgba(20,83,45,0.45)", border:"2px solid rgba(255,255,255,0.8)",
          boxShadow:"0 4px 14px rgba(0,0,0,0.18)",
          overflow:"hidden", position:"relative" }}>
          <div style={{
            position:"absolute", top:0, left:0, bottom:0,
            width:`${progress}%`,
            background:"linear-gradient(90deg,#1d4ed8,#3b82f6,#06b6d4,#7dd3fc)",
            borderRadius:999, transition:"width 0.06s linear", overflow:"hidden",
          }}>
            <div style={{
              position:"absolute", top:0, left:0, right:0, bottom:0,
              background:"linear-gradient(90deg,transparent 0%,rgba(255,255,255,0.45) 50%,transparent 100%)",
              animation:"waterShimmer 1.2s linear infinite",
            }}/>
            <svg style={{ position:"absolute", bottom:0, left:0, width:"200%", height:"10px" }}
              viewBox="0 0 200 10" preserveAspectRatio="none">
              <path d="M0 6 Q25 2 50 6 Q75 10 100 6 Q125 2 150 6 Q175 10 200 6 L200 10 L0 10 Z"
                fill="rgba(255,255,255,0.18)"/>
            </svg>
          </div>
          <div style={{
            position:"absolute", inset:0, borderRadius:999,
            backgroundImage:"repeating-linear-gradient(90deg,transparent,transparent 14px,rgba(255,255,255,0.05) 14px,rgba(255,255,255,0.05) 28px)",
          }}/>
        </div>
        <div style={{ color:"#14532d", fontSize:14, marginTop:8, fontWeight:900 }}>
          {Math.round(progress)}%
        </div>
      </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   LANGUAGE SCREEN
═══════════════════════════════════════════════════ */
function LanguageScreen({ onSelect, onBack, currentId }) {
  const t = useT();
  return (
    <GardenWrap>
      <Panel>
        {onBack && <BackBtn onClick={onBack}/>}
        <div style={{ textAlign:"center", marginBottom:24 }}>
          <div style={{ fontSize:46, marginBottom:8 }}>🌍</div>
          <h1 style={{ fontSize:22, fontWeight:900, marginBottom:4, color:"#f0fdf4" }}>
            {t("lang.title")}
          </h1>
          <p style={{ color:"#86efac", fontSize:13 }}>{t("lang.sub")}</p>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:11 }}>
          {LANGUAGES.map(lang=>(
            <button type="button" className="gp-btn" key={lang.id} onClick={()=>onSelect(lang)}
              aria-current={lang.id===currentId ? "true" : undefined}
              style={{
                width:"100%", textAlign:"left", color:"inherit", fontFamily:"inherit",
                background:lang.id===currentId ? `${lang.color}30` : `${lang.color}14`,
                border:`2px solid ${lang.id===currentId ? lang.color : lang.color+"44"}`,
                borderRadius:16, padding:"14px 18px", cursor:"pointer",
                display:"flex", alignItems:"center", gap:14, transition:"all 0.2s",
              }}
              onMouseEnter={e=>{
                e.currentTarget.style.background=`${lang.color}28`;
                e.currentTarget.style.transform="translateX(6px)";
                e.currentTarget.style.borderColor=lang.color;
              }}
              onMouseLeave={e=>{
                e.currentTarget.style.background=lang.id===currentId ? `${lang.color}30` : `${lang.color}14`;
                e.currentTarget.style.transform="translateX(0)";
                e.currentTarget.style.borderColor=lang.id===currentId ? lang.color : `${lang.color}44`;
              }}
            >
              <span style={{ fontSize:32 }}>{lang.flag}</span>
              <span lang={LANGUAGE_META[lang.id].htmlLang} style={{ fontWeight:800, fontSize:16, color:"#f0fdf4" }}>{lang.label}</span>
              <span style={{ marginLeft:"auto", color:lang.id===currentId ? "#4ade80" : "#64748b", fontSize:18 }}>
                {lang.id===currentId ? "✓" : "›"}
              </span>
            </button>
          ))}
        </div>
      </Panel>
    </GardenWrap>
  );
}

/*AristotleIntro*/

function AristotleIntro({ module, questionCount, onStart, onBack }) {
  const t = useT();
  const [AristotleIn, setAristotleIn] = useState(false);
  const [showCloud, setShowCloud] = useState(false);
  const [canProceed, setCanProceed] = useState(false);

  // The component is keyed by module id, so state starts fresh for every module.
  useEffect(() => {
    const t1 = setTimeout(() => setAristotleIn(true), 250);
    const t2 = setTimeout(() => setShowCloud(true), 1400);
    const t3 = setTimeout(() => setCanProceed(true), 1400 + 2500); // stays locked ~2.5s after text appears
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [module]);

  return (
    <GardenWrap>
      <Panel>
        {onBack && <BackBtn onClick={onBack}/>}
        <div style={{ textAlign: "center", marginBottom: 14 }}>
          <div style={{
            display:"inline-block", background:`${module.color}22`,
            border:`1px solid ${module.color}55`, borderRadius:12,
            padding:"4px 14px", marginBottom:10,
          }}>
            <span style={{ color: module.color, fontWeight:900, fontSize:12, letterSpacing:0.5 }}>
              {module.icon} {t("intro.module", { n: module.id })}
            </span>
          </div>
          <h2 style={{ color: "#fbbf24", fontWeight:900, fontSize:19, lineHeight:1.3 }}>
            {module.title}
          </h2>
          {questionCount > 0 && (
            <div style={{ color:"#86efac", fontSize:12, fontWeight:700, marginTop:4 }}>
              {t("intro.questions", { n: questionCount })}
            </div>
          )}
        </div>

        {/* Aristotle appears */}
        <div style={{
          display:"flex", flexDirection:"column", alignItems:"center",
          marginBottom:18, minHeight:210, justifyContent:"flex-end",
        }}>
          {showCloud && (
            <div style={{
              position:"relative",
              background:"white", color:"#1e293b",
              borderRadius:20, padding:"16px 18px",
              fontSize:14, fontWeight:700, lineHeight:1.6,
              boxShadow:"0 12px 40px rgba(0,0,0,0.3)",
              animation:"cloudAppear 0.5s cubic-bezier(0.175,0.885,0.32,1.275)",
              marginBottom:10, maxWidth:"100%",
            }}>
              <div style={{
                position:"absolute", bottom:-14, left:"50%", transform:"translateX(-50%)",
                width:0, height:0,
                borderLeft:"14px solid transparent",
                borderRight:"14px solid transparent",
                borderTop:"16px solid white",
              }}/>
              <div style={{
                color:"#7c3aed", fontSize:11, fontWeight:900, marginBottom:8,
                textTransform:"uppercase", letterSpacing:1,
                display:"flex", alignItems:"center", gap:6, justifyContent:"center",
              }}>
                📜 {t("intro.explains")}
              </div>
              {module.info}
            </div>
          )}

          <img src={asset("Aristotle.png")} alt="Aristotle" style={{
            width:100, height:133, objectFit:"contain",
            opacity: AristotleIn ? 1 : 0,
            transform: AristotleIn ? "translateY(0)" : "translateY(20px)",
            transition:"all 0.6s ease",
            animation: AristotleIn ? "idleFloat 3s ease-in-out infinite" : "none",
            filter:"drop-shadow(0 10px 28px rgba(139,92,246,0.6))",
          }}/>
          <div style={{
            color:"#c4b5fd", fontWeight:900, fontSize:12, marginTop:6,
            background:"rgba(0,0,0,0.35)", borderRadius:8, padding:"2px 12px",
            opacity: AristotleIn ? 1 : 0, transition:"opacity 0.4s ease 0.3s",
          }}>
            Aristotle
          </div>
        </div>

        {/* "Did you know?" game facts from the info papers */}
        {showCloud && module.facts?.length > 0 && (
          <div style={{
            background:"rgba(251,191,36,0.08)", border:"1px solid rgba(251,191,36,0.35)",
            borderRadius:16, padding:"12px 14px", marginBottom:18,
            animation:"panelSlideUp 0.5s ease",
          }}>
            <div style={{ color:"#fbbf24", fontWeight:900, fontSize:12, letterSpacing:0.6,
              textTransform:"uppercase", marginBottom:8 }}>
              💡 {t("intro.didYouKnow")}
            </div>
            <ul style={{ listStyle:"none", display:"flex", flexDirection:"column", gap:7 }}>
              {/* Intro shows the first four; the results screen draws from the full list. */}
              {module.facts.slice(0,4).map((f,i)=>(
                <li key={i} style={{ display:"flex", gap:8, color:"#e2e8f0", fontSize:13, lineHeight:1.5 }}>
                  <span style={{ color:module.color, flexShrink:0 }}>●</span>
                  <span>{f}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ textAlign: "center" }}>
          <Btn onClick={onStart} color="#fbbf24" disabled={!canProceed} style={{ minWidth:220 }}>
            {canProceed ? t("intro.begin") : t("intro.reading")}
          </Btn>
        </div>
      </Panel>
    </GardenWrap>
  );
}

/* ═══════════════════════════════════════════════════
   CHARACTER SCREEN
═══════════════════════════════════════════════════ */
function CharacterScreen({ language, initialId, onSelect, onBack }) {
  const t = useT();
  const [idx,     setIdx]     = useState(()=>Math.max(0, CHARACTERS.findIndex(c=>c.id===initialId)));
  const [animDir, setAnimDir] = useState(null);
  const [animKey, setAnimKey] = useState(0);
  const touchStartX = useRef(null);

  function goTo(newIdx, dir) {
    setAnimDir(dir); setAnimKey(k=>k+1); setIdx(newIdx);
  }
  function prev() { goTo((idx-1+CHARACTERS.length)%CHARACTERS.length,"right"); }
  function next() { goTo((idx+1)%CHARACTERS.length,"left"); }
  function onTouchStart(e) { touchStartX.current = e.touches[0].clientX; }
  function onTouchEnd(e) {
    if (touchStartX.current===null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (dx>45) prev(); else if (dx<-45) next();
    touchStartX.current = null;
  }

  const c = CHARACTERS[idx];
  return (
    <GardenWrap>
      <Panel>
        <BackBtn onClick={onBack}/>
        <div style={{ textAlign:"center", marginBottom:20 }}>
          <h1 style={{ fontSize:22, fontWeight:900, color:"#f0fdf4" }}>{t("char.title")}</h1>
          <p style={{ color:"#86efac", fontSize:13, marginTop:3 }}>
            {language.flag} {language.label} · {t("char.browse")}
          </p>
        </div>

        <div style={{ position:"relative" }} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <button type="button" className="gp-btn" onClick={prev} aria-label={t("char.prev")} style={{
            position:"absolute", left:-10, top:"50%", transform:"translateY(-50%)",
            width:38, height:38, borderRadius:"50%", zIndex:10,
            background:"rgba(74,222,128,0.15)", border:"2px solid rgba(74,222,128,0.35)",
            color:"#4ade80", fontSize:20, cursor:"pointer",
            display:"flex", alignItems:"center", justifyContent:"center",
          }}>‹</button>

          <div key={animKey} style={{
            textAlign:"center", margin:"0 30px",
            animation:animDir==="left"?"slideInRight 0.32s ease"
              :animDir==="right"?"slideInLeft 0.32s ease":"none",
          }}>
            <div style={{ background:`${c.color}12`, border:`2px solid ${c.color}50`, borderRadius:22, padding:"24px 20px" }}>
              <img src={c.idle} alt={c.name} draggable={false} style={{
                height:"clamp(170px, 30vh, 260px)", width:"auto", aspectRatio:"2 / 3",
                objectFit:"contain", display:"block", margin:"0 auto 14px",
                filter:`drop-shadow(0 0 1.5px #fff) drop-shadow(0 10px 24px ${c.color}90)`,
                animation:"charIdle 3s ease-in-out infinite",
              }}/>
              <div style={{ fontWeight:900, fontSize:20, color:"#f0fdf4", marginBottom:3 }}>{c.name}</div>
              <div style={{
                display:"inline-block", background:`${c.color}22`, border:`1px solid ${c.color}55`,
                color:c.color, fontWeight:700, fontSize:12, borderRadius:8, padding:"3px 10px", marginBottom:10,
              }}>{t(`culture.${c.culture}`)}</div>
              <div style={{ color:"#94a3b8", fontSize:13, fontStyle:"italic",
                background:"rgba(255,255,255,0.04)", borderRadius:12, padding:"8px 12px" }}>
                "{t(`char.${c.id}.idle`)}"
              </div>
            </div>
          </div>

          <button type="button" className="gp-btn" onClick={next} aria-label={t("char.next")} style={{
            position:"absolute", right:-10, top:"50%", transform:"translateY(-50%)",
            width:38, height:38, borderRadius:"50%", zIndex:10,
            background:"rgba(74,222,128,0.15)", border:"2px solid rgba(74,222,128,0.35)",
            color:"#4ade80", fontSize:20, cursor:"pointer",
            display:"flex", alignItems:"center", justifyContent:"center",
          }}>›</button>
        </div>

        <div style={{ display:"flex", justifyContent:"center", gap:8, margin:"18px 0 20px" }}>
          {CHARACTERS.map((ch,i)=>(
            <button type="button" className="gp-btn" key={ch.id} aria-label={ch.name}
              aria-current={i===idx ? "true" : undefined}
              onClick={()=>i!==idx&&goTo(i,i>idx?"left":"right")}
              style={{ width:i===idx?22:8, height:8, borderRadius:4, cursor:"pointer", border:"none", padding:0,
                background:i===idx?c.color:"#334155", transition:"all 0.3s" }}/>
          ))}
        </div>

        <Btn onClick={()=>onSelect(c)} style={{ width:"100%" }} color={c.color}>
          {t("char.start", { name: c.name })}
        </Btn>
      </Panel>
    </GardenWrap>
  );
}

/* ═══════════════════════════════════════════════════
   MAP SVG: rich garden with river + bridge
═══════════════════════════════════════════════════ */
function MapSVG({ completedModules }) {
  return (
    <svg style={{ position:"absolute", top:0, left:0, width:"100%", height:"100%", zIndex:0 }}
      viewBox="0 0 100 100" preserveAspectRatio="xMidYMid slice">
      <defs>
        <linearGradient id="skyG" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="#6bbde8"/>
          <stop offset="40%"  stopColor="#b8e4a0"/>
          <stop offset="100%" stopColor="#1a5c0a"/>
        </linearGradient>
        <radialGradient id="sunG" cx="78%" cy="10%" r="30%">
          <stop offset="0%"   stopColor="#fff9c4" stopOpacity="0.9"/>
          <stop offset="100%" stopColor="#6bbde8" stopOpacity="0"/>
        </radialGradient>
        <linearGradient id="riverG" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#3b82f6" stopOpacity="0.7"/>
          <stop offset="50%"  stopColor="#60a5fa" stopOpacity="0.9"/>
          <stop offset="100%" stopColor="#2563eb" stopOpacity="0.7"/>
        </linearGradient>
        <filter id="blur2">
          <feGaussianBlur stdDeviation="0.4"/>
        </filter>
      </defs>

      {/* Sky + sun glow */}
      <rect width="100" height="100" fill="url(#skyG)"/>
      <rect width="100" height="100" fill="url(#sunG)"/>

      {/* Sun disc */}
      <circle cx="78" cy="9" r="5" fill="#fff9c4" opacity="0.7"/>
      <circle cx="78" cy="9" r="8" fill="#fde68a" opacity="0.18"/>

      {/* Clouds */}
      <ellipse cx="20" cy="8"  rx="10" ry="4"  fill="white" opacity="0.55"/>
      <ellipse cx="26" cy="7"  rx="7"  ry="3.5" fill="white" opacity="0.45"/>
      <ellipse cx="14" cy="9"  rx="6"  ry="3"   fill="white" opacity="0.4"/>
      <ellipse cx="55" cy="12" rx="9"  ry="3.5" fill="white" opacity="0.45"/>
      <ellipse cx="62" cy="11" rx="6"  ry="3"   fill="white" opacity="0.38"/>

      {/* Distant mountains */}
      <path d="M0 38 L8 22 L16 38 Z"  fill="#4a6741" opacity="0.35"/>
      <path d="M12 38 L22 18 L32 38 Z" fill="#3d5a34" opacity="0.3"/>
      <path d="M70 38 L82 20 L94 38 Z" fill="#4a6741" opacity="0.32"/>
      {/* Snow caps */}
      <path d="M8 22 L11 28 L5 28 Z"  fill="white" opacity="0.45"/>
      <path d="M22 18 L25 25 L19 25 Z" fill="white" opacity="0.4"/>
      <path d="M82 20 L85 27 L79 27 Z" fill="white" opacity="0.4"/>

      {/* Ground */}
      <ellipse cx="50" cy="100" rx="72" ry="28" fill="#2d6b10" opacity="0.7"/>

      {/* Rolling hills */}
      <ellipse cx="18" cy="63" rx="28" ry="17" fill="#3a8020" opacity="0.45"/>
      <ellipse cx="80" cy="66" rx="26" ry="15" fill="#4a9030" opacity="0.4"/>
      <ellipse cx="50" cy="60" rx="34" ry="18" fill="#4a9030" opacity="0.32"/>

      {/* ─── RIVER (flows diagonally across the map) ─── */}
      {/* Main river body */}
      <path d="M0 55 Q15 52 22 56 Q30 61 38 58 Q46 55 54 59 Q62 63 72 60 Q82 57 100 62"
        stroke="url(#riverG)" strokeWidth="5.5" fill="none" strokeLinecap="round" opacity="0.85"/>
      {/* River shimmer highlights */}
      <path d="M0 55 Q15 52 22 56 Q30 61 38 58 Q46 55 54 59 Q62 63 72 60 Q82 57 100 62"
        stroke="white" strokeWidth="1.2" fill="none" strokeLinecap="round" opacity="0.25"
        strokeDasharray="3,5"
        style={{ animation:"riverFlow 2s linear infinite" }}/>
      {/* Deeper river channel */}
      <path d="M0 55.5 Q15 52.5 22 56.5 Q30 61.5 38 58.5 Q46 55.5 54 59.5 Q62 63.5 72 60.5 Q82 57.5 100 62.5"
        stroke="#1d4ed8" strokeWidth="2" fill="none" strokeLinecap="round" opacity="0.4"/>
      {/* River banks */}
      <path d="M0 52 Q15 49 22 53 Q30 58 38 55 Q46 52 54 56 Q62 60 72 57 Q82 54 100 59"
        stroke="#15803d" strokeWidth="2.5" fill="none" opacity="0.5"/>
      <path d="M0 58 Q15 55 22 59 Q30 64 38 61 Q46 58 54 62 Q62 66 72 63 Q82 60 100 65"
        stroke="#166534" strokeWidth="2.5" fill="none" opacity="0.5"/>
      {/* Reeds & water plants along banks */}
      {[[8,51],[18,60],[35,54],[50,58],[68,62],[85,58]].map(([x,y],i)=>(
        <g key={i}>
          <rect x={x-0.3} y={y-4} width="0.7" height="4" rx="0.3" fill="#15803d" opacity="0.8"/>
          <ellipse cx={x} cy={y-4} rx="1.5" ry="0.8" fill="#4ade80" opacity="0.6"/>
        </g>
      ))}
      {/* Water lily pads */}
      <ellipse cx="30" cy="58" rx="2.5" ry="1.2" fill="#16a34a" opacity="0.7"/>
      <ellipse cx="60" cy="61" rx="2"   ry="1"   fill="#16a34a" opacity="0.65"/>
      <text x="29" y="59" fontSize="2.2" style={{ userSelect:"none" }}>🌸</text>
      <text x="59" y="62" fontSize="2.2" style={{ userSelect:"none" }}>🌸</text>

      {/* ─── STONE BRIDGE (crosses river at x≈46, y≈57) ─── */}
      {/* Bridge shadow */}
      <ellipse cx="46" cy="59" rx="8" ry="2" fill="#0f172a" opacity="0.25"/>
      {/* Bridge road surface */}
      <rect x="38" y="55.5" width="16" height="4" rx="1" fill="#a8956a"/>
      {/* Stone blocks texture */}
      {[39,41,43,45,47,49,51].map(x=>(
        <rect key={x} x={x} y="55.5" width="1.6" height="4" rx="0.3"
          fill="#8b7355" opacity="0.4"/>
      ))}
      {/* Bridge railings */}
      <rect x="38" y="54.5" width="16" height="1.2" rx="0.6" fill="#d4b896"/>
      <rect x="38" y="59.5" width="16" height="1.2" rx="0.6" fill="#c4a882"/>
      {/* Railing posts */}
      {[38.5,41,43.5,46,48.5,51,53].map(x=>(
        <rect key={x} x={x} y="53.8" width="0.8" height="7" rx="0.4" fill="#b8965a"/>
      ))}
      {/* Arch under bridge */}
      <path d="M40 59.5 Q46 62 52 59.5" stroke="#7a6040" strokeWidth="1.2" fill="none" opacity="0.7"/>
      {/* Bridge stones: decorative */}
      <ellipse cx="46" cy="57.5" rx="7.5" ry="1.8" fill="#c9ad80" opacity="0.15"/>
      {/* Moss/vine on bridge */}
      <text x="37" y="60" fontSize="2.5" style={{ userSelect:"none" }}>🌿</text>
      <text x="51" y="58" fontSize="2.5" style={{ userSelect:"none" }}>🌿</text>

      {/* Waterfall (right side) */}
      <path d="M86 8 Q92 6 96 8 L97 35 Q91 33 85 35 Z" fill="#5a6978" opacity="0.85"/>
      <path d="M87 10 Q91 8 95 10 L96 33 Q91 32 86 33 Z" fill="#4a5568" opacity="0.7"/>
      <rect x="88" y="34" width="3"   height="28" rx="1.5"  fill="#7dd3fc" opacity="0.75"/>
      <rect x="92" y="34" width="2.5" height="25" rx="1.25" fill="#93c5fd" opacity="0.65"/>
      <ellipse cx="91" cy="68" rx="8" ry="3.5" fill="#3b82f6" opacity="0.5"/>
      <ellipse cx="91" cy="67" rx="5" ry="2"   fill="#60a5fa" opacity="0.55"/>
      <ellipse cx="91" cy="71" rx="10" ry="4"  fill="white"   opacity="0.1"/>

      {/* Small pond */}
      <ellipse cx="18" cy="75" rx="8" ry="4"   fill="#7dd3fc" opacity="0.55"/>
      <ellipse cx="18" cy="74.5" rx="5" ry="2.5" fill="#bae6fd" opacity="0.4"/>
      {/* Pond ripples */}
      <ellipse cx="18" cy="75" rx="6" ry="2.8" fill="none" stroke="#93c5fd" strokeWidth="0.4" opacity="0.5"/>

      {/* ─── DENSE FOREST (left cluster) ─── */}
      <g opacity="0.85">
        {/* Tall oaks */}
        <rect x="3"  y="40" width="3.5" height="16" rx="1.2" fill="#5c3a10"/>
        <ellipse cx="4.75" cy="38" rx="7"  ry="9"  fill="#1a5c0a"/>
        <ellipse cx="4.75" cy="36" rx="5"  ry="6"  fill="#22701a"/>
        <rect x="10" y="42" width="3"   height="14" rx="1.2" fill="#5c3a10"/>
        <ellipse cx="11.5" cy="40" rx="6"  ry="8"  fill="#166534"/>
        <ellipse cx="11.5" cy="38" rx="4"  ry="5.5" fill="#1a7a3a"/>
        {/* Pine trees */}
        <rect x="1"  y="48" width="2"   height="10" rx="0.8" fill="#5c3a10"/>
        <path d="M2 48 L-2 56 L6 56 Z" fill="#064e1a" opacity="0.9"/>
        <path d="M2 44 L-1 50 L5 50 Z" fill="#0a6622" opacity="0.9"/>
        <path d="M2 41 L0  46 L4 46 Z" fill="#0d7a28"/>
        {/* Birch */}
        <rect x="16" y="36" width="2"   height="18" rx="0.8" fill="#d4c5a9"/>
        <ellipse cx="17" cy="34" rx="4.5" ry="7"  fill="#2d7a15"/>
        <rect x="16.3" y="40" width="1.5" height="1" fill="#555" opacity="0.4" rx="0.3"/>
        <rect x="16.3" y="44" width="1.5" height="1" fill="#555" opacity="0.4" rx="0.3"/>
      </g>

      {/* ─── RIGHT TREE CLUSTER ─── */}
      <g opacity="0.8">
        <rect x="73" y="42" width="3"   height="14" rx="1" fill="#5c3a10"/>
        <ellipse cx="74.5" cy="40" rx="6"  ry="8"  fill="#1a5c0a"/>
        <ellipse cx="74.5" cy="38" rx="4.5" ry="6" fill="#22701a"/>
        <rect x="79" y="44" width="2.5" height="13" rx="1" fill="#5c3a10"/>
        <ellipse cx="80.2" cy="42" rx="5"  ry="7"  fill="#15803d"/>
        {/* Fruit tree */}
        <rect x="82" y="46" width="2"   height="11" rx="0.8" fill="#78350f"/>
        <ellipse cx="83" cy="44" rx="4.5" ry="5.5" fill="#16a34a"/>
        <text x="81.5" y="47" fontSize="2.5" style={{ userSelect:"none" }}>🍎</text>
        <text x="83.5" y="46" fontSize="2"   style={{ userSelect:"none" }}>🍎</text>
      </g>

      {/* ─── MID-MAP TREES (around path) ─── */}
      <g opacity="0.75">
        <rect x="55" y="30" width="2.5" height="11" rx="1" fill="#5c3a10"/>
        <ellipse cx="56.2" cy="28" rx="5" ry="7" fill="#166534"/>
        <rect x="34" y="48" width="2"   height="9"  rx="0.8" fill="#5c3a10"/>
        <ellipse cx="35" cy="46" rx="4" ry="5.5" fill="#15803d"/>
        <rect x="60" y="46" width="2"   height="9"  rx="0.8" fill="#5c3a10"/>
        <ellipse cx="61" cy="44" rx="4.5" ry="6" fill="#1a5c0a"/>
      </g>

      {/* ─── BUSHES & SHRUBS ─── */}
      {[[8,70],[22,66],[42,80],[62,76],[76,72],[90,75],[30,35],[50,24]].map(([cx,cy],i)=>(
        <g key={i}>
          <ellipse cx={cx}   cy={cy}   rx="4"   ry="2.8" fill="#166534" opacity="0.7"/>
          <ellipse cx={cx-2} cy={cy-1} rx="2.5" ry="2"   fill="#15803d" opacity="0.65"/>
          <ellipse cx={cx+2} cy={cy-1} rx="2.5" ry="2"   fill="#1a7a3a" opacity="0.65"/>
        </g>
      ))}

      {/* ─── FLOWERS scatter ─── */}
      {[[20,82],[65,79],[40,86],[58,83],[78,77],[10,73],[88,83],[32,88],[72,85]].map(([cx,cy],i)=>(
        <text key={i} x={cx-1.5} y={cy+1} fontSize="3.5" textAnchor="middle" style={{ userSelect:"none" }}>
          {["🌸","🌼","🌺","🌻","🌷","💐","🌸","🌼","🌺"][i]}
        </text>
      ))}

      {/* ─── BIRDS ─── */}
      <text x="30" y="15" fontSize="4" style={{ userSelect:"none", animation:"birdFly 2s ease-in-out infinite" }}>🐦</text>
      <text x="48" y="19" fontSize="3" style={{ userSelect:"none", animation:"birdFly 2.4s 0.5s ease-in-out infinite" }}>🐦</text>
      <text x="62" y="14" fontSize="3.5" style={{ userSelect:"none", animation:"birdFly 1.8s 1s ease-in-out infinite" }}>🦋</text>

      {/* ─── ROCKS & BOULDERS ─── */}
      <ellipse cx="25" cy="72" rx="3"   ry="1.8" fill="#6b7280" opacity="0.6"/>
      <ellipse cx="26" cy="71" rx="1.8" ry="1.2" fill="#9ca3af" opacity="0.5"/>
      <ellipse cx="70" cy="68" rx="2.5" ry="1.5" fill="#6b7280" opacity="0.55"/>
      <ellipse cx="71" cy="67" rx="1.5" ry="1"   fill="#9ca3af" opacity="0.45"/>
      <ellipse cx="42" cy="35" rx="2"   ry="1.2" fill="#6b7280" opacity="0.5"/>

      {/* ─── DIRT PATH ─── */}
      {/* Shadow */}
      <path d="M50 90 Q34 86 18 82 Q46 78 72 74 Q50 70 24 66 Q48 62 70 58 Q48 54 24 50 Q48 46 68 42 Q48 38 26 34 Q44 30 60 26"
        stroke="#3a2010" strokeWidth="5" fill="none" strokeLinecap="round" opacity="0.3"
        transform="translate(0.6,0.6)"/>
      {/* Main path */}
      <path d="M50 90 Q34 86 18 82 Q46 78 72 74 Q50 70 24 66 Q48 62 70 58 Q48 54 24 50 Q48 46 68 42 Q48 38 26 34 Q44 30 60 26"
        stroke="#c8a96e" strokeWidth="4" fill="none" strokeLinecap="round" opacity="0.75"/>
      {/* Path highlight */}
      <path d="M50 90 Q34 86 18 82 Q46 78 72 74 Q50 70 24 66 Q48 62 70 58 Q48 54 24 50 Q48 46 68 42 Q48 38 26 34 Q44 30 60 26"
        stroke="white" strokeWidth="0.7" fill="none" strokeLinecap="round" opacity="0.25"
        strokeDasharray="2,4"/>
      {/* Path stones */}
      {[[50,90],[34,86],[18,82],[45,78],[72,74],[48,70],[24,66],[47,62],[70,58],[47,54],
        [24,50],[46,46],[68,42],[47,38],[26,34],[43,30],[60,26]].map(([x,y],i)=>(
        <ellipse key={i} cx={x} cy={y} rx="1.2" ry="0.7" fill="#e5d5b0" opacity="0.3"
          transform={`rotate(${i*25} ${x} ${y})`}/>
      ))}

      {/* Completed path glow */}
      {completedModules>=1&&<path d="M50 90 Q34 86 18 82" stroke="#4ade80" strokeWidth="3.8" fill="none" strokeLinecap="round" opacity="0.9"/>}
      {completedModules>=2&&<path d="M18 82 Q46 78 72 74" stroke="#4ade80" strokeWidth="3.8" fill="none" strokeLinecap="round" opacity="0.9"/>}
      {completedModules>=3&&<path d="M72 74 Q50 70 24 66" stroke="#4ade80" strokeWidth="3.8" fill="none" strokeLinecap="round" opacity="0.9"/>}
      {completedModules>=4&&<path d="M24 66 Q48 62 70 58" stroke="#4ade80" strokeWidth="3.8" fill="none" strokeLinecap="round" opacity="0.9"/>}
      {completedModules>=5&&<path d="M70 58 Q48 54 24 50" stroke="#4ade80" strokeWidth="3.8" fill="none" strokeLinecap="round" opacity="0.9"/>}
      {completedModules>=6&&<path d="M24 50 Q48 46 68 42" stroke="#4ade80" strokeWidth="3.8" fill="none" strokeLinecap="round" opacity="0.9"/>}
      {completedModules>=7&&<path d="M68 42 Q48 38 26 34" stroke="#4ade80" strokeWidth="3.8" fill="none" strokeLinecap="round" opacity="0.9"/>}
      {completedModules>=8&&<path d="M26 34 Q44 30 60 26" stroke="#4ade80" strokeWidth="3.8" fill="none" strokeLinecap="round" opacity="0.9"/>}

      {/* Aristotle person near start */}
      <image href={asset("Aristotle.png")} x="55" y="81" width="11" height="15"
        style={{ imageRendering:"pixelated" }} opacity="0.9"/>
    </svg>
  );
}

/* ═══════════════════════════════════════════════════
   MAP SCREEN
═══════════════════════════════════════════════════ */
function MapScreen({ language, character, modules = MODULES, completedModules, prevCompleted, onStartModule, onBack, onViewCertificate, onPlayAgain, onLogout, onChangeLanguage }) {
  const t = useT();
  const [charPos,         setCharPos]         = useState(PATH_NODES[prevCompleted]);
  const [isWalking,       setIsWalking]       = useState(false);
  const [showCelebration, setShowCelebration] = useState(false);
  const [zoom,            setZoom]            = useState(1);
  const [pan,             setPan]             = useState({ x:0, y:0 });
  const mapContainerRef = useRef(null);
  const lastPinchDist   = useRef(null);
  const lastTouchPos    = useRef(null);
  const isDragging      = useRef(false);
  const dragStart       = useRef(null);
  const stepQueue       = useRef([]);
  const animRef         = useRef(null);
  const currentNodeRef  = useRef(prevCompleted);

  const clampZoom = z => Math.min(Math.max(z, 0.55), 3.2);
  function clampPan(x, y, z) {
    const zz = z ?? zoom;
    const ms = (zz-1)*160;
    return { x:Math.min(Math.max(x,-ms),ms), y:Math.min(Math.max(y,-ms),ms) };
  }

  function walkNextStep() {
    if (stepQueue.current.length===0) {
      setIsWalking(false);
      if (completedModules > prevCompleted) {
        setShowCelebration(true);
        setTimeout(()=>setShowCelebration(false), 2500);
      }
      return;
    }
    const target = stepQueue.current.shift();
    animateTo(currentNodeRef.current, target, ()=>{
      currentNodeRef.current = target;
      walkNextStep();
    });
  }

  function animateTo(fromIdx, toIdx, done) {
    const from=PATH_NODES[fromIdx]; const to=PATH_NODES[toIdx];
    setIsWalking(true);
    let start=null; const DUR=950;
    function step(ts) {
      if (!start) start=ts;
      const raw=Math.min((ts-start)/DUR,1);
      const t=easeInOut(raw);
      setCharPos({ x:lerp(from.x,to.x,t), y:lerp(from.y,to.y,t) });
      if (raw<1) { animRef.current=requestAnimationFrame(step); }
      else { setCharPos(to); done(); }
    }
    cancelAnimationFrame(animRef.current);
    animRef.current=requestAnimationFrame(step);
  }
  useEffect(()=>()=>cancelAnimationFrame(animRef.current),[]);

  // Walk the character from its previous node to the newly unlocked one, once on mount.
  useEffect(() => {
    if (completedModules <= prevCompleted) return;
    const queue = [];
    for (let i=prevCompleted+1; i<=completedModules; i++) queue.push(i);
    stepQueue.current = queue;
    walkNextStep();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally mount-only
  }, []);

  function onWheel(e) {
    e.preventDefault();
    const delta=e.deltaY>0?-0.12:0.12;
    setZoom(z=>{ const nz=clampZoom(z+delta); setPan(p=>clampPan(p.x,p.y,nz)); return nz; });
  }
  function onTouchStart(e) {
    if (e.touches.length===2) {
      const dx=e.touches[0].clientX-e.touches[1].clientX;
      const dy=e.touches[0].clientY-e.touches[1].clientY;
      lastPinchDist.current=Math.sqrt(dx*dx+dy*dy);
      lastTouchPos.current=null;
    } else if (e.touches.length===1) {
      lastTouchPos.current={x:e.touches[0].clientX,y:e.touches[0].clientY};
    }
  }
  function onTouchMove(e) {
    if (e.touches.length===2) {
      e.preventDefault();
      const dx=e.touches[0].clientX-e.touches[1].clientX;
      const dy=e.touches[0].clientY-e.touches[1].clientY;
      const dist=Math.sqrt(dx*dx+dy*dy);
      if (lastPinchDist.current) {
        const ratio=dist/lastPinchDist.current;
        setZoom(z=>{ const nz=clampZoom(z*ratio); setPan(p=>clampPan(p.x,p.y,nz)); return nz; });
      }
      lastPinchDist.current=dist;
    } else if (e.touches.length===1&&lastTouchPos.current) {
      const dx=e.touches[0].clientX-lastTouchPos.current.x;
      const dy=e.touches[0].clientY-lastTouchPos.current.y;
      setPan(p=>clampPan(p.x+dx,p.y+dy));
      lastTouchPos.current={x:e.touches[0].clientX,y:e.touches[0].clientY};
    }
  }
  function onTouchEnd()  { lastPinchDist.current=null; lastTouchPos.current=null; }
  function onMouseDown(e){ isDragging.current=true; dragStart.current={x:e.clientX-pan.x,y:e.clientY-pan.y}; }
  function onMouseMove(e){ if(!isDragging.current) return; setPan(clampPan(e.clientX-dragStart.current.x,e.clientY-dragStart.current.y)); }
  function onMouseUp()   { isDragging.current=false; }

  useEffect(()=>{
    const el=mapContainerRef.current; if(!el) return;
    el.addEventListener("wheel",onWheel,{passive:false});
    return ()=>el.removeEventListener("wheel",onWheel);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- listener only uses functional state updates
  },[]);

  function zoomIn()    { setZoom(z=>{ const nz=clampZoom(z+0.25); setPan(p=>clampPan(p.x,p.y,nz)); return nz; }); }
  function zoomOut()   { setZoom(z=>{ const nz=clampZoom(z-0.25); setPan(p=>clampPan(p.x,p.y,nz)); return nz; }); }
  function zoomReset() { setZoom(1); setPan({x:0,y:0}); }

  return (
    <GardenWrap>
      <Panel style={{ padding:0, overflow:"hidden" }}>
        {/* Header */}
        <div style={{ padding:"16px 20px 12px", borderBottom:"1px solid rgba(74,222,128,0.12)" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <BackBtn onClick={onBack}/>
            <div style={{ display:"flex", alignItems:"center", gap:10, marginBottom:16 }}>
              <button type="button" className="gp-btn" onClick={onChangeLanguage}
                aria-label={t("map.changeLang")} title={t("map.changeLang")}
                style={{ background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)",
                  borderRadius:10, padding:"5px 10px", cursor:"pointer", fontSize:13, color:"#cbd5e1",
                  fontWeight:800, display:"flex", alignItems:"center", gap:5 }}>
                <span style={{ fontSize:15 }}>{language.flag}</span> 🌐
              </button>
              <button type="button" className="gp-btn" onClick={onLogout} style={{
                background:"none", border:"none", color:"#f87171", fontSize:12,
                cursor:"pointer", textDecoration:"underline", fontFamily:"inherit",
              }}>{t("map.logout")}</button>
            </div>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <img src={character.idle} alt={character.name}
              style={{ width:42, height:56, objectFit:"contain", flexShrink:0 }}/>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:900, fontSize:15, color:"#f0fdf4" }}>{t("map.journey", { name: character.name })}</div>
              <div style={{ color:"#86efac", fontSize:12 }}>
                {language.flag} {language.label} · {t("map.completed", { done: completedModules, total: MODULES.length })}
              </div>
            </div>
            <div style={{ width:80 }}>
              <div style={{ height:7, borderRadius:999, background:"#0f2a0f", overflow:"hidden" }}>
                <div style={{
                  height:"100%", borderRadius:999,
                  width:`${(completedModules/MODULES.length)*100}%`,
                  background:"linear-gradient(90deg,#22c55e,#86efac)",
                  transition:"width 1s ease",
                }}/>
              </div>
              <div style={{ textAlign:"right", fontSize:10, color:"#4ade80", marginTop:2 }}>
                {Math.round((completedModules/MODULES.length)*100)}%
              </div>
            </div>
          </div>
        </div>

        {/* Map */}
        <div ref={mapContainerRef}
          style={{ position:"relative", overflow:"hidden", height:440, cursor:zoom>1?"grab":"default", userSelect:"none" }}
          onMouseDown={onMouseDown} onMouseMove={onMouseMove}
          onMouseUp={onMouseUp} onMouseLeave={onMouseUp}
          onTouchStart={onTouchStart} onTouchMove={onTouchMove} onTouchEnd={onTouchEnd}>

          <div style={{
            position:"absolute", inset:0,
            transform:`translate(${pan.x}px,${pan.y}px) scale(${zoom})`,
            transformOrigin:"center center",
            transition:isDragging.current?"none":"transform 0.15s ease",
            width:"100%", height:"100%",
          }}>
            <MapSVG completedModules={completedModules}/>

            {/* Module nodes */}
            {modules.map((mod,i)=>(
              <MapNode key={mod.id} mod={mod} node={PATH_NODES[i+1]}
                label={completedModules<i ? t("map.moduleLocked",{ n: mod.id }) : `${t("map.module",{ n: mod.id })}: ${mod.title}`}
                done={completedModules>i} current={completedModules===i}
                locked={completedModules<i}
                onClick={()=>!isWalking&&completedModules>=i&&onStartModule(mod)}/>
            ))}

            {/* Labels */}
            <div style={{ position:"absolute", left:`${PATH_NODES[PATH_NODES.length-1].x}%`,
              top:`${PATH_NODES[PATH_NODES.length-1].y-10}%`, transform:"translate(-50%,-50%)",
              fontSize:20, zIndex:6, filter:"drop-shadow(0 2px 6px rgba(0,0,0,0.6))" }}>🏁</div>
            <div style={{ position:"absolute", left:`${PATH_NODES[0].x}%`, top:`${PATH_NODES[0].y+6}%`,
              transform:"translate(-50%,-50%)", fontSize:9, color:"#ffe066", fontWeight:900, zIndex:6,
              letterSpacing:1, textShadow:"0 1px 4px rgba(0,0,0,0.8)" }}>{t("map.start")}</div>

            {/* Walking character */}
            <div style={{
              position:"absolute",
              left:`${charPos.x}%`, top:`${charPos.y}%`,
              transform:`translate(-50%,-110%) scale(${1/zoom*1.15})`,
              zIndex:10, textAlign:"center", transformOrigin:"bottom center",
            }}>
              <div style={{ background:"white", color:"#0f172a", borderRadius:6,
                padding:"2px 7px", fontSize:9, fontWeight:900, whiteSpace:"nowrap",
                marginBottom:2, boxShadow:`0 2px 10px ${character.color}88` }}>
                {character.name}
              </div>
              <img src={isWalking?character.happy:character.idle} alt={character.name}
                style={{ width:44, height:59, objectFit:"contain", display:"block", margin:"0 auto",
                  filter:`drop-shadow(0 4px 12px ${character.color}cc)`,
                  animation:isWalking?"walkBob 0.35s ease-in-out infinite":"idleFloat 3s ease-in-out infinite",
                }}/>
            </div>

            {/* Celebration */}
            {showCelebration&&(
              <div style={{ position:"absolute",inset:0,display:"flex",flexDirection:"column",
                alignItems:"center",justifyContent:"center",zIndex:20,pointerEvents:"none" }}>
                {["🎉","⭐","🌟","🎊","✨"].map((e,i)=>(
                  <span key={i} style={{
                    position:"absolute", left:`${15+i*16}%`, top:`${20+i*8}%`,
                    fontSize:28, animation:"celebPop 2.2s ease forwards",
                    animationDelay:`${i*0.15}s`,
                  }}>{e}</span>
                ))}
              </div>
            )}
          </div>

          {/* Zoom controls */}
          <div style={{ position:"absolute",bottom:12,right:12,display:"flex",flexDirection:"column",gap:6,zIndex:30 }}>
            {[{label:"+",fn:zoomIn,aria:t("map.zoomIn")},{label:"⟳",fn:zoomReset,aria:t("map.zoomReset")},{label:"−",fn:zoomOut,aria:t("map.zoomOut")}].map(({label,fn,aria})=>(
              <button type="button" className="gp-btn" key={label} onClick={fn} aria-label={aria} title={aria} style={{
                width:36,height:36,borderRadius:10,
                background:"rgba(15,30,15,0.85)",border:"1.5px solid rgba(74,222,128,0.3)",
                color:"#86efac",fontSize:16,fontWeight:900,cursor:"pointer",
                display:"flex",alignItems:"center",justifyContent:"center",
                backdropFilter:"blur(8px)",
              }}>{label}</button>
            ))}
          </div>
          <div style={{ position:"absolute",bottom:12,left:12,
            background:"rgba(15,30,15,0.7)",borderRadius:8,padding:"3px 9px",
            fontSize:10,color:"#4ade80",border:"1px solid rgba(74,222,128,0.25)",
            backdropFilter:"blur(8px)",zIndex:30 }}>
            {Math.round(zoom*100)}% · {t("map.zoomHint")}
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding:"10px 20px",borderTop:"1px solid rgba(74,222,128,0.12)",textAlign:"center" }}>
          <p aria-live="polite" style={{ color:"#9ca3af", fontSize:12 }}>
            {isWalking&&t("map.walking", { name: character.name })}
            {!isWalking&&completedModules===0&&t("map.tapFirst")}
            {!isWalking&&completedModules>0&&completedModules<MODULES.length&&t("map.next")}
            {!isWalking&&completedModules>=MODULES.length&&t("map.done")}
          </p>
          {completedModules>=MODULES.length && (
            <div style={{ marginTop:10, display:"flex", gap:8, justifyContent:"center", flexWrap:"wrap" }}>
              <Btn onClick={onViewCertificate} color="#fbbf24">{t("map.viewCert")}</Btn>
              <Btn onClick={onPlayAgain} color="#3b82f6">{t("map.playAgain")}</Btn>
            </div>
          )}
        </div>
      </Panel>
    </GardenWrap>
  );
}

/* Map node */
function MapNode({ mod, node, done, current, locked, onClick, label }) {
  const [hov, setHov] = useState(false);
  const ring = done?"#4ade80":current?"#fbbf24":"#6b8f4a";
  const bg   = done?"linear-gradient(135deg,#166534,#22c55e)"
    :current?"linear-gradient(135deg,#78350f,#d97706)"
    :"linear-gradient(135deg,#1c3a10,#2d5a1b)";
  return (
    <button type="button" className="gp-node" onClick={onClick} disabled={locked}
      aria-label={label} title={label}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{ position:"absolute", left:`${node.x}%`, top:`${node.y}%`,
        transform:"translate(-50%,-50%)", cursor:locked?"not-allowed":"pointer", zIndex:5,
        background:"none", border:"none", padding:0, borderRadius:"50%", color:"inherit" }}>
      {(current||(!locked&&hov))&&(
        <div style={{ position:"absolute",width:68,height:68,borderRadius:"50%",
          top:"50%",left:"50%",transform:"translate(-50%,-50%)",
          background:ring,opacity:0.3,filter:"blur(10px)",
          animation:"nodePulse 1.8s ease-in-out infinite",pointerEvents:"none" }}/>
      )}
      <div style={{ width:50,height:50,borderRadius:"50%",background:bg,border:`3px solid ${ring}`,
        display:"flex",alignItems:"center",justifyContent:"center",fontSize:21,transition:"transform 0.18s",
        transform:hov&&!locked?"scale(1.22)":"scale(1)",
        filter:locked?"grayscale(1) brightness(0.45)":"none",
        boxShadow:!locked?`0 0 18px ${ring}77,inset 0 2px 4px rgba(255,255,255,0.15)`:"none" }}>
        {done?"✅":locked?"🔒":mod.icon}
      </div>
      <div style={{ position:"absolute",top:"calc(100% + 5px)",left:"50%",transform:"translateX(-50%)",
        fontSize:9,fontWeight:900,whiteSpace:"nowrap",textAlign:"center",
        color:done?"#4ade80":current?"#fbbf24":"#6b8f4a",
        background:"rgba(0,0,0,0.7)",borderRadius:5,padding:"2px 7px",
        border:`1px solid ${done?"#4ade8044":current?"#fbbf2444":"#3a5a2044"}` }}>
        M{mod.id}
      </div>
    </button>
  );
}
/* ═══════════════════════════════════════════════════
   GAME SCREEN: cinematic encounter + quiz
═══════════════════════════════════════════════════ */
// Random permutation of 0..n-1 (Fisher-Yates).
function randomPermutation(n) {
  const idx = Array.from({ length:n }, (_,i)=>i);
  for (let i=n-1;i>0;i--) {
    const j=Math.floor(Math.random()*(i+1));
    [idx[i],idx[j]]=[idx[j],idx[i]];
  }
  return idx;
}
const OPTION_LETTERS = ["A","B","C","D","E","F"];

function GameScreen({ mod, character, questions, onFinish, onExit }) {
  const t = useT();
  const isMobile = useIsMobile();
  const [phase,     setPhase]     = useState("encounter");
  const [idx,       setIdx]       = useState(0);
  const [selected,  setSelected]  = useState(null);
  const [correct,   setCorrect]   = useState(false);
  const [score,     setScore]     = useState(0);
  const [AristotleIn,    setAristotleIn]    = useState(false);
  const [showCloud, setShowCloud] = useState(false);
  const [showCoin,  setShowCoin]  = useState(false);
  const [showPocket,setShowPocket]= useState(false);
  const [animKey,   setAnimKey]   = useState(0);
  const timers = useRef([]);

  // Option order is shuffled once per play-through (images stay paired with their captions)
  // and the correct answer's index is remapped to match.
  const [perms] = useState(()=>questions.map(q=>randomPermutation(q.options.length)));
  const shuffled = useMemo(()=>questions.map((q,qi)=>{
    const perm = perms[qi] || q.options.map((_,i)=>i);
    return {
      ...q,
      options: perm.map(i=>q.options[i]),
      images: Array.isArray(q.images) ? perm.map(i=>q.images[i]) : null,
      answer: perm.indexOf(q.answer),
    };
  }),[questions, perms]);

  const q     = shuffled[idx];
  const total = shuffled.length;

  function clearTimers() { timers.current.forEach(clearTimeout); timers.current=[]; }

  useEffect(()=>{
    if (phase!=="encounter") return;
    clearTimers();
    const t1=setTimeout(()=>setAristotleIn(true),  300);
    const t2=setTimeout(()=>setShowCloud(true), 2200);
    const t3=setTimeout(()=>setPhase("question"), 4000);
    timers.current=[t1,t2,t3];
    return clearTimers;
  },[idx,phase]);

  useEffect(()=>()=>clearTimers(),[]);

  function handleAnswer(i) {
    if (phase!=="question"||selected!==null) return;
    const ok = i===q.answer;
    setSelected(i); setCorrect(ok); setAnimKey(k=>k+1);
    if (ok) setScore(s=>s+1);
    setPhase("feedback");
    if (ok) {
      setShowCoin(true);
      setTimeout(()=>setShowPocket(true), 1200);
      setTimeout(()=>{ setShowCoin(false); setShowPocket(false); }, 2200);
    }
  }

function handleNext() {
  clearTimers();
  if (idx===total-1) { onFinish(score); return; }
  setIdx(i=>i+1);
  setSelected(null); setCorrect(false); setShowCoin(false); setShowPocket(false);
  setPhase("question"); // skip the arrival cinematic: thexy already arrived, Aristotle just asks
}

  const AristotleImg = phase==="feedback"
    ?(correct?asset("happy_Aristotle.png"):asset("angry_Aristotle.png"))
    :asset("Aristotle.png");
  const charImg = phase==="feedback"
    ?(correct?character.happy:character.sad)
    :character.idle;
  const progress = ((idx+(phase==="feedback"?1:0))/total)*100;

  return (
    <div style={{
      position:"fixed", inset:0, overflow:"hidden",
      background:"linear-gradient(180deg,#6bbde8 0%,#a8ddb5 35%,#4caf50 68%,#2d7d32 100%)",
      fontFamily:"'Nunito','Segoe UI',sans-serif",
    }}>
      <GlobalStyles/>

      {/* ═══ RICH GARDEN BACKGROUND ═══
          The same living landscape as every other screen (see NatureScene.jsx):
          mountains, forests, waterfall, river, pond, meadow flowers, butterflies. */}
      <NatureScene/>

      {/* Progress bar */}
      <div style={{ position:"absolute",top:0,left:0,right:0,height:6,zIndex:20 }}>
        <div style={{
          height:"100%", width:`${progress}%`,
          background:`linear-gradient(90deg,${mod.color},#86efac)`,
          transition:"width 0.4s", boxShadow:`0 0 10px ${mod.color}88`,
        }}/>
      </div>

      {/* Score + Q counter */}
      <div style={{ position:"absolute",top:10,left:0,right:0,
        display:"flex",justifyContent:"space-between",alignItems:"center",
        padding:"0 16px",zIndex:20 }}>
        <div style={{ background:"rgba(0,0,0,0.45)",borderRadius:10,padding:"4px 10px",
          color:"#86efac",fontSize:12,fontWeight:800,backdropFilter:"blur(6px)",
          border:"1px solid rgba(74,222,128,0.2)" }}>{t("game.q", { n: idx+1, total })}</div>
        <div style={{ display:"flex", gap:8, alignItems:"center" }}>
          <div style={{ background:"rgba(0,0,0,0.45)",borderRadius:10,padding:"4px 10px",
            fontSize:12,fontWeight:800,backdropFilter:"blur(6px)",
            border:"1px solid rgba(74,222,128,0.2)",color:"#fbbf24" }}>⭐ {score}</div>
          {onExit && (
            <button type="button" className="gp-btn"
              onClick={()=>{ if (window.confirm(t("game.exitConfirm"))) { clearTimers(); onExit(); } }}
              style={{ background:"rgba(0,0,0,0.45)",borderRadius:10,padding:"4px 10px",
                fontSize:12,fontWeight:800,backdropFilter:"blur(6px)",cursor:"pointer",
                border:"1px solid rgba(255,255,255,0.18)",color:"#e2e8f0" }}>
              {t("game.exit")}
            </button>
          )}
        </div>
      </div>

      {/* ═══ ENCOUNTER PHASE ═══ */}
{phase==="encounter"&&(
  <div style={{ position:"absolute",inset:0,display:"flex",
    alignItems:"flex-end",justifyContent:"center",paddingBottom:"30%",zIndex:10 }}>

    {/* Character - left */}
    <div style={{ position:"absolute",left:"8%",bottom:"32%",
      textAlign:"center",animation:"slideInLeft 0.5s ease" }}>
      <img src={character.idle} alt={character.name} style={{
        height:"clamp(120px, 22vh, 220px)",width:"auto",aspectRatio:"2 / 3",objectFit:"contain",display:"block",
        filter:`drop-shadow(0 0 1.5px #fff) drop-shadow(0 0 1.5px #fff) drop-shadow(0 8px 20px ${character.color}aa)`,
        animation:"charIdle 3s ease-in-out infinite",
      }}/>
      <div style={{ background:character.color,color:"#fff",borderRadius:999,border:"2px solid #fff",
        padding:"3px 12px",fontSize:"clamp(11px, 1.3vw, 14px)",fontWeight:900,marginTop:4,display:"inline-block",
        textShadow:"0 1px 2px rgba(0,0,0,0.3)",
        boxShadow:`0 2px 10px ${character.color}88` }}>{character.name}</div>
    </div>

    {/* ── Question cloud: centered above both characters ── */}
      {showCloud&&(
        <div style={{
          position:"absolute",
          bottom:"62%",
          left:0,
          right:0,
          margin:"0 auto",
          width:"min(320px, 84vw)",
          background:"white", color:"#1e293b",
          borderRadius:24, padding:"18px 20px",
          fontSize:14, fontWeight:800, lineHeight:1.6,
          boxShadow:"0 12px 48px rgba(0,0,0,0.32), 0 2px 8px rgba(0,0,0,0.15)",
          animation:"cloudAppear 0.55s cubic-bezier(0.175,0.885,0.32,1.275)",
          zIndex:20,
          textAlign:"center",
        }}>
        {/* Cloud bumps on top */}
        <div style={{ position:"absolute",top:-12,left:"18%",
          width:32,height:22,background:"white",borderRadius:"50%",
          boxShadow:"0 -2px 6px rgba(0,0,0,0.08)" }}/>
        <div style={{ position:"absolute",top:-18,left:"38%",
          width:42,height:30,background:"white",borderRadius:"50%",
          boxShadow:"0 -2px 6px rgba(0,0,0,0.08)" }}/>
        <div style={{ position:"absolute",top:-12,left:"60%",
          width:32,height:22,background:"white",borderRadius:"50%",
          boxShadow:"0 -2px 6px rgba(0,0,0,0.08)" }}/>
        {/* Cloud tail pointing down-right toward Aristotle */}
        <div style={{ position:"absolute",bottom:-16,right:"22%",
          width:0,height:0,
          borderLeft:"16px solid transparent",
          borderRight:"16px solid transparent",
          borderTop:"18px solid white" }}/>
        <div style={{ color:"#7c3aed",fontSize:11,fontWeight:900,
          marginBottom:8,textTransform:"uppercase",letterSpacing:1.2,
          display:"flex",alignItems:"center",justifyContent:"center",gap:6 }}>
          <span>📜</span> {t("game.asksCloud")}
        </div>
        <div style={{ color:"#1e293b",fontSize:15,fontWeight:800,lineHeight:1.6 }}>
          {q.text}
        </div>
      </div>
    )}

    {/* Aristotle walks in */}
    <div style={{
      position:"absolute", bottom:"32%",
      animation:AristotleIn?"AristotleWalkIn 1.8s cubic-bezier(0.25,0.46,0.45,0.94) forwards":"none",
      right:AristotleIn?"8%":"-22%",
      transition:AristotleIn?"none":"right 0s",
      textAlign:"center",
    }}>
      <img src={asset("Aristotle.png")} alt="Aristotle" style={{
        height:"clamp(120px, 22vh, 220px)",width:"auto",aspectRatio:"2 / 3",objectFit:"contain",display:"block",
        filter:"drop-shadow(0 0 1.5px #fff) drop-shadow(0 0 1.5px #fff) drop-shadow(0 8px 24px rgba(139,92,246,0.6))",
        animation:AristotleIn?"walkBob 0.55s ease-in-out infinite":"none",
      }}/>
      <div style={{ color:"#fff",fontWeight:900,fontSize:"clamp(11px, 1.3vw, 14px)",marginTop:4,display:"inline-block",
        background:"#7c3aed",borderRadius:999,padding:"3px 12px",border:"2px solid #fff",
        textShadow:"0 1px 2px rgba(0,0,0,0.3)" }}>
        Aristotle
      </div>
    </div>

    {/* Skip */}
    <div style={{ position:"absolute",bottom:18,right:16 }}>
      <button type="button" className="gp-btn" onClick={()=>{ clearTimers(); setAristotleIn(true); setShowCloud(true);
        timers.current.push(setTimeout(()=>setPhase("question"),400)); }}
        style={{ background:"rgba(0,0,0,0.4)",border:"1px solid rgba(255,255,255,0.2)",
          color:"#94a3b8",fontSize:11,cursor:"pointer",borderRadius:10,
          padding:"6px 12px",fontFamily:"inherit" }}>
        {t("game.skip")}
      </button>
    </div>
  </div>
)}


{/* ═══ QUESTION PHASE ═══ */}
      {phase==="question"&&(
        <div style={{ position:"absolute",inset:0,display:"flex",
          flexDirection:isMobile?"column":"row",alignItems:"stretch",justifyContent:"center",
          zIndex:10,padding:isMobile?"46px clamp(10px, 4vw, 40px) 10px":"clamp(50px, 7vh, 72px) clamp(12px, 3vw, 48px) 16px",
          gap:isMobile?8:"clamp(8px, 2vw, 32px)",
          maxWidth:1500,margin:"0 auto" }}>
          {/* Left: Character */}
          <div style={{ width:isMobile?"100%":"clamp(150px, 24%, 340px)",display:"flex",
            flexDirection:isMobile?"row":"column",flexShrink:0,
            alignItems:"center",justifyContent:isMobile?"flex-start":"flex-end",
            gap:isMobile?10:0,paddingBottom:isMobile?0:12,
            animation:"slideInLeft 0.4s ease" }}>
            <img src={charImg} alt={character.name} style={{
              height:isMobile?"clamp(76px, 11vh, 100px)":"clamp(110px, 21vh, 200px)",width:"auto",aspectRatio:"2 / 3",
              objectFit:"contain",flexShrink:0,
              filter:`drop-shadow(0 0 1.5px #fff) drop-shadow(0 0 1.5px #fff) drop-shadow(0 6px 16px ${character.color}99)`,
              animation:"idleFloat 3s ease-in-out infinite",
            }}/>
            <div style={{ display:"flex",flexDirection:"column",
              alignItems:isMobile?"flex-start":"center" }}>
              <div style={{ color:"#fff",fontWeight:900,fontSize:"clamp(11px, 1.2vw, 14px)",
                background:character.color,borderRadius:999,padding:"3px 12px",border:"2px solid #fff",
                textShadow:"0 1px 2px rgba(0,0,0,0.3)",
                marginTop:isMobile?0:5,textAlign:isMobile?"left":"center" }}>{character.name}</div>
              <div style={{ color:"#e2e8f0",fontSize:"clamp(10px, 1vw, 12px)",textAlign:isMobile?"left":"center",
                marginTop:6,fontStyle:"italic",padding:"2px 8px",lineHeight:1.4,
                background:"rgba(0,0,0,0.45)",borderRadius:8,
                maxWidth:isMobile?180:undefined }}>
                "{t(`char.${character.id}.idle`)}"
              </div>
            </div>
          </div>

          {/* Right: Q+A panel */}
          <div className="gp-col" style={{ flex:1,minWidth:0,maxWidth:isMobile?undefined:920,display:"flex",flexDirection:"column",gap:"clamp(8px, 1.2vh, 14px)",overflowY:"auto",
            animation:"slideInRight 0.4s ease" }}>
            <div style={{ background:"rgba(10,20,10,0.82)",backdropFilter:"blur(16px)",
              border:"1px solid rgba(74,222,128,0.22)",borderRadius:18,padding:"12px 14px" }}>
              <div style={{ display:"flex",gap:10,alignItems:"flex-start" }}>
                <img src={asset("Aristotle.png")} alt="Aristotle" style={{
                  height:isMobile?59:"clamp(59px, 8vh, 86px)",width:"auto",aspectRatio:"2 / 3",objectFit:"contain",flexShrink:0,
                  animation:"idleFloat 3s ease-in-out infinite",
                  filter:"drop-shadow(0 4px 12px rgba(139,92,246,0.5))",
                }}/>
                <div>
                  <div style={{ color:"#a78bfa",fontWeight:900,
                    marginBottom:5,letterSpacing:0.5,textTransform:"uppercase",fontSize:"clamp(10px, 0.9vw, 13px)" }}>📜 {t("game.asksPanel")}</div>
                  <div style={{ color:"#f0fdf4",fontWeight:800,fontSize:"clamp(15px, 1.35vw, 22px)",lineHeight:1.5 }}>
                    {q.text}
                  </div>
                </div>
              </div>
            </div>

            {q.images ? (
              <div style={{ display:"grid",
                gridTemplateColumns:`repeat(${Math.min(q.images.length,2)}, minmax(0,auto))`,
                gap:isMobile?8:10,justifyContent:"center",
                flex:1,alignContent:"center",maxHeight:"100%",overflow:"auto" }}>
                {q.images.map((img,i)=>(
                  <button type="button" className="gp-opt" key={i} onClick={()=>handleAnswer(i)}
                    aria-label={`${OPTION_LETTERS[i]}: ${q.options[i]}`}
                    style={{ borderRadius:12,overflow:"hidden",cursor:"pointer",padding:0,color:"inherit",
                      border:"1.5px solid rgba(74,222,128,0.18)",transition:"all 0.15s",
                      background:"rgba(10,25,10,0.55)",display:"flex",flexDirection:"column",
                      width:isMobile?"clamp(120px, 38vw, 220px)":"clamp(120px, 13vw, 240px)" }}
                    onMouseEnter={e=>{ e.currentTarget.style.transform="scale(1.03)"; e.currentTarget.style.borderColor="#22c55e88"; }}
                    onMouseLeave={e=>{ e.currentTarget.style.transform="scale(1)"; e.currentTarget.style.borderColor="rgba(74,222,128,0.18)"; }}
                  >
                    <img src={img} alt="" draggable={false} style={{
                      width:"100%",aspectRatio:"4 / 3",objectFit:"cover",display:"block" }}/>
                    <div style={{ fontSize:"clamp(11px, 0.95vw, 15px)",fontWeight:700,color:"#e2e8f0",
                      textAlign:"center",padding:"4px 5px",lineHeight:1.25 }}>
                      {q.options[i]}
                    </div>
                  </button>
                ))}
              </div>
            ) : (
              <div style={{ display:"flex",flexDirection:"column",gap:7,flex:1,justifyContent:"center" }}>
                {q.options.map((opt,i)=>(
                  <button type="button" className="gp-opt" key={i} onClick={()=>handleAnswer(i)}
                    style={{ width:"100%",textAlign:"left",fontFamily:"inherit",
                      background:"rgba(10,25,10,0.78)",backdropFilter:"blur(12px)",
                      border:"1.5px solid rgba(74,222,128,0.18)",
                      borderRadius:13,padding:"11px 14px",cursor:"pointer",
                      fontSize:"clamp(13px, 1.1vw, 18px)",fontWeight:700,color:"#e2e8f0",transition:"all 0.15s",
                      display:"flex",alignItems:"center",gap:10 }}
                    onMouseEnter={e=>{ e.currentTarget.style.background="rgba(34,197,94,0.15)"; e.currentTarget.style.borderColor="#22c55e55"; e.currentTarget.style.transform="translateX(4px)"; }}
                    onMouseLeave={e=>{ e.currentTarget.style.background="rgba(10,25,10,0.78)"; e.currentTarget.style.borderColor="rgba(74,222,128,0.18)"; e.currentTarget.style.transform="translateX(0)"; }}
                  >
                    <span style={{ width:24,height:24,borderRadius:"50%",flexShrink:0,
                      background:"rgba(74,222,128,0.12)",border:"1.5px solid rgba(74,222,128,0.3)",
                      display:"flex",alignItems:"center",justifyContent:"center",
                      fontSize:11,fontWeight:900,color:"#4ade80" }}>
                      {OPTION_LETTERS[i]}
                    </span>
                    {opt}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ FEEDBACK PHASE ═══ */}
      {phase==="feedback"&&(
        <div style={{ position:"absolute",inset:0,display:"flex",
          flexDirection:isMobile?"column":"row",alignItems:"stretch",justifyContent:"center",
          zIndex:10,padding:isMobile?"46px clamp(10px, 4vw, 40px) 10px":"clamp(50px, 7vh, 72px) clamp(12px, 3vw, 48px) 16px",
          gap:isMobile?8:"clamp(8px, 2vw, 32px)",
          maxWidth:1500,margin:"0 auto" }}>
          {/* Left: Character reacting */}
          <div style={{ width:isMobile?"100%":"clamp(150px, 24%, 340px)",display:"flex",
            flexDirection:isMobile?"row":"column",flexShrink:0,
            alignItems:"center",justifyContent:isMobile?"flex-start":"flex-end",
            gap:isMobile?10:0,paddingBottom:isMobile?0:12,
            position:"relative" }}>
            {showPocket&&(
            <div style={{
            position:"absolute", bottom:isMobile?"auto":"28%", top:isMobile?"-4px":"auto",
            left:isMobile?"46px":"55%",
            zIndex:25, pointerEvents:"none",
            animation:"pocketGlow 1s ease forwards",
            }}><CoinIcon size={24}/></div>
            )}
            <img key={animKey} src={charImg} alt={character.name} style={{
              height:isMobile?"clamp(76px, 11vh, 100px)":"clamp(110px, 21vh, 200px)",width:"auto",aspectRatio:"2 / 3",
              objectFit:"contain",flexShrink:0,
              filter:`drop-shadow(0 0 1.5px #fff) drop-shadow(0 0 1.5px #fff) drop-shadow(0 6px 16px ${character.color}bb)`,
              animation:correct?"cBounce 0.65s ease":"cShake 0.5s ease",
            }}/>
            <div style={{ display:"flex",flexDirection:"column",
              alignItems:isMobile?"flex-start":"center" }}>
              <div style={{ color:"#fff",fontWeight:900,fontSize:"clamp(11px, 1.2vw, 14px)",
                background:character.color,borderRadius:999,padding:"3px 12px",border:"2px solid #fff",
                textShadow:"0 1px 2px rgba(0,0,0,0.3)",
                marginTop:isMobile?0:5,textAlign:isMobile?"left":"center" }}>{character.name}</div>
              <div style={{ color:correct?"#86efac":"#fca5a5",fontSize:10,textAlign:isMobile?"left":"center",
                marginTop:6,fontStyle:"italic",padding:"2px 8px",lineHeight:1.4,
                background:"rgba(0,0,0,0.5)",borderRadius:8,
                maxWidth:isMobile?180:undefined }}>
                "{t(`char.${character.id}.${correct?"happy":"sad"}`)}"
              </div>
            </div>
          </div>

          {/* Right: Aristotle reaction + revealed answers */}
<div className="gp-col" style={{ flex:1,minWidth:0,maxWidth:isMobile?undefined:920,display:"flex",flexDirection:"column",gap:"clamp(8px, 1.2vh, 14px)",overflowY:"auto",paddingBottom:4 }}>
            <div style={{
              background:correct?"rgba(22,101,52,0.72)":"rgba(127,29,29,0.72)",
              backdropFilter:"blur(16px)",
              border:`1px solid ${correct?"#22c55e55":"#ef444455"}`,
              borderRadius:18,padding:"12px 14px",position:"relative",
            }}>
              {showCoin&&(
               <div style={{
                position:"absolute",right:20,top:"50%",zIndex:20,
                animation:"coinToChar 1.8s cubic-bezier(0.25,0.46,0.45,0.94) forwards",
                pointerEvents:"none",
                }}><CoinIcon size={30}/></div>
              )}
              <div style={{ display:"flex",gap:10,alignItems:"center" }}>
                <img src={AristotleImg} alt="Aristotle" style={{
                  height:isMobile?68:"clamp(68px, 9vh, 96px)",width:"auto",aspectRatio:"2 / 3",objectFit:"contain",flexShrink:0,
                  filter:`drop-shadow(0 4px 14px ${correct?"rgba(34,197,94,0.7)":"rgba(239,68,68,0.7)"})`,
                  animation:correct?"AristotleBounce 0.7s ease":"AristotleShake 0.6s ease",
                }}/>
                <div>
                  <div style={{ fontWeight:900,fontSize:"clamp(11px, 0.95vw, 14px)",letterSpacing:0.5,
                    color:correct?"#4ade80":"#f87171",marginBottom:4 }}>
                    {correct?t("game.happy"):t("game.disappointed")}
                  </div>
                  <div style={{ color:correct?"#bbf7d0":"#fecaca",fontSize:"clamp(13px, 1.05vw, 17px)",fontStyle:"italic" }}>
                    {correct?t("game.praise"):t("game.notQuite")}
                  </div>
                  {correct&&(
                    <div style={{ color:"#fbbf24",fontSize:11,fontWeight:800,marginTop:5,
                      display:"flex",alignItems:"center",gap:5 }}>
                      <CoinIcon size={14}/> {t("game.coin")}
                    </div>
                    )}
                </div>
              </div>
            </div>

            {q.images ? (
              <div style={{ display:"grid",
                gridTemplateColumns:`repeat(${Math.min(q.images.length,2)}, minmax(0,auto))`,
                gap:isMobile?8:10,justifyContent:"center" }}>
                {q.images.map((img,i)=>{
                  let border="2px solid transparent";
                  if (i===q.answer)      border="2px solid #22c55e";
                  else if (i===selected) border="2px solid #ef4444";
                  const labelBg = i===q.answer?"rgba(22,101,52,0.55)":i===selected?"rgba(127,29,29,0.55)":"rgba(10,25,10,0.5)";
                  const labelCol = i===q.answer?"#bbf7d0":i===selected?"#fecaca":"#94a3b8";
                  return (
                    <div key={i} style={{ borderRadius:12,overflow:"hidden",border,
                      display:"flex",flexDirection:"column",width:isMobile?"clamp(95px, 28vw, 170px)":"clamp(95px, 10vw, 190px)" }}>
                      <div style={{ position:"relative" }}>
                        <img src={img} alt={q.options[i]} style={{
                          width:"100%",aspectRatio:"4 / 3",objectFit:"cover",display:"block",
                          opacity:(i===q.answer||i===selected)?1:0.5 }}/>
                        {(i===q.answer||i===selected)&&(
                          <div style={{ position:"absolute",top:4,right:4,fontSize:15,
                            filter:"drop-shadow(0 1px 3px rgba(0,0,0,0.6))" }}>
                            {i===q.answer?"✅":"❌"}
                          </div>
                        )}
                      </div>
                      <div style={{ fontSize:"clamp(10px, 0.9vw, 14px)",fontWeight:700,textAlign:"center",
                        padding:"3px 4px",lineHeight:1.2,color:labelCol,background:labelBg }}>
                        {q.options[i]}
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div style={{ display:"flex",flexDirection:"column",gap:6 }}>
                {q.options.map((opt,i)=>{
                  let bg="rgba(10,25,10,0.6)";
                  let border="1px solid rgba(255,255,255,0.06)";
                  let col="#94a3b8";
                  if (i===q.answer)      { bg="rgba(22,101,52,0.7)"; border="1px solid #22c55e88"; col="#bbf7d0"; }
                  else if (i===selected) { bg="rgba(127,29,29,0.7)"; border="1px solid #ef444488"; col="#fecaca"; }
                  return (
                    <div key={i} style={{ background:bg,border,borderRadius:12,
                      padding:"9px 13px",fontSize:"clamp(12px, 1vw, 16px)",fontWeight:700,color:col,
                      display:"flex",alignItems:"center",gap:8 }}>
                      <span style={{ fontSize:14 }}>
                        {i===q.answer?"✅":i===selected?"❌":"  "}
                      </span>
                      {opt}
                    </div>
                  );
                })}
              </div>
            )}

            <div role="status" style={{ background:"rgba(255,251,235,0.96)",border:"1.5px solid #fbbf24",
              borderRadius:12,padding:"10px 13px",fontSize:"clamp(13px, 1.05vw, 17px)",fontWeight:700,color:"#1e3a8a",lineHeight:1.55,
              boxShadow:"0 6px 20px rgba(0,0,0,0.18)",maxHeight:isMobile?"30vh":undefined,overflowY:"auto" }}>
              💡 {q.explanation}
            </div>

            <Btn onClick={handleNext} color={mod.color} style={{ width:"100%" }}>
              {idx===total-1?t("game.finish"):t("game.next")}
            </Btn>
          </div>
        </div>
      )}
    </div>
  );
}
/* ═══════════════════════════════════════════════════
   RESULTS SCREEN
═══════════════════════════════════════════════════ */
function ResultsScreen({ mod, character, score, total, onContinue, saveError }) {
  const t = useT();
  const pass  = score >= total - 1;
  const [factIdx] = useState(()=>Math.floor(Math.random()*Math.max(mod.facts?.length||0,1)));
  const fact = mod.facts?.[factIdx];
  const stars = score===total?3:pass?2:score>0?1:0;

  return (
    <GardenWrap>
      <Panel style={{ textAlign:"center" }}>
        <div style={{ fontSize:68, marginBottom:8, animation:"popIn 0.5s ease" }}>
          {score===total?"🏆":pass?"🎉":"💪"}
        </div>
        <h2 style={{ fontSize:22, fontWeight:900, marginBottom:4, color:"#f0fdf4" }}>
          {pass?t("results.complete"):t("results.keep")}
        </h2>
        <p style={{ color:"#86efac", fontSize:13, marginBottom:20 }}>{mod.title}</p>

        <div style={{ display:"flex", justifyContent:"center", gap:8, marginBottom:20 }}>
          {[1,2,3].map(s=>(
            <span key={s} style={{ fontSize:32, opacity:s<=stars?1:0.18,
              filter:s<=stars?"drop-shadow(0 0 8px #fbbf24)":"none",
              animation:s<=stars?`bounceIn 0.4s ${s*0.1}s ease both`:"none" }}>⭐</span>
          ))}
        </div>

        <div style={{ display:"inline-block", background:"rgba(255,255,255,0.05)",
          border:`2px solid ${pass?"#22c55e":"#f59e0b"}`,
          borderRadius:18, padding:"14px 32px", marginBottom:20 }}>
          <div style={{ fontSize:42, fontWeight:900, color:pass?"#22c55e":"#f59e0b" }}>{score}/{total}</div>
          <div style={{ color:"#94a3b8", fontSize:13 }}>{t("results.correct")}</div>
        </div>

        <div style={{ display:"flex", gap:12, alignItems:"center",
          background:"rgba(255,255,255,0.04)", borderRadius:16,
          padding:14, marginBottom:20, textAlign:"left" }}>
          <img src={pass?asset("happy_Aristotle.png"):asset("Aristotle.png")} alt="Aristotle"
            style={{ width:52, height:69, objectFit:"contain", flexShrink:0,
              animation:pass?"AristotleBounce 0.7s ease":"none" }}/>
          <div>
            <div style={{ color:"#4ade80", fontWeight:900, fontSize:12, marginBottom:3 }}>{t("results.says")}</div>
            <div style={{ color:"#cbd5e1", fontSize:13, fontStyle:"italic" }}>
              {pass?t("results.praise"):t("results.retry")}
            </div>
          </div>
        </div>

        <div style={{ display:"flex", gap:12, alignItems:"center",
          background:"rgba(255,255,255,0.04)", borderRadius:16,
          padding:14, marginBottom:24, textAlign:"left" }}>
          <img src={pass?character.happy:character.sad} alt={character.name}
            style={{ width:60, height:80, objectFit:"contain", flexShrink:0,
              animation:pass?"cBounce 0.7s ease":"cShake 0.5s ease" }}/>
          <div style={{ color:"#cbd5e1", fontSize:13, fontStyle:"italic" }}>
            "{t(`char.${character.id}.${pass?"happy":"sad"}`)}"
            <div style={{ color:character.color, fontSize:12, marginTop:4 }}>— {character.name}</div>
          </div>
        </div>

        {fact && (
          <div style={{ background:"rgba(251,191,36,0.08)", border:"1px solid rgba(251,191,36,0.3)",
            borderRadius:14, padding:"10px 14px", marginBottom:20, textAlign:"left",
            color:"#e2e8f0", fontSize:13, lineHeight:1.5 }}>
            <span style={{ color:"#fbbf24", fontWeight:900 }}>💡 {t("intro.didYouKnow")} </span>{fact}
          </div>
        )}

        <Btn onClick={onContinue} style={{ width:"100%" }} color={pass?"#22c55e":"#f59e0b"}>
          {pass?t("results.continue"):t("results.tryAgain")}
        </Btn>
        {!pass&&(
          <p style={{ marginTop:12, color:"#94a3b8", fontSize:12 }}>
            {t("results.need", { n: Math.max(total-1,0), total })}
          </p>
        )}
        {saveError&&(
          <p role="alert" style={{ marginTop:12, color:"#fca5a5", fontSize:12 }}>{t("results.saveError")}</p>
        )}
      </Panel>
    </GardenWrap>
  );
}

/* ═══════════════════════════════════════════════════
   CERTIFICATE SCREEN
═══════════════════════════════════════════════════ */
function CertificateScreen({ user, language, onBack }) {
  const t = useT();
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext("2d");
    const W = 1200, H = 850, cx = W/2;
    const SCALE = 2; // render at 2x for a crisp download
    canvas.width = W*SCALE; canvas.height = H*SCALE;
    ctx.scale(SCALE, SCALE);

    const GREEN = "#166534", GREEN_LIGHT = "#4ade80";
    const GOLD = "#c9a227", GOLD_LIGHT = "#f4d160", GOLD_DARK = "#8a6d1a";
    const INK = "#1f2937", GRAY = "#57606f";
    const ROMAN = ["I","II","III","IV","V","VI","VII","VIII","IX","X","XI","XII"];

    // Arcs text along a circle, centred on the current (translated) origin.
    function arcText(text, radius, font, color, stepDeg) {
      ctx.save();
      ctx.font = font; ctx.fillStyle = color;
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      const step = stepDeg*Math.PI/180;
      ctx.rotate(-step*(text.length-1)/2);
      for (let i=0;i<text.length;i++) {
        ctx.save(); ctx.translate(0,-radius); ctx.fillText(text[i],0,0); ctx.restore();
        ctx.rotate(step);
      }
      ctx.restore();
    }
    // Draws letter-spaced small-caps-style text centred at x; returns its total width.
    // Saves/restores canvas state so callers' font/align/baseline are untouched.
    function spacedText(text, x, y, font, color, spacing) {
      ctx.save();
      ctx.font = font; ctx.fillStyle = color;
      ctx.textAlign = "left"; ctx.textBaseline = "middle";
      const chars = text.split("");
      const widths = chars.map(c=>ctx.measureText(c).width);
      const total = widths.reduce((a,b)=>a+b,0) + spacing*(chars.length-1);
      let px = x - total/2;
      chars.forEach((c,i)=>{ ctx.fillText(c,px,y); px += widths[i]+spacing; });
      ctx.restore();
      return total;
    }
    function ribbonTail(x, y, angleDeg, color) {
      ctx.save();
      ctx.translate(x,y); ctx.rotate(angleDeg*Math.PI/180);
      const w=24, len=78, notch=18;
      ctx.beginPath();
      ctx.moveTo(-w/2,0); ctx.lineTo(w/2,0); ctx.lineTo(w/2,len);
      ctx.lineTo(0,len-notch); ctx.lineTo(-w/2,len); ctx.closePath();
      ctx.fillStyle = color; ctx.fill();
      ctx.strokeStyle = "rgba(0,0,0,0.18)"; ctx.lineWidth = 1; ctx.stroke();
      ctx.fillStyle = "rgba(255,255,255,0.14)";
      ctx.fillRect(-3,4,6,len-notch-8);
      ctx.restore();
    }
    // A single laurel leaf, used to build sprigs and the small wordmark flourish.
    function leaf(x, y, angleDeg, size, color) {
      ctx.save();
      ctx.translate(x,y); ctx.rotate(angleDeg*Math.PI/180);
      ctx.beginPath(); ctx.ellipse(0,0,size,size*0.4,0,0,Math.PI*2);
      ctx.fillStyle = color; ctx.fill();
      ctx.restore();
    }
    // A laurel branch curling up one side of a circle of the given radius, centred
    // at (x,y). mirror=+1 hugs the right side, -1 the left — call both to wrap a
    // medallion in a wreath that converges at the bottom, open at the top.
    function laurelSprig(x, y, mirror, radius, count=9) {
      ctx.save();
      ctx.translate(x,y);
      for (let i=0;i<count;i++) {
        const t = i/(count-1);
        const beta = t*2.36; // 0 = bottom, sweeping up to ~135°
        const r = radius*0.3 + t*radius*1.05;
        const lx = mirror * r*Math.sin(beta);
        const ly = r*Math.cos(beta);
        leaf(lx, ly, mirror*(beta*180/Math.PI+90), 11-t*4, i%2===0?GREEN_LIGHT:GREEN);
      }
      ctx.restore();
    }
    // Five-point star, used for the medallion emblem instead of an emoji glyph.
    function star(x, y, outerR, innerR, color) {
      ctx.save();
      ctx.translate(x,y);
      ctx.beginPath();
      ctx.moveTo(0,-outerR);
      for (let i=0;i<5;i++) {
        ctx.rotate(Math.PI/5); ctx.lineTo(0,-innerR);
        ctx.rotate(Math.PI/5); ctx.lineTo(0,-outerR);
      }
      ctx.closePath();
      ctx.fillStyle = color; ctx.fill();
      ctx.restore();
    }
    function cornerFlourish(x, y, rotDeg) {
      ctx.save();
      ctx.translate(x,y); ctx.rotate(rotDeg*Math.PI/180);
      ctx.strokeStyle = GOLD; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(0,30); ctx.quadraticCurveTo(0,0,30,0); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0,18); ctx.quadraticCurveTo(0,0,18,0); ctx.stroke();
      ctx.beginPath(); ctx.arc(0,0,3.2,0,Math.PI*2); ctx.fillStyle = GOLD; ctx.fill();
      ctx.restore();
    }
    function divider(y, w) {
      ctx.strokeStyle = GOLD; ctx.lineWidth = 1.3;
      ctx.beginPath(); ctx.moveTo(cx-w/2,y); ctx.lineTo(cx-9,y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(cx+9,y); ctx.lineTo(cx+w/2,y); ctx.stroke();
      ctx.save(); ctx.translate(cx,y); ctx.rotate(Math.PI/4);
      ctx.fillStyle = GOLD; ctx.fillRect(-4,-4,8,8); ctx.restore();
    }
    // A signature block: a value (signature or date) above a hairline rule, with a
    // small-caps caption below it — the classic bottom-of-diploma layout.
    function signatureBlock(x, valueText, valueFont, caption, align) {
      ctx.save();
      const lineW = 230;
      const lineX0 = align==="left" ? x : x - lineW;
      const lineX1 = align==="left" ? x + lineW : x;
      const textX  = (lineX0+lineX1)/2;
      ctx.textAlign = "center";
      ctx.fillStyle = INK; ctx.font = valueFont;
      ctx.fillText(valueText, textX, 704);
      ctx.strokeStyle = "rgba(201,162,39,0.55)"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(lineX0,720); ctx.lineTo(lineX1,720); ctx.stroke();
      ctx.restore();
      spacedText(caption, textX, 738, "700 11px Georgia", GOLD_DARK, 1.6);
    }

    /* ── Background ── */
    const grad = ctx.createLinearGradient(0,0,W,H);
    grad.addColorStop(0, "#fdfaf0");
    grad.addColorStop(1, "#f2ead4");
    ctx.fillStyle = grad;
    ctx.fillRect(0,0,W,H);
    // faint diagonal paper texture
    ctx.save();
    ctx.globalAlpha = 0.03; ctx.strokeStyle = GREEN; ctx.lineWidth = 1;
    for (let x=-H;x<W;x+=16) { ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x+H,H); ctx.stroke(); }
    ctx.restore();
    // soft vignette
    const vg = ctx.createRadialGradient(cx,H/2,H*0.25,cx,H/2,H*0.75);
    vg.addColorStop(0,"rgba(0,0,0,0)"); vg.addColorStop(1,"rgba(60,40,10,0.10)");
    ctx.fillStyle = vg; ctx.fillRect(0,0,W,H);

    /* ── Borders ── */
    ctx.strokeStyle = GREEN; ctx.lineWidth = 10;
    ctx.strokeRect(30,30,W-60,H-60);
    ctx.strokeStyle = GOLD; ctx.lineWidth = 3;
    ctx.strokeRect(48,48,W-96,H-96);
    ctx.strokeStyle = "rgba(201,162,39,0.45)"; ctx.lineWidth = 1;
    ctx.strokeRect(58,58,W-116,H-116);
    [[60,60,0],[W-60,60,90],[W-60,H-60,180],[60,H-60,270]].forEach(([x,y,r])=>cornerFlourish(x,y,r));

    ctx.textAlign = "center";

    /* ── Wordmark ── */
    const wmWidth = spacedText("GREENPATH", cx, 96, "700 22px Georgia", GREEN, 4);
    leaf(cx-wmWidth/2-22, 94, 200, 8, GREEN_LIGHT);
    leaf(cx-wmWidth/2-34, 98, 195, 6, GREEN);
    leaf(cx+wmWidth/2+22, 94, 20, 8, GREEN_LIGHT);
    leaf(cx+wmWidth/2+34, 98, 15, 6, GREEN);
    divider(122, 170);

    /* ── Title ── */
    const MAXW = W - 220; // keeps longer translations inside the border
    ctx.fillStyle = "rgba(15,23,42,0.12)"; ctx.font = "700 46px Georgia";
    ctx.fillText(t("cert.heading"), cx+2, 192, MAXW);
    ctx.fillStyle = INK;
    ctx.fillText(t("cert.heading"), cx, 190, MAXW);

    ctx.fillStyle = GRAY; ctx.font = "italic 20px Georgia";
    ctx.fillText(t("cert.certifies"), cx, 236, MAXW);

    /* ── Name ── */
    ctx.fillStyle = GREEN; ctx.font = "italic 700 50px Georgia";
    ctx.fillText(user.fullName, cx, 306, MAXW);
    const nameWidth = Math.min(ctx.measureText(user.fullName).width, MAXW);
    divider(328, Math.min(Math.max(nameWidth+70,260),520));

    /* ── Body ── */
    ctx.fillStyle = GRAY; ctx.font = "21px Georgia";
    ctx.fillText(t("cert.completed", { n: MODULES.length }), cx, 374, MAXW);
    ctx.font = "italic 21px Georgia";
    ctx.fillText(t("cert.inLang", { lang: language.label }), cx, 402, MAXW);

    /* ── Module badges ── */
    spacedText(t("cert.modules"), cx, 440, "700 12px Georgia", GOLD_DARK, 2);
    const R = 19, GAP = 13;
    const total = MODULES.length*(2*R) + (MODULES.length-1)*GAP;
    const startX = cx - total/2 + R;
    ctx.save();
    ctx.textBaseline = "middle";
    MODULES.forEach((m,i)=>{
      const x = startX + i*(2*R+GAP), y = 472;
      ctx.beginPath(); ctx.arc(x,y,R,0,Math.PI*2);
      ctx.fillStyle = `${m.color}18`; ctx.fill();
      ctx.strokeStyle = m.color; ctx.lineWidth = 1.6; ctx.stroke();
      ctx.font = "700 13px Georgia"; ctx.fillStyle = INK;
      ctx.fillText(ROMAN[i]||String(i+1), x, y+1);
    });
    ctx.restore();

    /* ── Seal ── */
    const sealY = 578, sealR = 48;
    ribbonTail(cx-12, sealY, -9, GREEN);
    ribbonTail(cx+12, sealY, 9, "#15803d");
    laurelSprig(cx, sealY, -1, sealR);
    laurelSprig(cx, sealY, 1, sealR);

    const sealGrad = ctx.createRadialGradient(cx-14,sealY-14,4,cx,sealY,sealR);
    sealGrad.addColorStop(0, GOLD_LIGHT); sealGrad.addColorStop(0.55, GOLD); sealGrad.addColorStop(1, GOLD_DARK);
    ctx.beginPath(); ctx.arc(cx,sealY,sealR,0,Math.PI*2);
    ctx.fillStyle = sealGrad; ctx.fill();
    ctx.strokeStyle = GOLD_DARK; ctx.lineWidth = 3; ctx.stroke();
    ctx.beginPath(); ctx.arc(cx,sealY,sealR-8,0,Math.PI*2);
    ctx.strokeStyle = "rgba(255,255,255,0.55)"; ctx.lineWidth = 1.2; ctx.stroke();

    ctx.save(); ctx.translate(cx,sealY);
    arcText("GREENPATH", sealR-13, "700 10px Georgia", "#5c3d0a", 18);
    ctx.restore();
    star(cx, sealY+3, 15, 6.5, "#5c3d0a");

    /* ── Footer ── */
    const dateStr = new Date().toLocaleDateString(LANGUAGE_META[language.id]?.locale, {
      year:"numeric", month:"long", day:"numeric"
    });
    signatureBlock(90, "GreenPath", "italic 26px Georgia", t("cert.director"), "left");
    signatureBlock(W-90, dateStr, "italic 20px Georgia", t("cert.date"), "right");
    ctx.textAlign = "center";
  }, [user, language, t]);

  function download() {
    const canvas = canvasRef.current;
    const link = document.createElement("a");
    link.download = `${user.fullName.replace(/\s+/g,"_")}_GreenPath_Certificate.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  return (
    <GardenWrap>
      <Panel style={{ maxWidth: 620 }}>
        <div style={{ textAlign:"center", marginBottom:16 }}>
          <div style={{ fontSize:44, marginBottom:4 }}>🏆</div>
          <h1 style={{ fontSize:22, fontWeight:900, color:"#f0fdf4" }}>
            {t("cert.heading")}
          </h1>
          <p style={{ color:"#86efac", fontSize:13 }}>
            {t("cert.sub", { name: user.fullName })}
          </p>
        </div>

        <div style={{ borderRadius:14, overflow:"hidden", border:"1px solid rgba(74,222,128,0.25)", marginBottom:18 }}>
          <canvas ref={canvasRef} role="img" aria-label={`${t("cert.heading")}: ${user.fullName}`}
            style={{ width:"100%", display:"block" }} />
        </div>

        <div style={{ display:"flex", gap:10, flexWrap:"wrap" }}>
          <Btn onClick={download} style={{ flex:"1 1 180px" }} color="#fbbf24">
            {t("cert.download")}
          </Btn>
          <Btn onClick={onBack} style={{ flex:"1 1 180px" }} color="#22c55e">
            {t("cert.backMap")}
          </Btn>
        </div>
      </Panel>
    </GardenWrap>
  );
}

/* ═══════════════════════════════════════════════════
   ROOT APP
═══════════════════════════════════════════════════ */

export default function App() {
  const [screen,           setScreen]           = useState("loading");
  const [user,             setUser]             = useState(null);
  const [language,         setLanguage]         = useState(null);
  // Language for the UI before (and independent of) the saved game language.
  const [uiLangId,         setUiLangId]         = useState(initialLanguageId);
  const [character,        setCharacter]        = useState(null);
  const [completedModules, setCompletedModules] = useState(0);
  const [prevCompleted,    setPrevCompleted]    = useState(0);
  const [activeModule,     setActiveModule]     = useState(null);
  const [lastScore,        setLastScore]        = useState(null);
  const [saveError,        setSaveError]        = useState(false);
  const [langReturnTo,     setLangReturnTo]     = useState(null);

  const [loadingDone, setLoadingDone] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [destination, setDestination] = useState(null);
  const initialAuthCheckedRef = useRef(false);

  const langId = language?.id || uiLangId;

  // Keep <html lang> in sync for screen readers, hyphenation and fonts.
  useEffect(() => {
    document.documentElement.lang = LANGUAGE_META[langId]?.htmlLang || "en";
  }, [langId]);

  const moduleQuestions = useMemo(()=>
    activeModule ? QUESTIONS.filter(q=>q.module===activeModule.id).map(q=>localizeQuestion(q, langId)) : [],
  [activeModule, langId]);
  const localizedModule = useMemo(()=>
    activeModule ? localizeModule(activeModule, langId) : null,
  [activeModule, langId]);

  function chooseUiLanguage(lang) {
    setUiLangId(lang.id);
    rememberLanguage(lang.id);
  }

  function persistProgress(patch) {
    if (!user) return;
    const progress = {
      languageId: language?.id,
      characterId: character?.id,
      completedModules,
      ...patch,
    };
    setSaveError(false);
    saveProgress(user.uid, progress).catch(()=>setSaveError(true));
  }

  function handleAuth(u) {
    setUser(u);
    if (u.progress && u.progress.completedModules != null) {
      const lang = LANGUAGES.find(l=>l.id===u.progress.languageId);
      const char = CHARACTERS.find(c=>c.id===u.progress.characterId);
      if (lang && char) {
        setLanguage(lang);
        setCharacter(char);
        setCompletedModules(u.progress.completedModules);
        setPrevCompleted(u.progress.completedModules);
        setScreen("map");
        return;
      }
    }
    setScreen("language");
  }

  // Auto-resume a signed-in session (e.g. reopening the app on the same device)
  // without jumping straight past the loading splash: the screen switch waits
  // for whichever of {loading animation, auth check} finishes last.
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      if (initialAuthCheckedRef.current) return;
      initialAuthCheckedRef.current = true;
      if (fbUser) {
        const record = await fetchUserRecord(fbUser.uid).catch(()=>null);
        const username = record?.username || (fbUser.email||"").split("@")[0];
        const fullName = record?.fullName || fbUser.displayName || username;
        const progress = record?.progress || null;
        setUser({ uid: fbUser.uid, username, fullName });
        const lang = progress && LANGUAGES.find(l=>l.id===progress.languageId);
        const char = progress && CHARACTERS.find(c=>c.id===progress.characterId);
        if (progress?.completedModules != null && lang && char) {
          setLanguage(lang);
          setCharacter(char);
          setCompletedModules(progress.completedModules);
          setPrevCompleted(progress.completedModules);
          setDestination("map");
        } else {
          setDestination("language");
        }
      } else {
        setDestination("auth");
      }
      setAuthChecked(true);
    });
    return unsub;
  }, []);

  // While the splash is up, move on as soon as both the animation and the auth check are done.
  const currentScreen = (screen==="loading" && loadingDone && authChecked && destination) ? destination : screen;
  function go(next) { setScreen(next); }

  function handleFinish(score) { setLastScore(score); go("results"); }

  function handleContinue() {
    const isNextModule = activeModule.id === completedModules+1;
    const pass = lastScore >= moduleQuestions.length-1;
    const newCompleted = (isNextModule && pass)
      ? Math.min(completedModules+1, MODULES.length)
      : completedModules;

    setPrevCompleted(completedModules);
    setCompletedModules(newCompleted);
    persistProgress({ completedModules: newCompleted });
    // Failed attempts go straight back to the module so the "Try Again" button means what it says.
    if (!pass) { go("intro"); return; }
    go("map");
  }

  function handlePlayAgain() {
    setPrevCompleted(0);
    setCompletedModules(0);
    persistProgress({ completedModules: 0 });
    go("map");
  }

  function handleLanguageSelected(lang) {
    setLanguage(lang);
    chooseUiLanguage(lang);
    if (langReturnTo === "map" && character) {
      setLangReturnTo(null);
      setPrevCompleted(completedModules);
      persistProgress({ languageId: lang.id });
      go("map");
      return;
    }
    go("character");
  }

  async function handleLogout() {
    await logoutUser().catch(()=>{});
    setUser(null);
    setLanguage(null);
    setCharacter(null);
    setCompletedModules(0);
    setPrevCompleted(0);
    setActiveModule(null);
    setLastScore(null);
    setSaveError(false);
    go("auth");
  }

  const mapModules = useMemo(()=>MODULES.map(m=>localizeModule(m, langId)), [langId]);

  return (
    <LangCtx.Provider value={langId}>
      <GlobalStyles/>
      {currentScreen==="loading"&&(
        <LoadingScreen onDone={()=>setLoadingDone(true)}/>
      )}
      {currentScreen==="auth"&&(
        <AuthScreen onAuth={handleAuth} languageId={uiLangId} onLanguageChange={chooseUiLanguage}/>
      )}
      {currentScreen==="language"&&(
        <LanguageScreen currentId={langId} onSelect={handleLanguageSelected}
          onBack={langReturnTo==="map" ? ()=>{ setLangReturnTo(null); go("map"); } : undefined}/>
      )}
      {currentScreen==="character"&&language&&(
        <CharacterScreen language={language} initialId={character?.id}
          onSelect={c=>{
            setCharacter(c);
            setPrevCompleted(completedModules);
            persistProgress({ characterId: c.id, languageId: language.id });
            go("map");
          }}
          onBack={()=>go("language")}/>
      )}
      {currentScreen==="map"&&language&&character&&(
        <MapScreen language={language} character={character} modules={mapModules}
          completedModules={completedModules} prevCompleted={prevCompleted}
          onStartModule={mod=>{ setActiveModule(mod); go("intro"); }}
          onBack={()=>go("character")}
          onChangeLanguage={()=>{ setLangReturnTo("map"); go("language"); }}
          onViewCertificate={()=>go("certificate")}
          onPlayAgain={handlePlayAgain}
          onLogout={handleLogout}/>
      )}
      {currentScreen==="intro"&&localizedModule&&(
        <AristotleIntro key={localizedModule.id} module={localizedModule} questionCount={moduleQuestions.length}
          onBack={()=>{ setPrevCompleted(completedModules); go("map"); }}
          onStart={()=>go("game")}/>
      )}
      {currentScreen==="game"&&localizedModule&&(
        <GameScreen key={localizedModule.id}
          mod={localizedModule} character={character}
          questions={moduleQuestions} onFinish={handleFinish}
          onExit={()=>{ setPrevCompleted(completedModules); go("map"); }}/>
      )}
      {currentScreen==="results"&&localizedModule&&(
        <ResultsScreen mod={localizedModule} character={character}
          score={lastScore} total={moduleQuestions.length} saveError={saveError}
          onContinue={handleContinue}/>
      )}
      {currentScreen==="certificate"&&user&&language&&(
        <CertificateScreen user={user} language={language}
          onBack={()=>go("map")}/>
      )}
    </LangCtx.Provider>
  );
}

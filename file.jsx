import React, { useMemo, useState, useEffect, useRef } from "react";
import { auth, db } from "./firebase.js";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  onAuthStateChanged,
  signOut,
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
   Tracks viewport width so layouts can adapt between
   narrow phone screens and wider tablet/desktop screens.
═══════════════════════════════════════════════════ */
const MOBILE_BREAKPOINT = 640;
function useIsMobile() {
  const [isMobile, setIsMobile] = useState(
    typeof window !== "undefined" ? window.innerWidth <= MOBILE_BREAKPOINT : false
  );
  useEffect(() => {
    const onResize = () => setIsMobile(window.innerWidth <= MOBILE_BREAKPOINT);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return isMobile;
}

/* ═══════════════════════════════════════════════════
   ACCOUNTS: Firebase Auth + Firestore, so a username is
   unique across every device, not just one browser. Auth
   needs an email, so usernames are mapped to a fake
   "@gardenquest.local" address under the hood; the UI
   only ever shows the username.
═══════════════════════════════════════════════════ */
const USERNAME_RE = /^[a-z0-9_.-]{3,20}$/;
function usernameToEmail(username) { return `${username}@gardenquest.local`; }

function friendlyAuthError(err) {
  switch (err?.code) {
    case "auth/email-already-in-use": return "That username is already taken.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found": return "Incorrect username or password.";
    case "auth/weak-password": return "Password must be at least 6 characters.";
    case "auth/network-request-failed": return "No internet connection. Please try again.";
    default: return "Something went wrong. Please try again.";
  }
}

async function registerUser(username, password, fullName) {
  const cred = await createUserWithEmailAndPassword(auth, usernameToEmail(username), password);
  await updateProfile(cred.user, { displayName: fullName });
  await setDoc(doc(db, "users", cred.user.uid), { username, fullName, progress: null });
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
const LANGUAGES = [
  { id: "en", label: "English",  flag: "🇬🇧", color: "#8b5cf6" },
  { id: "gr", label: "Greek",    flag: "🇬🇷", color: "#3b82f6" },
  { id: "it", label: "Italian",  flag: "🇮🇹", color: "#22c55e" },
  { id: "ro", label: "Romanian", flag: "🇷🇴", color: "#f59e0b" },
  { id: "cz", label: "Czech",    flag: "🇨🇿", color: "#ef4444" },
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
    info: "Wildlife gardens are natural or semi-natural spaces where edible plants grow in harmony with local ecosystems, mimicking the layers and biodiversity of a forest with minimal human intervention. Traditional seeds are the hidden power behind these gardens saving, exchanging, and growing diverse local varieties preserves cultural heritage and strengthens climate resilience for generations to come."
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
    info: "Sustainable mini-greenhouses (tunnel, hydroponic, passive solar or vertical) protect plants from cold, wind, rain and climate stress, helping grow food locally with low-impact materials. Integrated and biological pest control, such as encouraging ladybirds, lacewings and parasitoid wasps, manages pests like the woolly aphid (Eriosoma lanigerum) without relying mainly on chemical pesticides."
  },
  // Topics 5-6 on the list: RO Practice 2 (Companion planting) + RO Practice 1 (Homemade natural pest control)
  {
    id: 3,
    title: "ORGANIC PEST CONTROL AND COMPANION PLANTING",
    icon: "🌿",
    color: "#22c55e",
    info: "Homemade natural pest control uses plant-based preparations and natural ingredients such as garlic, nettles, chili peppers, or soap solutions to manage garden pests without synthetic chemicals. These methods are enviromentally friendly, affordable, biodegradable, and help protect beneficial insects while supporting sustainable and organic gardening practices."
  },
  // Topics 8 & 11 on the list: GR clay pot crafting + stitching reusable bags from old fabrics
  {
    id: 4,
    title: "Reusable Alternatives for a Plastic-Free Kitchen",
    icon: "🌱",
    color: "#10b981",
    info: "Clay pot crafting revives the ancient art of shaping terracotta vessels for food storage durable, breathable containers for grains, legumes and pickles that keep food fresh for longer without a single scrap of plastic. Old clothes and linen scraps get a second life too, stitched into sturdy reusable bags for shopping, produce and bread reviving traditional sewing skills while replacing single-use plastic."
  },
  // Topic 9 on the list: GR Traditional food pickling, sun-drying, and oil-based methods
  {
    id: 5,
    title: "Reducing Food Waste",
    icon: "🦋",
    color: "#3b82f6",
    info: "Traditional pickling, sun-drying and oil-based methods preserve seasonal produce without refrigeration vegetables are brined or soaked in vinegar, fruit and herbs are dried in the sun, and olives are stored in oil, saving surplus harvests from waste. Leftover citrus peels get a second life too: steeped in vinegar for about two weeks, they become a fragrant, all-purpose cleaner that replaces synthetic chemical products."
  },
  // Topic 10 on the list: GR Making kitchen cleaners from citrus peels and vinegar
  // NOTE: title "Cultural Exchange and Culinary Traditions" doesn't match this topic's actual content either.
  {
    id: 6,
    title: "Cultural Exchange and Culinary Traditions",
    icon: "🍂",
    color: "#8b5cf6",
    info: "Making kitchen cleaners from citrus peels and vinegar revives the age-old Mediterranean and Carpathian practice of using food scraps as powerful household cleaning agents. By infusing lemon, orange or grapefruit peels in white vinegar, a natural all-purpose cleaner is produced free of synthetic chemicals, plastic packaging and added cost."
  },
  // Topic 4 on the list (CZ Practice LTTA Romania - Water Irrigation / Greywater Reuse) is merged into this
  // module. Its packaging/greenwashing content isn't one of the 11 listed topics. Title below is a best-effort
  // placeholder covering both sub-topics: not confirmed by the manager yet; worth double-checking with her.
  {
    id: 7,
    title: "Sustainable Packaging & Water Reuse",
    icon: "♻️",
    color: "#0ea5e9",
    info: "Sustainable packaging protects food, reduces waste and limits environmental impact, but not every “green” claim on it is reliable; official certifications matter more than colourful marketing. Reusing appropriately treated greywater (wastewater from showers, sinks, baths and laundry) for suitable non-drinking purposes like toilet flushing is another simple way to cut a household's environmental footprint."
  },
  // NOT on the list either (seasonal/local eating); kept, moved to the end.
  {
    id: 8,
    title: "Seasonal & Local Eating",
    icon: "🥕",
    color: "#ec4899",
    info: "Eating fruits and vegetables when they're in season and grown nearby means less transport, less energy-intensive storage, and produce that's fresher and tastier. Choosing seasonal, local food is one of the simplest everyday ways to shrink a household's carbon footprint."
  }
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
    options: ["Imported packaged food", "Food grown in a local edible whildlife garden"],
    images: [asset("Garden1.png"), asset("Garden2.png")],
    answer: 1,
    explanation: "A diverse garden provides a wide variety of food and seeds while preserving biodiversity, supporting pollinators and wildlife, and helping gardens better adapt to drought, pests, and climate change."
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
    explanation: "Traditional seeds preserve local plant varieties, protect cultural heritage, and strengthen climate resilience by conserving varieties naturally adapted to local climates and changing environmental conditions."
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
    options: ["Basil", "Marigold", "Garlic", "Nastutium"],
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
    options: [" Chlorine", "D-limonene", "Baking powder", "Sugar"],
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
      "Uses drinking water for every purpose and sends all used water directly away.",
      "Leaves several taps running unnecessarily.",
      "Collects and appropriately treats greywater and reuses it for toilet flushing."
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

  // MODULE 8: not on the list: Seasonal & Local Eating.
  // AI-drafted from scratch (no source material existed for this module): flag for the manager to review.
  {
    id: 32,
    module: 8,
    text: "Which of these has the lowest carbon footprint?",
    options: ["Berries flown in from overseas in winter", "Local, in-season vegetables from a nearby farm", "Vegetables grown in a heated greenhouse out of season", "Canned imported fruit"],
    answer: 1,
    explanation: "Local, in-season produce travels short distances and needs no extra heating or long-term refrigerated storage, so it has a much smaller carbon footprint than food that's imported or grown out of season."
  },
  {
    id: 33,
    module: 8,
    text: "Is it TRUE OR FALSE that buying imported fruit year-round is more sustainable than buying local fruit only when it's in season?",
    options: ["True", "False"],
    answer: 1,
    explanation: "Imported, out-of-season fruit usually requires long-distance transport, refrigeration or energy-intensive greenhouse growing, all of which increase emissions compared to eating what's locally in season."
  },
  {
    id: 34,
    module: 8,
    text: "What is one benefit of eating seasonally?",
    options: ["Food is always more expensive", "Produce is fresher and often more nutritious", "It requires more packaging", "It increases food miles"],
    answer: 1,
    explanation: "Seasonal produce is usually harvested closer to when it's eaten, so it retains more nutrients and flavour than food that's been stored or shipped long distances."
  },
  {
    id: 35,
    module: 8,
    text: "Which shopping habit best supports local, seasonal eating?",
    options: ["Shopping at a farmers' market for what's currently in season", "Buying whatever fruit you want regardless of season", "Choosing pre-packaged imported produce", "Always picking the cheapest option regardless of origin"],
    answer: 0,
    explanation: "Farmers' markets typically sell what's currently in season and grown nearby, making it easy to shop in line with local, low-carbon eating."
  },
];

const PATH_NODES = [
  { x:50, y:90 }, // 0 = START
  { x:18, y:82 }, // 1
  { x:72, y:74 }, // 2
  { x:24, y:66 }, // 3
  { x:70, y:58 }, // 4
  { x:24, y:50 }, // 5
  { x:68, y:42 }, // 6
  { x:26, y:34 }, // 7
  { x:60, y:26 }, // 8 = last module = FINISH
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
      body { font-family:'Nunito','Segoe UI',sans-serif; }
      #root { min-height:100vh; }

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
   WATERFALL SVG
═══════════════════════════════════════════════════ */
function WaterfallSVG({ w = 100, h = 170 }) {
  return (
    <svg viewBox="0 0 80 160" style={{ width: w, height: h, overflow: "visible" }}>
      <path d="M10 0 Q40-2 70 0 L72 42 Q40 38 8 42 Z" fill="#5a6978"/>
      <path d="M18 4 Q40 2 62 4 L63 38 Q40 35 17 38 Z" fill="#4a5568"/>
      <rect x="24" y="2" width="12" height="10" rx="2" fill="#374151"/>
      <rect x="44" y="3" width="11" height="9" rx="2" fill="#374151"/>
      <path d="M10 0 Q15 5 8 42" fill="none" stroke="#3a4550" strokeWidth="1.5" opacity="0.6"/>
      <path d="M70 0 Q75 5 72 42" fill="none" stroke="#3a4550" strokeWidth="1.5" opacity="0.6"/>
      <rect x="26" y="40" width="9" height="65" rx="4.5" fill="#7dd3fc" opacity="0.88"
        style={{ animation:"wfStream 0.38s ease-in-out infinite alternate" }}/>
      <rect x="43" y="40" width="7" height="58" rx="3.5" fill="#93c5fd" opacity="0.78"
        style={{ animation:"wfStream 0.32s 0.1s ease-in-out infinite alternate" }}/>
      <rect x="35" y="40" width="5" height="60" rx="2.5" fill="#bae6fd" opacity="0.65"
        style={{ animation:"wfStream 0.42s 0.05s ease-in-out infinite alternate" }}/>
      <rect x="20" y="44" width="4" height="40" rx="2" fill="#93c5fd" opacity="0.48"
        style={{ animation:"wfStream 0.5s 0.18s ease-in-out infinite alternate" }}/>
      <rect x="54" y="44" width="3.5" height="37" rx="1.75" fill="#7dd3fc" opacity="0.42"
        style={{ animation:"wfStream 0.46s 0.24s ease-in-out infinite alternate" }}/>
      {[28,33,38,43,48].map((x, i) => (
        <circle key={i} cx={x} cy={55 + (i % 3) * 5} r="1.4" fill="#e0f2fe" opacity="0.8"
          style={{ animation:`dropFall ${0.5+i*0.09}s ${i*0.1}s linear infinite` }}/>
      ))}
      <ellipse cx="40" cy="114" rx="26" ry="11" fill="#2563eb" opacity="0.38"
        style={{ animation:"waterRipple 1.3s ease-in-out infinite" }}/>
      <ellipse cx="40" cy="112" rx="20" ry="8" fill="#3b82f6" opacity="0.48"/>
      <ellipse cx="40" cy="110" rx="13" ry="5" fill="#60a5fa" opacity="0.55"/>
      <ellipse cx="40" cy="108" rx="7" ry="3" fill="#93c5fd" opacity="0.7"/>
      {[30,35,40,45,50].map((x,i) => (
        <circle key={i} cx={x} cy={99+(i%2)*3} r="1.6" fill="#bfdbfe" opacity="0.8"
          style={{ animation:`splash ${0.28+i*0.06}s ${i*0.05}s ease-in-out infinite` }}/>
      ))}
      <ellipse cx="40" cy="120" rx="32" ry="13" fill="white" opacity="0.08"
        style={{ animation:"mistFloat 2.2s ease-in-out infinite" }}/>
      <ellipse cx="9"  cy="108" rx="9"  ry="14" fill="#15803d" opacity="0.78"/>
      <ellipse cx="71" cy="105" rx="8"  ry="13" fill="#16a34a" opacity="0.72"/>
      <ellipse cx="4"  cy="93"  rx="6"  ry="9"  fill="#166534" opacity="0.65"/>
      <ellipse cx="76" cy="91"  rx="5"  ry="8"  fill="#15803d" opacity="0.6"/>
      <rect x="11" y="118" width="2.5" height="12" rx="1.2" fill="#78350f" opacity="0.7"/>
      <rect x="64" y="118" width="2.5" height="12" rx="1.2" fill="#78350f" opacity="0.7"/>
      <text x="3"  y="104" fontSize="5" style={{ userSelect:"none" }}>🌸</text>
      <text x="68" y="102" fontSize="5" style={{ userSelect:"none" }}>🌼</text>
    </svg>
  );
}

/* ═══════════════════════════════════════════════════
   SHARED UI
═══════════════════════════════════════════════════ */
function Btn({ children, onClick, color="#22c55e", style={}, disabled }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} disabled={disabled}
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
  return (
    <button onClick={onClick} style={{
      background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)",
      color:"#94a3b8", cursor:"pointer", fontSize:13, fontWeight:700,
      padding:"6px 14px", marginBottom:16, fontFamily:"inherit",
      borderRadius:10, transition:"all 0.15s",
    }}>← Back</button>
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
      minHeight:"100dvh",
      background:"linear-gradient(180deg,#6bbde8 0%,#a8ddb5 32%,#4caf50 65%,#2d7d32 100%)",
      display:"flex", alignItems:"center", justifyContent:"center",
      fontFamily:"'Nunito','Segoe UI',sans-serif", padding:16,
      position:"relative", overflow:"hidden",
    }}>
      <div style={{ position:"absolute", bottom:0, left:0, right:0, height:"38%",
        background:"linear-gradient(180deg,transparent,#1b5e2099)", pointerEvents:"none", zIndex:0 }}/>
      {showWaterfall && <>
        <div style={{ position:"absolute", right:"1%", top:"4%", pointerEvents:"none", zIndex:0, opacity:0.85 }}>
          <WaterfallSVG w={130} h={200}/>
        </div>
        <div style={{ position:"absolute", left:"-2%", top:"10%", pointerEvents:"none", zIndex:0, opacity:0.6 }}>
          <WaterfallSVG w={100} h={160}/>
        </div>
      </>}
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
  color:"#f0fdf4", fontSize:14, fontFamily:"inherit", outline:"none",
};

function AuthScreen({ onAuth }) {
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
      if (!fullName.trim() || !uname || !password) {
        setError("Please fill in all fields.");
        return;
      }
      if (!USERNAME_RE.test(uname)) {
        setError("Username must be 3-20 characters: letters, numbers, dots, hyphens or underscores.");
        return;
      }
      if (password.length < 6) {
        setError("Password must be at least 6 characters.");
        return;
      }
      setBusy(true);
      try {
        const u = await registerUser(uname, password, fullName.trim());
        onAuth(u);
      } catch (err) {
        setError(friendlyAuthError(err));
      } finally {
        setBusy(false);
      }
    } else {
      if (!uname || !password) {
        setError("Please fill in all fields.");
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
        <div style={{ textAlign:"center", marginBottom:22 }}>
          <div style={{ fontSize:44, marginBottom:8 }}>🔐</div>
          <h1 style={{ fontSize:22, fontWeight:900, color:"#f0fdf4" }}>
            {mode==="register" ? "Create Your Account" : "Welcome Back"}
          </h1>
          <p style={{ color:"#86efac", fontSize:13, marginTop:4 }}>
            {mode==="register"
              ? "We'll use your name on your completion certificate"
              : "Log in to continue your garden journey"}
          </p>
        </div>

        <form onSubmit={handleSubmit} style={{ display:"flex", flexDirection:"column", gap:12 }}>
          {mode==="register" && (
            <input
              type="text" placeholder="Full name (for your certificate)"
              value={fullName} onChange={e=>setFullName(e.target.value)}
              style={inputStyle}
            />
          )}
          <input
            type="text" placeholder="Username"
            value={username} onChange={e=>setUsername(e.target.value)}
            style={inputStyle} autoCapitalize="none"
          />
          <input
            type="password" placeholder="Password"
            value={password} onChange={e=>setPassword(e.target.value)}
            style={inputStyle}
          />

          {error && (
            <div style={{ color:"#fca5a5", fontSize:13, textAlign:"center" }}>{error}</div>
          )}

          <Btn onClick={()=>{}} disabled={busy} style={{ width:"100%", marginTop:6 }} color="#22c55e">
            {busy ? "Please wait…" : mode==="register" ? "Create Account 🌱" : "Log In 🌿"}
          </Btn>
        </form>

        <div style={{ textAlign:"center", marginTop:16 }}>
          <button
            onClick={()=>{ setMode(m=>m==="register"?"login":"register"); setError(""); }}
            style={{ background:"none", border:"none", color:"#86efac",
              fontSize:13, cursor:"pointer", textDecoration:"underline", fontFamily:"inherit" }}
          >
            {mode==="register" ? "Already have an account? Log in" : "New here? Create an account"}
          </button>
        </div>

        <p style={{ marginTop:18, color:"#475569", fontSize:11, textAlign:"center", lineHeight:1.5 }}>
          Your account works on any device: just log in with the same username and password.
        </p>
      </Panel>
    </GardenWrap>
  );
}

/* ═══════════════════════════════════════════════════
   LOADING SCREEN
═══════════════════════════════════════════════════ */
function LoadingScreen({ onDone }) {
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    const id = setInterval(() => {
      setProgress(p => {
        const next = p + 1.4;
        if (next >= 100) { clearInterval(id); setTimeout(()=>onDone(), 600); return 100; }
        return next;
      });
    }, 38);
    return () => clearInterval(id);
  }, []);

  return (
    <div style={{
      position:"fixed", inset:0,
      background:"linear-gradient(180deg,#6bbde8 0%,#a8ddb5 35%,#4caf50 68%,#2d7d32 100%)",
      display:"flex", flexDirection:"column",
      alignItems:"center", justifyContent:"center",
      fontFamily:"'Nunito','Segoe UI',sans-serif", overflow:"hidden",
    }}>
      <div style={{ position:"absolute", right:"2%", top:"3%", zIndex:0, opacity:0.9 }}>
        <WaterfallSVG w={160} h={240}/>
      </div>
      <div style={{ position:"absolute", left:"0%", top:"8%", zIndex:0, opacity:0.65 }}>
        <WaterfallSVG w={130} h={200}/>
      </div>
      <div style={{ position:"absolute", bottom:0, left:0, right:0, height:"35%",
        background:"linear-gradient(180deg,transparent,#1b5e2099)", zIndex:0, pointerEvents:"none" }}/>
      {["🍃","🌸","🌼","🍀","🌺","🦋","🌿","🌻"].map((e,i)=>(
        <span key={i} style={{
          position:"absolute", zIndex:0, pointerEvents:"none",
          left:`${5+i*12}%`, top:`${3+(i%4)*7}%`,
          fontSize:16+(i%3)*5, opacity:0.4,
          animation:`leafDrift ${4+i}s ease-in-out infinite`,
          animationDelay:`${i*0.6}s`,
        }}>{e}</span>
      ))}

      <div style={{ position:"relative", zIndex:1, textAlign:"center", marginBottom:28 }}>
        <div style={{ fontSize:56, marginBottom:6, filter:"drop-shadow(0 4px 16px rgba(0,0,0,0.4))" }}>🌿</div>
        <h1 style={{ fontSize:38, fontWeight:900, color:"white",
          textShadow:"0 3px 16px rgba(0,0,0,0.5), 0 1px 4px rgba(0,0,0,0.4)",
          letterSpacing:-0.5, lineHeight:1.1, marginBottom:8 }}>Garden Quest</h1>
        <p style={{ color:"#dcfce7", fontSize:14, fontWeight:600, opacity:0.85 }}>
          Your journey through the garden begins…
        </p>
      </div>

      <div style={{
        position:"relative",
        zIndex:1,
        display:"flex",
        alignItems:"flex-end",
        justifyContent:"center",
        gap:30,
        marginBottom:36,
        flexWrap:"wrap"
      }}>
        {CHARACTERS.map((c, i) => (
          <div key={c.id} style={{ textAlign:"center" }}>
            <div style={{
              background:`${c.color}20`,
              border:`2px solid ${c.color}55`,
              borderRadius:20,
              padding:"10px 12px",
              marginBottom:6
            }}>
              <img
                src={c.idle}
                alt={c.name}
                style={{
                  width:80,
                  height:107,
                  objectFit:"contain",
                  display:"block",
                  animation:`charBob 2.2s ${i * 0.3}s ease-in-out infinite`,
                  filter:`drop-shadow(0 6px 18px ${c.color}70)`
                }}
              />
            </div>

            <div style={{
              color:c.color,
              fontWeight:900,
              fontSize:12,
              background:"rgba(0,0,0,0.35)",
              borderRadius:8,
              padding:"2px 8px"
            }}>
              {c.name}
            </div>
          </div>
        ))}
      </div>

      <div style={{ position:"relative", zIndex:1, width:280, textAlign:"center" }}>
        <div style={{ fontSize:12, color:"#a7f3d0", fontWeight:700, marginBottom:8, letterSpacing:1 }}>
          LOADING…
        </div>
        <div style={{ height:22, borderRadius:999,
          background:"rgba(0,0,0,0.25)", border:"2px solid rgba(255,255,255,0.35)",
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
        <div style={{ color:"#bae6fd", fontSize:14, marginTop:8, fontWeight:800 }}>
          {Math.round(progress)}%
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   LANGUAGE SCREEN
═══════════════════════════════════════════════════ */
function LanguageScreen({ onSelect }) {
  return (
    <GardenWrap>
      <Panel>
        <div style={{ textAlign:"center", marginBottom:24 }}>
          <div style={{ fontSize:46, marginBottom:8 }}>🌍</div>
          <h1 style={{ fontSize:22, fontWeight:900, marginBottom:4, color:"#f0fdf4" }}>
            Choose Your Language
          </h1>
          <p style={{ color:"#86efac", fontSize:13 }}>Select a language to continue</p>
        </div>
        <div style={{ display:"flex", flexDirection:"column", gap:11 }}>
          {LANGUAGES.map(lang=>(
            <div key={lang.id} onClick={()=>onSelect(lang)}
              style={{
                background:`${lang.color}14`,
                border:`2px solid ${lang.color}44`,
                borderRadius:16, padding:"14px 18px", cursor:"pointer",
                display:"flex", alignItems:"center", gap:14, transition:"all 0.2s",
              }}
              onMouseEnter={e=>{
                e.currentTarget.style.background=`${lang.color}28`;
                e.currentTarget.style.transform="translateX(6px)";
                e.currentTarget.style.borderColor=lang.color;
              }}
              onMouseLeave={e=>{
                e.currentTarget.style.background=`${lang.color}14`;
                e.currentTarget.style.transform="translateX(0)";
                e.currentTarget.style.borderColor=`${lang.color}44`;
              }}
            >
              <span style={{ fontSize:32 }}>{lang.flag}</span>
              <span style={{ fontWeight:800, fontSize:16, color:"#f0fdf4" }}>{lang.label}</span>
              <span style={{ marginLeft:"auto", color:"#64748b", fontSize:18 }}>›</span>
            </div>
          ))}
        </div>
      </Panel>
    </GardenWrap>
  );
}

/*AristotleIntro*/

function AristotleIntro({ module, onStart }) {
  const [AristotleIn, setAristotleIn] = useState(false);
  const [showCloud, setShowCloud] = useState(false);
  const [canProceed, setCanProceed] = useState(false);

  useEffect(() => {
    setAristotleIn(false);
    setShowCloud(false);
    setCanProceed(false);
    const t1 = setTimeout(() => setAristotleIn(true), 250);
    const t2 = setTimeout(() => setShowCloud(true), 1400);
    const t3 = setTimeout(() => setCanProceed(true), 1400 + 2500); // stays locked ~2.5s after text appears
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3); };
  }, [module]);

  return (
    <GardenWrap>
      <Panel>
        <div style={{ textAlign: "center", marginBottom: 14 }}>
          <div style={{
            display:"inline-block", background:`${module.color}22`,
            border:`1px solid ${module.color}55`, borderRadius:12,
            padding:"4px 14px", marginBottom:10,
          }}>
            <span style={{ color: module.color, fontWeight:900, fontSize:12, letterSpacing:0.5 }}>
              {module.icon} MODULE {module.id}
            </span>
          </div>
          <h2 style={{ color: "#fbbf24", fontWeight:900, fontSize:19, lineHeight:1.3 }}>
            {module.title}
          </h2>
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
                📜 Aristotle explains…
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

        <div style={{ textAlign: "center" }}>
          <Btn onClick={onStart} color="#fbbf24" disabled={!canProceed}>
            {canProceed ? "Begin the Quest 🌿" : "Reading… ⏳"}
          </Btn>
        </div>
      </Panel>
    </GardenWrap>
  );
}

/* ═══════════════════════════════════════════════════
   CHARACTER SCREEN
═══════════════════════════════════════════════════ */
function CharacterScreen({ language, onSelect, onBack }) {
  const [idx,     setIdx]     = useState(0);
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
          <h1 style={{ fontSize:22, fontWeight:900, color:"#f0fdf4" }}>Choose Your Character</h1>
          <p style={{ color:"#86efac", fontSize:13, marginTop:3 }}>
            {language.flag} {language.label} · Swipe or use arrows to browse
          </p>
        </div>

        <div style={{ position:"relative" }} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}>
          <button onClick={prev} style={{
            position:"absolute", left:-16, top:"50%", transform:"translateY(-50%)",
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
              <img src={c.idle} alt={c.name} style={{
                width:140, height:187, objectFit:"contain", display:"block", margin:"0 auto 14px",
                filter:`drop-shadow(0 10px 28px ${c.color}90)`,
                animation:"charIdle 3s ease-in-out infinite",
              }}/>
              <div style={{ fontWeight:900, fontSize:20, color:"#f0fdf4", marginBottom:3 }}>{c.name}</div>
              <div style={{
                display:"inline-block", background:`${c.color}22`, border:`1px solid ${c.color}55`,
                color:c.color, fontWeight:700, fontSize:12, borderRadius:8, padding:"3px 10px", marginBottom:10,
              }}>{c.culture}</div>
              <div style={{ color:"#94a3b8", fontSize:13, fontStyle:"italic",
                background:"rgba(255,255,255,0.04)", borderRadius:12, padding:"8px 12px" }}>
                "{c.bubble.idle}"
              </div>
            </div>
          </div>

          <button onClick={next} style={{
            position:"absolute", right:-16, top:"50%", transform:"translateY(-50%)",
            width:38, height:38, borderRadius:"50%", zIndex:10,
            background:"rgba(74,222,128,0.15)", border:"2px solid rgba(74,222,128,0.35)",
            color:"#4ade80", fontSize:20, cursor:"pointer",
            display:"flex", alignItems:"center", justifyContent:"center",
          }}>›</button>
        </div>

        <div style={{ display:"flex", justifyContent:"center", gap:8, margin:"18px 0 20px" }}>
          {CHARACTERS.map((ch,i)=>(
            <div key={i} onClick={()=>goTo(i,i>idx?"left":"right")}
              style={{ width:i===idx?22:8, height:8, borderRadius:4, cursor:"pointer",
                background:i===idx?c.color:"#334155", transition:"all 0.3s" }}/>
          ))}
        </div>

        <Btn onClick={()=>onSelect(c)} style={{ width:"100%" }} color={c.color}>
          🌿 Start the Game with {c.name}!
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
function MapScreen({ language, character, completedModules, prevCompleted, onStartModule, onBack, onViewCertificate, onPlayAgain, onLogout }) {
  const [charNode,        setCharNode]        = useState(prevCompleted);
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

  useEffect(() => {
    if (completedModules <= prevCompleted) return;
    const queue = [];
    for (let i=prevCompleted+1; i<=completedModules; i++) queue.push(i);
    stepQueue.current = queue;
    walkNextStep();
  }, []);

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
      setCharNode(target);
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
  },[]);

  function zoomIn()    { setZoom(z=>{ const nz=clampZoom(z+0.25); setPan(p=>clampPan(p.x,p.y,nz)); return nz; }); }
  function zoomOut()   { setZoom(z=>{ const nz=clampZoom(z-0.25); setPan(p=>clampPan(p.x,p.y,nz)); return nz; }); }
  function zoomReset() { setZoom(1); setPan({x:0,y:0}); }

  return (
    <GardenWrap showWaterfall={false}>
      <Panel style={{ padding:0, overflow:"hidden" }}>
        {/* Header */}
        <div style={{ padding:"16px 20px 12px", borderBottom:"1px solid rgba(74,222,128,0.12)" }}>
          <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
            <BackBtn onClick={onBack}/>
            <button onClick={onLogout} style={{
              background:"none", border:"none", color:"#f87171", fontSize:12,
              cursor:"pointer", textDecoration:"underline", fontFamily:"inherit", marginBottom:16,
            }}>Log out</button>
          </div>
          <div style={{ display:"flex", alignItems:"center", gap:12 }}>
            <img src={character.idle} alt={character.name}
              style={{ width:42, height:56, objectFit:"contain", flexShrink:0 }}/>
            <div style={{ flex:1 }}>
              <div style={{ fontWeight:900, fontSize:15, color:"#f0fdf4" }}>{character.name}'s Garden Journey</div>
              <div style={{ color:"#86efac", fontSize:12 }}>
                {language.flag} {language.label} · {completedModules}/{MODULES.length} completed
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
            {MODULES.map((mod,i)=>(
              <MapNode key={mod.id} mod={mod} node={PATH_NODES[i+1]}
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
              letterSpacing:1, textShadow:"0 1px 4px rgba(0,0,0,0.8)" }}>START</div>

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
            {[{label:"+",fn:zoomIn},{label:"⟳",fn:zoomReset},{label:"−",fn:zoomOut}].map(({label,fn})=>(
              <button key={label} onClick={fn} style={{
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
            {Math.round(zoom*100)}% · scroll or pinch to zoom
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding:"10px 20px",borderTop:"1px solid rgba(74,222,128,0.12)",textAlign:"center" }}>
          <p style={{ color:"#6b7280", fontSize:12 }}>
            {isWalking&&`${character.name} is walking through the garden…`}
            {!isWalking&&completedModules===0&&"👆 Tap Module 1 to begin, the Aristotle is waiting!"}
            {!isWalking&&completedModules>0&&completedModules<MODULES.length&&"The Aristotle awaits your next lesson! 👆"}
            {!isWalking&&completedModules===MODULES.length&&"🏆 You've mastered the entire garden journey!"}
          </p>
          {completedModules===MODULES.length && (
            <div style={{ marginTop:10, display:"flex", gap:8, justifyContent:"center" }}>
              <Btn onClick={onViewCertificate} color="#fbbf24">🏆 View Certificate</Btn>
              <Btn onClick={onPlayAgain} color="#3b82f6">🔄 Play Again</Btn>
            </div>
          )}
        </div>
      </Panel>
    </GardenWrap>
  );
}

/* Map node */
function MapNode({ mod, node, done, current, locked, onClick }) {
  const [hov, setHov] = useState(false);
  const ring = done?"#4ade80":current?"#fbbf24":"#6b8f4a";
  const bg   = done?"linear-gradient(135deg,#166534,#22c55e)"
    :current?"linear-gradient(135deg,#78350f,#d97706)"
    :"linear-gradient(135deg,#1c3a10,#2d5a1b)";
  return (
    <div onClick={onClick}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{ position:"absolute", left:`${node.x}%`, top:`${node.y}%`,
        transform:"translate(-50%,-50%)", cursor:locked?"not-allowed":"pointer", zIndex:5 }}>
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
    </div>
  );
}
/* ═══════════════════════════════════════════════════
   GAME SCREEN: cinematic encounter + quiz
═══════════════════════════════════════════════════ */
function GameScreen({ mod, character, questions, onFinish }) {
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

const shuffled = useMemo(()=>questions.map(q=>{
  const hasImages = Array.isArray(q.images);
  const pairs = q.options.map((opt,i)=>({ opt, img: hasImages?q.images[i]:null }));
  const correctPair = pairs[q.answer];
  for (let i=pairs.length-1;i>0;i--) {
    const j=Math.floor(Math.random()*(i+1));
    [pairs[i],pairs[j]]=[pairs[j],pairs[i]];
  }
  return {
    ...q,
    options: pairs.map(p=>p.opt),
    images: hasImages ? pairs.map(p=>p.img) : null,
    answer: pairs.indexOf(correctPair),
  };
}),[questions]);

  const q     = shuffled[idx];
  const total = shuffled.length;

  function clearTimers() { timers.current.forEach(clearTimeout); timers.current=[]; }

  useEffect(()=>{
    if (phase!=="encounter") return;
    setAristotleIn(false); setShowCloud(false);
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

      {/* ═══ RICH GARDEN BACKGROUND ═══ */}
      <div style={{ position:"absolute", inset:0, pointerEvents:"none", zIndex:0 }}>

        {/* Waterfall top-right */}
        <div style={{ position:"absolute", right:"2%", top:"3%", opacity:0.75 }}>
          <WaterfallSVG w={110} h={165}/>
        </div>

        {/* Sky clouds */}
        <svg style={{ position:"absolute", top:0, left:0, width:"100%", height:"28%", zIndex:0 }}
          viewBox="0 0 400 80" preserveAspectRatio="xMidYMid slice">
          <ellipse cx="60"  cy="18" rx="38" ry="14" fill="white" opacity="0.5"/>
          <ellipse cx="85"  cy="14" rx="26" ry="11" fill="white" opacity="0.42"/>
          <ellipse cx="38"  cy="20" rx="22" ry="10" fill="white" opacity="0.38"/>
          <ellipse cx="220" cy="22" rx="34" ry="12" fill="white" opacity="0.45"/>
          <ellipse cx="248" cy="17" rx="22" ry="10" fill="white" opacity="0.38"/>
          <ellipse cx="340" cy="15" rx="28" ry="11" fill="white" opacity="0.4"/>
          <ellipse cx="362" cy="20" rx="18" ry="9"  fill="white" opacity="0.35"/>
          {/* Birds */}
          <text x="130" y="20" fontSize="10" style={{ userSelect:"none",
            animation:"birdFly 2.2s ease-in-out infinite" }}>🐦</text>
          <text x="175" y="14" fontSize="8"  style={{ userSelect:"none",
            animation:"birdFly 1.9s 0.6s ease-in-out infinite" }}>🐦</text>
          <text x="290" y="18" fontSize="9"  style={{ userSelect:"none",
            animation:"birdFly 2.5s 1.1s ease-in-out infinite" }}>🦋</text>
        </svg>

        {/* Distant mountains */}
        <svg style={{ position:"absolute", top:"12%", left:0, width:"100%", height:"22%", zIndex:0 }}
          viewBox="0 0 400 60" preserveAspectRatio="xMidYMid slice">
          <path d="M0 60 L30 15 L60 60 Z"  fill="#4a6741" opacity="0.32"/>
          <path d="M40 60 L75 8  L110 60 Z" fill="#3d5a34" opacity="0.28"/>
          <path d="M280 60 L320 12 L360 60 Z" fill="#4a6741" opacity="0.3"/>
          <path d="M340 60 L370 20 L400 60 Z" fill="#3d5a34" opacity="0.26"/>
          {/* Snow caps */}
          <path d="M30 15 L36 26 L24 26 Z"  fill="white" opacity="0.5"/>
          <path d="M75 8  L82 20 L68 20 Z"  fill="white" opacity="0.45"/>
          <path d="M320 12 L327 24 L313 24 Z" fill="white" opacity="0.45"/>
        </svg>

        {/* Left tree cluster */}
        <svg style={{ position:"absolute", left:0, bottom:"28%", width:"22%", height:"45%", zIndex:1 }}
          viewBox="0 0 90 120" preserveAspectRatio="xMidYMax meet">
          {/* Big oak */}
          <rect x="18" y="62" width="8"   height="38" rx="3"  fill="#5c3a10"/>
          <ellipse cx="22" cy="58" rx="18" ry="24" fill="#1a5c0a"/>
          <ellipse cx="22" cy="52" rx="13" ry="18" fill="#22701a"/>
          <ellipse cx="22" cy="47" rx="8"  ry="12" fill="#2d8520"/>
          {/* Pine */}
          <rect x="52" y="70" width="5"   height="30" rx="2"  fill="#5c3a10"/>
          <path d="M54.5 70 L42 90 L67 90 Z" fill="#064e1a"/>
          <path d="M54.5 62 L44 78 L65 78 Z" fill="#0a6622"/>
          <path d="M54.5 54 L46 68 L63 68 Z" fill="#0d7a28"/>
          <path d="M54.5 47 L48 59 L61 59 Z" fill="#0f8830"/>
          {/* Small shrubs */}
          <ellipse cx="8"  cy="98" rx="8"  ry="5"  fill="#166534" opacity="0.8"/>
          <ellipse cx="5"  cy="95" rx="5"  ry="4"  fill="#15803d" opacity="0.7"/>
          <ellipse cx="75" cy="96" rx="7"  ry="4.5" fill="#166534" opacity="0.75"/>
          {/* Flowers on ground */}
          <text x="0"  y="108" fontSize="9" style={{ userSelect:"none" }}>🌸</text>
          <text x="28" y="112" fontSize="8" style={{ userSelect:"none" }}>🌼</text>
          <text x="60" y="110" fontSize="9" style={{ userSelect:"none" }}>🌺</text>
        </svg>

        {/* Right tree cluster */}
        <svg style={{ position:"absolute", right:0, bottom:"28%", width:"18%", height:"40%", zIndex:1 }}
          viewBox="0 0 75 110" preserveAspectRatio="xMidYMax meet">
          <rect x="30" y="55" width="7"   height="35" rx="2.5" fill="#5c3a10"/>
          <ellipse cx="33" cy="52" rx="16" ry="20" fill="#166534"/>
          <ellipse cx="33" cy="46" rx="11" ry="15" fill="#1a7a3a"/>
          <ellipse cx="33" cy="41" rx="7"  ry="10" fill="#22891a"/>
          {/* Fruit tree */}
          <rect x="55" y="60" width="5"   height="28" rx="2"  fill="#78350f"/>
          <ellipse cx="57" cy="57" rx="12" ry="14" fill="#16a34a"/>
          <text x="51" y="58" fontSize="7" style={{ userSelect:"none" }}>🍎</text>
          <text x="57" y="52" fontSize="6" style={{ userSelect:"none" }}>🍎</text>
          {/* Ground shrubs */}
          <ellipse cx="10" cy="95" rx="10" ry="6"  fill="#166534" opacity="0.75"/>
          <ellipse cx="7"  cy="92" rx="6"  ry="4.5" fill="#15803d" opacity="0.65"/>
          <text x="2"  y="104" fontSize="8" style={{ userSelect:"none" }}>🌻</text>
          <text x="20" y="108" fontSize="7" style={{ userSelect:"none" }}>🌷</text>
        </svg>

        {/* Ground gradient */}
        <div style={{ position:"absolute", bottom:0, left:0, right:0, height:"38%",
          background:"linear-gradient(180deg,transparent,#1b5e20bb)" }}/>

        {/* Ground foliage strip */}
        <div style={{ position:"absolute", bottom:0, left:0, right:0, height:"26%" }}>
          {["🌳","🌲","🌿","🌾","🌳","🌲","🌿","🌾"].map((e,i)=>(
            <span key={i} style={{
              position:"absolute", bottom:`${1+i%3*2}%`, left:`${i*13+1}%`,
              fontSize:20+(i%3)*7, opacity:0.55, userSelect:"none",
            }}>{e}</span>
          ))}
        </div>

        {/* ─── RIVER (full width, mid-lower scene) ─── */}
        <svg style={{ position:"absolute", bottom:"24%", left:0, width:"100%", height:"52px", zIndex:2, overflow:"visible" }}
          viewBox="0 0 400 52" preserveAspectRatio="none">
          <defs>
            <linearGradient id="gameRiverG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#60a5fa" stopOpacity="0.9"/>
              <stop offset="50%"  stopColor="#3b82f6" stopOpacity="1"/>
              <stop offset="100%" stopColor="#1d4ed8" stopOpacity="0.85"/>
            </linearGradient>
          </defs>

          {/* Left bank (grass) */}
          <path d="M0 10 Q100 6 200 10 Q300 14 400 10 L400 0 L0 0 Z"
            fill="#2d6b10" opacity="0.7"/>
          {/* Right bank (grass) */}
          <path d="M0 36 Q100 40 200 36 Q300 32 400 36 L400 52 L0 52 Z"
            fill="#2d6b10" opacity="0.7"/>

          {/* Main river body */}
          <path d="M0 10 Q100 6 200 10 Q300 14 400 10 L400 36 Q300 32 200 36 Q100 40 0 36 Z"
            fill="url(#gameRiverG)"/>

          {/* River surface shimmer */}
          <path d="M0 18 Q50 14 100 18 Q150 22 200 18 Q250 14 300 18 Q350 22 400 18"
            stroke="white" strokeWidth="1.8" fill="none" opacity="0.3"
            strokeDasharray="8,6"
            style={{ animation:"riverFlow 1.8s linear infinite" }}/>
          <path d="M0 26 Q50 22 100 26 Q150 30 200 26 Q250 22 300 26 Q350 30 400 26"
            stroke="white" strokeWidth="1.2" fill="none" opacity="0.2"
            strokeDasharray="5,8"
            style={{ animation:"riverFlow 2.4s 0.4s linear infinite" }}/>

          {/* Deep channel */}
          <path d="M0 22 Q100 18 200 22 Q300 26 400 22"
            stroke="#1d4ed8" strokeWidth="3" fill="none" opacity="0.35"/>

          {/* Reeds - left bank */}
          {[20,55,95,140,185,230,270,315,360].map((x,i)=>(
            <g key={i}>
              <rect x={x}   y={4}  width="1.2" height="7"  rx="0.6" fill="#15803d" opacity="0.9"/>
              <rect x={x+4} y={3}  width="1"   height="8"  rx="0.5" fill="#166534" opacity="0.8"/>
              <ellipse cx={x}   cy={4}  rx="2.5" ry="1" fill="#4ade80" opacity="0.55"/>
              <ellipse cx={x+4} cy={3}  rx="2"   ry="1" fill="#4ade80" opacity="0.5"/>
            </g>
          ))}
          {/* Reeds - right bank */}
          {[30,75,120,165,210,255,300,345,385].map((x,i)=>(
            <g key={i}>
              <rect x={x}   y={38} width="1.2" height="7"  rx="0.6" fill="#15803d" opacity="0.85"/>
              <rect x={x+5} y={39} width="1"   height="6"  rx="0.5" fill="#166534" opacity="0.75"/>
              <ellipse cx={x}   cy={45} rx="2.5" ry="1" fill="#4ade80" opacity="0.5"/>
            </g>
          ))}

          {/* Lily pads */}
          <ellipse cx="80"  cy="22" rx="6" ry="2.5" fill="#16a34a" opacity="0.75"/>
          <ellipse cx="160" cy="26" rx="5" ry="2"   fill="#16a34a" opacity="0.7"/>
          <ellipse cx="250" cy="20" rx="6" ry="2.5" fill="#16a34a" opacity="0.72"/>
          <ellipse cx="330" cy="25" rx="5" ry="2"   fill="#16a34a" opacity="0.68"/>
          <text x="77"  y="24" fontSize="7" style={{ userSelect:"none" }}>🌸</text>
          <text x="157" y="28" fontSize="6" style={{ userSelect:"none" }}>🌸</text>
          <text x="247" y="22" fontSize="7" style={{ userSelect:"none" }}>🌸</text>
          <text x="327" y="27" fontSize="6" style={{ userSelect:"none" }}>🌸</text>

          {/* Small fish glimpse */}
          <text x="110" y="30" fontSize="7" style={{ userSelect:"none", opacity:0.6 }}>🐟</text>
          <text x="290" y="19" fontSize="6" style={{ userSelect:"none", opacity:0.5 }}>🐟</text>
        </svg>

        {/* ─── STONE BRIDGE (over the river, center-left) ─── */}
        <svg style={{ position:"absolute", bottom:"24%", left:"30%", width:"22%", height:"68px",
          zIndex:3, overflow:"visible" }}
          viewBox="0 0 100 68" preserveAspectRatio="none">
          {/* Bridge shadow */}
          <ellipse cx="50" cy="56" rx="46" ry="5" fill="#0f172a" opacity="0.22"/>
          {/* Bridge arch (stone arch under the road) */}
          <path d="M12 52 Q50 28 88 52" fill="#7a6040" opacity="0.5"/>
          <path d="M16 52 Q50 32 84 52" fill="#92714a" opacity="0.35"/>
          {/* Arch keystone */}
          <path d="M46 30 L54 30 L52 38 L48 38 Z" fill="#a0845a" opacity="0.7"/>
          {/* Stone pillars */}
          <rect x="10" y="38" width="12" height="18" rx="2" fill="#8b7355"/>
          <rect x="78" y="38" width="12" height="18" rx="2" fill="#8b7355"/>
          {/* Pillar stone texture */}
          {[40,44,48,52].map(y=>(
            <g key={y}>
              <rect x="10" y={y} width="12" height="1" fill="#6b5535" opacity="0.35"/>
              <rect x="78" y={y} width="12" height="1" fill="#6b5535" opacity="0.35"/>
            </g>
          ))}
          {/* Bridge road surface */}
          <rect x="8" y="30" width="84" height="10" rx="2" fill="#c8a96e"/>
          {/* Road stone blocks */}
          {[10,22,34,46,58,70,82].map(x=>(
            <rect key={x} x={x} y="30" width="10" height="10" rx="1"
              fill="#b8956a" opacity="0.45"/>
          ))}
          {/* Road center line worn texture */}
          <rect x="8" y="34.5" width="84" height="1" fill="#e5d5b0" opacity="0.3"/>
          {/* Left railing */}
          <rect x="8"  y="26" width="84" height="5" rx="2.5" fill="#d4b896"/>
          {/* Right railing */}
          <rect x="8"  y="39" width="84" height="5" rx="2.5" fill="#c4a882"/>
          {/* Railing posts */}
          {[9,20,31,42,53,64,75,86].map(x=>(
            <rect key={x} x={x} y="24" width="3" height="22" rx="1.5" fill="#b8965a"/>
          ))}
          {/* Post caps */}
          {[9,20,31,42,53,64,75,86].map(x=>(
            <ellipse key={x} cx={x+1.5} cy="24" rx="2.5" ry="1.5" fill="#d4b896"/>
          ))}
          {/* Moss & vines on bridge */}
          <text x="4"  y="48" fontSize="8" style={{ userSelect:"none" }}>🌿</text>
          <text x="84" y="46" fontSize="8" style={{ userSelect:"none" }}>🌿</text>
          <text x="44" y="26" fontSize="6" style={{ userSelect:"none" }}>🌱</text>
        </svg>

        {/* ─── FLOWER PATCHES (scattered on ground) ─── */}
        {/* Left side flowers */}
        <div style={{ position:"absolute", bottom:"38%", left:"2%", display:"flex", gap:6 }}>
          {["🌸","🌼","🌺","🌷","🌻"].map((f,i)=>(
            <span key={i} style={{
              fontSize:16+(i%2)*4, userSelect:"none", opacity:0.85,
              animation:`leafDrift ${3+i*0.4}s ${i*0.3}s ease-in-out infinite`,
            }}>{f}</span>
          ))}
        </div>
        {/* Right side flowers */}
        <div style={{ position:"absolute", bottom:"38%", right:"2%", display:"flex", gap:6 }}>
          {["🌻","🌷","🌺","🌼","🌸"].map((f,i)=>(
            <span key={i} style={{
              fontSize:14+(i%2)*5, userSelect:"none", opacity:0.8,
              animation:`leafDrift ${3.5+i*0.3}s ${i*0.4}s ease-in-out infinite`,
            }}>{f}</span>
          ))}
        </div>
        {/* Center-bottom flower row */}
        <div style={{ position:"absolute", bottom:"28%", left:"50%", transform:"translateX(-50%)",
          display:"flex", gap:10 }}>
          {["🌸","🌼","🌸"].map((f,i)=>(
            <span key={i} style={{
              fontSize:12, userSelect:"none", opacity:0.7,
              animation:`leafDrift ${2.8+i*0.5}s ${i*0.2}s ease-in-out infinite`,
            }}>{f}</span>
          ))}
        </div>
        {/* River bank flowers */}
        <div style={{ position:"absolute", bottom:"46%", left:"5%", display:"flex", gap:8 }}>
          {["🌷","🌸","🌼","🌺"].map((f,i)=>(
            <span key={i} style={{
              fontSize:13+(i%2)*3, userSelect:"none", opacity:0.75,
              animation:`leafDrift ${3+i*0.6}s ${i*0.25}s ease-in-out infinite`,
            }}>{f}</span>
          ))}
        </div>
        <div style={{ position:"absolute", bottom:"46%", right:"5%", display:"flex", gap:8 }}>
          {["🌺","🌻","🌷","🌸"].map((f,i)=>(
            <span key={i} style={{
              fontSize:12+(i%2)*4, userSelect:"none", opacity:0.75,
              animation:`leafDrift ${3.2+i*0.5}s ${i*0.35}s ease-in-out infinite`,
            }}>{f}</span>
          ))}
        </div>

        {/* Floating leaves */}
        {["🍃","🌸","🍀","🌺","🍃"].map((e,i)=>(
          <span key={i} style={{
            position:"absolute", left:`${8+i*20}%`, top:`${5+i%3*5}%`,
            fontSize:15+(i%2)*5, opacity:0.38, userSelect:"none",
            animation:`leafDrift ${5+i}s ease-in-out infinite`,
            animationDelay:`${i*0.9}s`,
          }}>{e}</span>
        ))}
      </div>

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
          border:"1px solid rgba(74,222,128,0.2)" }}>Q {idx+1}/{total}</div>
        <div style={{ background:"rgba(0,0,0,0.45)",borderRadius:10,padding:"4px 10px",
          fontSize:12,fontWeight:800,backdropFilter:"blur(6px)",
          border:"1px solid rgba(74,222,128,0.2)",color:"#fbbf24" }}>⭐ {score}</div>
      </div>

      {/* ═══ ENCOUNTER PHASE ═══ */}
{phase==="encounter"&&(
  <div style={{ position:"absolute",inset:0,display:"flex",
    alignItems:"flex-end",justifyContent:"center",paddingBottom:"30%",zIndex:10 }}>

    {/* Character - left */}
    <div style={{ position:"absolute",left:"8%",bottom:"32%",
      textAlign:"center",animation:"slideInLeft 0.5s ease" }}>
      <img src={character.idle} alt={character.name} style={{
        width:90,height:120,objectFit:"contain",
        filter:`drop-shadow(0 8px 24px ${character.color}aa)`,
        animation:"charIdle 3s ease-in-out infinite",
      }}/>
      <div style={{ background:"white",color:"#0f172a",borderRadius:8,
        padding:"3px 10px",fontSize:11,fontWeight:900,marginTop:4,
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
          <span>📜</span> The Aristotle asks…
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
        width:88,height:117,objectFit:"contain",
        filter:"drop-shadow(0 8px 28px rgba(139,92,246,0.65))",
        animation:AristotleIn?"walkBob 0.55s ease-in-out infinite":"none",
      }}/>
      <div style={{ color:"#c4b5fd",fontWeight:900,fontSize:11,marginTop:4,
        background:"rgba(0,0,0,0.45)",borderRadius:8,padding:"2px 10px" }}>
        Aristotle
      </div>
    </div>

    {/* Skip */}
    <div style={{ position:"absolute",bottom:18,right:16 }}>
      <button onClick={()=>{ clearTimers(); setAristotleIn(true); setShowCloud(true);
        setTimeout(()=>setPhase("question"),400); }}
        style={{ background:"rgba(0,0,0,0.4)",border:"1px solid rgba(255,255,255,0.2)",
          color:"#94a3b8",fontSize:11,cursor:"pointer",borderRadius:10,
          padding:"6px 12px",fontFamily:"inherit" }}>
        Skip intro ›
      </button>
    </div>
  </div>
)}


{/* ═══ QUESTION PHASE ═══ */}
      {phase==="question"&&(
        <div style={{ position:"absolute",inset:0,display:"flex",
          flexDirection:isMobile?"column":"row",alignItems:"stretch",
          zIndex:10,padding:isMobile?"46px 10px 10px":"50px 12px 16px",gap:isMobile?8:0 }}>
          {/* Left: Character */}
          <div style={{ width:isMobile?"100%":"28%",display:"flex",
            flexDirection:isMobile?"row":"column",flexShrink:0,
            alignItems:"center",justifyContent:isMobile?"flex-start":"flex-end",
            gap:isMobile?10:0,paddingBottom:isMobile?0:12,
            animation:"slideInLeft 0.4s ease" }}>
            <img src={charImg} alt={character.name} style={{
              width:isMobile?54:80,height:isMobile?72:107,objectFit:"contain",flexShrink:0,
              filter:`drop-shadow(0 6px 18px ${character.color}99)`,
              animation:"idleFloat 3s ease-in-out infinite",
            }}/>
            <div style={{ display:"flex",flexDirection:"column",
              alignItems:isMobile?"flex-start":"center" }}>
              <div style={{ color:character.color,fontWeight:900,fontSize:11,
                background:"rgba(0,0,0,0.5)",borderRadius:8,padding:"3px 10px",
                marginTop:isMobile?0:5,textAlign:isMobile?"left":"center" }}>{character.name}</div>
              <div style={{ color:"#94a3b8",fontSize:10,textAlign:isMobile?"left":"center",
                marginTop:6,fontStyle:"italic",padding:"0 4px",lineHeight:1.4,
                maxWidth:isMobile?180:undefined }}>
                "{character.bubble.idle}"
              </div>
            </div>
          </div>

          {/* Right: Q+A panel */}
          <div style={{ flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:8,
            animation:"slideInRight 0.4s ease" }}>
            <div style={{ background:"rgba(10,20,10,0.82)",backdropFilter:"blur(16px)",
              border:"1px solid rgba(74,222,128,0.22)",borderRadius:18,padding:"12px 14px" }}>
              <div style={{ display:"flex",gap:10,alignItems:"flex-start" }}>
                <img src={asset("Aristotle.png")} alt="Aristotle" style={{
                  width:44,height:59,objectFit:"contain",flexShrink:0,
                  animation:"idleFloat 3s ease-in-out infinite",
                  filter:"drop-shadow(0 4px 12px rgba(139,92,246,0.5))",
                }}/>
                <div>
                  <div style={{ color:"#a78bfa",fontWeight:900,fontSize:10,
                    marginBottom:5,letterSpacing:0.5 }}>📜 Aristotle ASKS:</div>
                  <div style={{ color:"#f0fdf4",fontWeight:800,fontSize:14,lineHeight:1.55 }}>
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
                  <div key={i} onClick={()=>handleAnswer(i)}
                    style={{ borderRadius:12,overflow:"hidden",cursor:"pointer",
                      border:"1.5px solid rgba(74,222,128,0.18)",transition:"all 0.15s",
                      background:"rgba(10,25,10,0.4)",display:"flex",flexDirection:"column",
                      width:"clamp(100px, 15vw, 190px)" }}
                    onMouseEnter={e=>{ e.currentTarget.style.transform="scale(1.03)"; e.currentTarget.style.borderColor="#22c55e88"; }}
                    onMouseLeave={e=>{ e.currentTarget.style.transform="scale(1)"; e.currentTarget.style.borderColor="rgba(74,222,128,0.18)"; }}
                  >
                    <img src={img} alt={q.options[i]} style={{
                      width:"100%",aspectRatio:"4 / 3",objectFit:"cover",display:"block" }}/>
                    <div style={{ fontSize:"clamp(9px, 1.1vw, 12px)",fontWeight:700,color:"#e2e8f0",
                      textAlign:"center",padding:"3px 4px",lineHeight:1.2 }}>
                      {q.options[i]}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ display:"flex",flexDirection:"column",gap:7,flex:1,justifyContent:"center" }}>
                {q.options.map((opt,i)=>(
                  <div key={i} onClick={()=>handleAnswer(i)}
                    style={{ background:"rgba(10,25,10,0.78)",backdropFilter:"blur(12px)",
                      border:"1.5px solid rgba(74,222,128,0.18)",
                      borderRadius:13,padding:"11px 14px",cursor:"pointer",
                      fontSize:13,fontWeight:700,color:"#e2e8f0",transition:"all 0.15s",
                      display:"flex",alignItems:"center",gap:10 }}
                    onMouseEnter={e=>{ e.currentTarget.style.background="rgba(34,197,94,0.15)"; e.currentTarget.style.borderColor="#22c55e55"; e.currentTarget.style.transform="translateX(4px)"; }}
                    onMouseLeave={e=>{ e.currentTarget.style.background="rgba(10,25,10,0.78)"; e.currentTarget.style.borderColor="rgba(74,222,128,0.18)"; e.currentTarget.style.transform="translateX(0)"; }}
                  >
                    <span style={{ width:24,height:24,borderRadius:"50%",flexShrink:0,
                      background:"rgba(74,222,128,0.12)",border:"1.5px solid rgba(74,222,128,0.3)",
                      display:"flex",alignItems:"center",justifyContent:"center",
                      fontSize:11,fontWeight:900,color:"#4ade80" }}>
                      {["A","B","C","D"][i]}
                    </span>
                    {opt}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══ FEEDBACK PHASE ═══ */}
      {phase==="feedback"&&(
        <div style={{ position:"absolute",inset:0,display:"flex",
          flexDirection:isMobile?"column":"row",alignItems:"stretch",
          zIndex:10,padding:isMobile?"46px 10px 10px":"50px 12px 16px",gap:isMobile?8:0 }}>
          {/* Left: Character reacting */}
          <div style={{ width:isMobile?"100%":"28%",display:"flex",
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
              width:isMobile?56:82,height:isMobile?75:110,objectFit:"contain",flexShrink:0,
              filter:`drop-shadow(0 6px 18px ${character.color}bb)`,
              animation:correct?"cBounce 0.65s ease":"cShake 0.5s ease",
            }}/>
            <div style={{ display:"flex",flexDirection:"column",
              alignItems:isMobile?"flex-start":"center" }}>
              <div style={{ color:character.color,fontWeight:900,fontSize:11,
                background:"rgba(0,0,0,0.5)",borderRadius:8,padding:"3px 10px",
                marginTop:isMobile?0:5,textAlign:isMobile?"left":"center" }}>{character.name}</div>
              <div style={{ color:correct?"#86efac":"#fca5a5",fontSize:10,textAlign:isMobile?"left":"center",
                marginTop:6,fontStyle:"italic",padding:"0 4px",lineHeight:1.4,
                maxWidth:isMobile?180:undefined }}>
                "{correct?character.bubble.happy:character.bubble.sad}"
              </div>
            </div>
          </div>

          {/* Right: Aristotle reaction + revealed answers */}
<div style={{ flex:1,minWidth:0,display:"flex",flexDirection:"column",gap:8 }}>
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
                  width:54,height:72,objectFit:"contain",flexShrink:0,
                  filter:`drop-shadow(0 4px 14px ${correct?"rgba(34,197,94,0.7)":"rgba(239,68,68,0.7)"})`,
                  animation:correct?"AristotleBounce 0.7s ease":"AristotleShake 0.6s ease",
                }}/>
                <div>
                  <div style={{ fontWeight:900,fontSize:11,letterSpacing:0.5,
                    color:correct?"#4ade80":"#f87171",marginBottom:4 }}>
                    {correct?"🌟 Aristotle IS HAPPY!":"😤 Aristotle IS DISAPPOINTED!"}
                  </div>
                  <div style={{ color:correct?"#bbf7d0":"#fecaca",fontSize:13,fontStyle:"italic" }}>
                    {correct
                      ?"Excellent! The garden blooms with your wisdom! 🌸"
                      :"Hmm… not quite. The plants whisper differently… 🍃"}
                  </div>
                  {correct&&(
                    <div style={{ color:"#fbbf24",fontSize:11,fontWeight:800,marginTop:5,
                      display:"flex",alignItems:"center",gap:5 }}>
                      <CoinIcon size={14}/> Coin flying to your pocket!
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
                      display:"flex",flexDirection:"column",width:"clamp(85px, 12vw, 160px)" }}>
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
                      <div style={{ fontSize:"clamp(9px, 1vw, 11px)",fontWeight:700,textAlign:"center",
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
                  let col="#475569";
                  if (i===q.answer)      { bg="rgba(22,101,52,0.7)"; border="1px solid #22c55e88"; col="#bbf7d0"; }
                  else if (i===selected) { bg="rgba(127,29,29,0.7)"; border="1px solid #ef444488"; col="#fecaca"; }
                  return (
                    <div key={i} style={{ background:bg,border,borderRadius:12,
                      padding:"9px 13px",fontSize:12,fontWeight:700,color:col,
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

            <div style={{ background:"rgba(251,191,36,0.14)",border:"1.5px solid rgba(251,191,36,0.45)",
              borderRadius:12,padding:"10px 13px",fontSize:12.5,fontWeight:600,color:"#2c32efff",lineHeight:1.55 }}>
              💡 {q.explanation}
            </div>

            <Btn onClick={handleNext} color={mod.color} style={{ width:"100%" }}>
              {idx===total-1?"Finish Module 🎉":"Next Question →"}
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
function ResultsScreen({ mod, character, score, total, onContinue }) {
  const pass  = score >= total - 1;
  const stars = score===total?3:pass?2:score>0?1:0;

  return (
    <GardenWrap>
      <Panel style={{ textAlign:"center" }}>
        <div style={{ fontSize:68, marginBottom:8, animation:"popIn 0.5s ease" }}>
          {score===total?"🏆":pass?"🎉":"💪"}
        </div>
        <h2 style={{ fontSize:22, fontWeight:900, marginBottom:4, color:"#f0fdf4" }}>
          {pass?"Module Complete!":"Keep Practicing!"}
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
          <div style={{ color:"#64748b", fontSize:13 }}>correct</div>
        </div>

        <div style={{ display:"flex", gap:12, alignItems:"center",
          background:"rgba(255,255,255,0.04)", borderRadius:16,
          padding:14, marginBottom:20, textAlign:"left" }}>
          <img src={pass?asset("happy_Aristotle.png"):asset("Aristotle.png")} alt="Aristotle"
            style={{ width:52, height:69, objectFit:"contain", flexShrink:0,
              animation:pass?"AristotleBounce 0.7s ease":"none" }}/>
          <div>
            <div style={{ color:"#4ade80", fontWeight:900, fontSize:12, marginBottom:3 }}>Aristotle says:</div>
            <div style={{ color:"#cbd5e1", fontSize:13, fontStyle:"italic" }}>
              {pass
                ?"The garden flourishes with your knowledge! Well done! 🌿"
                :"The plants need more tending. Come back and try again! 🌱"}
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
            "{pass?character.bubble.happy:character.bubble.sad}"
            <div style={{ color:character.color, fontSize:12, marginTop:4 }}>— {character.name}</div>
          </div>
        </div>

        <Btn onClick={onContinue} style={{ width:"100%" }} color={pass?"#22c55e":"#f59e0b"}>
          {pass?"Continue Journey 🗺️":"Try Again 🔄"}
        </Btn>
        {!pass&&(
          <p style={{ marginTop:12, color:"#475569", fontSize:12 }}>
            You need at least <strong style={{ color:"#f59e0b" }}>{Math.max(total-1,0)} out of {total}</strong> correct to unlock the next level.
          </p>
        )}
      </Panel>
    </GardenWrap>
  );
}

/* ═══════════════════════════════════════════════════
   CERTIFICATE SCREEN
═══════════════════════════════════════════════════ */
function CertificateScreen({ user, language, onBack }) {
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
    const wmWidth = spacedText("GARDEN QUEST", cx, 96, "700 22px Georgia", GREEN, 4);
    leaf(cx-wmWidth/2-22, 94, 200, 8, GREEN_LIGHT);
    leaf(cx-wmWidth/2-34, 98, 195, 6, GREEN);
    leaf(cx+wmWidth/2+22, 94, 20, 8, GREEN_LIGHT);
    leaf(cx+wmWidth/2+34, 98, 15, 6, GREEN);
    divider(122, 170);

    /* ── Title ── */
    ctx.fillStyle = "rgba(15,23,42,0.12)"; ctx.font = "700 46px Georgia";
    ctx.fillText("Certificate of Achievement", cx+2, 192);
    ctx.fillStyle = INK;
    ctx.fillText("Certificate of Achievement", cx, 190);

    ctx.fillStyle = GRAY; ctx.font = "italic 20px Georgia";
    ctx.fillText("This certifies that", cx, 236);

    /* ── Name ── */
    ctx.fillStyle = GREEN; ctx.font = "italic 700 50px Georgia";
    ctx.fillText(user.fullName, cx, 306);
    const nameWidth = ctx.measureText(user.fullName).width;
    divider(328, Math.min(Math.max(nameWidth+70,260),520));

    /* ── Body ── */
    ctx.fillStyle = GRAY; ctx.font = "21px Georgia";
    ctx.fillText(`has successfully completed all ${MODULES.length} modules of Garden Quest`, cx, 374);
    ctx.font = "italic 21px Georgia";
    ctx.fillText(`in ${language.label}`, cx, 402);

    /* ── Module badges ── */
    spacedText("MODULES COMPLETED", cx, 440, "700 12px Georgia", GOLD_DARK, 2);
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
    arcText("GARDEN QUEST", sealR-13, "700 10px Georgia", "#5c3d0a", 16);
    ctx.restore();
    star(cx, sealY+3, 15, 6.5, "#5c3d0a");

    /* ── Footer ── */
    const dateStr = new Date().toLocaleDateString(undefined, {
      year:"numeric", month:"long", day:"numeric"
    });
    signatureBlock(90, "Garden Quest", "italic 26px Georgia", "PROGRAMME DIRECTOR", "left");
    signatureBlock(W-90, dateStr, "italic 20px Georgia", "DATE OF COMPLETION", "right");
    ctx.textAlign = "center";
  }, [user, language]);

  function download() {
    const canvas = canvasRef.current;
    const link = document.createElement("a");
    link.download = `${user.fullName.replace(/\s+/g,"_")}_GardenQuest_Certificate.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  return (
    <GardenWrap>
      <Panel style={{ maxWidth: 620 }}>
        <div style={{ textAlign:"center", marginBottom:16 }}>
          <h1 style={{ fontSize:22, fontWeight:900, color:"#f0fdf4" }}>
            Certificate of Achievement
          </h1>
          <p style={{ color:"#86efac", fontSize:13 }}>
            {user.fullName} has completed the Garden Quest programme.
          </p>
        </div>

        <div style={{ borderRadius:14, overflow:"hidden", border:"1px solid rgba(74,222,128,0.25)", marginBottom:18 }}>
          <canvas ref={canvasRef} style={{ width:"100%", display:"block" }} />
        </div>

        <div style={{ display:"flex", gap:10 }}>
          <Btn onClick={download} style={{ flex:1 }} color="#fbbf24">
            Download Certificate
          </Btn>
          <Btn onClick={onBack} style={{ flex:1 }} color="#22c55e">
            Back to Map
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
  const [character,        setCharacter]        = useState(null);
  const [completedModules, setCompletedModules] = useState(0);
  const [prevCompleted,    setPrevCompleted]    = useState(0);
  const [activeModule,     setActiveModule]     = useState(null);
  const [lastScore,        setLastScore]        = useState(null);

  const [loadingDone, setLoadingDone] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [destination, setDestination] = useState(null);
  const initialAuthCheckedRef = useRef(false);

  const moduleQuestions = useMemo(()=>
    activeModule ? QUESTIONS.filter(q=>q.module===activeModule.id) : [],
  [activeModule]);

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

  useEffect(() => {
    if (loadingDone && authChecked && destination) setScreen(destination);
  }, [loadingDone, authChecked, destination]);

  function handleFinish(score) { setLastScore(score); setScreen("results"); }

  function handleContinue() {
    const isNextModule = activeModule.id === completedModules+1;
    const pass = lastScore >= moduleQuestions.length-1;
    const newCompleted = (isNextModule && pass)
      ? Math.min(completedModules+1, MODULES.length)
      : completedModules;

    setPrevCompleted(completedModules);
    setCompletedModules(newCompleted);

    if (user) {
      saveProgress(user.uid, {
        languageId: language.id,
        characterId: character.id,
        completedModules: newCompleted,
      });
    }
    setScreen("map");
  }

  function handlePlayAgain() {
    setPrevCompleted(0);
    setCompletedModules(0);
    if (user) {
      saveProgress(user.uid, {
        languageId: language.id,
        characterId: character.id,
        completedModules: 0,
      });
    }
    setScreen("map");
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
    setScreen("auth");
  }

  return (
    <>
      <GlobalStyles/>
      {screen==="loading"&&(
        <LoadingScreen onDone={()=>setLoadingDone(true)}/>
      )}
      {screen==="auth"&&(
        <AuthScreen onAuth={handleAuth}/>
      )}
      {screen==="language"&&(
        <LanguageScreen onSelect={l=>{ setLanguage(l); setScreen("character"); }}/>
      )}
      {screen==="character"&&(
        <CharacterScreen language={language}
          onSelect={c=>{ setCharacter(c); setScreen("map"); }}
          onBack={()=>setScreen("language")}/>
      )}
      {screen==="map"&&(
        <MapScreen language={language} character={character}
          completedModules={completedModules} prevCompleted={prevCompleted}
          onStartModule={mod=>{ setActiveModule(mod); setScreen("intro"); }}
          onBack={()=>setScreen("character")}
          onViewCertificate={()=>setScreen("certificate")}
          onPlayAgain={handlePlayAgain}
          onLogout={handleLogout}/>
      )}
      {screen==="intro"&&activeModule&&(
        <AristotleIntro module={activeModule}
          onStart={()=>setScreen("game")}/>
      )}
      {screen==="game"&&activeModule&&(
        <GameScreen mod={activeModule} character={character}
          questions={moduleQuestions} onFinish={handleFinish}/>
      )}
      {screen==="results"&&activeModule&&(
        <ResultsScreen mod={activeModule} character={character}
          score={lastScore} total={moduleQuestions.length}
          onContinue={handleContinue}/>
      )}
      {screen==="certificate"&&user&&(
        <CertificateScreen user={user} language={language}
          onBack={()=>setScreen("map")}/>
      )}
    </>
  );
}
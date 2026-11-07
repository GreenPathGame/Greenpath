# GreenPath – Online Game

A free, browser-based learning game about sustainable food, gardening and food traditions from the Carpathian and Mediterranean regions. Players pick a language and a character, walk a garden map with Aristotle as their guide, answer questions in 10 modules, and download a personal certificate at the end.

**Live:** https://greenpathgame.github.io/Greenpath/ (deployed automatically to GitHub Pages from `main` by GitHub Actions, `.github/workflows/deploy.yml`).

## Features

- **5 languages:** English, Ελληνικά (Greek), Italiano, Română, Čeština. All UI text, module introductions, "Did you know?" facts, questions, answers, explanations and the certificate are translated. The language can be changed at any time from the map.
- **4 characters:** Manos (GR), Roxana (RO), Rino (IT), Jana (CZ), each with idle, happy and sad reactions.
- **Living garden world:** mountains, forests, a waterfall, river, pond and flower meadows with butterflies, birds and a duck, drawn in `NatureScene.jsx` behind every screen.
- **10 modules, 40 questions:** multiple choice, true/false and picture questions, each with an explanation. You need all answers but one correct to unlock the next module.
- **Accounts:** username + password (Firebase Auth). Progress, language and character sync across devices.
- **Certificate:** generated in the player's language with their full name and the date, downloadable as a PNG.
- Works on phones, tablets and desktop. Answer buttons and map nodes work with the keyboard, and animations are reduced when the device asks for reduced motion.

## Modules and sources

| # | Module | Source (info paper / checklist topic) |
|---|--------|----------------------------------------|
| 1 | Wildlife Gardens | CZ Practice 1 (forest-inspired edible wildlife gardens) + CZ Practice 2 (traditional seeds) |
| 2 | Traditional Agricultural Practices, Organic Gardening, Farming, and Agroecology | IT (TalentWay) Info Paper 1 (sustainable mini-greenhouses) + Info Paper 2 (biological control of the woolly aphid) |
| 3 | Organic Pest Control and Companion Planting | RO (Phoenix) Info Paper 1 (homemade natural pest control) + Info Paper 2 (companion planting) |
| 4 | Reusable Alternatives for a Plastic-Free Kitchen | GR clay pot crafting + GR stitching reusable bags |
| 5 | Reducing Food Waste | GR traditional pickling, sun-drying and oil-based methods |
| 6 | Kitchen Cleaners from Citrus Peels and Vinegar | GR kitchen cleaners from citrus peels and vinegar |
| 7 | Sustainable Packaging & Water Reuse | IT (TalentWay) Info Paper 3 (sustainable packaging, eco-labels) + LTTA Romania water case study (greywater) |
| 8 | Seasonal and Mindful Cooking: Preserving Cultural Heritage | RO info papers 3 + 4 (silvoița, zacusca) |
| 9 | From Herbs to Traditional Products | LTTA Italy info paper |
| 10 | Eating with the Seasons: Understanding Compost pH | Info Paper 4 (TalentWay, Italy) – Practice 1, compost pH |

## Project structure

```
file.jsx              The whole game: data (MODULES, QUESTIONS), screens and App
NatureScene.jsx       Animated landscape background (pure SVG, no image files)
i18n.js               UI strings for all 5 languages + translate()
translations/*.js     Module and question translations (gr, it, ro, cz), keyed by id
firebase.js           Firebase app / auth / Firestore setup
public/               Character art, question images, favicon
.github/workflows/    GitHub Pages deployment
```

English content in `file.jsx` is the source of truth. If a translation is missing, the English text is shown instead.

### Adding or editing a question

1. Add or edit the question in `QUESTIONS` in `file.jsx` (`id`, `module`, `text`, `options`, `answer` index, `explanation`, optional `images` in the same order as `options`).
2. Add the same `id` to each file in `translations/`, with `options` **in the same order** as in English. The game shuffles options at play time and keeps the correct answer.

## Development

```bash
npm install
npm run dev       # local dev server
npm run lint      # ESLint (React hooks rules)
npm run build     # production build into dist/
```

Pushing to `main` builds and deploys to GitHub Pages.

## Security

What protects the game, and what must be switched on by hand.

**Already in the code**

| Protection | What it stops | Where |
| --- | --- | --- |
| Firestore security rules | Reading or changing other players' data, writing anywhere else, junk/oversized data, faking a username, skipping straight to the certificate | `firestore.rules` (tests: `tests/firestore.rules.test.mjs`) |
| Content Security Policy | Running injected scripts; sending data to any site other than Firebase/Google | `vite.config.js` (added to production builds) |
| Input limits | Overlong names/usernames/passwords, invisible or direction-reversing characters in names | `AuthScreen` / `cleanFullName` in `file.jsx` |
| No HTML injection | Text from players is always shown as text (React escapes it; the code uses no `innerHTML`/`eval`) | whole app |
| Clean sign-up | A failed sign-up no longer leaves a half-made account that blocks the username | `registerUser` in `file.jsx` |
| Optional bot protection | Scripts creating accounts or hammering the database | Firebase App Check in `firebase.js` (off until a key is set) |
| Rules tests on GitHub | A future change to the rules silently opening the database | `.github/workflows/rules-tests.yml` |

**To do in the Firebase console (project `greenpath-96558`)**

1. **Publish the rules** – Firestore Database → Rules → replace everything with the contents of `firestore.rules` → Publish. (Or `npx firebase-tools deploy --only firestore:rules`.)
2. **Authentication → Settings → User actions:** keep "Enable create (sign-up)" on; turn **on** "Email enumeration protection".
3. **Authentication → Settings → Authorized domains:** add `greenpathgame.github.io`.
4. **Usage and billing:** stay on the free Spark plan (it cannot run up a bill). If you ever move to Blaze, set a budget alert.

**To do in Google Cloud console (APIs & Services → Credentials → the "Browser key")**

5. Application restrictions → **Websites** → add `https://greenpathgame.github.io/*`, `http://localhost:*/*`. API restrictions → restrict to *Identity Toolkit API*, *Token Service API*, *Cloud Firestore API* (and *Firebase App Check API* if you use step 7). This stops other sites from using the game's key.

**To do on GitHub (repository Settings)**

6. Branches → add a protection rule for `main`: require a pull request (anyone pushing to `main` changes the live site).

**Optional: bot protection (App Check)**

7. In the [reCAPTCHA admin console](https://www.google.com/recaptcha/admin) create a **reCAPTCHA v3** key for `greenpathgame.github.io` and `localhost`. In Firebase → App Check, register the web app with that key. Add the *site key* to the deploy workflow as `VITE_RECAPTCHA_SITE_KEY` (Settings → Secrets and variables → Actions → Variables, and `env: VITE_RECAPTCHA_SITE_KEY: ${{ vars.VITE_RECAPTCHA_SITE_KEY }}` on the Build step). Deploy, check the game still works, and only then press **Enforce** for Authentication and Firestore in App Check.

**Known limits (by design of a browser game)**

- The certificate is drawn in the player's browser, so a determined person can edit their own copy of the page. The rules make faking progress in the database slow (one module per save), but a certificate is not proof of learning.
- GitHub Pages cannot send HTTP security headers, so protection against being embedded in another site (clickjacking) is not possible there. The game has no actions worth clickjacking.

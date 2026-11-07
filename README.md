# GreenPath – Online Game

A free, browser-based learning game about sustainable food, gardening and food traditions from the Carpathian and Mediterranean regions. Players pick a language and a character, walk a garden map with Aristotle as their guide, answer questions in 9 modules, and download a personal certificate at the end.

**Live:** https://greenpathgame.github.io/Greenpath/ (deployed automatically to GitHub Pages from `main` by GitHub Actions, `.github/workflows/deploy.yml`).

## Features

- **5 languages:** English, Ελληνικά (Greek), Italiano, Română, Čeština. All UI text, module introductions, "Did you know?" facts, questions, answers, explanations and the certificate are translated. The language can be changed at any time from the map.
- **4 characters:** Manos (GR), Roxana (RO), Rino (IT), Jana (CZ), each with idle, happy and sad reactions.
- **Living garden world:** mountains, forests, a waterfall, river, pond and flower meadows with butterflies, birds and a duck, drawn in `NatureScene.jsx` behind every screen.
- **9 modules, 38 questions:** multiple choice, true/false and picture questions, each with an explanation. You need all answers but one correct to unlock the next module.
- **Accounts:** username + password (Firebase Auth). Progress, language and character sync across devices.
- **Certificate:** generated in the player's language with their full name and the date, downloadable as a PNG.
- Works on phones, tablets and desktop. Answer buttons and map nodes work with the keyboard, and animations are reduced when the device asks for reduced motion.

## Modules and sources

| # | Module | Source (info paper / checklist topic) |
|---|--------|----------------------------------------|
| 1 | Wildlife Gardens | CZ Practice 1 (forest-inspired edible wildlife gardens) + CZ Practice 2 (traditional seeds) |
| 2 | Traditional Agricultural Practices, Organic Gardening, Farming, and Agroecology | IT Practice 1 (handmade sustainable greenhouses) + IT Practice 2 (biological control of the woolly aphid) |
| 3 | Organic Pest Control and Companion Planting | RO Practice 1 (homemade natural pest control) + RO Practice 2 (companion planting) |
| 4 | Reusable Alternatives for a Plastic-Free Kitchen | GR clay pot crafting + GR stitching reusable bags |
| 5 | Reducing Food Waste | GR traditional pickling, sun-drying and oil-based methods |
| 6 | Kitchen Cleaners from Citrus Peels and Vinegar | GR kitchen cleaners from citrus peels and vinegar |
| 7 | Sustainable Packaging & Water Reuse | CZ / LTTA Romania water case study (greywater) + packaging |
| 8 | Seasonal and Mindful Cooking: Preserving Cultural Heritage | RO info papers 3 + 4 (silvoița, zacusca) |
| 9 | From Herbs to Traditional Products | LTTA Italy info paper |

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

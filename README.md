# Dhruv's Exam Center

A game-style exam-prep tracker for Dhruv (Grade 6, Calcutta International School, Cambridge curriculum). Built to be used for years, not just for Term 1.

**Setup:** see [SETUP.md](SETUP.md).

## What it does
**Dhruv (student)**
- **HQ:** level, stage (Rookie → Explorer → Challenger → Elite → Master → Grandmaster → Legend → Mythic), XP bar, daily streak, 3 daily quests, a countdown to the next exam ("boss battle"), and every subject as a "world".
- **Worlds (one per subject):** a predicted score with a confidence band, Boss HP (drops as he prepares), and a 3-step ladder: Foundational → Challenging (unlocks after any Foundational) → God-mode (unlocks at 60%+ on Challenging).
- **Papers:** Claude writes them from the syllabus plus uploaded handouts, puts more marks on his weak topics, and avoids repeating recent questions. They can be played online or printed and done on paper.
- **Marking:** MCQs are marked instantly. Written answers and photos of handwritten pages are marked by Claude against a mark scheme. Every lost mark gets *his answer, what was wrong, the right answer and why*.
- **Mistake notebook:** every lost mark stays here until he redoes the question correctly (+15 XP per fix).
- **Power-up lessons:** 5-minute lessons per topic, aimed at his actual past mistakes. Each has keywords, a worked example, traps, a memory trick, a quick check, and YouTube search links.
- **Mark any written paper:** upload photos of a school worksheet or test. Claude transcribes it, writes a mark scheme, marks it, and saves it to history.
- **Trophies:** 12 achievements.

**Parent**
- Predicted score per subject with a band and confidence level, plus coverage, papers done, last practice, weakest topic and status (On track / Watch / At risk).
- Activity heatmap, rule-based next actions, an on-demand **AI briefing**, recent results with full marking, the AI cost against your budget, every paper and mark scheme (printable), handouts, and settings (unlock levels, daily caps, exam dates, subjects).

## How the numbers work (`supabase/functions/_shared/scoring.js`)
- **Topic mastery:** a weighted average of topic scores. Recent papers count more (×0.8 per step back). Scores are adjusted for difficulty: Foundational ×0.9, God-mode ×1.12.
- **Predicted score:** topic mastery weighted by each topic's share of the real exam. Untested topics count as 50%. Thin evidence is pulled toward 50%. The band is ±8 to ±30 points depending on how much evidence exists.
- **Preparedness / Boss HP:** 60% predicted score + 15% topic coverage + 15% ladder progress + 10% recent practice.
- **XP:** paper base (100 / 200 / 350) scaled by score, plus bonuses for 90%+, surviving God-mode, improving a weak skill by 15+ points, the weakest-world quest, and the daily streak. Foundational pays half once readiness is 85%+ so he can't farm easy papers. XP is awarded **only by the server**, so it can't be faked from the browser.

## Architecture
- `web/`: React (Vite) single-page app, hosted on GitHub Pages.
- `supabase/migrations/`: Postgres schema with row-level security. Answer keys are in a separate parent-only table.
- `supabase/functions/`: Deno edge functions that call the Claude API: `generate-exam`, `grade-attempt`, `ingest-handout`, `tutor` (lessons + parent briefing).
- `seed/`: syllabus, exam dates and ICT Paper 1. Edit these, then re-run deploy to update.

## Adding a new term or year
Edit `seed/syllabus.json` (topics, weights, paper dates), set `term`, and run `bash scripts/deploy.sh supabase`. Past attempts and papers stay and keep feeding his history.

# Going live: about 20 minutes

The app runs in **demo mode** until these steps are done. Demo mode uses sample data and has no AI.

You need three accounts, which you already have: **Supabase**, **Anthropic Console** and **GitHub**.

## 1. Create the Supabase project (5 min)
1. Go to supabase.com → **New project**. Name it `dhruv-exam-center`. Region: **Mumbai (ap-south-1)**. Use a strong DB password (you won't need it again). Plan: Free.
2. Wait about 2 minutes for it to finish setting up.
3. Go to **Project Settings → General** and copy the **Project ID** (20 letters).
4. Click your avatar (top right) → **Account → Access Tokens → Generate new token**. Copy it.

## 2. Anthropic API key (2 min)
1. Go to console.anthropic.com → **API Keys → Create key** and copy it.
2. Go to **Billing → Spend limits** and set a monthly limit (for example $30). This is the real safety net. The app's own daily caps are a second layer.

## 3. GitHub token (3 min)
1. Go to GitHub → **Settings → Developer settings → Personal access tokens → Fine-grained → Generate**.
2. Repository access: **All repositories**. Permissions: **Administration, Contents, Pages, Workflows** set to *Read and write*.
3. Copy the token.

## 4. Fill in `.env`
In the `Exam Center App` folder, copy `.env.example` to `.env` and fill in every blank, including passwords for Dhruv and you.

## 5. Deploy
- **Easiest:** tell Claude in this project "run the deploy". Claude runs `scripts/deploy.sh` on your computer and reads the keys from `.env` without printing them.
- **Yourself (Mac Terminal, needs Node: `brew install node`):**
  `cd "~/Documents/Claude/Projects/Dhruv Exam Center/Exam Center App" && npm install && bash scripts/deploy.sh`

The script does five things:
1. Creates the database and loads the syllabus, exam dates and ICT Paper 1.
2. Switches off public sign-ups, so only your two logins exist.
3. Stores the Anthropic key on the server and deploys the four AI functions.
4. Creates the **Parent** login (`dpatodia@gmail.com`) and the **Dhruv** login (`dpatodia+dhruv@gmail.com`). Dhruv only clicks "Dhruv" and types his password.
5. Pushes the site to GitHub and turns on GitHub Pages. The site is at `https://<your-github-username>.github.io/dhruv-exam-center/`.

## After deploying
- Open the site, log in as Parent, go to **Handouts**, and upload the ICT handouts (and others as you get them). Every paper is written from these.
- Bookmark the site on Dhruv's laptop and your phone.
- You can delete `.env` afterwards. Re-running the deploy needs it again.

## Things to know
- **The repo is public** because free GitHub Pages needs it. It contains code, the syllabus and the public "anon" key, but **no results, answers or keys**. Those live in Supabase behind row-level security. Answer keys are stored where Dhruv's login cannot read them.
- **Costs:** Supabase and GitHub are free at this size. Claude usage shows in Parent → Overview (estimated) and exactly in the Anthropic Console.
- **Updating later:** change files, then run `bash scripts/deploy.sh github` for the site or `bash scripts/deploy.sh supabase` for the backend.
- **Forgot a password:** Supabase → Authentication → Users → the user → "Send password recovery". This goes to your Gmail for both logins.

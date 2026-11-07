// ─────────────────────────────────────────────────────────────────────────────
// Fill these two in after creating the Supabase project (see SETUP.md, step 2).
// The anon key is designed to be public — Row Level Security protects the data.
// Leave them empty to run the app in DEMO mode (sample data, no AI).
// ─────────────────────────────────────────────────────────────────────────────
export const SUPABASE_URL = "https://rbydsbzhwrnooppqitga.supabase.co";
export const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJieWRzYnpod3Jub29wcHFpdGdhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM1MjI1MzEsImV4cCI6MjEwOTA5ODUzMX0.jgVRdjfnSujjuNzlxPlKpK7u8HR_LiBcujUnLWov2zE";

// The two logins. Dhruv's uses a Gmail "+" alias so he needs no inbox of his own.
export const LOGINS = {
  dhruv: 'dpatodia+dhruv@gmail.com',
  parent: 'dpatodia@gmail.com',
};

export const STUDENT_NAME = 'Dhruv';
export const DEMO = !SUPABASE_URL || !SUPABASE_ANON_KEY;

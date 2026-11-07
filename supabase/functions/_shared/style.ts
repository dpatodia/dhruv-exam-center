// Cambridge question style, distilled (4 Nov 2026) from official public Cambridge specimen papers and
// mark schemes (IGCSE 0580, 0625, 0620, 0610, 0500, 0470, 0460, 0530, 0549, 0417) and Cambridge's
// official command-word list. Stage 7 tests themselves are not public, so we copy the STYLE and
// scale the content, reading load and tariffs down for an 11-year-old.
// The school's own format notes (subjects.exam_notes) always win where they conflict.

export const GENERAL_STYLE = `CAMBRIDGE HOUSE STYLE (apply to every written paper):
- Structure: numbered questions with lettered parts. number "3(a)", "3(b)(i)" etc. Each numbered question has ONE shared context; its parts all refer back to it.
- Put that shared context (situation, data table, source, passage, described figure) in "stem" on the FIRST part of the numbered question only. Never repeat it in later parts and never write "(a)" inside prompt text.
- Write every table as pipe rows, one row per line, header row first (e.g. "Time / s | 0 | 1 | 2"), with a blank line before and after and no "|---|" separator line; it is printed as a real table.
- Data and figures are introduced as "Table 2.1 shows ..." or "Fig. 3.1 shows ..." and written out as a plain-text table or a precise description of the diagram (say "NOT TO SCALE" for geometry).
- Every part starts with a Cambridge command word, and the marks match what the word demands:
  State / Name / Identify / Give / Write down (1 mark per point) · Define (1-2) · Describe (1 mark per point; "any n from") ·
  Explain (point + reason linked to it; 2-3 marks) · Suggest (apply knowledge to an unfamiliar situation; several valid answers) ·
  Predict · Calculate / Work out / Determine (method + answer) · Compare (similarity AND/OR difference) · Complete.
  Never use bare "What is ...?" or "Why ...?" stems in place of a command word.
- Vary response formats: tick one/two boxes, circle the answer, draw lines to match, complete a table, complete sentences from a word list (each word once, more than once or not at all).
- Questions inside a section rise in difficulty. Keep context to 1-2 short sentences per part; say "a student", not "Dhruv".
- MCQ: 4 options A-D (stored as options, answer letter a-d), one best answer, options similar in length; numbers in ascending order; every wrong option comes from a real misconception or a likely slip; no joke or absurd options. Use True/False only if the subject rules allow it.
- Mark schemes use Cambridge conventions: separate marking points with ";", alternatives with "/", and add "A ..." (accept), "R ..." (reject), "I ..." (ignore) lines where useful; "any n from:" lists with up to n+2 valid points; "AND" when both are needed for one mark; "ecf" when a wrong earlier answer is carried forward; "owtte" (or words to that effect). Credit meaning, not exact wording.
- Parts worth 5 marks or more that need extended writing are marked by LEVELS, not by ticking points. Write 3 levels in markScheme, e.g. "L1 (1-2): ...", "L2 (3-4): ...", "L3 (5-6): ...", plus indicative content.
- Instructions mention "Show your working" and "Write your answers in the spaces provided" once, not in every question.`;

const SCIENCE = `SCIENCE STYLE (Cambridge Lower Secondary / IGCSE core, scaled to Stage 7):
- Section A: 10 MCQs (1 mark each). At least 3 use a table, diagram or data; at least 2 use the "which row is correct?" format (a 2-column table with 4 rows A-D combining two either/or choices).
- Section B: 5-7 numbered questions of 5-10 marks each. Each opens with ONE context (a practical, an everyday situation or a data set) in "stem"; parts may mix topics within that context. No topic banners in prompts. Show "[Total: n]" only through the marks of the parts.
- At least 40% of Section B marks use given information: read a value, describe a trend, "Use the information in Table 2.1 to suggest ...".
- Include one "A student investigates ..." practical question: variable to change / measure / keep the same, fair test, a reading from apparatus, one improvement.
- Calculations: mark scheme "C1 formula; C1 substitution; A1 answer". The unit is printed on the answer line in the prompt (e.g. "speed = ............ m/s"); only test units where the question says "Give the unit" (its own mark). Never take marks for missing units otherwise. Correct answer with no working gets full marks.
- "Explain" must need a reason in the answer (e.g. "produces carbon dioxide; bubbles make the dough rise"), not just a fact.
- Use at least 3 non-writing formats in Section B (tick, circle, match, complete table, word list).`;

const MATHS = `MATHS STYLE (Cambridge Lower Secondary / IGCSE core Paper 1 style, Stage 7 content):
- No sections. 15-20 numbered questions, easiest first, each with 1-4 parts; most parts 1-2 marks; include 2-3 multi-step problems worth 3-4 marks. No True/False and no MCQ.
- Command words: Work out, Find, Write down, Complete, Show that, Explain, Give a reason for your answer.
- At least 4 questions built on a table, number line, grid, coordinates, or a diagram described in words ("The diagram shows ... NOT TO SCALE").
- At least one angle question asking for the size AND a geometrical reason (B1 each).
- End each prompt with its answer line showing the unit or variable: "............ cm", "x = ............", "............ : ............".
- Mark schemes: M1 (method), A1 (accurate answer, depends on M), B1 (independent mark); partial credit written as "B2 for ... or B1 for ... or M1 for ..."; FT (follow through) their earlier answer; oe, cao, isw. Any correct method earns the marks.
- Everyday contexts (rupees, Kolkata, school, sport) with numbers that work without a calculator. Include 1-2 reasoning puzzles (e.g. smallest number meeting two conditions).`;

const STYLES: Record<string, string> = {
  physics: SCIENCE, chemistry: SCIENCE, biology: SCIENCE,
  maths: MATHS,
  'english-lang': `ENGLISH LANGUAGE STYLE (Cambridge 0500 style, scaled to Stage 7):
- Reading: put ONE unseen passage (350-450 words, original, age-appropriate) in "stem" of question 1(a), headed "Text A: <title>", with its paragraphs numbered [1], [2] ... Questions point to the text: "(paragraph 2)" or "Reread paragraph 3 ('first words ... last words')".
- Tariffs rise with the task: retrieve a fact [1]; "Give two ..." [2]; "Using your own words, explain what the writer means by '...'" [2, one mark per part of the meaning]; "Identify a word or phrase which suggests ..." [1]; meaning of a word in context [1 each, 2-3 of these]; "Why does the writer use the word X rather than Y?" [2]; "Explain why ..." [3].
- One language-effect question [4-5]: reprint a 2-3 sentence extract in the prompt; the student picks phrases and explains their effect; marked by 3 levels.
- Optional summary [6-8]: "in your own words, no more than 80 words": content points plus a small writing mark.
- No personal-experience questions and no punctuation/grammar drills in the reading section. Answers lifted word-for-word get no credit where "own words" are asked for.
- Writing: two prompts, choose one, as ONE question part carrying all the writing marks (never split content and style into separate parts). Mark with level bands: Content and Structure /6 and Style and Accuracy /10 (bands describe the quality of the whole piece, not counts of features).`,
  'english-lit': `ENGLISH LITERATURE STYLE (Stage 7). This is a LITERATURE paper on the texts studied in class, not an unseen-text comprehension paper (that is English Language):
- At least 70% of the marks must be on the specific texts named in the syllabus topics and handouts (e.g. the named story, poems and songs): characters, events, settings, themes, the writer's message and techniques, and Dhruv's personal response to THOSE texts. Refer to them by title, character and moment; he quotes short phrases from memory. Never reprint copyrighted text or song lyrics.
- Only state facts about a studied text (plot events, names, endings) that appear in the handout notes. If there are no handout notes for a text, ask open questions that any student who studied it can answer (characters, theme, what happens, his opinion) and keep mark schemes as indicative content, not invented specifics.
- At most 30% of marks on an unseen ORIGINAL poem or extract (written for the paper, printed with line numbers) to test poetry-appreciation skills. Never write an imitation of a studied text.
- Question types: character and theme questions ("What do we learn about ...?"), "How does the writer make ... seem ...?", comparison of two studied texts, and a personal-response question about a studied text.
- Two PEEL questions [6-8 each] on studied texts, with 2-3 bullet prompts. Levels: L1 a point is stated; L2 point + relevant quotation or close reference + simple explanation; L3 several developed points, precise references, effect on the reader, linked back to the question.
- No questions about authors' lives, bands or prizes; do not ask what PEEL stands for; no MCQ section; at most 4 marks of device-spotting.`,
  history: `HISTORY STYLE (Cambridge 0470 style, scaled to Stage 7):
- Section A: 2-3 structured questions. Each has a one-line stem, then (a) "Describe ..." [3], (b) "Why ...?" / "Explain why ..." [4-5], (c) "'<statement>' How far do you agree? Explain your answer." [6-8].
- Section B (source question): 3-4 lines of Background Information ending in the key question, then Sources A-C (or D), each 50-80 words or a described picture, in simple language, each with a provenance line in brackets (who made it, when, why). Write sources yourself but make them realistic; never write "written for this paper". Parts: "What can you learn from Source A?" [3]; "How far do Sources A and B agree?" [4]; "Why was Source C made at this time?" [4]; "How useful is Source C?" [4]; final "Do these sources show that ...? Use the sources to explain your answer." [5].
- At most 6 marks of MCQ or one-word recall in the whole paper.
- Every (c) question and the final source question need both sides and a judgement.
- Levels for any part worth 4+: L1 general statements / reason named only / surface details from a source; L2 reasons explained with a correct fact, or one side argued, or source message explained; L3 both sides explained with a supported judgement, or source evaluated using provenance and own knowledge.`,
  geography: `GEOGRAPHY STYLE (Cambridge 0460 style, scaled to Stage 7):
- 2-3 themed questions worth 15-25 marks each, with (a), (b), (c) parts. At most 5 marks of MCQ.
- Every (a) and (b) opens with "Study Fig. n.n, which shows ..." in "stem". Across the paper include at least: a data table (max 5 rows), a bar or line graph described with exact values, a labelled diagram or sketch map, and a photograph description or short news report.
- Tariff ladder: "What is meant by ...?" [1] -> "Using Fig. 1.1, identify ..." [1-2] -> "Using Fig. 1.1 only, describe ... Use figures in your answer." [3, one mark reserved for quoting data with units] -> "Suggest ..." [3-4] -> "Explain why ..." [4].
- End each question with a 6-mark (c): "For a named example you have studied, describe/explain ...", with a line "Named example: ............". Levels: L1 (1-2) simple statements; L2 (3-4) developed statements (cause linked to effect); L3 (5-6) two+ developed statements and a named place with a specific detail. Max 4 if no place is named.
- Diagram questions must ask for explanation (arrows, process), not just labels.`,
  spanish: `SPANISH STYLE (Cambridge 0530 style, scaled to Stage 7):
- Write ALL instructions and questions in Spanish with simple commands (Lee, Mira, Escribe la letra, Contesta en español). The paper's instruction line may add an English gloss in brackets.
- Order: picture/sign matching (describe each picture in words) -> 3-option multiple choice (A-C) on a short text -> short answers in Spanish on a longer text -> matching people to descriptions with 2-3 extra distractors -> grammar in context -> writing. Texts are real-world types (notice, email, blog, profile), 60-150 words.
- Most items 1 mark; 2-mark items say "(Menciona dos detalles.)". MCQ has 3 options (store 3 options). No true/false and no translation items; no English explanations of grammar.
- Grammar (the school tests it): gap-fills inside a short Spanish text (choose the right verb form/article/adjective ending), never isolated drills.
- Writing: (a) form-filling with single words [about 5]; (b) a task with 4 Spanish bullet questions, "Escribe 40-60 palabras", marked separately for content (bullets covered) and language.
- Mark scheme: accept phonetic/one-letter misspellings and wrong gender/person if meaning is clear; list alternatives with optional words in brackets; add "Reject ..." lines for incomplete answers or extra text that changes the meaning.`,
  hindi: `HINDI STYLE (Cambridge 0549 style, scaled to Stage 7):
- All rubrics in simple Hindi; number sections "अभ्यास 1, 2 ...".
- ALWAYS print the passage in "stem". For seen lessons from the school texts, print an extract (100-200 words) using the handout wording; never test facts that are not on the page.
- Include: short answers on an article (1 mark each, one "कोई दो/तीन बातें लिखिए" item worth 2-3); matching 3-4 short speaker texts (A-D) to 6-8 statements; note-making under given headings with one example bullet; 3-option MCQs (store 3 options) on main idea, opinion, purpose and what words like "यह/वह" refer to.
- Vocabulary drills (पर्यायवाची, एक शब्द) at most about 15% of marks, only on syllabus items.
- Writing: an email/diary/letter with 3 bullet prompts, "लगभग 60-80 शब्दों में"; marks about 40% content, 60% language, stated in the question. Content = all bullets covered, suits the reader; language = range, accuracy, linking words (क्योंकि, लेकिन, इसलिए).
- Mark scheme: short phrases with "/" between alternatives; tolerate small spelling slips if meaning is clear. Everything in Devanagari; never mix Latin letters into Hindi words.`,
  ict: `ICT STYLE (Cambridge ICT/Computing style, scaled to Stage 7):
- Start most questions with a one-sentence scenario (a school robot, a Scratch game for younger pupils) in "stem".
- Command words set the tariff: State/Name [1 per point], Describe [point + detail], Explain [point + reason]; prompt "State two ..." [2], "Describe two ..." [4]. Add "Your answers must be different." where answers could repeat.
- Picking items (circle 2 of 8, tick 1 of 4) at most about 15% of marks. Include one table-completion item (e.g. input / process / output, or sensor / what it detects).
- Flowchart and Scratch items: complete a missing step, predict the output, find and correct the error, name the loop or decision.
- No brand names except Scratch. Discuss/Compare items at most 4 marks.
- Mark scheme: "Two from:" lists with 4-8 alternatives and "/" between variants; credit meaning, not exact wording.`,
};

export function styleFor(subjectId: string): string {
  const s = STYLES[subjectId];
  return s ? `${GENERAL_STYLE}\n\n${s}` : GENERAL_STYLE;
}

/** "1 h 15 min" -> 75 */
export function paperMinutes(subject: any): number | null {
  const papers = subject?.papers || [];
  const p = papers.find((x: any) => /theory|written/i.test(x.name)) || papers[0];
  if (!p?.duration) return null;
  const h = /(\d+)\s*h/.exec(p.duration), m = /(\d+)\s*min/.exec(p.duration);
  const mins = (h ? Number(h[1]) * 60 : 0) + (m ? Number(m[1]) : 0);
  return mins || null;
}

# Elementary Math

A Kumon-style math worksheet generator that runs entirely in the browser.
Describe the practice you want in plain English, answer the problems on screen,
get them graded, and export the sheet as a printable PDF.

No build step, no dependencies, no server-side code — plain HTML, CSS and JS.

## Run it

```sh
open index.html            # works straight from the filesystem
# or, to serve it:
python3 -m http.server 8000    # then http://localhost:8000
```

## Describing a worksheet

Type what you want in the box and hit **Generate**. Every click produces a fresh
set of problems from the same description, so click again for the next day's
practice. The panel echoes back what it understood, so you can see whether the
parser read you correctly before you print anything — the **What you'll get**
panel lists each section as `2 pages of 20 problems — Subtraction · 2-digit −
1-digit · within 20 · side by side`.

| You type | You get |
| --- | --- |
| `subtraction within 20` | 1 page, 20 horizontal problems, answers 0–20, never negative |
| `2-digit addition within 100 without carry` | 2-digit + 2-digit, no column ever carries |
| `3 digit vertical subtraction` | stacked column format (`stacked` works too) |
| `multiplication tables to 12` | both factors 1–12 |
| `division within 144` | exact division, no remainders |
| `grade 2` | a preset packet for that grade, via the Kumon level it maps to |
| `level C` | a preset packet for that Kumon level directly |

Phrases the parser understands:

- **Operation** — addition / plus / `+`, subtraction / minus / `-`, multiplication / times / `×`, division / `÷`, and `mixed`
- **Size** — `2-digit`, `one-digit`, `3 digit minus 1 digit` (first width is the top number, second is the bottom)
- **Ceiling** — `within 20`, `up to 100`, `under 1000`, `to 12`
- **Regrouping** — `without carry`, `no borrowing`, `with regrouping`
- **Layout** — `vertical` / `column` / `stacked`, or `horizontal` / `across`
- **Amount** — `5 pages`, `15 questions`

### Grade and Kumon level presets

`grade 3`, `3rd grade`, `level C` and `kumon c` all expand to a spec string,
which is then parsed exactly as if you had typed it — there is no separate
code path for presets, and the panel shows you the expansion.

The levels follow the Kumon math progression:

| Level | Grade | What it drills | What the generator makes |
| --- | --- | --- | --- |
| 3A | — | +1, +2, +3 | one-digit addition within 10 *(approximation)* |
| 2A | K | adding 4 through 10 | addition within 20 *(approximation)* |
| A | 1 | horizontal addition with larger numbers, then subtraction | add within 20, 2-digit + 1-digit within 100, sub within 20 |
| B | 2 | vertical addition and subtraction, carrying and borrowing | 2-digit vertical add with carrying, 3-digit vertical add and sub |
| C | 3 | multiplication tables, 4-digit × 1-digit, division by one digit | tables to 9, 4-digit × 1-digit vertical, 3-digit ÷ 1-digit |
| D | 4 | double-digit multiplication, long division | 2-digit × 2-digit vertical, 3-digit ÷ 2-digit |
| E | 5 | **fractions** | not generatable — falls back to 3-digit × 2-digit and 4-digit ÷ 2-digit |
| F | 6 | **fractions, decimals, order of operations** | not generatable — falls back to 4-digit × 2-digit and 4-digit ÷ 2-digit |

Caveats, stated plainly:

- Kumon is ability-based and students commonly work above their school grade, so
  the grade column is the nominal alignment, not a promise about any child.
- Levels 7A–4A are counting and number writing, so asking for them starts you at 3A.
- Levels E and F onward are fractions and decimals, which this generator cannot
  produce. It says so in the panel and gives you multi-digit arithmetic instead.
- Long division is not laid out in long-division form; division always prints
  horizontally.

### Multi-section packets

Separate clauses with `;`, a newline, or `then` to build a graded packet. The
operation and the ceiling carry forward from earlier clauses, so you only state
them once:

```
subtraction within 20: 1 page of one-digit,
then 5 pages of 2-digit minus 1-digit,
then 5 pages of mixed
```

`mixed` after same-operation sections means a mix of the *difficulties* you
already listed, not a mix of operations.

## Working through a sheet

- Type into the answer box on each problem; `Enter` / `↑` `↓` move between boxes.
- **Check this page** grades that page: green tick, red cross, and a `correct / total` score in the page header. A blank answer counts as wrong.
- **Check all pages** grades everything and shows a running total in the panel.
- **Show answer key** fills in the answers; unticking it puts your own back.
- Editing an answer clears its mark, so you can retry and re-check.

Nothing is saved: **Generate** and a page reload both discard the answers on
screen.

## Exporting a PDF

**Export PDF** opens the browser print dialog — choose *Save as PDF*, Letter,
and no scaling. The print stylesheet drops the whole UI and renders each page as
one clean Letter sheet: problems only, answer boxes as ruled blanks, no page
breaks mid-problem.

Answer blanks are all the same width on a given page, so their size never hints
at how many digits the answer has.

Tick **Include answers in the PDF** to print the filled sheet (combine with
*Show answer key* to print an answer key).

## Layout of the code

| File | What it does |
| --- | --- |
| `index.html` | Panel + sheet markup |
| `styles.css` | Screen styling and the `@media print` worksheet layout |
| `js/rng.js` | Seeded RNG (mulberry32); each run draws a fresh seed |
| `js/parser.js` | Free text → section configs; Kumon level and grade presets; the "what I understood" labels |
| `js/generator.js` | Section configs → problems, honouring digit widths, ceilings and carry/borrow rules |
| `js/render.js` | Problems → pages of DOM; column fitting; grading |
| `js/app.js` | Panel wiring |

The scripts load as plain globals under `window.EM`, deliberately: it keeps
`file://` working without a build step or a server.

### Guarantees the generator enforces

- Subtraction never goes negative.
- Division is always exact unless remainders are asked for.
- `without carry` / `without borrowing` is checked column by column, not approximated.
- Problems do not repeat within a page.
- `n - n = 0` stays rare rather than filling a page.

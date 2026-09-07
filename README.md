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

Type what you want in the box. The panel echoes back what it understood, so you
can see whether the parser read you correctly before you print anything.

| You type | You get |
| --- | --- |
| `subtraction within 20` | 1 page, 20 horizontal problems, answers 0–20, never negative |
| `2-digit addition within 100 without carry` | 2-digit + 2-digit, no column ever carries |
| `3 digit vertical subtraction` | stacked column format, 5 × 4 to a page |
| `multiplication tables to 12` | both factors 1–12 |
| `division within 144` | exact division, no remainders |
| `grade 2` | a preset multi-page packet for that grade (K–5 available) |

Phrases the parser understands:

- **Operation** — addition / plus / `+`, subtraction / minus / `-`, multiplication / times / `×`, division / `÷`, and `mixed`
- **Size** — `2-digit`, `one-digit`, `3 digit minus 1 digit` (first width is the top number, second is the bottom)
- **Ceiling** — `within 20`, `up to 100`, `under 1000`, `to 12`
- **Regrouping** — `without carry`, `no borrowing`, `with regrouping`
- **Layout** — `vertical` / `column` / `stacked`, or `horizontal`
- **Amount** — `5 pages`, `15 questions`

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

## Exporting a PDF

**Export PDF** opens the browser print dialog — choose *Save as PDF*, Letter,
and no scaling. The print stylesheet drops the whole UI and renders each page as
one clean Letter sheet: problems only, answer boxes as ruled blanks, no page
breaks mid-problem.

Answer blanks are all the same width on a given page, so their size never hints
at how many digits the answer has.

Tick **Include answers in the PDF** to print the filled sheet (combine with
*Show answer key* to print an answer key).

## Reproducibility

Every worksheet is generated from a seed, shown in the panel. The same seed and
the same spec always produce the same problems — useful for handing the same
sheet to two children, or reprinting one you lost. **New problems** rolls a new
seed; **Generate** keeps the one in the box.

## Layout of the code

| File | What it does |
| --- | --- |
| `index.html` | Panel + sheet markup |
| `styles.css` | Screen styling and the `@media print` worksheet layout |
| `js/rng.js` | Seeded RNG (mulberry32) so a seed reproduces a worksheet |
| `js/parser.js` | Free text → section configs; grade presets; the "what I understood" labels |
| `js/generator.js` | Section configs → problems, honouring digit widths, ceilings and carry/borrow rules |
| `js/render.js` | Problems → pages of DOM; grading |
| `js/app.js` | Panel wiring |

The scripts load as plain globals under `window.EM`, deliberately: it keeps
`file://` working without a build step or a server.

### Guarantees the generator enforces

- Subtraction never goes negative.
- Division is always exact unless remainders are asked for.
- `without carry` / `without borrowing` is checked column by column, not approximated.
- Problems do not repeat within a page.
- `n - n = 0` stays rare rather than filling a page.

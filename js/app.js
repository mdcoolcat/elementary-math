// Wiring: spec -> parse -> generate -> render -> grade -> print.
(function (EM) {
  'use strict';

  var $ = function (id) { return document.getElementById(id); };

  // Plain-English examples. Each is real parser input — clicking one fills the
  // box with exactly this text, so what you see is what gets parsed.
  var EXAMPLES = [
    'addition within 20',
    'subtraction within 20',
    '2-digit addition without carrying',
    '3-digit subtraction, stacked',
    'times tables to 12',
    'division within 100',
    'grade 3',
    '1 page of one-digit subtraction within 20; then 5 pages of 2-digit minus 1-digit; then 5 pages of mixed'
  ];

  var DEFAULT_SPEC = 'subtraction within 20';
  var DEFAULT_PAGES = 3;

  var state = {
    spec: '',
    sections: [],
    worksheet: null,
    savedAnswers: null   // user input parked while the answer key is showing
  };

  // ---- panel feedback ------------------------------------------------------

  function showUnderstood(sections, notes, warnings) {
    var box = $('understood');
    var list = $('understood-list');
    var warn = $('warnings');
    list.textContent = '';

    sections.forEach(function (sec) {
      var li = document.createElement('li');
      var strong = document.createElement('strong');
      strong.textContent = sec.pages + (sec.pages === 1 ? ' page' : ' pages');
      li.appendChild(strong);
      li.appendChild(document.createTextNode(
        ' of ' + sec.perPage + ' problems — ' + sec.label));
      list.appendChild(li);
    });

    box.hidden = sections.length === 0;
    warn.textContent = '';
    (notes || []).forEach(function (text) {
      var p = document.createElement('p');
      p.className = 'note';
      p.textContent = text;
      warn.appendChild(p);
    });
    (warnings || []).forEach(function (text) {
      var p = document.createElement('p');
      p.className = 'warn-line';
      p.textContent = text;
      warn.appendChild(p);
    });
    warn.hidden = warn.childNodes.length === 0;
    if (!warn.hidden) box.hidden = false;
  }

  function updateTotal() {
    var pages = document.querySelectorAll('.page.checked');
    if (!pages.length) { $('total-score').textContent = ''; return; }
    var correct = 0, total = 0;
    pages.forEach(function (p) {
      p.querySelectorAll('.problem').forEach(function (pr) {
        total++;
        if (pr.classList.contains('ok')) correct++;
      });
    });
    $('total-score').textContent = 'Checked: ' + correct + ' / ' + total +
      ' correct across ' + pages.length + (pages.length === 1 ? ' page' : ' pages');
  }

  // ---- generate ------------------------------------------------------------

  function pageCount() {
    var v = parseInt($('pages').value, 10);
    if (!isFinite(v)) v = DEFAULT_PAGES;
    v = Math.max(1, Math.min(40, v));
    $('pages').value = v;
    return v;
  }

  function generate(spec, seed) {
    var parsed = EM.parser.parse(spec);
    var notes = parsed.notes.slice();
    var messages = parsed.warnings.slice();

    if (!parsed.sections.length) {
      showUnderstood([], notes, messages);
      $('sheet').innerHTML = '<p class="empty">Nothing to generate yet.</p>';
      state.worksheet = null;
      return;
    }

    // The Pages control sizes the packet; page counts the user typed themselves
    // outrank it, since those are an explicit request.
    var wanted = pageCount();
    if (parsed.statedPages) {
      var typed = parsed.sections.reduce(function (n, s) { return n + s.pages; }, 0);
      if (typed !== wanted) {
        notes.push('Using the ' + typed + ' pages your description asks for, not the Pages setting.');
      }
    } else {
      // scalePages can drop trailing sections when the target is smaller than
      // the section count, so it returns the list rather than only mutating it.
      parsed.sections = EM.parser.scalePages(parsed.sections, wanted, messages);
    }

    var worksheet = EM.generator.build(parsed.sections, seed);
    messages = messages.concat(worksheet.warnings);

    state.spec = spec;
    state.sections = parsed.sections;
    state.worksheet = worksheet;
    state.savedAnswers = null;

    showUnderstood(parsed.sections, notes, messages);
    EM.render.render(worksheet, $('sheet'));
    $('show-answers').checked = false;
    $('total-score').textContent = '';
    document.querySelector('.sheet-wrap').scrollIntoView({ block: 'start' });
  }

  // Always a fresh seed: every run produces a new set of problems.
  function run() {
    var spec = $('spec').value.trim() || DEFAULT_SPEC;
    $('spec').value = spec;
    generate(spec, EM.rng.newSeed());
  }

  // ---- events --------------------------------------------------------------

  function wire() {
    var chips = $('chips');
    EXAMPLES.forEach(function (ex) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'chip';
      b.textContent = ex.length > 34 ? ex.slice(0, 32) + '…' : ex;
      b.title = ex;
      b.addEventListener('click', function () {
        $('spec').value = ex;
        run();
      });
      chips.appendChild(b);
    });

    $('generate').addEventListener('click', function () { run(); });

    $('spec').addEventListener('keydown', function (e) {
      if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); run(); }
    });

    $('sheet').addEventListener('click', function (e) {
      var btn = e.target.closest('button.submit');
      if (!btn) return;
      var page = btn.closest('.page');
      EM.render.gradePage(page);
      updateTotal();
    });

    // Enter / arrows move between answer boxes.
    $('sheet').addEventListener('keydown', function (e) {
      if (e.key !== 'Enter' && e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
      var input = e.target;
      if (!input.classList || !input.classList.contains('ans')) return;
      var all = Array.prototype.slice.call(document.querySelectorAll('input.ans'));
      var i = all.indexOf(input);
      var next = all[e.key === 'ArrowUp' ? i - 1 : i + 1];
      if (next) { e.preventDefault(); next.focus(); next.select(); }
    });

    // Re-checking a page after edits should not leave stale marks.
    $('sheet').addEventListener('input', function (e) {
      if (!e.target.classList || !e.target.classList.contains('ans')) return;
      var problem = e.target.closest('.problem');
      if (problem) problem.classList.remove('ok', 'bad', 'blank');
      var mark = problem && problem.querySelector('.mark');
      if (mark) mark.textContent = '';
    });

    $('check-all').addEventListener('click', function () {
      document.querySelectorAll('.page').forEach(function (p) { EM.render.gradePage(p); });
      updateTotal();
    });

    $('reset').addEventListener('click', function () {
      $('show-answers').checked = false;
      state.savedAnswers = null;
      EM.render.fillAnswers($('sheet'), false);
      document.querySelectorAll('.page').forEach(function (p) { EM.render.clearPage(p); });
      updateTotal();
    });

    $('show-answers').addEventListener('change', function () {
      var inputs = document.querySelectorAll('input.ans');
      if (this.checked) {
        state.savedAnswers = Array.prototype.map.call(inputs, function (i) { return i.value; });
        inputs.forEach(function (i) { i.value = i.dataset.answer; });
      } else {
        var saved = state.savedAnswers;
        inputs.forEach(function (i, idx) { i.value = saved ? (saved[idx] || '') : ''; });
        state.savedAnswers = null;
      }
    });

    $('print-answers').addEventListener('change', function () {
      document.body.classList.toggle('print-answers', this.checked);
    });

    $('export').addEventListener('click', function () {
      if (!state.worksheet) return;
      window.print();
    });

    $('pages').addEventListener('keydown', function (e) {
      if (e.key === 'Enter') { e.preventDefault(); run(); }
    });

  }

  document.addEventListener('DOMContentLoaded', function () {
    wire();
    $('spec').value = DEFAULT_SPEC;
    generate(DEFAULT_SPEC, EM.rng.newSeed());
  });
})((window.EM = window.EM || {}));

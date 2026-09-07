// Worksheet DOM: page layout, answer inputs, grading.
(function (EM) {
  'use strict';

  var SIGN = { add: '+', sub: '−', mul: '×', div: '÷' };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  // Every blank on a page is the same width. Sizing each box to its own answer
  // would tell the student how many digits to expect.
  function answerWidth(page) {
    var n = 1;
    page.problems.forEach(function (p) {
      n = Math.max(n, String(p.answer).length, String(p.a).length);
    });
    return Math.max(2, Math.min(7, n + 1));
  }

  function makeInput(problem, pageIndex, index, width) {
    var input = el('input', 'ans');
    input.type = 'text';
    input.inputMode = 'numeric';
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.setAttribute('aria-label', 'Answer for problem ' + (index + 1));
    input.dataset.answer = String(problem.answer);
    input.dataset.page = String(pageIndex);
    input.dataset.index = String(index);
    input.style.setProperty('--w', width + 'ch');
    return input;
  }

  function horizontalProblem(problem, pageIndex, index, width) {
    var wrap = el('div', 'problem h');
    wrap.appendChild(el('span', 'pnum', '(' + (index + 1) + ')'));
    var expr = el('span', 'expr');
    expr.appendChild(el('span', 'operand', String(problem.a)));
    expr.appendChild(el('span', 'sign', SIGN[problem.op]));
    expr.appendChild(el('span', 'operand', String(problem.b)));
    expr.appendChild(el('span', 'eq', '='));
    wrap.appendChild(expr);
    wrap.appendChild(makeInput(problem, pageIndex, index, width));
    wrap.appendChild(el('span', 'mark'));
    return wrap;
  }

  function verticalProblem(problem, pageIndex, index, width) {
    var wrap = el('div', 'problem v');
    wrap.appendChild(el('span', 'pnum', '(' + (index + 1) + ')'));
    var stack = el('div', 'vstack');
    stack.appendChild(el('div', 'vrow top', String(problem.a)));
    var bottom = el('div', 'vrow bot');
    bottom.appendChild(el('span', 'vsign', SIGN[problem.op]));
    bottom.appendChild(el('span', 'vnum', String(problem.b)));
    stack.appendChild(bottom);
    stack.appendChild(el('div', 'vrule'));
    var slot = el('div', 'vans');
    slot.appendChild(makeInput(problem, pageIndex, index, width));
    stack.appendChild(slot);
    wrap.appendChild(stack);
    wrap.appendChild(el('span', 'mark'));
    return wrap;
  }

  function columnsFor(page) {
    var n = page.problems.length;
    if (page.layout === 'vertical') {
      if (n % 5 === 0) return 5;
      if (n % 4 === 0) return 4;
      return n <= 12 ? 4 : 5;
    }
    return n > 12 ? 2 : 1;
  }

  function renderPage(page, pageIndex, total) {
    var section = el('section', 'page');
    section.dataset.page = String(pageIndex);

    var head = el('header', 'page-head');
    head.appendChild(el('span', 'page-no', String(pageIndex + 1)));
    head.appendChild(el('span', 'page-label', page.label));
    var score = el('span', 'page-score', '');
    score.dataset.role = 'score';
    head.appendChild(score);
    section.appendChild(head);

    var grid = el('div', 'problems ' + (page.layout === 'vertical' ? 'grid-v' : 'grid-h'));
    var cols = columnsFor(page);
    var rows = Math.ceil(page.problems.length / cols);
    grid.style.setProperty('--cols', cols);
    grid.style.setProperty('--rows', rows);
    var width = answerWidth(page);
    // Published on the grid as well so the vertical stacks (and their rules)
    // can size themselves to match the answer boxes.
    grid.style.setProperty('--w', width + 'ch');
    page.problems.forEach(function (p, i) {
      grid.appendChild(page.layout === 'vertical'
        ? verticalProblem(p, pageIndex, i, width)
        : horizontalProblem(p, pageIndex, i, width));
    });
    section.appendChild(grid);

    var foot = el('footer', 'page-foot');
    var btn = el('button', 'submit', 'Check this page');
    btn.type = 'button';
    btn.dataset.page = String(pageIndex);
    foot.appendChild(btn);
    foot.appendChild(el('span', 'page-of', 'Page ' + (pageIndex + 1) + ' of ' + total));
    section.appendChild(foot);

    return section;
  }

  // columnsFor() is a guess from the problem count; wide problems (4-digit x
  // 2-digit multiplication) can still overrun the sheet. Measure once the page
  // is in the document and drop a column until it fits. Skipped on narrow
  // viewports, where the page is not at its printed width and the measurement
  // would not describe the printed result.
  function fitColumns(section) {
    if (section.clientWidth < 640) return;
    var grid = section.querySelector('.problems');
    var count = grid.children.length;
    var cols = parseInt(grid.style.getPropertyValue('--cols'), 10) || 1;
    while (cols > 1 && section.scrollWidth > section.clientWidth) {
      cols--;
      grid.style.setProperty('--cols', cols);
      grid.style.setProperty('--rows', Math.ceil(count / cols));
    }
  }

  function render(worksheet, mount) {
    mount.textContent = '';
    var sections = worksheet.pages.map(function (page, i) {
      var section = renderPage(page, i, worksheet.pages.length);
      mount.appendChild(section);
      return section;
    });
    sections.forEach(fitColumns);
  }

  // ---- grading -------------------------------------------------------------

  function gradePage(sectionEl) {
    var inputs = sectionEl.querySelectorAll('input.ans');
    var correct = 0;
    inputs.forEach(function (input) {
      var raw = input.value.trim();
      var ok = raw !== '' && /^-?\d+$/.test(raw) && parseInt(raw, 10) === parseInt(input.dataset.answer, 10);
      var problem = input.closest('.problem');
      problem.classList.remove('ok', 'bad');
      problem.classList.add(ok ? 'ok' : 'bad');
      problem.querySelector('.mark').textContent = ok ? '✓' : '✗';
      if (raw === '') problem.classList.add('blank');
      else problem.classList.remove('blank');
      if (ok) correct++;
    });
    sectionEl.classList.add('checked');
    var score = sectionEl.querySelector('[data-role="score"]');
    score.textContent = correct + ' / ' + inputs.length;
    score.classList.toggle('perfect', correct === inputs.length && inputs.length > 0);
    return { correct: correct, total: inputs.length };
  }

  function clearPage(sectionEl) {
    sectionEl.classList.remove('checked');
    sectionEl.querySelectorAll('.problem').forEach(function (p) {
      p.classList.remove('ok', 'bad', 'blank');
      p.querySelector('.mark').textContent = '';
    });
    var score = sectionEl.querySelector('[data-role="score"]');
    score.textContent = '';
    score.classList.remove('perfect');
  }

  function fillAnswers(root, fill) {
    root.querySelectorAll('input.ans').forEach(function (input) {
      input.value = fill ? input.dataset.answer : '';
    });
  }

  EM.render = {
    render: render,
    gradePage: gradePage,
    clearPage: clearPage,
    fillAnswers: fillAnswers,
    SIGN: SIGN
  };
})((window.EM = window.EM || {}));

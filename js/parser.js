// Free-text worksheet spec parser.
// Turns things like "2-digit addition within 100 without carry" or
// "1 page of one-digit subtraction, then 5 pages of 2-digit minus 1-digit"
// into a list of concrete section configs, and reports what it understood.
(function (EM) {
  'use strict';

  var WORD_NUM = {
    zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
    seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
    single: 1, double: 2, triple: 3
  };

  var OP_WORDS = [
    { op: 'add', re: /\b(addition|adding|add|plus|sums?)\b|\+/ },
    { op: 'sub', re: /\b(subtraction|subtracting|subtract|substraction|substract|minus|take away|difference)\b|(?:^|\s)[-−](?=\s)/ },
    { op: 'mul', re: /\b(multiplication|multiplying|multiply|times tables?|times table|times|product)\b|[×]|(?:^|\s)x(?=\s)/ },
    { op: 'div', re: /\b(division|dividing|divide|divided by|quotient)\b|[÷]/ }
  ];

  var OP_LABEL = { add: 'Addition', sub: 'Subtraction', mul: 'Multiplication', div: 'Division' };
  var OP_SIGN = { add: '+', sub: '−', mul: '×', div: '÷' };

  // ---- Kumon level presets -------------------------------------------------
  // Modelled on the Kumon math progression: 7A-4A are counting and number
  // writing (nothing this generator can draw), 3A starts +1/+2/+3, 2A is adding
  // 4 through 10, A is horizontal addition with larger numbers then subtraction,
  // B is vertical addition and subtraction with carrying and borrowing, C is the
  // multiplication tables then 4-digit x 1-digit then simple division by one
  // digit, D is 2-digit x 2-digit then long division. E and F move on to
  // fractions and decimals, which this generator cannot produce.
  //
  // Each preset is a spec string re-fed through the parser, so levels are
  // written in the same language a user types.
  var LEVELS = {
    '3a': {
      title: 'Level 3A — adding small numbers',
      spec: '6 pages of one-digit addition within 10',
      note: 'Level 3A is really "+1, +2, +3"; this approximates it as one-digit addition within 10.'
    },
    '2a': {
      title: 'Level 2A — adding up to 10',
      spec: '3 pages of one-digit addition within 20; 3 pages of addition within 20',
      note: 'Level 2A is really "adding 4 through 10"; this approximates it as addition within 20.'
    },
    'a': {
      title: 'Level A — horizontal addition and subtraction',
      spec: '2 pages of addition within 20; 2 pages of 2-digit by 1-digit addition within 100; 2 pages of subtraction within 20'
    },
    'b': {
      title: 'Level B — vertical addition and subtraction, carrying and borrowing',
      spec: '2 pages of 2-digit vertical addition within 100 with carrying; 2 pages of 3-digit vertical addition; 2 pages of 3-digit vertical subtraction'
    },
    'c': {
      title: 'Level C — multiplication tables, then division by one digit',
      spec: '2 pages of multiplication tables to 9; 2 pages of 4-digit by 1-digit vertical multiplication; 2 pages of 3-digit by 1-digit division'
    },
    'd': {
      title: 'Level D — double-digit multiplication and long division',
      spec: '3 pages of 2-digit by 2-digit vertical multiplication; 3 pages of 3-digit by 2-digit division',
      note: 'Level D also introduces fractions, and its division is taught in long-division form. Neither is generated here.'
    },
    'e': {
      title: 'Level E — (fractions)',
      spec: '3 pages of 3-digit by 2-digit vertical multiplication; 3 pages of 4-digit by 2-digit division',
      note: 'Kumon Level E is fractions, which this generator cannot produce. Showing multi-digit arithmetic instead.'
    },
    'f': {
      title: 'Level F — (fractions, decimals, order of operations)',
      spec: '3 pages of 4-digit by 2-digit vertical multiplication; 3 pages of 4-digit by 2-digit division',
      note: 'Kumon Level F is fractions, decimals and order of operations, none of which this generator produces. Showing multi-digit arithmetic instead.'
    }
  };

  // Kumon is ability-based and students usually work above their school grade,
  // so this is the nominal alignment, not a promise about any given child.
  var GRADE_TO_LEVEL = {
    k: '2a', '1': 'a', '2': 'b', '3': 'c', '4': 'd', '5': 'e', '6': 'f'
  };

  function wordToNum(tok) {
    if (tok == null) return null;
    tok = String(tok).trim().toLowerCase();
    if (/^\d+$/.test(tok)) return parseInt(tok, 10);
    return WORD_NUM.hasOwnProperty(tok) ? WORD_NUM[tok] : null;
  }

  function normalize(text) {
    return String(text || '')
      .toLowerCase()
      .replace(/[‐-―]/g, '-')      // fancy dashes -> hyphen
      .replace(/−/g, '-')
      .replace(/\s+/g, ' ')
      .trim();
  }

  var NUMWORD_RE = '\\d+|zero|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|single|double|triple';

  function splitSegments(text) {
    // Split on ; newline, "then", and commas that introduce a new "N page(s)" clause.
    var parts = text.split(new RegExp(
      '\\s*(?:[;\\n]|,?\\s*\\bthen\\b|,(?=\\s*(?:' + NUMWORD_RE + ')\\s+pages?\\b))\\s*', 'i'
    ));
    return parts.map(function (s) { return s.trim(); }).filter(Boolean);
  }

  function detectOps(s) {
    var found = [];
    OP_WORDS.forEach(function (o) {
      var m = s.match(o.re);
      if (m) found.push({ op: o.op, index: m.index });
    });
    found.sort(function (a, b) { return a.index - b.index; });
    var seen = {}, ops = [];
    found.forEach(function (f) {
      if (!seen[f.op]) { seen[f.op] = true; ops.push(f.op); }
    });
    return ops;
  }

  function parseSegment(seg, warnings) {
    var s = normalize(seg);
    var out = { source: seg.trim() };

    // pages: "5 pages", "1 page of"
    var m = s.match(new RegExp('(' + NUMWORD_RE + ')\\s*pages?\\b', 'i'));
    if (m) out.pages = clamp(wordToNum(m[1]) || 1, 1, 50);

    // per page: "20 questions", "15 problems per page"
    m = s.match(new RegExp('(' + NUMWORD_RE + ')\\s*(?:questions?|problems?|exercises?)\\b', 'i'));
    if (m) out.perPage = clamp(wordToNum(m[1]) || 20, 4, 40);

    // ceiling: within 20 / up to 100 / to 12 / max 50 / under 1000
    m = s.match(/\b(?:within|up to|no (?:more|higher|greater) than|max(?:imum)?(?: of)?|under|below|less than|to)\s+(\d+)\b/);
    if (m) out.max = parseInt(m[1], 10);

    // digit specs, in order: "2-digit minus 1-digit"
    var digits = [];
    var dre = new RegExp('(' + NUMWORD_RE + ')[\\s-]*digits?\\b', 'gi');
    var dm;
    while ((dm = dre.exec(s)) !== null) {
      var d = wordToNum(dm[1]);
      if (d != null && d >= 1 && d <= 5) digits.push(d);
    }
    if (digits.length >= 1) out.aDigits = digits[0];
    if (digits.length >= 2) out.bDigits = digits[1];

    // regrouping
    if (/\b(?:no|without|non)[- ]?(?:carry|carrying|regroup|regrouping|borrow|borrowing|rename|renaming)\b/.test(s)) {
      out.regroup = 'none';
    } else if (/\b(?:with|requir\w*|needs?)\s+(?:carry|carrying|regroup|regrouping|borrow|borrowing)\b/.test(s)) {
      out.regroup = 'require';
    }

    // layout
    if (/\b(vertical|column|stacked|long form)\b/.test(s)) out.layout = 'vertical';
    else if (/\b(horizontal|across|in a row|number sentence)\b/.test(s)) out.layout = 'horizontal';

    // remainders for division
    if (/\bwith remainders?\b/.test(s)) out.remainder = true;
    if (/\b(?:no|without) remainders?\b/.test(s)) out.remainder = false;

    // operations
    var ops = detectOps(s);
    var isMixed = /\bmix(?:ed|es|ture)?\b|\ball four\b/.test(s);
    if (ops.length > 1 || (isMixed && ops.length >= 1)) {
      out.ops = ops.length ? ops : ['add', 'sub'];
      out.op = 'mixed';
    } else if (ops.length === 1) {
      out.op = isMixed ? 'mixed' : ops[0];
      out.ops = [ops[0]];
    } else if (isMixed) {
      out.op = 'mixed';
      out.ops = null; // fill from context
    }

    // "times tables to 12" -> multiplier ceiling rather than product ceiling
    if (/\btimes tables?\b/.test(s) || /\bmultiplication tables?\b/.test(s)) {
      out.tables = true;
    }

    return out;
  }

  function clamp(n, lo, hi) { return Math.max(lo, Math.min(hi, n)); }

  // Carry a field forward from an earlier clause to later ones that omit it:
  // "subtraction within 20: 1 page of one-digit, then 5 pages of 2-digit minus
  // 1-digit". Forward only — a ceiling stated in a later clause must not reach
  // back and clamp an earlier one.
  function fillForward(sections, field) {
    var known = null;
    sections.forEach(function (s) {
      if (s[field] != null) { known = s[field]; return; }
      if (known != null) { s[field] = known; s[field + 'Inherited'] = true; }
    });
  }

  // The operation is the exception: it is often stated only once, anywhere in
  // the sentence, and applies to every clause.
  function fillBackward(sections, field) {
    var known = null;
    for (var i = sections.length - 1; i >= 0; i--) {
      if (sections[i][field] != null) { known = sections[i][field]; continue; }
      if (known != null) { sections[i][field] = known; sections[i][field + 'Inherited'] = true; }
    }
  }

  // Turn a loose section into concrete numeric ranges.
  function resolve(sec, warnings) {
    var op = sec.op || 'add';
    var ops = sec.ops && sec.ops.length ? sec.ops : [op === 'mixed' ? 'add' : op];
    if (op === 'mixed' && (!sec.ops || !sec.ops.length)) ops = ['add', 'sub'];

    var explicitLayout = sec.layout != null;
    var layout = sec.layout;
    var aDigits = sec.aDigits || null;
    var bDigits = sec.bDigits || null;
    var max = sec.max != null ? sec.max : null;

    // Default layout: vertical once the numbers get wide, horizontal otherwise.
    if (!layout) {
      var wide = (aDigits && aDigits >= 3) || (max != null && max >= 1000) ||
                 (ops.indexOf('mul') >= 0 && bDigits && bDigits >= 2);
      layout = wide ? 'vertical' : 'horizontal';
    }
    if (layout === 'vertical' && ops.length === 1 && ops[0] === 'div') {
      layout = 'horizontal'; // long-division layout is out of scope
      if (explicitLayout) {
        warnings.push('Division is laid out horizontally — long-division format is not supported.');
      }
    }

    function rangeFor(d) {
      if (!d) return null;
      return d === 1 ? [1, 9] : [Math.pow(10, d - 1), Math.pow(10, d) - 1];
    }

    var aR = rangeFor(aDigits);
    // "2-digit addition" means both operands are 2-digit; "2-digit minus 1-digit" is explicit.
    var bR = rangeFor(bDigits) || rangeFor(aDigits);

    if (!aR) aR = max != null ? [1, Math.max(1, max)] : [1, 20];
    if (!bR) bR = max != null ? [1, Math.max(1, max)] : [1, 20];

    // A ceiling at or below the digit floor leaves nothing to draw from (a
    // 3-digit value "within 100" can only ever be 100). If the ceiling merely
    // carried over from an earlier clause, drop it quietly; if this clause asked
    // for it outright, say why it was ignored.
    if (max != null && aDigits != null && max <= aR[0]) {
      if (!sec.maxInherited) {
        warnings.push('Ignored "within ' + max + '" for ' + aDigits +
          '-digit values — nothing with ' + aDigits + ' digits fits under it.');
      }
      max = null;
    }
    if (max != null) {
      aR = [Math.min(aR[0], max), Math.min(aR[1], max)];
      bR = [Math.min(bR[0], max), Math.min(bR[1], max)];
    }

    if (sec.tables) {
      // "multiplication tables to 12" -> both factors bounded by the ceiling
      var t = max != null ? max : 12;
      aR = [1, t]; bR = [1, t]; max = null;
    }

    var perPage = sec.perPage || 20;
    var pages = sec.pages || 1;

    return {
      op: op,
      ops: ops,
      layout: layout,
      aRange: aR,
      bRange: bR,
      max: max,
      regroup: sec.regroup || 'any',
      remainder: sec.remainder === true,
      perPage: perPage,
      pages: pages,
      aDigits: aDigits,
      bDigits: bDigits,
      tables: !!sec.tables,
      source: sec.source,
      label: describe({
        op: op, ops: ops, layout: layout, aDigits: aDigits, bDigits: bDigits,
        max: max, regroup: sec.regroup || 'any', tables: !!sec.tables
      })
    };
  }

  function describe(s) {
    var bits = [];
    if (s.op === 'mixed') {
      bits.push('Mixed ' + s.ops.map(function (o) { return OP_LABEL[o].toLowerCase(); }).join(' / '));
    } else {
      bits.push(OP_LABEL[s.op]);
    }
    if (s.aDigits && s.bDigits && s.aDigits !== s.bDigits) {
      bits.push(s.aDigits + '-digit ' + OP_SIGN[s.op === 'mixed' ? s.ops[0] : s.op] + ' ' + s.bDigits + '-digit');
    } else if (s.aDigits) {
      bits.push(s.aDigits + '-digit');
    }
    if (s.tables) bits.push('tables');
    if (s.max != null) bits.push('within ' + s.max);
    if (s.regroup === 'none') bits.push(s.op === 'sub' ? 'no borrowing' : 'no carrying');
    if (s.regroup === 'require') bits.push(s.op === 'sub' ? 'with borrowing' : 'with carrying');
    bits.push(s.layout === 'vertical' ? 'stacked' : 'side by side');
    return bits.join(' · ');
  }

  // "grade 3", "3rd grade", "g3", "kindergarten", "level C", "kumon 2A".
  function expandPreset(text, warnings) {
    var s = normalize(text);

    var lm = s.match(/\b(?:kumon\s*level|level|kumon)\s*([1-7]?\s*a|[b-o])\b/);
    if (lm) {
      var lkey = lm[1].replace(/\s+/g, '');
      if (LEVELS[lkey]) return { key: lkey, level: LEVELS[lkey] };
      if (/^[1-7]a$/.test(lkey)) {
        warnings.push('Kumon Level ' + lkey.toUpperCase() +
          ' is counting and number writing, not arithmetic — starting at Level 3A instead.');
        return { key: '3a', level: LEVELS['3a'] };
      }
      warnings.push('Kumon Level ' + lkey.toUpperCase() +
        ' is beyond arithmetic (fractions, algebra and up) — showing Level F arithmetic instead.');
      return { key: 'f', level: LEVELS['f'] };
    }

    var gm = s.match(/\bgrade\s*([k1-9])\b|\b([1-9])(?:st|nd|rd|th)\s*grade\b|\bkindergarten\b|\bg([k1-9])\b/);
    if (!gm) return null;
    var gkey = /kindergarten/.test(gm[0]) ? 'k' : String(gm[1] || gm[2] || gm[3]).toLowerCase();
    var level = GRADE_TO_LEVEL[gkey];
    if (!level) {
      warnings.push('Grade ' + gkey.toUpperCase() +
        ' is past what this generator covers (it stops at elementary arithmetic) — showing Level F arithmetic instead.');
      level = 'f';
      gkey = null;
    }
    return { key: level, level: LEVELS[level], grade: gkey };
  }

  function parse(text) {
    var warnings = [];
    var notes = [];
    var raw = String(text || '').trim();
    if (!raw) return { sections: [], warnings: ['Type what you want, e.g. "subtraction within 20".'], notes: notes };

    var body = raw;
    var preset = expandPreset(raw, warnings);
    // Only treat it as a preset if the text is just the grade/level name — if
    // they also spelled out digits or an operation, take them at their word.
    var rest = normalize(raw)
      .replace(/\b(?:kumon\s*level|level|kumon)\s*[1-7]?\s*[a-o]\b/, '')
      .replace(/\bgrade\s*[k1-9]\b|\b[1-9](?:st|nd|rd|th)\s*grade\b|\bkindergarten\b|\bg[k1-9]\b/, '');
    if (preset && !/\bdigit|within|page|addition|subtraction|multiplication|division\b/.test(rest)) {
      body = preset.level.spec;
      notes.push((preset.grade ? 'Grade ' + preset.grade.toUpperCase() + ' → ' : '') +
        preset.level.title + '.');
      if (preset.level.note) notes.push(preset.level.note);
    }

    var segments = splitSegments(body);
    var loose = segments.map(function (seg) { return parseSegment(seg, warnings); });

    // Only the operation and the ceiling carry across clauses of one sentence
    // ("subtraction within 20: 1 page of one-digit, then 5 pages of 2-digit minus 1-digit").
    // Layout / regrouping / count stay local to the clause that stated them.
    var namedAnOp = loose.some(function (s) { return s.op != null; });
    fillForward(loose, 'op');
    fillBackward(loose, 'op');
    fillForward(loose, 'max');
    if (!namedAnOp) {
      warnings.push('No operation recognised — defaulting to addition. Try wording like "subtraction within 20".');
    }
    // ops travels with op
    var ctxOps = null;
    loose.forEach(function (s) { if (s.ops && ctxOps == null) ctxOps = s.ops; });
    loose.forEach(function (s) { if (!s.ops && ctxOps) s.ops = ctxOps.slice(); });

    var sections = loose.map(function (s) { return resolve(s, warnings); });

    // "then 5 pages of mixed" after subtraction sections = mix of the earlier
    // difficulty shapes, not a mix of operations.
    sections.forEach(function (sec, i) {
      if (sec.op !== 'mixed' || sec.ops.length !== 1 || sec.aDigits) return;
      var shapes = [];
      for (var j = 0; j < i; j++) {
        var prev = sections[j];
        if (prev.op === 'mixed' || prev.ops[0] !== sec.ops[0]) continue;
        shapes.push({ op: prev.ops[0], aRange: prev.aRange, bRange: prev.bRange, regroup: prev.regroup });
      }
      if (shapes.length) {
        sec.shapes = shapes;
        sec.label = 'Mixed ' + OP_LABEL[sec.ops[0]].toLowerCase() +
          (sec.max != null ? ' · within ' + sec.max : '') +
          ' · ' + (sec.layout === 'vertical' ? 'stacked' : 'side by side');
      }
    });

    if (!sections.length) warnings.push('Could not read that. Try "2-digit addition within 100 without carry".');
    var total = sections.reduce(function (n, s) { return n + s.pages; }, 0);
    if (total > 40) {
      warnings.push('Capped at 40 pages (asked for ' + total + ').');
      var budget = 40, kept = [];
      sections.forEach(function (s) {
        if (budget <= 0) return;
        s.pages = Math.min(s.pages, budget);
        budget -= s.pages;
        kept.push(s);
      });
      sections = kept;
    }

    return { sections: sections, warnings: warnings, notes: notes };
  }

  EM.parser = {
    parse: parse,
    LEVELS: LEVELS,
    GRADE_TO_LEVEL: GRADE_TO_LEVEL,
    OP_SIGN: OP_SIGN,
    OP_LABEL: OP_LABEL,
    describe: describe
  };
})((window.EM = window.EM || {}));

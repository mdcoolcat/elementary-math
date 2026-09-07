// Problem generation. Takes resolved sections from the parser and produces
// pages of problems, honouring digit ranges, ceilings and carry/borrow rules.
(function (EM) {
  'use strict';

  function digitsOf(n) { return String(Math.abs(n)).length; }

  function columns(n, width) {
    var out = [];
    for (var i = 0; i < width; i++) { out.push(n % 10); n = Math.floor(n / 10); }
    return out;
  }

  function hasCarry(a, b) {
    var w = Math.max(digitsOf(a), digitsOf(b));
    var A = columns(a, w), B = columns(b, w), carry = 0;
    for (var i = 0; i < w; i++) {
      var s = A[i] + B[i] + carry;
      if (s > 9) { carry = 1; return true; }
      carry = 0;
    }
    return false;
  }

  function hasBorrow(a, b) {
    var w = Math.max(digitsOf(a), digitsOf(b));
    var A = columns(a, w), B = columns(b, w), borrow = 0;
    for (var i = 0; i < w; i++) {
      var d = A[i] - B[i] - borrow;
      if (d < 0) { borrow = 1; return true; }
      borrow = 0;
    }
    return false;
  }

  function regroupOk(op, a, b, mode) {
    if (mode === 'any' || !mode) return true;
    var flag = op === 'add' ? hasCarry(a, b) : op === 'sub' ? hasBorrow(a, b) : null;
    if (flag === null) return true; // carry rules do not apply to x and ÷
    return mode === 'none' ? !flag : flag;
  }

  // Try to build one problem for a shape. Returns null when the roll is invalid.
  function rollOne(shape, rng) {
    var op = shape.op;
    var aLo = shape.aRange[0], aHi = shape.aRange[1];
    var bLo = shape.bRange[0], bHi = shape.bRange[1];
    var max = shape.max;
    if (aHi < aLo || bHi < bLo) return null;

    if (op === 'div') {
      var dLo = Math.max(2, bLo);
      var dHi = shape.bDigits ? bHi : Math.min(bHi, 12);
      if (dHi < dLo) return null;
      var d = rng.int(dLo, dHi);
      var ceiling = max != null ? Math.min(max, aHi) : aHi;
      var qHi = Math.floor(ceiling / d);
      var qLo = Math.max(1, Math.ceil(aLo / d));
      if (qHi < qLo || qHi < 1) return null;
      var q = rng.int(qLo, Math.min(qHi, 12 * 12));
      var dividend = d * q;
      if (dividend < aLo || dividend > ceiling) return null;
      return { op: 'div', a: dividend, b: d, answer: q };
    }

    var a = rng.int(aLo, aHi);
    var b = rng.int(bLo, bHi);

    if (op === 'add') {
      if (b < 1 || a < 1) return null;
      var sum = a + b;
      if (max != null && sum > max) return null;
      if (!regroupOk('add', a, b, shape.regroup)) return null;
      return { op: 'add', a: a, b: b, answer: sum };
    }

    if (op === 'sub') {
      if (b < 1) return null;
      if (max != null && a > max) return null;
      if (b > a) return null;             // never negative
      if (a === b && rng() < 0.8) return null;  // keep "n - n = 0" rare
      if (!regroupOk('sub', a, b, shape.regroup)) return null;
      return { op: 'sub', a: a, b: b, answer: a - b };
    }

    if (op === 'mul') {
      if (a < 1 || b < 1) return null;
      var prod = a * b;
      if (max != null && prod > max) return null;
      return { op: 'mul', a: a, b: b, answer: prod };
    }

    return null;
  }

  // Shapes a section can draw from. A "mixed" section blends the shapes of the
  // earlier sections it follows, plus its own (widest) range.
  function shapesFor(sec) {
    var base = {
      aRange: sec.aRange, bRange: sec.bRange, max: sec.max,
      regroup: sec.regroup, bDigits: sec.bDigits
    };
    if (sec.op === 'mixed' && sec.shapes && sec.shapes.length) {
      var list = sec.shapes.map(function (s) {
        return {
          op: s.op, aRange: s.aRange, bRange: s.bRange,
          max: sec.max, regroup: s.regroup, bDigits: null
        };
      });
      list.push(Object.assign({ op: sec.ops[0] }, base));
      return list;
    }
    if (sec.op === 'mixed') {
      return sec.ops.map(function (o) { return Object.assign({ op: o }, base); });
    }
    return [Object.assign({ op: sec.op }, base)];
  }

  // Balanced, shuffled assignment of n slots across the available shapes.
  function slotPlan(count, shapeCount, rng) {
    var plan = [];
    for (var i = 0; i < count; i++) plan.push(i % shapeCount);
    return rng.shuffle(plan);
  }

  function makeProblems(sec, count, rng, report) {
    var shapes = shapesFor(sec);
    var plan = slotPlan(count, shapes.length, rng);
    var seen = Object.create(null);
    var out = [];

    for (var i = 0; i < plan.length; i++) {
      var shape = shapes[plan[i]];
      var p = null;
      for (var t = 0; t < 600 && !p; t++) {
        var cand = rollOne(shape, rng);
        if (!cand) continue;
        var key = cand.a + cand.op + cand.b;
        if (seen[key]) { cand = null; continue; }
        p = cand;
      }
      // Fall back to any shape, then to allowing a repeat, before giving up.
      for (var s = 0; s < shapes.length && !p; s++) {
        for (var t2 = 0; t2 < 400 && !p; t2++) {
          var c2 = rollOne(shapes[s], rng);
          if (c2 && !seen[c2.a + c2.op + c2.b]) p = c2;
        }
      }
      for (var s2 = 0; s2 < shapes.length && !p; s2++) {
        for (var t3 = 0; t3 < 400 && !p; t3++) {
          p = rollOne(shapes[s2], rng);
        }
      }
      if (!p) { if (report) report.impossible = true; continue; }
      seen[p.a + p.op + p.b] = true;
      out.push(p);
    }
    return out;
  }

  function build(sections, seed) {
    var rng = EM.rng.makeRng(seed);
    var pages = [];
    var report = { impossible: false, short: false };

    sections.forEach(function (sec) {
      for (var p = 0; p < sec.pages; p++) {
        var problems = makeProblems(sec, sec.perPage, rng, report);
        if (problems.length < sec.perPage) report.short = true;
        pages.push({
          label: sec.label,
          layout: sec.layout,
          problems: problems
        });
      }
    });

    var warnings = [];
    if (report.impossible || report.short) {
      warnings.push('Some pages have fewer problems than asked — the constraints leave too few valid combinations.');
    }
    return { seed: String(seed), pages: pages, warnings: warnings };
  }

  EM.generator = {
    build: build,
    makeProblems: makeProblems,
    hasCarry: hasCarry,
    hasBorrow: hasBorrow,
    digitsOf: digitsOf
  };
})((window.EM = window.EM || {}));

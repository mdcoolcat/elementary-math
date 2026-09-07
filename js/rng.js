// Seeded RNG so a worksheet is reproducible from its seed.
(function (EM) {
  'use strict';

  function hashSeed(str) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul(h, 16777619) >>> 0;
    }
    return h >>> 0;
  }

  // mulberry32
  function makeRng(seed) {
    var a = typeof seed === 'number' ? seed >>> 0 : hashSeed(String(seed));
    function next() {
      a = (a + 0x6d2b79f5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    next.int = function (min, max) {
      return min + Math.floor(next() * (max - min + 1));
    };
    next.pick = function (arr) {
      return arr[next.int(0, arr.length - 1)];
    };
    next.shuffle = function (arr) {
      for (var i = arr.length - 1; i > 0; i--) {
        var j = next.int(0, i);
        var t = arr[i];
        arr[i] = arr[j];
        arr[j] = t;
      }
      return arr;
    };
    return next;
  }

  function newSeed() {
    return String(Math.floor(Math.random() * 900000) + 100000);
  }

  EM.rng = { makeRng: makeRng, newSeed: newSeed };
})((window.EM = window.EM || {}));

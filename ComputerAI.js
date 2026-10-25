/**
 * ComputerAI.js — Taktik-Engine für Computer-Gegner.
 *
 * Stufen:
 *   easy   → reiner Zufall
 *   medium → Zufall + Verfolgung von Treffern (Nachtbarzellen)
 *   hard   → Linien-Erkennung + Schachbrett-Parität
 *   expert → Wahrscheinlichkeitsdichte über alle möglichen Schiffspositionen
 */
(function (global) {
  'use strict';

  const key = (r, c) => r + ',' + c;

  class ComputerAI {
    constructor(difficulty = 'easy') {
      this.difficulty = difficulty;
    }

    /* =========================================================
       Public API
       ========================================================= */

    /**
     * Wählt ein Schiff für den Salven-Modus. Bevorzugt das Schiff
     * mit den meisten verbleibenden Feldern (max. Schusszahl).
     */
    chooseSalvoShip({ ownShips }) {
      const alive = (ownShips || []).filter(s => !s.sunk);
      if (!alive.length) return null;
      alive.sort((a, b) =>
        (b.cells.length - b.hits.size) - (a.cells.length - a.hits.size)
      );
      return alive[0];
    }

    /**
     * Wählt das nächste Ziel.
     * ctx: {
     *   rows, cols,
     *   myShots: Map<"r,c", {result:'hit'|'miss', sunk}>,
     *   sunkCells: Set<"r,c">,
     *   activeHits: [{r,c}]  — Treffer ohne versenktes Schiff,
     *   remainingShips: [sizes] — noch nicht versenkte Schiffslängen
     * }
     */
    chooseShot(ctx) {
      switch (this.difficulty) {
        case 'easy':   return this._easyShot(ctx);
        case 'medium': return this._mediumShot(ctx);
        case 'hard':   return this._hardShot(ctx);
        case 'expert': return this._expertShot(ctx);
        default:       return this._easyShot(ctx);
      }
    }

    /* =========================================================
       Hilfsfunktionen
       ========================================================= */

    _untriedCells({ rows, cols, myShots }) {
      const out = [];
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++)
          if (!myShots.has(key(r, c))) out.push({ r, c });
      return out;
    }

    _adjacentUntried(hits, { rows, cols, myShots }) {
      const out = [], seen = new Set();
      for (const h of hits) {
        for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
          const r = h.r + dr, c = h.c + dc;
          if (r < 0 || r >= rows || c < 0 || c >= cols) continue;
          const k = key(r, c);
          if (myShots.has(k) || seen.has(k)) continue;
          seen.add(k);
          out.push({ r, c });
        }
      }
      return out;
    }

    _findLines(hits) {
      const set = new Set(hits.map(h => key(h.r, h.c)));
      const lines = [];

      const visitedH = new Set();
      for (const h of hits) {
        if (visitedH.has(key(h.r, h.c))) continue;
        const line = [h];
        let c = h.c - 1;
        while (set.has(key(h.r, c))) { line.unshift({ r: h.r, c }); c--; }
        c = h.c + 1;
        while (set.has(key(h.r, c))) { line.push({ r: h.r, c }); c++; }
        if (line.length >= 2) {
          lines.push(line);
          line.forEach(p => visitedH.add(key(p.r, p.c)));
        }
      }

      const visitedV = new Set();
      for (const h of hits) {
        if (visitedV.has(key(h.r, h.c))) continue;
        const line = [h];
        let r = h.r - 1;
        while (set.has(key(r, h.c))) { line.unshift({ r, c: h.c }); r--; }
        r = h.r + 1;
        while (set.has(key(r, h.c))) { line.push({ r, c: h.c }); r++; }
        if (line.length >= 2) {
          lines.push(line);
          line.forEach(p => visitedV.add(key(p.r, p.c)));
        }
      }

      return lines;
    }

    _canPlace(r0, c0, dr, dc, size, myShots, sunkCells) {
      for (let i = 0; i < size; i++) {
        const r = r0 + dr * i, c = c0 + dc * i;
        const k = key(r, c);
        if (sunkCells.has(k)) return false;
        const s = myShots.get(k);
        if (s && s.result === 'miss') return false;
      }
      return true;
    }

    _rand(arr) {
      return arr[Math.floor(Math.random() * arr.length)];
    }

    /* =========================================================
       Easy — reiner Zufall
       ========================================================= */
    _easyShot(ctx) {
      const cells = this._untriedCells(ctx);
      return cells.length ? this._rand(cells) : null;
    }

    /* =========================================================
       Medium — Zufall + Verfolgung angrenzender Treffer
       ========================================================= */
    _mediumShot(ctx) {
      if (ctx.activeHits.length) {
        const cand = this._adjacentUntried(ctx.activeHits, ctx);
        if (cand.length) return this._rand(cand);
      }
      return this._easyShot(ctx);
    }

    /* =========================================================
       Hard — Linien-Erkennung + Schachbrett-Parität
       ========================================================= */
    _hardShot(ctx) {
      if (ctx.activeHits.length) {
        const lines = this._findLines(ctx.activeHits);
        const cand  = this._adjacentUntried(ctx.activeHits, ctx);

        if (lines.length && cand.length) {
          const lineEnds = cand.filter(c =>
            lines.some(line => line.some(h =>
              (Math.abs(h.r - c.r) === 1 && h.c === c.c) ||
              (Math.abs(h.c - c.c) === 1 && h.r === c.r)
            ))
          );
          if (lineEnds.length) return this._rand(lineEnds);
        }
        if (cand.length) return this._rand(cand);
      }

      const all = this._untriedCells(ctx);
      if (!all.length) return null;
      const parity = all.filter(c => (c.r + c.c) % 2 === 0);
      return this._rand(parity.length ? parity : all);
    }

    /* =========================================================
       Expert — Wahrscheinlichkeitsdichte
       ========================================================= */
    _expertShot(ctx) {
      const { rows, cols, myShots, sunkCells, remainingShips } = ctx;
      if (!remainingShips || !remainingShips.length) return this._easyShot(ctx);

      const density = new Float32Array(rows * cols);

      for (const size of remainingShips) {
        for (let r = 0; r < rows; r++)
          for (let c = 0; c + size <= cols; c++)
            if (this._canPlace(r, c, 0, 1, size, myShots, sunkCells))
              for (let i = 0; i < size; i++) density[r * cols + (c + i)] += 1;

        for (let r = 0; r + size <= rows; r++)
          for (let c = 0; c < cols; c++)
            if (this._canPlace(r, c, 1, 0, size, myShots, sunkCells))
              for (let i = 0; i < size; i++) density[(r + i) * cols + c] += 1;
      }

      let best = null, bestScore = -1;
      for (let r = 0; r < rows; r++)
        for (let c = 0; c < cols; c++) {
          if (myShots.has(key(r, c))) continue;
          const score = density[r * cols + c];
          if (score > bestScore) { bestScore = score; best = { r, c }; }
        }

      return best || this._easyShot(ctx);
    }
  }

  global.ComputerAI = ComputerAI;
})(window);
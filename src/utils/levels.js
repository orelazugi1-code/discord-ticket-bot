function xpNeededForLevel(level) {
  return 5 * level * level + 50 * level + 100;
}

function calculateLevel(totalXp) {
  let level = 0;
  let accumulated = 0;
  while (true) {
    const needed = xpNeededForLevel(level);
    if (accumulated + needed > totalXp) {
      return { level, currentXp: totalXp - accumulated, needed };
    }
    accumulated += needed;
    level++;
  }
}

module.exports = { xpNeededForLevel, calculateLevel };

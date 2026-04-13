/**
 * i18n.js — Japanese / English translations for Same Game UI
 */

export const translations = {
  ja: {
    title: "Same Game",
    subtitle: "同色隣接ブロックを消して高得点を狙え",
    score: "スコア",
    best: "ベスト",
    difficulty: "難易度",
    easy: "イージー",
    medium: "ミディアム",
    hard: "ハード",
    newGame: "新しいゲーム",
    undo: "元に戻す",
    gameOver: "ゲームオーバー",
    gameOverMsg: "これ以上消せるブロックがありません",
    cleared: "完全消去！",
    clearedMsg: "ボード完全消去ボーナス +1000点！",
    finalScore: "最終スコア",
    playAgain: "もう一度",
    previewScore: "スコア予測",
    hint: "2個以上隣接する同色ブロックをクリック",
    theme: "テーマ",
    light: "ライト",
    dark: "ダーク",
    language: "言語",
  },
  en: {
    title: "Same Game",
    subtitle: "Click groups of same-color blocks to score",
    score: "Score",
    best: "Best",
    difficulty: "Difficulty",
    easy: "Easy",
    medium: "Medium",
    hard: "Hard",
    newGame: "New Game",
    undo: "Undo",
    gameOver: "Game Over",
    gameOverMsg: "No more moves available",
    cleared: "Board Cleared!",
    clearedMsg: "Board clear bonus +1000 points!",
    finalScore: "Final Score",
    playAgain: "Play Again",
    previewScore: "Preview",
    hint: "Click groups of 2+ adjacent same-color blocks",
    theme: "Theme",
    light: "Light",
    dark: "Dark",
    language: "Language",
  },
};

/**
 * Get a translation string.
 * @param {string} lang  "ja" | "en"
 * @param {string} key
 * @returns {string}
 */
export function t(lang, key) {
  return translations[lang]?.[key] ?? translations.en[key] ?? key;
}

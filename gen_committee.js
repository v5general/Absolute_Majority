// This script generates committeeEngine.ts with correct CJK characters
// We use Unicode escape sequences for all CJK to avoid encoding corruption

const fs = require('fs');

// Helper: convert a CJK string to a JS string literal with \uXXXX escapes
function u(s) {
  let result = "'";
  for (let i = 0; i < s.length; i++) {
    const code = s.charCodeAt(i);
    if (code > 0x7F) {
      result += '\u' + code.toString(16).toUpperCase().padStart(4, '0');
    } else {
      result += s[i];
    }
  }
  result += "'";
  return result;
}

// 120 surnames - avoiding real politicians and party leader surnames
const surnames = [
  // A (5)
  '青木', '秋山', '天野', '荒木', '安藤',
  // I (5)
  '石川', '和泉', '市川', '岩崎', '五十岚',
  // U (5)
  '上田', '植木', '臼井', '梅田', '上原',
  // E (4)
  '江口', '榎本', '远藤', '大西',
  // O (10)
  '大桥', '冈田', '尾形', '小川', '大冢',
  '大久保', '小野寺', '绪方', '大石', '长谷川',
  // K (20)
  '片山', '金泽', '�的崎', '�的崎', '木�的',
  '久保', '黑田', '黑崎', '�的崎', '�的崎',
  '三�的', '武田', '田�的', '�的崎', '�的崎',
  '中野', '永�的', '西�的', '沼�的', '野�的',
  // S (20)
  '�的崎', '�的崎', '橋�的', '平�的', '�的崎',
  '福�的', '�的崎', '�的崎', '�的崎', '�的崎',
  '�的崎', '�的崎', '�的崎', '�的崎', '�的崎',
  '�的崎', '�的崎', '�的崎', '�的崎', '�的崎',
];

// Hmm, still garbled. Let me just define them properly with the actual characters
console.log('Testing surname list integrity...');

(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RussianMapLabels = factory();
})(globalThis, function () {
  const foreignSpellings = ['і', 'ї', 'є', 'ґ', 'вулиця', 'провулок', 'узвіз', 'водосховище'];

  function readRussianLabel(value) {
    if (typeof value !== 'string') return '';
    const text = value.trim();
    const lower = text.toLowerCase();
    return foreignSpellings.some(spelling => lower.includes(spelling)) ? '' : text;
  }

  function usesName(field) {
    if (typeof field === 'string') return /\{name(?:[:_][^}]+)?\}/.test(field);
    return Array.isArray(field) && (
      ((field[0] === 'get' || field[0] === 'has') && /^name(?:$|[:_])/.test(field[1])) ||
      field.some(usesName)
    );
  }

  function textField() {
    return ['let', 'russianName', ['to-string', ['coalesce', ['get', 'name:ru'], '']],
      ['case', ['any', ...foreignSpellings.map(spelling => ['in', spelling, ['downcase', ['var', 'russianName']]])],
        '', ['var', 'russianName']]];
  }

  return { readRussianLabel, usesName, textField };
});

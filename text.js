(function (root) {
  const COPY = typeof module !== 'undefined' && module.exports ? require('./copy.js') : root.TeamMakerCopy;
  const PLACEHOLDER = /\{(\w+)(?::([^|}]*)\|([^}]*))?\}/g;
  const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const raw = (key) => (key in COPY ? COPY[key] : key);

  function fill(template, vars, escapeValues) {
    return template.replace(PLACEHOLDER, (whole, name, one, many) => {
      if (!vars || !(name in vars)) return whole;
      if (one !== undefined) return Number(vars[name]) === 1 ? one : many;
      return escapeValues ? escapeHtml(vars[name]) : String(vars[name]);
    });
  }

  const api = {
    COPY,
    t: (key, vars) => fill(escapeHtml(raw(key)).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>'), vars, true),
    plain: (key, vars) => fill(raw(key).replace(/\*\*(.+?)\*\*/g, '$1'), vars, false),
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TeamMakerText = api;
})(typeof window !== 'undefined' ? window : globalThis);

// Small color-coded label. `value` selects a class via `classMap`; falls back
// to `chip-neutral` when there's no match (or to `fallback` text when value
// is missing).
export const Chip = ({ value, classMap, fallback = 'Not rated' }) => {
  const display = value || fallback;
  const variant = classMap[display] || 'chip-neutral';
  return <span className={`chip ${variant}`}>{display}</span>;
};

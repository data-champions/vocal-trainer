import React from 'react';

const NoteGlyph: React.FC<{ size?: number }> = ({ size = 28 }) => (
  <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden>
    <ellipse cx="12" cy="22" rx="8" ry="6" fill="#0b1221" stroke="#0b1221" strokeWidth="2" />
    <rect x="18" y="6" width="2.5" height="16" fill="#0b1221" />
  </svg>
);

export default NoteGlyph;

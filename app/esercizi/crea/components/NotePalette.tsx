import React from 'react';
import NoteGlyph from './NoteGlyph';

const NotePalette: React.FC = () => {
  return (
    <div className="palette">
      <h3>Quarter Note</h3>
      <p className="meta">Drag to place on the staff</p>
      <div className="note-token" data-length="1">
        <NoteGlyph size={26} />
        <div>
          <strong>Quarter</strong>
          <div className="meta">duration: 1 beat</div>
        </div>
      </div>
    </div>
  );
};

export default NotePalette;

'use client';

import type { NotationMode, VocalRangeKey } from '../../lib/constants';
import { VOCAL_RANGES } from '../../lib/constants';
import { formatNoteByNotation } from '../../lib/notes';

type RangeSelectorProps = {
  vocalRange: VocalRangeKey;
  onChange: (range: VocalRangeKey) => void;
  notationMode: NotationMode;
};

export function RangeSelector({
  vocalRange,
  onChange,
  notationMode,
}: RangeSelectorProps): JSX.Element {
  return (
    <label
      className="stacked-label"
      htmlFor="vocal-range-select"
      style={{ marginTop: '12px' }}
    >
      Estensione vocale
      <select
        id="vocal-range-select"
        value={vocalRange}
        onChange={(event) => onChange(event.target.value as VocalRangeKey)}
      >
        {(Object.keys(VOCAL_RANGES) as VocalRangeKey[]).map((rangeKey) => {
          const range = VOCAL_RANGES[rangeKey];
          const minLabel = formatNoteByNotation(range.min, notationMode);
          const maxLabel = formatNoteByNotation(range.max, notationMode);
          return (
            <option key={rangeKey} value={rangeKey}>
              {`${range.label} (${minLabel}–${maxLabel})`}
            </option>
          );
        })}
      </select>
    </label>
  );
}

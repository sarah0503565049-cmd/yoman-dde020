
import { addDays, diffDays, dow } from './time.js';

export function blockOccursOn(block, ymd) {
  if (diffDays(block.date, ymd) < 0) return false;
  if (block.until && diffDays(ymd, block.until) < 0) return false;
  if (block.exceptions && block.exceptions.includes(ymd)) return false;
  if (block.repeat === 'daily') return true;
  if (block.repeat === 'weekly') return dow(block.date) === dow(ymd);
  return block.date === ymd;
}

export function expandBlocks(blocks, fromYmd, toYmd) {
  const out = [];
  const days = diffDays(fromYmd, toYmd);
  for (let i = 0; i <= days; i++) {
    const day = addDays(fromYmd, i);
    for (const b of blocks) {
      if (blockOccursOn(b, day)) {
        out.push({
          blockId: b.id,
          date: day,
          startMin: b.startMin,
          durationMin: b.durationMin,
          title: b.title,
          repeat: b.repeat || 'none',
          allDay: !!b.allDay,
        });
      }
    }
  }
  return out;
}

export const REPEAT_LABELS = {
  none: 'חד-פעמי',
  daily: 'כל יום',
  weekly: 'כל שבוע',
};

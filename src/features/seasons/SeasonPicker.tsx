import { Select } from '@/components/ui/field';
import { SEASON_STATUS_LABELS } from '@/domain/types';
import { useGroup } from '@/features/group/GroupProvider';

/** Selector de temporada (solo aparece si hay más de una). */
export function SeasonPicker({ className }: { className?: string }) {
  const { seasons, season, setSeasonId } = useGroup();
  if (seasons.length < 2 || !season) return null;
  return (
    <label className={className}>
      <span className="sr-only">Temporada</span>
      <Select value={season.id} onChange={(e) => setSeasonId(e.target.value)} className="h-9 w-auto rounded-lg py-0 text-sm">
        {seasons.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name} ({SEASON_STATUS_LABELS[s.status].toLowerCase()})
          </option>
        ))}
      </Select>
    </label>
  );
}

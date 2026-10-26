import { CalendarRange } from 'lucide-react';
import { Link } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/misc';
import { useGroup } from '@/features/group/GroupProvider';

export function NoSeasonState() {
  const { isAdmin, seasonsLoading } = useGroup();
  if (seasonsLoading) return null;
  return (
    <Card>
      <EmptyState
        icon={CalendarRange}
        title="No hay ninguna temporada"
        description={
          isAdmin
            ? 'Crea la temporada con sus fechas y reglas para empezar a registrar partidos y entrenamientos.'
            : 'Un administrador del grupo debe crear la temporada antes de empezar.'
        }
        action={
          isAdmin ? (
            <Button asChild>
              <Link to="/temporada">Crear temporada</Link>
            </Button>
          ) : undefined
        }
      />
    </Card>
  );
}

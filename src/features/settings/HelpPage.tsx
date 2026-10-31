import type { ReactNode } from 'react';
import { PageHeader } from '@/components/layout/PageHeader';
import { Card } from '@/components/ui/card';
import { InstallInstructions } from '@/features/pwa/InstallInstructions';

function Section({ title, children, id }: { title: string; children: ReactNode; id?: string }) {
  return (
    <Card className="p-5 sm:p-6" id={id}>
      <h2 className="mb-3 text-lg font-semibold tracking-tight">{title}</h2>
      <div className="space-y-3 text-sm leading-relaxed text-muted [&_strong]:text-fg">{children}</div>
    </Card>
  );
}

export function HelpPage() {
  return (
    <>
      <PageHeader title="Ayuda" subtitle="Cómo funciona el reto, instalación y privacidad." />
      <div className="space-y-5">
        <Section title="Cómo funciona el reto">
          <p>
            Cada árbitro registra el resultado y las tarjetas de su <strong>primer partido designado del fin de semana</strong>. Objetivo ={' '}
            <strong>goles de ambos equipos + amarillas × 1 + azules × 2 + rojas × 5</strong>. Ejemplo: 13-1 con 2 amarillas, 1 azul y 1 roja = 23 km.
          </p>
          <p>
            Los km que corres pagan primero tus <strong>deudas de semanas anteriores</strong> y después el objetivo de la semana. Si te sobran km
            cuando ya no debes nada, <strong>se pierden para la competición</strong>: no se guardan para semanas futuras, aunque sí cuentan en tus
            estadísticas.
          </p>
          <p>
            <strong>Semanas:</strong> van del <strong>sábado a las 9:00 al sábado siguiente a las 8:59</strong>. El objetivo del partido del fin de
            semana empieza a contar ese sábado a las 9:00 y lo que corras desde entonces lo va pagando. Lo corrido antes no cuenta para ese objetivo.
          </p>
          <p>
            <strong>Cumplimiento</strong> = km válidos ÷ objetivos de las semanas ya iniciadas, con un máximo del 100 %. La clasificación usa este
            porcentaje, nunca los km totales corridos.
          </p>
          <p>
            <strong>Ritmo medio</strong> = tiempo total ÷ distancia total (solo entrenamientos con duración). <strong>Mejor ritmo</strong>: actividad de
            al menos 1 km.
          </p>
        </Section>

        <Section title="Correcciones">
          <p>
            Puedes editar o eliminar tus entrenamientos mientras la temporada esté abierta. Tu propio partido puedes corregirlo durante 30 minutos;
            después, lo corrige un administrador indicando el motivo. Todo cambio queda en <strong>Historial → Cambios</strong>.
          </p>
          <p>Si registras un entrenamiento con la misma fecha, distancia y duración que otro, la app te avisará antes de guardarlo.</p>
        </Section>

        <Section title="Capturas y reconocimiento (OCR)">
          <p>
            REFRUN lee capturas de <strong>Strava</strong>, <strong>Apple Fitness</strong> y <strong>consolas de gimnasio</strong>. El reconocimiento
            se ejecuta en tu dispositivo con Tesseract.js: la imagen <strong>no se sube ni se guarda</strong>; solo se envían los valores que confirmes.
          </p>
          <p>Consejos: usa capturas de pantalla (no fotos de la pantalla), sin recortar las etiquetas, y evita reflejos en las fotos de máquinas.</p>
          <p>
            Límites conocidos: puede fallar con imágenes borrosas, muy pequeñas, con fuentes decorativas o pantallas LCD de siete segmentos. Los campos
            dudosos se marcan como «Revisar» y los no detectados quedan vacíos para que los completes. Siempre puedes introducir los datos a mano.
          </p>
        </Section>

        <Section title="Instalar en el móvil" id="instalar">
          <InstallInstructions />
        </Section>

        <Section title="Notificaciones">
          <p>
            REFRUN puede recordarte que registres el partido del fin de semana y avisarte de los km que te faltan. Solo se pide permiso cuando pulsas
            «Activar notificaciones» y puedes cambiar días, hora y tipos de aviso en <strong>Ajustes → Notificaciones</strong>. En iPhone necesitas
            iOS 16.4 o posterior y abrir REFRUN desde la pantalla de inicio.
          </p>
        </Section>

        <Section title="Sin conexión">
          <p>
            Si pierdes la conexión puedes consultar lo que ya estaba cargado. Los cambios no se guardan sin conexión: los formularios de partido y de
            registro manual conservan lo que hayas escrito en este dispositivo hasta que vuelvas a tener red.
          </p>
        </Section>

        <Section title="Privacidad">
          <p>
            Los datos se guardan en la base de datos del grupo (Supabase) y solo los ven los miembros activos de tu grupo. No hay analítica de terceros.
            En este dispositivo solo se guardan preferencias de interfaz (tema, aviso de instalación) y borradores de formularios sin enviar.
          </p>
        </Section>
      </div>
    </>
  );
}

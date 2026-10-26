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
            Cada árbitro registra el resultado de su <strong>primer partido designado del fin de semana</strong>. La suma de goles de ambos equipos se
            convierte en kilómetros: un 13-1 son 14 km; un 4-7, 11 km. Por defecto <strong>todo se acumula durante la temporada</strong>: cada partido
            suma a tu objetivo total y cada carrera suma a tus km hechos. Al final se ve cuántos km tocaba hacer, cuántos se han hecho y qué porcentaje.
          </p>
          <p>
            Los entrenamientos confirmados se descuentan del objetivo. <strong>Pendientes = objetivo − corridos</strong> (nunca negativo).{' '}
            <strong>Cumplimiento semanal = corridos ÷ objetivo</strong>, y puede superar el 100 %.
          </p>
          <p>
            <strong>Semanas:</strong> de lunes a domingo en la zona horaria de la temporada. Por defecto, un partido cuenta para la semana{' '}
            <strong>siguiente</strong> (el partido del sábado 24 genera el objetivo del lunes 26 al domingo 1). Al registrarlo puedes elegir la semana del
            propio partido si el grupo lo acuerda así.
          </p>
          <p>
            <strong>Cumplimiento de temporada</strong> (metodología «acumulado», la predeterminada) = km hechos ÷ objetivo acumulado. Los km de más de
            una semana cuentan para el total. Existen dos metodologías alternativas («semanas independientes» y «compensación de semanas anteriores»)
            que el administrador puede elegir; cada cambio queda registrado.
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

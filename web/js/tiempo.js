// Fechas y horas siempre en la hora de Bogotá, sin importar la zona del celular.
const ZONA = 'America/Bogota';

export const fechaBogota = (d = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: ZONA }).format(d);

export const horaBogota = (d = new Date()) =>
  new Intl.DateTimeFormat('en-GB', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(d);

// '16:30' -> '4:30 p. m.'
export function horaLegible(hhmm) {
  if (!hhmm) return '';
  const [h, m] = hhmm.split(':').map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}

// '2026-10-01' -> '1 de octubre de 2026'
export function fechaLegible(iso) {
  const [a, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('es-CO', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(Date.UTC(a, m - 1, d)));
}

export const diaSemana = iso => {
  const [a, m, d] = iso.split('-').map(Number);
  return new Intl.DateTimeFormat('es-CO', { weekday: 'long', timeZone: 'UTC' }).format(new Date(Date.UTC(a, m - 1, d)));
};

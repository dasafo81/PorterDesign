// api/register.js
// Samodzielna rejestracja jest WYLACZONA. Konta testowe zaklada recznie administrator
// (panel Admin -> Nowy tenant / Nowy uzytkownik) po akceptacji zgloszenia z formularza
// (register.html / landing.html -> api/lead.js), w ktorym wymagana jest strona WWW lub Instagram.
// Endpoint zostaje, zeby stare linki/klienty dostaly czytelna odpowiedz zamiast 404.

export const config = { runtime: 'edge' };

export default async function handler(req) {
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  return new Response(
    JSON.stringify({ error: 'Samodzielna rejestracja jest wyłączona. Wyślij zgłoszenie na stronie mydecolab.pl/register — odezwiemy się z dostępem testowym.' }),
    { status: 403, headers }
  );
}

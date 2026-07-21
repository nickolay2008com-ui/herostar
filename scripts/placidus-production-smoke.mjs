const base = 'https://herostar.up.railway.app';

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function houseWidths(cusps) {
  return cusps.map((cusp, index) => {
    const next = cusps[(index + 1) % cusps.length];
    return ((next.longitude - cusp.longitude) % 360 + 360) % 360;
  });
}

const health = await fetch(`${base}/health`);
assert(health.ok, `health failed: ${health.status}`);

const [appResponse, cssResponse] = await Promise.all([
  fetch(`${base}/app.js`),
  fetch(`${base}/placidus.css`),
]);
assert(appResponse.ok, `app.js failed: ${appResponse.status}`);
assert(cssResponse.ok, `placidus.css failed: ${cssResponse.status}`);
const appText = await appResponse.text();
const cssText = await cssResponse.text();
assert(appText.includes("CURRENT_CHART_VERSION = '0.2-placidus'"), 'production app does not require Placidus version');
assert(appText.includes('house-axis'), 'production app does not render house axes');
assert(cssText.includes('.wheel .house-axis'), 'production Placidus styles are missing');

const response = await fetch(`${base}/api/charts`, {
  method: 'POST',
  headers: { 'content-type': 'application/json' },
  body: JSON.stringify({ demo: true }),
});
const payload = await response.json();
assert(response.status === 201, `demo chart failed: ${response.status} ${JSON.stringify(payload)}`);
assert(payload.chart?.version === '0.2-placidus', `wrong chart version: ${payload.chart?.version}`);
assert(payload.chart?.system === 'Система домов Плацидуса', `wrong system: ${payload.chart?.system}`);
assert(payload.chart?.houses?.key === 'placidus', 'houses key is not placidus');
assert(payload.chart?.houses?.cusps?.length === 12, 'expected twelve Placidus cusps');
assert(payload.chart.houses.cusps.every((cusp, index) => cusp.house === index + 1 && Number.isFinite(cusp.longitude)), 'invalid cusp payload');
const widths = houseWidths(payload.chart.houses.cusps);
assert(widths.every((width) => width > 0 && width < 180), `invalid house widths: ${widths.join(', ')}`);
assert(widths.some((width) => Math.abs(width - 30) > 0.5), `houses still look equal: ${widths.join(', ')}`);
assert(payload.chart.planets.every((planet) => Number.isInteger(planet.house) && planet.house >= 1 && planet.house <= 12), 'planet houses are invalid');
assert(payload.chart.angles?.ascendant && payload.chart.angles?.mc, 'ASC or MC missing');
assert(payload.portrait?.cards?.length === 11, 'portrait contract changed');

console.log(JSON.stringify({
  ok: true,
  version: payload.chart.version,
  system: payload.chart.system,
  cusps: payload.chart.houses.cusps.map((cusp) => Number(cusp.longitude.toFixed(4))),
  widths: widths.map((width) => Number(width.toFixed(4))),
  planetHouses: Object.fromEntries(payload.chart.planets.map((planet) => [planet.key, planet.house])),
}, null, 2));

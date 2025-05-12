/* script.js */
const map = new maplibregl.Map({
  container: 'map',
  style: {
    version: 8,
    sources: {
      base: {
        type: 'raster',
        tiles: [
          'https://a.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
          'https://b.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png',
          'https://c.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png'
        ],
        tileSize: 256,
        attribution: '© OpenStreetMap contributors, © CARTO'
      },
      property_tiles: {
        type: 'vector',
        tiles: [
          'https://storage.googleapis.com/musa5090s25-team3-public/tiles/properties/{z}/{x}/{y}.pbf'
        ]
      }
    },
    layers: [
      { id: 'osm-base', type: 'raster', source: 'base' },
      {
        id: 'property-fill',
        type: 'fill',
        source: 'property_tiles',
        'source-layer': 'property_tile_info',
        paint: {
          'fill-color': [
            'step',
            ['get', 'current_assessed_value'],
            '#003366',
            100000, '#0f4d90',
            250000, '#2176d2',
            500000, '#96c9ff',
            750000, '#25cef7',
            1000000, '#DAEDFE'
          ],
          'fill-opacity': 0.75
        }
      }
    ]
  },
  center: [-75.1652, 39.9526],
  zoom: 11
});

/* ---------- search ---------- */
const searchInput = document.getElementById('search-input');
const searchBtn = document.getElementById('search-btn');
let searchMarker = null;

async function geocode(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(
    query
  )}`;
  const res = await fetch(url, { headers: { 'Accept-Language': 'en' } });
  if (!res.ok) return null;
  const json = await res.json();
  return json[0] || null;
}

async function doSearch() {
  const q = searchInput.value.trim();
  if (!q) return;
  const result = await geocode(q);
  if (!result) {
    alert('Location not found');
    return;
  }
  const lat = parseFloat(result.lat);
  const lon = parseFloat(result.lon);
  map.flyTo({ center: [lon, lat], zoom: 16 });
  if (searchMarker) {
    searchMarker.setLngLat([lon, lat]);
  } else {
    searchMarker = new maplibregl.Marker({ color: '#d00' })
      .setLngLat([lon, lat])
      .addTo(map);
  }
}

searchBtn.addEventListener('click', doSearch);
searchInput.addEventListener('keydown', e => {
  if (e.key === 'Enter') {
    doSearch();
  }
});

/* ---------- field selection ---------- */
const fieldCheckboxes = document.querySelectorAll('#field-panel input[type="checkbox"]');
function getSelectedFields() {
  return Array.from(fieldCheckboxes)
    .filter(cb => cb.checked)
    .map(cb => cb.dataset.field);
}

/* ---------- popup ---------- */
map.on('click', 'property-fill', e => {
  const p = e.features[0].properties;
  const current = +p.current_assessed_value;
  const prev = +p.tax_year_assessed_value;
  const deltaDollar = current - prev;
  const deltaPct = prev !== 0 ? (deltaDollar / prev) * 100 : 0;

  const selected = getSelectedFields();
  const lines = [];

  if (selected.includes('address')) {
    lines.push(`<strong>${p.address}</strong>`);
  }
  if (selected.includes('current')) {
    lines.push(`<em>Current Assessment ($):</em> $${current.toLocaleString()}`);
  }
  if (selected.includes('prev')) {
    lines.push(`<em>Tax Year 2024 Assessment ($):</em> $${prev.toLocaleString()}`);
  }
  if (selected.includes('deltaDollar')) {
    lines.push(`<em>Change ($):</em> $${deltaDollar.toLocaleString()}`);
  }
  if (selected.includes('deltaPct')) {
    lines.push(`<em>Change (%):</em> ${deltaPct.toFixed(1)}%`);
  }

  const popupHTML = `<div class="popup-content">${lines.join('<br>')}</div>`;

  new maplibregl.Popup()
    .setLngLat(e.lngLat)
    .setHTML(popupHTML)
    .addTo(map);
});

map.on('mouseenter', 'property-fill', () => (map.getCanvas().style.cursor = 'pointer'));
map.on('mouseleave', 'property-fill', () => (map.getCanvas().style.cursor = ''));

/* ---------- SUMMARY ---------- */
document.getElementById('summary-text').innerHTML =
  '<p>There were <strong>350,626</strong> properties that increased in assessed value since the last mass appraisal. ' +
  'Overall, each property assessment changed by an <strong>increase of 23.6%</strong> on average.</p>';

/* ---------- DENSITY PLOT UTILITIES ---------- */
function getDensitySeries(bins, maxVal) {
  const adjusted = bins
    .map(b => {
      const lower = b.lower_bound;
      const upper = Math.min(b.upper_bound, maxVal);
      const fullWidth = b.upper_bound - b.lower_bound;
      const width = upper - lower;
      if (width <= 0) return null;
      const count = b.property_count * (width / fullWidth);
      return { lower, upper, count };
    })
    .filter(Boolean);

  const total = d3.sum(adjusted, d => d.count);

  return adjusted.flatMap(b => {
    const density = (b.count / total) / (b.upper - b.lower);
    return [
      { value: b.lower, density },
      { value: b.upper, density }
    ];
  });
}

function renderDensityPlot(container, series, maxVal, title) {
  const margin = { top: 25, right: 20, bottom: 55, left: 60 };
  const outerW = 450;
  const outerH = 200;
  const w = outerW - margin.left - margin.right;
  const h = outerH - margin.top - margin.bottom;

  d3.select(container).select('svg').remove();

  const svg = d3
    .select(container)
    .append('svg')
    .attr('width', outerW)
    .attr('height', outerH)
    .append('g')
    .attr('transform', `translate(${margin.left},${margin.top})`);

  const x = d3.scaleLinear().domain([0, maxVal]).nice().range([0, w]);
  const y = d3
    .scaleLinear()
    .domain([0, d3.max(series, d => d.density)])
    .nice()
    .range([h, 0]);

  svg
    .append('g')
    .attr('class', 'grid')
    .selectAll('line')
    .data(x.ticks(10))
    .enter()
    .append('line')
    .attr('x1', d => x(d))
    .attr('x2', d => x(d))
    .attr('y1', 0)
    .attr('y2', h)
    .attr('stroke', 'rgba(0,0,0,0.15)')
    .attr('stroke-width', 1);

  svg
    .append('g')
    .attr('transform', `translate(0,${h})`)
    .call(d3.axisBottom(x).tickFormat(d3.format('$~s')))
    .selectAll('text')
    .style('font-size', '0.5625rem');

  const yAxis = svg.append('g').call(d3.axisLeft(y).ticks(5));
  yAxis.selectAll('text').remove();

  const area = d3
    .area()
    .x(d => x(d.value))
    .y0(h)
    .y1(d => y(d.density))
    .curve(d3.curveBasis);

  svg
    .append('path')
    .datum(series)
    .attr('fill', '#003366')
    .attr('fill-opacity', 0.25)
    .attr('stroke', '#003366')
    .attr('stroke-width', 2)
    .attr('d', area);

  svg
    .append('text')
    .attr('x', 0)
    .attr('y', -10)
    .attr('font-size', '0.625rem')
    .attr('fill', '#222')
    .text(title);

  svg
    .append('text')
    .attr('x', w / 2)
    .attr('y', h + 35)
    .attr('text-anchor', 'middle')
    .attr('font-size', '0.625rem')
    .text('Assessed Value');

  svg
    .append('text')
    .attr('transform', 'rotate(-90)')
    .attr('x', -h / 2)
    .attr('y', -margin.left + 30)
    .attr('text-anchor', 'middle')
    .attr('font-size', '0.625rem')
    .text('Properties');
}

/* ---------- TAX-YEAR DENSITY CHART ---------- */
const taxYearUrl =
  'https://storage.googleapis.com/musa5090s25-team3-public/configs/tax_year_assessment_bins.json';

let taxYearData = {};
const MAX_X_DEFAULT = 1_000_000;

function initTaxYear() {
  fetch(taxYearUrl)
    .then(r => r.json())
    .then(json => {
      taxYearData = json;
      const years = Object.keys(json).sort();
      const sel = document.getElementById('tax-year-select');
      years.forEach(y => {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        sel.appendChild(opt);
      });
      const latest = years.at(-1);
      sel.value = latest;
      sel.addEventListener('change', () => drawTaxYear(sel.value));
      drawTaxYear(latest);
    });
}

function drawTaxYear(year) {
  const raw = taxYearData[year] || [];
  const series = getDensitySeries(raw, MAX_X_DEFAULT);
  renderDensityPlot('#chart-tax-year', series, MAX_X_DEFAULT, `Assessment Value Density (${year})`);
}

initTaxYear();

/* ---------- PREDICTED DENSITY CHART ---------- */
const predictedUrl =
  'https://storage.googleapis.com/musa5090s25-team3-public/configs/predicted_value_summary_nested.json';

let predictedData = {};

function initPredicted() {
  fetch(predictedUrl)
    .then(r => r.json())
    .then(json => {
      if (Array.isArray(json.predicted)) {
        predictedData['Predicted'] = json.predicted;
      } else {
        Object.keys(json).forEach(y => {
          const arr = json[y].predicted ?? json[y];
          predictedData[y] = arr;
        });
      }

      let years = Object.keys(predictedData).filter(y => y !== '2025').sort();

      const sel = document.getElementById('pred-year-select');
      years.forEach(y => {
        const opt = document.createElement('option');
        opt.value = y;
        opt.textContent = y;
        sel.appendChild(opt);
      });

      const latest = years.at(-1);
      sel.value = latest;
      sel.addEventListener('change', () => drawPredicted(sel.value));
      drawPredicted(latest);
    });
}

function drawPredicted(year) {
  const raw = predictedData[year] || [];
  const series = getDensitySeries(raw, MAX_X_DEFAULT);
  renderDensityPlot(
    '#chart-current',
    series,
    MAX_X_DEFAULT,
    `Predicted Assessment Value Density (${year})`
  );
}

initPredicted();

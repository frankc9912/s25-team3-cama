// search.js

async function fetchValuations(parcelId) {
  const url = `https://us-east4-musa5090s25-team3.cloudfunctions.net/parcelLookup?parcel_number=${parcelId}`;
  const res = await fetch(url);
  if (res.status === 404) {
    alert(`No data for parcel ${parcelId}`);
    return [];
  }
  if (!res.ok) {
    alert(`Error: ${res.statusText}`);
    return [];
  }
  return res.json();  // [{ parcel_number, year, market_value, …, type }, …]
}

function clearResults() {
  document.querySelector('.chart-container').innerHTML =
    '<canvas id="valuationChart"></canvas>';
  document.getElementById('property-info-table').innerHTML = '';
}

async function handleSearch() {
  const parcelId = document.getElementById('parcel-number').value.trim();
  if (!parcelId) {
    alert('Please enter a parcel number.');
    return;
  }

  clearResults();
  const loading = document.createElement('div');
  loading.className = 'loading';
  loading.textContent = 'Loading data…';
  document.querySelector('.chart-container').appendChild(loading);

  try {
    // 1) fetch raw data
    const raw = await fetchValuations(parcelId);
    if (raw.length === 0) {
      clearResults();
      return;
    }

    // 2) coerce all numeric fields to integers
    const series = raw.map(r => ({
      ...r,
      year:             parseInt(r.year, 10),
      market_value:     Math.round(r.market_value),
      taxable_land:     r.taxable_land   != null ? Math.round(r.taxable_land)   : null,
      taxable_building: r.taxable_building != null ? Math.round(r.taxable_building) : null,
      exempt_land:      r.exempt_land    != null ? Math.round(r.exempt_land)    : null,
      exempt_building:  r.exempt_building  != null ? Math.round(r.exempt_building)  : null,
    }));

    // 3) split into historical vs predicted
    const historical = series.filter(d => d.type === 'actual');
    const predicted  = series.filter(d => d.type === 'predicted');

    // 4) sort both arrays by year
    historical.sort((a, b) => a.year - b.year);
    predicted.sort((a, b) => a.year - b.year);

    // 5) prepare data for the chart (bridge the gap)
    const chartActual = historical.slice();
    if (predicted.length > 0) {
      const firstPredYear  = predicted[0].year;
      const firstPredValue = predicted[0].market_value;
      if (!chartActual.some(d => d.year === firstPredYear)) {
        chartActual.push({ year: firstPredYear, market_value: firstPredValue });
        chartActual.sort((a, b) => a.year - b.year);
      }
    }

    // 6) render chart (with bridged actual + predicted) and table (historical only)
    renderChart(chartActual, predicted);
    renderTable(historical);

  } catch (err) {
    alert('Error: ' + err.message);
  } finally {
    loading.remove();
  }
}

// wire up event listeners
document.getElementById('search-button')
        .addEventListener('click', handleSearch);
document.getElementById('parcel-number')
        .addEventListener('keyup', e => e.key === 'Enter' && handleSearch());

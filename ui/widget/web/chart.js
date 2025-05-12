// chart.js

function renderChart(actual, predicted) {
  const ctx = document.getElementById("valuationChart").getContext("2d");

  // All years in both series
  const years = Array.from(
    new Set(actual.concat(predicted).map(d => d.year))
  ).sort((a, b) => a - b);

  // Build the two datasets
  const actualData    = years.map(y => {
    const r = actual.find(d => d.year === y);
    return r ? r.market_value : null;
  });
  const predictedData = years.map(y => {
    const r = predicted.find(d => d.year === y);
    return r ? r.market_value : null;
  });

  // First predicted year for tooltip filtering
  const firstPredYear = predicted.length ? String(predicted[0].year) : null;

  if (window.myChart) window.myChart.destroy();

  window.myChart = new Chart(ctx, {
    type: 'line',
    data: {
      labels: years,
      datasets: [
        {
          label: 'Actual Assessment',
          data: actualData,
          borderColor: '#004080',
          fill: false
        },
        {
          label: 'Predicted Value',
          data: predictedData,
          borderDash: [5,5],
          borderColor: '#ff9800',
          fill: false
        }
      ]
    },
    options: {
      responsive: true,
      scales: {
        x: { title: { display: true, text: 'Year' } },
        y: { title: { display: true, text: 'Value ($)' } }
      },
      plugins: {
        tooltip: {
          filter: (tooltipItem) => {
            // tooltipItem.label is the year as string
            if (
              tooltipItem.dataset.label === 'Actual Assessment' &&
              tooltipItem.label === firstPredYear
            ) {
              return false;   // hide the Actual entry at that year
            }
            return true;
          }
        }
      }
    }
  });
}

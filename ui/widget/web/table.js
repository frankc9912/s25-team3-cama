// table.js

function renderTable(data) {
  const container = document.getElementById("property-info-table");
  if (!data.length) {
    container.innerHTML = '';
    return;
  }

  let html = `
    <table class="info-message">
      <thead>
        <tr>
          <th>Year</th>
          <th>Market Value</th>
          <th>Taxable Land</th>
          <th>Taxable Building</th>
          <th>Exempt Land</th>
          <th>Exempt Building</th>
        </tr>
      </thead>
      <tbody>
  `;

  data.forEach(row => {
    html += `<tr>
      <td>${row.year}</td>
      <td>$${row.market_value?.toLocaleString() ?? '—'}</td>
      <td>$${row.taxable_land?.toLocaleString() ?? '—'}</td>
      <td>$${row.taxable_building?.toLocaleString() ?? '—'}</td>
      <td>$${row.exempt_land?.toLocaleString() ?? '—'}</td>
      <td>$${row.exempt_building?.toLocaleString() ?? '—'}</td>
    </tr>`;
  });

  html += `
      </tbody>
    </table>
  `;
  container.innerHTML = html;
}
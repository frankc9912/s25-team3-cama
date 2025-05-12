// index.js

const express = require('express');
const cors    = require('cors');
const fetch   = require('node-fetch');

const app = express();
app.use(cors());

// Metadata server URL for the function's service account token
const METADATA_TOKEN_URL =
  'http://metadata.google.internal/computeMetadata/v1/' +
  'instance/service-accounts/default/token';
// BigQuery REST endpoint prefix
const BIGQUERY_API_URL = 'https://bigquery.googleapis.com/bigquery/v2/projects';
// Your GCP project, injected at deploy time
const project = process.env.BQ_PROJECT;

// Fetch an OAuth2 access token from the metadata server
async function getAccessToken() {
  const resp = await fetch(METADATA_TOKEN_URL, {
    headers: { 'Metadata-Flavor': 'Google' }
  });
  const { access_token } = await resp.json();
  return access_token;
}

// Our parameterized CTE against the _partitioned_ tables
const SQL = `
DECLARE pid INT64 DEFAULT @parcel;
WITH hist AS (
  SELECT
    parcel_number,
    year,
    market_value,
    taxable_land,
    taxable_building,
    exempt_land,
    exempt_building
  FROM \`${project}.core.opa_assessments_partitioned\`
  WHERE
    parcel_number = pid
    AND year <> 2025    -- drop any 2025 historical row
),
pred AS (
  SELECT
    parcel_number,
    prediction_year      AS year,
    CEIL(predicted_value) AS market_value,  -- round up
    NULL                 AS taxable_land,
    NULL                 AS taxable_building,
    NULL                 AS exempt_land,
    NULL                 AS exempt_building
  FROM \`${project}.core.predicted_value_partitioned\`
  WHERE parcel_number = pid
)
-- use single quotes for string literals here!
SELECT *, 'actual'    AS type FROM hist
UNION ALL
SELECT *, 'predicted' AS type FROM pred
ORDER BY year, type;
`;

// Handle GET /?parcel_number=...
app.get('/', async (req, res) => {
  const parcel = Number(req.query.parcel_number);
  if (isNaN(parcel)) {
    return res.status(400).send('Invalid or missing parcel_number');
  }

  try {
    // 1) Grab an access token
    const token = await getAccessToken();

    // 2) Call BigQuery REST API with named parameter
    const url = `${BIGQUERY_API_URL}/${project}/queries`;
    const body = {
      query: SQL,
      useLegacySql: false,
      parameterMode: 'NAMED',
      queryParameters: [{
        name: 'parcel',
        parameterType: { type: 'INT64' },
        parameterValue: { value: parcel.toString() }
      }]
    };
    const bqRes = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type':  'application/json'
      },
      body: JSON.stringify(body)
    });
    const result = await bqRes.json();

    // 3) Error / empty handling
    if (result.error) {
      console.error(result.error);
      return res.status(500).send(result.error.message);
    }
    if (!result.rows || result.rows.length === 0) {
      return res.status(404).json({ message: `No data for parcel ${parcel}` });
    }

    // 4) Transform BigQuery rows into JS objects
    const fields = result.schema.fields;
    const data = result.rows.map(r => {
      const vals = r.f.map(c => c.v);
      const obj = {};
      fields.forEach((fld, i) => {
        let v = vals[i];
        if (fld.type === 'INT64' || fld.type === 'FLOAT64') v = Number(v);
        obj[fld.name] = v;
      });
      return obj;
    });

    // 5) Return JSON
    res.json(data);

  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  }
});

// Export the Express app as the Cloud Function "parcelLookup"
exports.parcelLookup = app;

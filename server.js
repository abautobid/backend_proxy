require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');

const app = express(); // Define app here

// Read from environment variables
const PORT = process.env.PORT || 3000;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const GRANT_TYPE = process.env.GRANT_TYPE;

// Enable CORS for your Angular app (http://localhost:4200)
app.use(cors({
  origin: 'http://localhost:4200'
}));

// Middleware to parse JSON bodies
app.use(express.json());

// Node.js (Express) route example
app.get('/api/generate-token', async (req, res) => {
  const response = await fetch('https://api.click-ins.com/oauth/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      client_secret: process.env.CLICKINS_API_KEY,
      grant_type: 'client_credentials',
      // Optional: callback_headers.additional_parameters, etc.
    }),
  });

  const data = await response.json();
  res.json({ token: data.access_token });
});


// New endpoint for creating an inspection case
app.post('/api/create-inspection', async (req, res) => {
  try {
    // Extract fields using the correct keys from the request body.
    const { client_token, client_process_id, inspection_type } = req.body;
    if (!client_token || client_process_id === undefined) {
      return res.status(400).json({ error: 'Missing required parameters: client_token or client_process_id' });
    }
    
    // Build the Click-Ins API URL.
    const url = `https://api.click-ins.com/rest/v2/inspections?upload_type=MEDIA`;
    
    // Set up headers. Use the client_token in the Authorization header.
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${client_token}`
    };

    // Construct the request body with minimal payload.
    const body = {
      client_token: client_token,
      inspection_type: inspection_type || 'FULL_INSPECTION',
      client_process_id: client_process_id
    };

    const response = await axios.post(url, body, { headers });
    res.json(response.data);
  } catch (error) {
    if (error.response) {
      console.error('Error creating inspection:', error.response.data);
      return res.status(error.response.status).json({ error: error.response.data });
    } else {
      console.error('Error creating inspection:', error.message);
      return res.status(500).json({ error: error.message });
    }
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Backend proxy server is running on port ${PORT}`);
});


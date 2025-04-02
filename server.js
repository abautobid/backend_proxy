require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const qs = require('qs'); // required to stringify form-urlencoded

const app = express();
const { v4: uuidv4 } = require('uuid'); // add this at the top of server.js
// Environment variables
const PORT = process.env.PORT || 3000;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const GRANT_TYPE = process.env.GRANT_TYPE || 'client_credentials';

// CORS (Angular or WordPress frontend)
app.use(cors({
  origin: ['http://localhost:4200', 'https://24aba.com']
}));

// Middleware
app.use(express.json());

// Health check route
app.get('/', (req, res) => {
  res.send('✅ Click-Ins backend is live!');
});

app.post('/api/generate-token-and-link', async (req, res) => {
  try {
    const uniqueId = uuidv4();

    // Step 1: Prepare payload for short link creation
    const payload = qs.stringify({
      grant_type: GRANT_TYPE,
      client_secret: CLIENT_SECRET,
      client_process_id: `PROCESS-${uniqueId}`,
      client_inspector_name: `INSPECTOR-${uniqueId}`,
      redirect_url: 'https://yourwebsite.com/inspection-success',
      fail_url: 'https://yourwebsite.com/inspection-fail',
      unauthorized_url: 'https://yourwebsite.com/unauthorized',
      branch: 'Main Branch'
    });

    // Step 2: Send to the correct short link endpoint
    const shortLinkResponse = await axios.post(
      'https://api.click-ins.com/rest/v2/oauth2/url_shortener',
      payload,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded'
        }
      }
    );

    // Step 3: Extract token and short link from response
    const {
      access_token,
      token_type,
      expires_in,
      short_link
    } = shortLinkResponse.data;

    // Step 4: Return response
    res.json({
      token: access_token,
      token_type,
      expires_in,
      short_link
    });

  } catch (error) {
    console.error('❌ Short link error:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
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
      console.log('📤 Sending to:', 'https://api.click-ins.com/rest/v2/link');

      return res.status(500).json({ error: error.message });
    }
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Backend proxy server is running on port ${PORT}`);
});

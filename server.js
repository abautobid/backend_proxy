require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const qs = require('qs');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');

const app = express();

const PORT = process.env.PORT || 3000;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const GRANT_TYPE = process.env.GRANT_TYPE || 'client_credentials';

app.use(cors({
  origin: ['http://localhost:4200', 'https://24aba.com'],
  methods: ['GET', 'POST'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.send('✅ Click-Ins backend is live!');
});

app.post('/api/generate-token-and-link', async (req, res) => {
  try {
    const uniqueId = uuidv4();

    const payload = qs.stringify({
      grant_type: GRANT_TYPE,
      client_secret: CLIENT_SECRET,
      client_process_id: `PROCESS-${uniqueId}`,
      client_inspector_name: `INSPECTOR-${uniqueId}`,
      redirect_url: 'https://24aba.com/?inspection=success',
fail_url: 'https://24aba.com/?inspection=fail',
unauthorized_url: 'https://24aba.com/?inspection=unauthorized',
      branch: 'Main Branch'
    });

    const shortLinkResponse = await axios.post(
      'https://api.click-ins.com/rest/v2/oauth2/url_shortener',
      payload,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token, token_type, expires_in, short_link } = shortLinkResponse.data;

    res.json({ token: access_token, token_type, expires_in, short_link });
  } catch (error) {
    console.error('❌ Short link error:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

app.post('/api/create-inspection', async (req, res) => {
  try {
    const { client_token, client_process_id, inspection_type } = req.body;
    if (!client_token || client_process_id === undefined) {
      return res.status(400).json({ error: 'Missing required parameters: client_token or client_process_id' });
    }

    const url = `https://api.click-ins.com/rest/v2/inspections?upload_type=MEDIA`;
    const headers = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${client_token}`
    };

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

app.post('/api/clickins-callback', async (req, res) => {
  const reportData = req.body;
  console.log('📥 Received Click-Ins callback:', JSON.stringify(reportData, null, 2));

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT),
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const reportId = reportData.report_html_filename?.replace('.html', '');
    const reportUrl = reportId
      ? `https://app.click-ins.com/html-reports/${reportId}.html`
      : 'Not provided';

    const mailOptions = {
      from: `"Click-Ins Bot" <${process.env.EMAIL_USER}>`,
      to: 'inspection@24aba.com',
      subject: '📄 New Click-Ins Inspection Report Received',
      text: `A new inspection report was received.\n\nInspection ID: ${reportData.inspection_id || 'N/A'}\n\nReport Link: ${reportUrl}\n\nFull JSON:\n${JSON.stringify(reportData, null, 2)}`
    };

    await transporter.sendMail(mailOptions);

    res.status(200).json({ message: '✅ Report received and emailed successfully.' });
  } catch (error) {
    console.error('❌ Failed to send email:', error);
    res.status(500).json({ error: error.message || 'Email send failed' });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Backend proxy server is running on port ${PORT}`);
});

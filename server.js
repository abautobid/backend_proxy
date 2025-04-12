require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const qs = require('qs');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);


const app = express();
const { access_token, token_type, expires_in, short_link } = shortLinkResponse.data;
const PORT = process.env.PORT || 3000;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const GRANT_TYPE = process.env.GRANT_TYPE || 'client_credentials';

// ✅ In-memory store for email mapping (TEMPORARY)
const inspectionEmails = {};

app.use(cors({
origin: ['http://localhost:4200', 'https://24aba.com'],
}));



app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get('/', (req, res) => {
  res.send('✅ Click-Ins backend is live!');
});

app.post('/api/generate-token-and-link', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const uniqueId = uuidv4();
    const clientProcessId = `PROCESS-${uniqueId}`;

    // ✅ Store the email with process ID
    inspectionEmails[clientProcessId] = email;

    const payload = qs.stringify({
      grant_type: GRANT_TYPE,
      client_secret: CLIENT_SECRET,
      client_process_id: clientProcessId,
      client_inspector_name: `INSPECTOR-${uniqueId}`,
      redirect_url: 'https://24aba.com/inspection/inspect-car/thank-you',
      fail_url: 'https://24aba.com/inspection/inspect-car/error',
      unauthorized_url: 'https://24aba.com/inspection/inspect-car/unauthorized',
      branch: 'Main Branch'
    });

    const shortLinkResponse = await axios.post(
      'https://api.click-ins.com/rest/v2/oauth2/url_shortener',
      payload,
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    const { access_token, token_type, expires_in, short_link } = shortLinkResponse.data;

    res.json({ token: access_token, token_type, expires_in, short_link, client_process_id: clientProcessId });
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
    const clientProcessId = reportData.client_process_id;
    const userEmail = inspectionEmails[clientProcessId];
    const recipient = userEmail || 'inspection@24aba.com'; // fallback if not found

    const short_link = `https://app.click-ins.com/html-reports/${reportData.report_html_filename?.replace('.html', '')}.html`;

    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT),
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      }
    });

    const mailOptions = {
      from: `"24ABA Inspections" <${process.env.EMAIL_USER}>`,
      to: recipient,
      subject: "🚗 Your Inspection Link is Ready!",
      html: `
        <p>Hello,</p>
        <p>Thank you for completing your payment!</p>
        <p>Your car inspection report is now ready. Click the button below to view it:</p>
        <p style="text-align:center;">
          <a href="${short_link}" style="display:inline-block;padding:12px 24px;background-color:#e60023;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;">
            📄 View Report
          </a>
        </p>
        <p>If the button doesn't work, you can also click or paste this link:</p>
        <p><a href="${short_link}">${short_link}</a></p>
        <p>– 24ABA Team</p>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log("📧 Inspection report email sent to", recipient);

    res.status(200).json({ message: `✅ Report and email sent to ${recipient}` });

  } catch (error) {
    console.error('❌ Failed to process Click-Ins callback or send email:', error.message);
    res.status(500).json({ error: 'Failed to handle inspection callback or send email.' });
  }
});


app.post('/api/mailchimp-subscribe', async (req, res) => {
  const { email, firstName, lastName, dealershipName, phone, inventorySize } = req.body;

  // ✅ Require all fields
  if (!email || !firstName || !lastName || !dealershipName || !phone || !inventorySize) {
    return res.status(400).json({ error: 'All fields are required.' });
  }

  const data = {
    email_address: email,
    status: "subscribed",
    merge_fields: {
      FNAME: firstName,
      LNAME: lastName,
      DEALER: dealershipName,
      PHONE: phone,
      INVSIZE: inventorySize
    }
  };

  const apiKey = process.env.MAILCHIMP_API_KEY;
  const audienceId = process.env.MAILCHIMP_AUDIENCE_ID;
  const dc = process.env.MAILCHIMP_DC;

  const url = `https://${dc}.api.mailchimp.com/3.0/lists/${audienceId}/members`;

  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `apikey ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(data)
    });

    const result = await response.json();

    if (response.status >= 400) {
      console.error("Mailchimp Error:", result);
      return res.status(400).json({ error: result.detail || "Mailchimp API error" });
    }


    res.status(200).json({ message: "✅ Successfully subscribed to 24ABA!" });

  } catch (error) {
    console.error("❌ Mailchimp Error:", error.message);
    res.status(500).json({ error: "Internal Server Error" });
  }
});

app.post('/api/create-payment-session', async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ error: "Email is required" });
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: 'Car Inspection (AI Report)',
            },
            unit_amount: 100, // ✅ €1.00 in cents
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      customer_email: email,
      success_url: `https://24aba.com/inspection/after-payment?email=${encodeURIComponent(email)}`,
      cancel_url: 'https://24aba.com/inspection/payment-cancelled',
    });

    return res.status(200).json({
      sessionId: session.id,
      url: session.url
    });
  } catch (err) {
    console.error("Stripe Error:", err.message);
    res.status(500).json({ error: "Could not create Stripe session" });
  }
});


app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Backend proxy server is running on port ${PORT}`);
});

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const qs = require('qs');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);


const multer = require('multer');
const fs = require('fs');
const FormData = require('form-data');

const fleetManager = require('./routes/fleetManager');
const reseller = require('./routes/reseller');

const { saveInspection,getResellerByReferralCode } = require('./utility/supabaseUtility');
const { supabase } = require('./lib/supabaseClient.js');


const router = express.Router();

// Set up multer to store files temporarily
const upload = multer({ dest: 'uploads/' });



const app = express();
const PORT = process.env.PORT || 3000;
const CLIENT_SECRET = process.env.CLIENT_SECRET;
const PAYMENT_URL_24ABA = process.env.PAYMENT_URL_24ABA;
const GRANT_TYPE = process.env.GRANT_TYPE || 'client_credentials';



const CLICK_INS_CLIENT_ID = process.env.CLICK_INS_CLIENT_ID;
const CLICK_INS_API_KEY = process.env.CLICK_INS_API_KEY;
const CLICK_INS_URL = process.env.CLICK_INS_URL;

const CEBIA_API_URL = process.env.CEBIA_API_URL;

const inspectionEmails = {};

app.use(cors({
  origin: ['http://localhost:3000','http://localhost:3001', 'https://24aba.com'],
}));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/fleet', fleetManager);
app.use('/api/reseller', reseller);


app.get('/', (req, res) => {
  res.send('✅ Click-Ins backend is live!');
});

app.post('/api/generate-token-and-link', async (req, res) => {
  try {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });

    const uniqueId = uuidv4();
    const clientProcessId = `PROCESS-${uniqueId}`;
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

    // ✅ Send inspection link by email
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
      to: email,
      subject: "🚗 Your Inspection Link is Ready!",
      html: `
        <p>Hello,</p>
        <p>Thank you for completing your payment!</p>
        <p>Your car inspection is now ready. Click the button below to begin:</p>
        <p style="text-align:center;">
          <a href="${short_link}" style="display:inline-block;padding:12px 24px;background-color:#e60023;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;">
            🚗 Begin Inspection
          </a>
        </p>
        <p>If the button doesn't work, you can also click or paste this link:</p>
        <p><a href="${short_link}">${short_link}</a></p>
        <p>– 24ABA Team</p>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log("📧 Inspection link email sent to", email);

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
      return res.status(400).json({ error: 'Missing required parameters' });
    }

    const response = await axios.post(
      `https://api.click-ins.com/rest/v2/inspections?upload_type=MEDIA`,
      {
        client_token,
        inspection_type: inspection_type || 'FULL_INSPECTION',
        client_process_id
      },
      { headers: { 'Authorization': `Bearer ${client_token}` } }
    );

    res.json(response.data);
  } catch (error) {
    console.error('Error creating inspection:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
});

app.post('/api/clickins-callback', async (req, res) => {
  const reportData = req.body;
  console.log('📥 Received Click-Ins callback:', JSON.stringify(reportData, null, 2));

  try {
    const clientProcessId = reportData.client_process_id;
    const userEmail = inspectionEmails[clientProcessId];
    const recipient = userEmail || 'inspection@24aba.com';

    const reportId = reportData.report_html_filename?.replace('.html', '');
    const short_link = reportId ? `https://app.click-ins.com/html-reports/${reportId}.html` : 'https://app.click-ins.com/';

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
    console.error('❌ Failed to handle inspection callback or send email:', error.message);
    res.status(500).json({ error: 'Failed to handle inspection callback or send email.' });
  }
});

app.post('/api/create-payment-session', async (req, res) => {
  try {
    const { email, vin} = req.body;



    if (!email) return res.status(400).json({ error: "Email is required" });
    if (!vin) return res.status(400).json({ error: "VIN is required" });


 

    const clickInsToken = await getClickInsToken();
    const inspectionData = await createClickInsInspection(clickInsToken);
    const InspectionId = inspectionData.inspection_case_id;
  
    const cebiaToken = await getCebiaToken();
    
    const cebiaQueue = await getCebiaBasicInfoQueueId(vin,cebiaToken);

      const inspectionObj = {
          plate_number: vin,
          email : email,
          queue_id: cebiaQueue,
          status: 'pending',
          user_id : null,
          inspection_case_id: InspectionId,
          reseller_id : null,
      };
      await saveInspection(inspectionObj)

    
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: { name: 'VIN '+vin+' Car Inspection' },
            unit_amount: 2999,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      customer_email: email,
      success_url: PAYMENT_URL_24ABA+`?email=${encodeURIComponent(email)}&token=${encodeURIComponent(cebiaQueue)}&inpid=${InspectionId}&vin=${vin}`,
      cancel_url: 'https://24aba.com/inspection/payment-cancelled',
    });

    return res.status(200).json({ sessionId: session.id, url: session.url });
  } catch (err) {
    console.error("Stripe Error:", err.message);
    res.status(500).json({ error: "Could not create Stripe session" });
  }
});


app.get("/api/cebia/poll/:vin", async (req, res) => {
  const { vin } = req.params;
  const cebiaToken = process.env.CEBIA_STATIC_BEARER_TOKEN;

  if (!cebiaToken) {
    return res.status(500).json({ error: "Missing static Bearer token in .env" });
  }

  const maxRetries = 10;
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  try {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log(`🔁 Poll attempt ${attempt} for VIN: ${vin}`);

      const response = await axios.get(
        `${CEBIA_API_URL}CreateBaseInfoQuery/${vin}`,
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${cebiaToken}`,
          },
        }
      );

      const { queueStatus, baseInfoData } = response.data;

      if (queueStatus === 1 && baseInfoData) {
        console.log("✅ VIN data ready!");
        return res.json(response.data);
      }

      await delay(3000); // wait 3 seconds before next try
    }

    return res.status(202).json({ message: "VIN data not ready after polling." });
  } catch (err) {
    console.error("❌ Polling error:", err.response?.data || err.message);
    return res.status(500).json({ error: "Polling failed." });
  }
});


app.get("/api/report/:queueId", async (req, res) => {
  const queueId = req.params.queueId;
  const cebiaToken =await getCebiaToken()

  if (!cebiaToken) {
    return res.status(500).json({ error: "Missing CEBIA_STATIC_BEARER_TOKEN" });
  }

  try {
    const response = await axios.get(
      `${CEBIA_API_URL}GetPayedDataQuery/${queueId}`,
      {
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${cebiaToken}`,
        },
      }
    );

    const { couponNumber } = response.data;

    if (couponNumber) {
      console.log("✅ report is  ready!");
      return res.status(200).json({ url: `https://en.cebia.com/?s_coupon=${couponNumber}` });
      
    }

    return res.json(response.data);
  } catch (err) {
    console.error("❌ Paid data fetch error:", err.response?.data || err.message);
    return res.status(500).json({ error: "Failed to fetch report" });
  }
});


async function getCebiaToken() {
  
  const tokenResponse = await axios.post(
    process.env.CEBIA_AUTH_URL, // ✅ CORRECT endpoint
    qs.stringify({
      grant_type: "password",
      username: process.env.CEBIA_USERNAME,
      password: process.env.CEBIA_PASSWORD,
      client_id: process.env.CEBIA_CLIENT_ID,
      client_secret: process.env.CEBIA_CLIENT_SECRET,
    }),
    {
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
    }
  );
  
  return tokenResponse.data.access_token;
}




async function getCebiaBasicInfoQueueId(vin, cebiaToken) {


  
  const maxRetries = 10;
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  try {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log(`🔁 Poll attempt ${attempt} for VIN: ${vin}`);

      const response = await axios.get(
        `${CEBIA_API_URL}CreateBaseInfoQuery/${vin}`,
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${cebiaToken}`,
          },
        }
      );

      const { queueStatus, baseInfoData, queue} = response.data;
      console.log(response.data);
      if ((queueStatus === 1 || queueStatus === 2) && queue) {
        console.log("✅ VIN data ready!");
        console.log(queue);
        return queue;
      }

      //await delay(3000); // wait 3 seconds before next try
    }

    return false;
  } catch (err) {
    console.error("❌ Polling error:", err.response?.data || err.message);
    return false;
  }
};






async function getCebiaBasicInfo(queueId, cebiaToken) {


  
  const maxRetries = 20;
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  try {
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      console.log(`🔁 Poll attempt ${attempt} for queueId: ${queueId}`);

      const response = await axios.get(
        `${CEBIA_API_URL}GetBaseInfoQuery/${queueId}`,
        {
          headers: {
            Accept: "application/json",
            Authorization: `Bearer ${cebiaToken}`,
          },
        }
      );

      const { queueStatus, baseInfoData, queue} = response.data;
      console.log(response.data);
      if (queueStatus === 3 && baseInfoData) {
        console.log("✅ VIN data ready!");
        console.log(queue);
        return baseInfoData;
      }

      await delay(3000); // wait 3 seconds before next try
    }

    return false;
  } catch (err) {
    console.error("❌ Polling error:", err.response?.data || err.message);
    return false;
  }
};

async function getClickInsToken() {

const CLICK_INS_CLIENT_ID = process.env.CLICK_INS_CLIENT_ID;
const CLICK_INS_API_KEY = process.env.CLICK_INS_API_KEY;
const CLICK_INS_URL = process.env.CLICK_INS_URL;

  const data = qs.stringify({
    grant_type: 'client_credentials',
    client_id: CLICK_INS_CLIENT_ID,
    client_secret: CLICK_INS_API_KEY
  });

  const config = {
    method: 'post',
    url: `${CLICK_INS_URL}oauth2/token`,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    data: data
  };

   const response  = await axios(config)
    .then(function (response) {
      return response;
      console.log(response.data);

        

    })
    .catch(function (error) {
      return error;
      console.error(error);
    });
    
    return response.data.access_token;
};



async function createClickInsInspection(clientToken, inspectionType = "FULL_INSPECTION") {
  const CLICK_INS_URL = process.env.CLICK_INS_URL;
  const url = `${CLICK_INS_URL}inspections?upload_type=MEDIA`;
  
  const clientProcessId = `PROCESS-TEST-${uuidv4()}`;

  const body = {
    client_token: clientToken,
    inspection_type: inspectionType,
    client_process_id: clientProcessId
  };

  try {
    const response = await axios.post(url, body, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${clientToken}`,

      }
    });

    console.log("✅ Inspection created:", response.data);
    return response.data;
  } catch (error) {
    console.error("❌ Error creating inspection:", error.response?.data || error.message);
    throw error;
  }
};




app.post('/api/upload-inspection-images', upload.array('files'), async (req, res) => {
  const { inspectionId } = req.body;
  const files = req.files;

  if (!inspectionId || !files?.length) {
    return res.status(400).json({ error: 'inspectionId and at least one image file are required' });
  }

  const token = await getClickInsToken();
  try {
    const responses = await Promise.all(
      files.map((file, index) => uploadToClickIns(inspectionId, token, file, index))
    );

    return res.status(200).json({ message: 'Images uploaded', results: responses });
  } catch (error) {
    console.error('Upload Error:', error.message);
    return res.status(500).json({ error: 'Failed to upload images to Click-Ins' });
  }
});

async function uploadToClickIns(inspectionId, token, file, index) {
  const form = new FormData();

  form.append(
    'images',
    JSON.stringify({
      images: [
        {
          image_id: `image-${Date.now()}-${index}`,
          name: file.originalname,
        },
      ],
    })
  );

  form.append('files', fs.createReadStream(file.path), {
    filename: file.originalname,
    contentType: file.mimetype,
  });

  const url = `${CLICK_INS_URL}inspections/${inspectionId}/images?key=${CLICK_INS_API_KEY}&upload_type=MEDIA&skip_damage_detection=false`;

  const headers = {
    ...form.getHeaders(),
    Authorization: `Bearer ${token}`,
  };

  const response = await axios.post(url, form, { headers });

  // Cleanup local file
  fs.unlink(file.path, () => {});

  return response.data;
}


app.post('/api/start-inspection', async (req, res) => {
  try {
      const { inspectionId,email } = req.body;
      

    if (!inspectionId) {
      return res.status(400).json({ error: 'inspectionId is required' });
    }

    const token = await getClickInsToken();
      

    const apiUrl = `${CLICK_INS_URL}inspections/${inspectionId}/asyncProcess`;

    const response = await axios.post(
      apiUrl,
      {
        skip_image_reasons: [
          {
            reason: "default",
            skipped_images: [
              {
                section_id: "1",
                part_id: "1",
                camera_view: "LEFT"
              }
            ]
          }
        ],
        inspectors_comment: "abc"
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        params: {
          key: CLICK_INS_API_KEY,
          email: email,
          callback: ''
        }
      }
    );

    res.status(200).json({
      success: true,
      message: 'Inspection triggered',
      data: response.data
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    });
  }
});



app.post('/api/vin-detail', async (req, res) => {
  try {
    const { email, vin } = req.body;
    
    if (!email) return res.status(400).json({ error: "Email is required" });
    if (!vin) return res.status(400).json({ error: "VIN is required" });
    
    const cebiaToken = await getCebiaToken();
    const cebiaQueue = await getCebiaBasicInfoQueueId(vin,cebiaToken);

    const baseInfoData = await getCebiaBasicInfo(cebiaQueue,cebiaToken);
    
    return res.status(200).json(baseInfoData);
  } catch (err) {
    console.error("Stripe Error:", err.message);
    res.status(500).json({ error: "Could not create Stripe session" });
  }
});


app.post('/api/get-inspection-detail', async (req, res) => {
  try {
      const { inspectionId } = req.body;
      

    if (!inspectionId) {
      return res.status(400).json({ error: 'inspectionId is required' });
    }

    const token = await getClickInsToken();
      

    const apiUrl = `${CLICK_INS_URL}inspections/${inspectionId}`;

    const response = await axios.get(
      apiUrl,
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        params: {
          key: CLICK_INS_API_KEY,
          callback: ''
        }
      }
    );
    
    res.status(200).json(response.data);
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    });
  }
});



app.post('/api/email-report', async (req, res) => {
  try {
    const { email,short_link } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });
    if (!short_link) return res.status(400).json({ error: "short_link is required" });

   

    // ✅ Send inspection link by email
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT),
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      tls: {
        rejectUnauthorized: false
      },
      logger: true,
      debug: true
    });

    const mailOptions = {
      from: `"24ABA Inspections" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: "🚗 Your Inspection Link is Ready!",
      html: `
        <p>Hello,</p>
        <p>Thank you for completing your payment!</p>
        <p>Your car inspection is now ready. Click the button below to begin:</p>
        <p style="text-align:center;">
          <a href="${short_link}" style="display:inline-block;padding:12px 24px;background-color:#e60023;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;">
            Open Full Report
          </a>
        </p>
        <p>If the button doesn't work, you can also click or paste this link:</p>
        <p><a href="${short_link}">${short_link}</a></p>
        <p>– 24ABA Team</p>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log("📧 Inspection link email sent to", email);

    res.json({ success: true });
  } catch (error) {
    console.error('❌ Short link error:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
});



app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    return res.status(401).json({ error: error.message });
  }

  return res.status(200).json({
    message: 'Login successful',
    access_token: data.session.access_token,
    user: data.user,
  });
});




app.get('/api/create-auth', async (req, res) => {
  const email = 'reseller@gmail.com';
  const password = 'test1234';
  const { data, error } = await supabase.auth.signUp({ email, password });
   return res.status(200).json({ data});
});




app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Backend proxy server is running on port ${PORT}`);
});

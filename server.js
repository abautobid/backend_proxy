require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const qs = require('qs');
const nodemailer = require('nodemailer');
const { v4: uuidv4 } = require('uuid');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const crypto = require('crypto')

const multer = require('multer');
const fs = require('fs');
const path = require('path');

const FormData = require('form-data');

const fleetManager = require('./routes/fleetManager');
const reseller = require('./routes/reseller');
const admin = require('./routes/admin');

const { saveInspection,getInspectionsForInspectCar,
        getInspectionById,updateInspection, getUserById, saveCheckCarVinInspection,
        getInspectKoreaByStatus,updateCheckCarVinInspection, updateAppSettings,
        getAppSettings,getCheckCarVinInspectionByInspectionId
      } = require('./utility/supabaseUtility');
const { sendEmailReport } = require('./utility/helper');
const { getPayedDataQuery,vinCheck} = require('./utility/cebiaUtility');
const { getStoreCheckedVin, payFromBalanceRaw,checkReportStatusRaw, loginCheckCarVin,downloadCheckCarVinPdf, removeNullChars} = require('./utility/CheckCarVinUtility');
const { supabase } = require('./lib/supabaseClient.js');

const { extractVehicleData } = require('./utility/checkCarVinPDFParser');


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

const CEBIA_AUTH_URL = process.env.CEBIA_AUTH_URL;
const CEBIA_API_URL = process.env.CEBIA_API_URL;




const inspectionEmails = {};


const algorithm = 'aes-256-cbc';

const ENCRYPTION_KEY='4f3c9a54b1d74f6a8e9bd3f7aef127ccb8e1d5f8477a2c0f3a3eec8327a1e5df'
const ENCRYPTION_IV='9f4c3b1a7e8d2f6037a1c9b2f0a1e3c4'
// Use a 32-byte (256-bit) key and a 16-byte IV (hex or base64 encoded)
const secretKey = Buffer.from(ENCRYPTION_KEY, 'hex');
const iv = Buffer.from(ENCRYPTION_IV, 'hex');



app.use(cors({
  origin: ['http://localhost:3000', 'http://localhost:3001', 'https://24aba.com'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'], // include all that you use
  allowedHeaders: ['Content-Type', 'Authorization'], // add more if needed
  credentials: false // set to true only if you're using cookies
}));

// Optional: handle OPTIONS requests explicitly (usually not needed with cors middleware)
app.options('*', cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.use('/api/fleet', fleetManager);
app.use('/api/reseller', reseller);
app.use('/api/admin', admin);



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
    const { inspectionId } = req.body;

    if (!inspectionId) return res.status(400).json({ error: "Invalid requsted id." });

    const inspection = await getInspectionById(inspectionId);
       
    if (!inspection || inspection.length === 0) {
        return res.status(401).json({ error: "Invalid request found." });         
    }
    const inspection_fee = 24.99;
    const inspection_fee_stripe = 2499;

    await updateInspection({
        id: inspection.id,
        inspection_fee: inspection_fee,
    });
    
    const encryptedInspectionId = encrypt(inspection.id);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: { name: 'VIN '+inspection.plate_number+' Car Inspection' },
            unit_amount: inspection_fee_stripe,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      customer_email: inspection.email,
      success_url: PAYMENT_URL_24ABA+`?id=${encryptedInspectionId}`,
      cancel_url: 'https://24aba.com/inspection/payment-cancelled',
    });

    return res.status(200).json({ sessionId: session.id, url: session.url });
  } catch (err) {
    console.error("Stripe Error:", err);
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
    CEBIA_AUTH_URL, // ✅ CORRECT endpoint
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

      const { queueStatus, baseInfoData, queue,status} = response.data;
      console.log(response.data);
      if(status == 400){
        return {error : "Invalid VIN."};
      }
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
  
  const clientProcessId = `PROCESS-INSPECTION-${uuidv4()}`;

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




app.post('/api/complete-inspection', upload.array('files'), async (req, res) => {
  const { inspectionId } = req.body;
  const files = req.files;



    
    if (!inspectionId || !files?.length) {
      return res.status(400).json({ error: 'inspectionId is required' });
    }
        
  
    try {


    const inspection = await getInspectionById(inspectionId);
    console.log(inspection);
    
    if (!inspection || inspection.length === 0 || inspection.status !== 'paid') {

        if(inspection && inspection.status === 'completed'){
            return res.status(401).json({ error: "Request has already been completed" });
        }else{
            return res.status(401).json({ error: "Invalid request." });
        }
    }

    if (!inspection.image_uploaded && !files?.length) {
      return res.status(400).json({ error: 'At least one image file is required' });
    }
        

    if(!inspection.cebia_coupon_number){
      const cebiaToken =await getCebiaToken();

      const couponNumber =  await getPayedDataQuery(inspection.queue_id,cebiaToken);         
    
      await updateInspection({
          id: inspection.id,
          cebia_coupon_number: couponNumber,
          skip_ai : 0,
      }); 

    //  const emailSent2 = await sendEmailReport(inspection.email, url_completed);

    }

    const clickInsToken = await getClickInsToken();
    
    if(!inspection.inspection_case_id){
      const inspectionData = await createClickInsInspection(clickInsToken);
      const clickInsInspectionId = inspectionData.inspection_case_id;

      await updateInspection({
          id: inspection.id,
          inspection_case_id: clickInsInspectionId
      }); 

    }

    if(!inspection.image_uploaded){

      const inspectionForClickIns = await getInspectionById(inspectionId);


      const responses = await Promise.all(
        files.map((file, index) => uploadToClickIns(inspectionForClickIns.inspection_case_id, clickInsToken, file, index))
      );

        await updateInspection({
          id: inspection.id,
          image_uploaded: 1,
          skip_ai : 0,
      }); 

    }

  
  
  

    return res.status(200).json({ message: 'Images uploaded' });
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
      const { inspectionId } = req.body;
      

    if (!inspectionId) {
      return res.status(400).json({ error: 'inspectionId is required' });
    }


      

    const inspection = await getInspectionById(inspectionId);
    console.log(inspection);
    
    if (!inspection || inspection.length === 0 || inspection.status !== 'paid' || inspection.skip_ai || !inspection.inspection_case_id || !inspection.image_uploaded  ) {

      return res.status(401).json({
        success: false,
        error: 'invalid request'
      });

    }
    const token = await getClickInsToken();
    const inspectionCaseId = inspection.inspection_case_id;

    const apiUrl = `${CLICK_INS_URL}inspections/${inspectionCaseId}/asyncProcess`;

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
        inspectors_comment: "inspection"
      },
      {
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        params: {
          key: CLICK_INS_API_KEY,
          email: inspection.email,
          callback: ''
        }
      }
    );


     
    await updateInspection({
        id: inspection.id,
        status: 'completed',
        ai_inspection_completed: 1,
    });       

    
    return res.status(200).json({
      success: true,
      message: 'Inspection triggered',
      data: response.data
    });

  } catch (error) {
    return res.status(500).json({
      success: false,
      error: error.response?.data || error.message
    });
  }
});



app.post('/api/vin-detail', async (req, res) => {
  try {
    const { inspectionId } = req.body;
    
    if (!inspectionId) return res.status(400).json({ error: "Inspection id is required" });


    const inspection = await getInspectionById(inspectionId);
    
    
    if (!inspection || inspection.length === 0) {
        return res.status(401).json({ error: "Invalid request found." });         
    }

    const cebiaToken = await getCebiaToken();

    if(!inspection.queue_id){  
      const cebiaQueueNew = await getCebiaBasicInfoQueueId(inspection.plate_number,cebiaToken);
      await updateInspection({
          id: inspection.id,
          queue_id: cebiaQueueNew,
      });
      const baseInfoDataNew = await getCebiaBasicInfo(cebiaQueueNew,cebiaToken);
      return res.status(200).json(baseInfoDataNew);
    }else{
      const cebiaQueue = await getCebiaBasicInfoQueueId(inspection.plate_number,cebiaToken);
      const baseInfoData = await getCebiaBasicInfo(cebiaQueue,cebiaToken);
      return res.status(200).json(baseInfoData);
    }
    
  
    

    
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
    
  const user_data = await getUserById(data.user.id);

  const user = {
    id : data.user.id,
    email : data.user.email,
    name : user_data.name,
    role : user_data.type
  }


  return res.status(200).json({
    message: 'Login successful',
    access_token: data.session.access_token,
    user: user,
  });
});



app.post('/api/inspect-car', async (req, res) => {
  try {
    const { email, vin} = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });
    if (!vin) return res.status(400).json({ error: "VIN is required" });


    const cebiaToken = await getCebiaToken();
    const carInfoResp = await vinCheck(vin, cebiaToken);
    if(!carInfoResp.isVinValid){
          return res.status(200).json({ error: "VIN i pavlefshëm. Ju lutem provoni me një të vlefshëm."});
    }
    const cebiaQueueResp = await getCebiaBasicInfoQueueId(vin,cebiaToken);
    
    if(cebiaQueueResp.error){
        return res.status(200).json({ error: "VIN i pavlefshëm. Ju lutem provoni me një të vlefshëm."});
    }

    if(!cebiaQueueResp){
        return res.status(200).json({ error: "VIN i pavlefshëm. Ju lutem provoni me një të vlefshëm."});
    }
    
    inspection = await getInspectionsForInspectCar(vin,email);
    
    if (!inspection || inspection.length === 0) {

        const ip = req.headers['x-forwarded-for']?.split(',')[0] || req.socket?.remoteAddress || null;

         const inspectionObj = {
            plate_number: vin,
            email: email,
            status: 'pending',
            model : carInfoResp.carInfo.model,
            brand : carInfoResp.carInfo.brand,
            ip_address: ip,
            
        };
        const inspectionId = await saveInspection(inspectionObj);

        if (inspectionId) {
             return res.status(200).json({ inspectionId: inspectionId, message: "Inspection submitted successfully", status : 'pending',  model : carInfoResp.carInfo.model, brand :carInfoResp.carInfo.brand });
        }else{
             return res.status(401).json({ error: "Kërkesa juaj nuk mund të përpunohet në këtë moment. Ju lutemi provoni përsëri." });
        }         

    }

    return res.status(200).json({ 
        inspectionId: inspection[0].id, 
        message: "Inspection found.", 
        status : inspection[0].status, 
        skip_ai : inspection[0].skip_ai,  
        cebia_coupon_number : inspection[0].cebia_coupon_number,  
        ai_inspection_completed : inspection[0].ai_inspection_completed,  
        image_uploaded : inspection[0].image_uploaded,
        model : inspection[0].model, 
        brand : inspection[0].brand 
      });

    

  } catch (error) {
    console.error('Error creating inspection:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
});



app.post('/api/inspect-car-korea', async (req, res) => {
  try {
    const { email, vin } = req.body;
    if (!email) return res.status(400).json({ error: "Email is required" });
    if (!vin) return res.status(400).json({ error: "VIN is required" });


    
    inspection = await getInspectionsForInspectCar(vin,email);
    
   
      
    if (!inspection || inspection.length === 0) {

      
       const checkCarVin = await getStoreCheckedVin(vin);

        if(!checkCarVin.vehicle){
            return res.status(200).json({ error: "VIN i pavlefshëm. Ju lutem provoni me një të vlefshëm." });
        }

        if(checkCarVin.vehicle == '-'){
            return res.status(200).json({ error: "VIN i pavlefshëm. Ju lutem provoni me një të vlefshëm." });
        }

         const inspectionObj = {
            plate_number: vin,
            email: email,
            status: 'pending',
            vin_type: 'korea'        
        };
        const inspectionId = await saveInspection(inspectionObj);

        const checkCarVinInspectionObj = {
                inspection_id: inspectionId,
                vin: vin,
                stored_vin_data : checkCarVin
        }

        await saveCheckCarVinInspection(checkCarVinInspectionObj)

        if (inspectionId) {
             return res.status(200).json({ inspectionId: inspectionId, message: "Inspection submitted successfully", status : 'pending', vin_detail: checkCarVin });
        }else{
             return res.status(200).json({ error: "Kërkesa juaj nuk mund të përpunohet në këtë moment. Ju lutemi provoni përsëri." });
        }         

    }

    const checkCarVinData = await getCheckCarVinInspectionByInspectionId(inspection[0].id)

    return res.status(200).json({ 
        inspectionId: inspection[0].id, 
        message: "Inspection found.", 
        status : inspection[0].status, 
        skip_ai : inspection[0].skip_ai,  
        cebia_coupon_number : inspection[0].cebia_coupon_number,  
        ai_inspection_completed : inspection[0].ai_inspection_completed,  
        image_uploaded : inspection[0].image_uploaded,
        model : inspection[0].model, 
        brand : inspection[0].brand,
        vin_type : inspection[0].vin_type,
        vin_detail: checkCarVinData.stored_vin_data,

      });

    

  } catch (error) {
    console.error('Error creating inspection:', error.response?.data || error.message);
    res.status(500).json({ error: 'Kërkesa juaj nuk mund të përpunohet në këtë moment. Ju lutemi provoni përsëri.' });
  }
});


app.post('/api/notify-me-korea', async (req, res) => {
  try {
    const { contact, email, vin } = req.body;

    if (!contact) return res.status(400).json({ error: "Contact Info is required" });
    if (!email) return res.status(400).json({ error: "Email is required" });
    if (!vin) return res.status(400).json({ error: "VIN is required" });

    await supabase.from('korea_report_notifications').insert([
      {
        contact_info: contact,
        email: email,
        vin : vin,
      }
    ]);
    return res.status(200).json({
      message: "Faleminderit! Do t'ju njoftojmë sapo raportet për makinat nga Koreja të jenë sërish të disponueshme."
    });

  } catch (error) {
    console.error('Error creating inspection:', error.response?.data || error.message);
    res.status(500).json({ error: error.response?.data || error.message });
  }
});


app.post('/api/payment-received', async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "id is required" });
    
    
    const inspectionId = decrypt(id);
      

    const inspection = await getInspectionById(inspectionId);
    console.log(inspection);
    
    if (!inspection || inspection.length === 0 || inspection.status !== 'pending') {

        if(inspection && inspection.status !== 'pending'){
            return res.status(200).json({inspectionId: inspection.id, error: "request already processed.", vin_type : inspection.vin_type });
        }else{
            return res.status(401).json({ error: "request not found" });
        }
          
    }else{  
          await updateInspection({
              id: inspection.id,
              status: 'paid',
              
          });
          if(inspection.vin_type == 'korea'){
            await sendInspectionKoreaEmail({vin: inspection.plate_number, email : inspection.email, inspectionId: inspection.id})
          }
    }

    return res.status(200).json({ inspectionId: inspection.id, message: "Inspection found.", vin_type : inspection.vin_type });

    

  } catch (error) {
    console.error('Error creating inspection:', error.response?.data || error.message);
    res.status(500).json({ error : 'Invalid request.'});
  }
});


app.post('/api/skip-ai-inspection', async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "id is required" });
    
    
    const inspectionId = id;
      
    const cebieReportUrl =  "https://en.cebia.com/?s_coupon=";

    const inspection = await getInspectionById(inspectionId);
    console.log(inspection);
    
    if (!inspection || inspection.length === 0 || inspection.status !== 'paid') {

        if(inspection && inspection.status === 'completed' && inspection.cebia_coupon_number){
            const url = cebieReportUrl+inspection.cebia_coupon_number;
            const emailSent = await sendEmailReport(inspection.email, url);
            
            if(emailSent){
              await updateInspection({
                  id: inspection.id,
                  status: 'completed',
                  send_email : 1,
                  skip_ai : 1,
              }); 
            }

            return res.status(200).json({inspectionId: inspection.id, error: "request already processed.", url  : url});
        }else{
            return res.status(401).json({ error: "Invalid request." });
        }
          
    }else{

        const cebiaToken =await getCebiaToken();

        const couponNumber =  await getPayedDataQuery(inspection.queue_id,cebiaToken);         
        console.log(couponNumber);

        const url_completed = cebieReportUrl+couponNumber;

        await updateInspection({
            id: inspection.id,
            status: 'completed',
            cebia_coupon_number: couponNumber,
            skip_ai : 1,
        }); 

        const emailSent2 = await sendEmailReport(inspection.email, url_completed);

        if(emailSent2){
          await updateInspection({
              id: inspection.id,
              send_email : 1,
          }); 
        }

        
        return res.status(200).json({inspectionId: inspection.id, message: "requested_completed", url  : url_completed});
    }    

  } catch (error) {
    console.error('Error creating inspection:', error.response?.data || error.message);
    res.status(500).json({ error : 'Invalid request.'});
  }
});



app.post('/api/get-inspection', async (req, res) => {
  try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "id is required" });
    const inspectionId = id;
    const inspection = await getInspectionById(inspectionId);    
    
    if (!inspection || inspection.length === 0) {
        return res.status(401).json({error: "request not found"}); 
    }else{
        const inpsectionObj = {
          inspectionId : inspection.id,
          status : inspection.status,
          skip_ai : inspection.skip_ai,
          ai_inspection_completed : inspection.ai_inspection_completed,
          image_uploaded : inspection.image_uploaded,
          cebia_coupon_number : inspection.cebia_coupon_number,
          vin : inspection.plate_number,
          inspection_case_id : inspection.inspection_case_id,
          model : inspection.model,
          brand : inspection.brand

        }
        return res.status(200).json(inpsectionObj);
    }    

  } catch (error) {
    console.error('Error inspection:', error.response?.data || error.message);
    res.status(500).json({ error : 'Invalid request.'});
  }
});








app.get('/api/create-auth', async (req, res) => {
  const email = 'reseller@gmail.com';
  const password = 'test1234';
  const { data, error } = await supabase.auth.signUp({ email, password });
   return res.status(200).json({ data});
});



app.post('/api/update-model-brand', async (req, res) => {
  try {
    // Get limit from query or default to 10
    const limit = parseInt(req.query.limit) || 10;

    // Fetch distinct plate numbers with a limit
    const { data: distinctPlates, error: fetchError } = await supabase
      .from('inspections')
      .select('plate_number', { distinct: true })
      .or('model.is.null,brand.is.null') // filters rows where model OR brand is null
      .limit(limit);

    if (fetchError) {
      return res.status(500).json({ error: fetchError.message });
    }

    const cebiaToken = await getCebiaToken();
    let updatedCount = 0;
    let failed = [];

    for (const row of distinctPlates) {
      const vin = row.plate_number;

      try {
        const carInfoResp = await vinCheck(vin, cebiaToken);

        if (carInfoResp?.isVinValid && carInfoResp.carInfo) {
          const { model, brand } = carInfoResp.carInfo;

          const { error: updateError } = await supabase
            .from('inspections')
            .update({ model, brand })
            .eq('plate_number', vin);

          if (updateError) {
            failed.push({ vin, reason: updateError.message });
          } else {
            updatedCount++;
          }
        } else {
          failed.push({ vin, reason: 'Invalid VIN or car info not found' });
        }

      } catch (err) {
        failed.push({ vin, reason: err.message });
      }
    }

    return res.status(200).json({
      message: `Processed up to ${limit} VINs`,
      updatedCount,
      failed,
    });

  } catch (error) {
    console.error('Unexpected error:', error.message);
    return res.status(500).json({ error: error.message });
  }
});


function encrypt(text) {
  const cipher = crypto.createCipheriv(algorithm, secretKey, iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  return encrypted;
}

function decrypt(encryptedData) {
  const decipher = crypto.createDecipheriv(algorithm, secretKey, iv);
  let decrypted = decipher.update(encryptedData, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}



async function sendInspectionKoreaEmail({ vin, email, inspectionId}) {
  if (!email) throw new Error("Email is required");
  if (!vin) throw new Error("vin is required");

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
    to: `${process.env.SUPPORT_EMAIL}`,
    subject: "🚗 Korean Inspection Paid and Pending for Report !",
    html: `
      <p>Hello,</p>
      <p>Korean VIN Inspection has been paid and waiting for Report email.</p>
      <p>Details are following</p>
      <p>
        Id : ${inspectionId}<br>
        VIN : ${vin}<br>
        Customer Email : ${email}<br>
        Status : Paid<br>
      </p>
      <p>– 24ABA Team</p>
    `
  };

  await transporter.sendMail(mailOptions);
  console.log("📧 Korean Inspection paid and waiting for report", "ahsan.shaikh.hyd@gmail.com");

  return true;
}



app.post('/api/get-check-car-vin', async (req, res) => {
  try {
    const { vin } = req.body;
    if (!vin) return res.status(400).json({ error: "vin is required" });

    const resp = await getStoreCheckedVin(vin);

    return res.status(200).json(resp);

  } catch (error) {
    console.error('Error inspection:', error.response?.data || error.message);
    res.status(500).json({ error: 'Invalid request.' });
  }
});


app.post('/api/generate-check-car-vin', async (req, res) => {
  try {
    
    const result = await getInspectKoreaByStatus('paid');
    

    if (result && !result.initiate_report) {
      
      const email = await getAppSettings('check_car_vin_email');
      
      const resp = await payFromBalanceRaw(result.vin, email.prop_value);

      if (
        resp &&
        resp.status === 200 &&
        resp.message === 'Payment successful!' &&
        Array.isArray(resp.reports) &&
        resp.reports.length > 0
      ) {
        const reportId = resp.reports[0];
        const userId = resp.user_id;


        await updateCheckCarVinInspection(result.id, {
          report_id: reportId,
          initiate_report: true,
          checkcarvin_user_id : userId,
        });

         await updateInspection({
              id: result.inspection_id,
              status: 'report initiated',
              
          });

        console.log('Payment success, report ID:', reportId);

      } else {
        console.error('Payment failed or invalid response:', resp);
      }
    }


    const result2 = await getInspectKoreaByStatus('report initiated');


    if (result2 && result2.initiate_report && !result2.report_generated) {
      const resp2 = await checkReportStatusRaw({
        vin: result2.vin,
        user_id: result2.checkcarvin_user_id,
        reports: [result2.report_id]
      });

      if (
        resp2 &&
        resp2.status === 200 &&
        resp2.message === 'Report generated success!' &&
        resp2.queue_status === 'Success' &&
        Array.isArray(resp2.reports) &&
        resp2.reports.length > 0 &&
        resp2.reports[0].status === 'Success'
      ) {
        const generatedReport = resp2.reports[0];
        const generatedReportId = generatedReport.id;

        await updateCheckCarVinInspection(result2.id, {
          report_generated: true,
          report_uuid: generatedReportId,
            report_generated_on: new Date().toISOString()
        });

        await updateInspection({
            id: result2.inspection_id,
            status: 'report generated',
            
        });
        console.log('✅ Report generated successfully:', generatedReportId);
      } else {
        console.warn('⚠️ Report not yet generated or failed:', resp2);
      }
    }



    return res.status(200).json({message : 'done', result2});

  } catch (error) {
    console.error('Error inspection:', error.response?.data || error.message);
    res.status(500).json({ error: 'Invalid request.' });
  }
});

app.post('/api/report-status-check-car-vin', async (req, res) => {
  try {
  
    const result2 = await getInspectKoreaByStatus('report generated');
    console.log(result2);
    if(result2 && result2.report_uuid){

       const generatedAt = new Date(result2.report_generated_on);
      const now = new Date();

      const diffMs = now.getTime() - generatedAt.getTime();
      const diffMinutes = diffMs / (1000 * 60);

      if (diffMinutes >= 5) {        
        const resp = await downloadCheckCarVinPdf(result2.report_uuid)
        await updateInspection({
              id: result2.inspection_id,
              status: 'report downloaded',
              
          });

          return res.status(200).json(resp);
      }
    }
    return res.status(200).json({message : 'no report for report parsing'});

  } catch (error) {
    console.error('Error inspection:', error.response?.data || error.message);
    res.status(500).json({ error: 'Invalid request.' });
  }
});

app.post('/api/parse-report-check-car-vin', async (req, res) => {
  try {
  
    const result2 = await getInspectKoreaByStatus('report downloaded');
    console.log(result2);
    if(!result2){
          return res.status(200).json({message : 'no report for report PDF'});
    }
    const reportId = result2.report_uuid.replace(/-/g, '');
  
    const pdfPath = path.resolve(__dirname, `uploads/${reportId}.pdf`);

    const resp = await extractVehicleData(pdfPath)

    if (resp && typeof resp === 'object' && !Array.isArray(resp) && resp.model && resp.year) {
        
        const inspection = await getInspectionById(result2.inspection_id);    

        const baseUrl = process.env.WEB_APP_BASE_URL;
        
        

        const safeResp = removeNullChars(resp)

        await updateCheckCarVinInspection(result2.id, {
          report_data: safeResp,
        });

        await updateInspection({
              id: result2.inspection_id,
              status: 'completed',
              
          });
        
        const shortUrl = baseUrl + `inspect-car/korea-report/?id=${inspection.id}`
        
        sendInspectionKoreaReport({vin : inspection.plate_number, email : inspection.email, short_link : shortUrl})

      
        console.log("Valid JSON object");
      
    } else {
      console.log("Not a valid JSON object");
    }

    return res.status(200).json(resp);
    

  } catch (error) {
    
    
    await updateInspection({
        id: result2.inspection_id,
        status: 'report generated',
        
    });
    console.error('Error inspection:', error.response?.data || error.message);
    res.status(500).json({ error: 'Invalid request.' });
  }
});

app.post('/api/login-check-car-vin', async (req, res) => {
  try {


    const email = await getAppSettings('check_car_vin_email');

    const password = await getAppSettings('check_car_vin_password');

    const { token, user } = await loginCheckCarVin(email.prop_value, password.prop_value);
    console.log('Login token:', token);
    console.log('User:', user);
    await updateAppSettings('check_car_vin_token', token);
    return res.status(200).json({token : token});

  } catch (error) {
    console.error('Error inspection:', error.response?.data || error.message);
    res.status(500).json({ error: 'Invalid request.' });
  }
});


app.post('/api/get-korea-report', async (req, res) => {
   try {
    const { id } = req.body;
    if (!id) return res.status(400).json({ error: "id is required" });
    const inspectionId = id;
    const inspection = await getInspectionById(inspectionId);    
    
    if (!inspection || inspection.length === 0) {
        return res.status(200).json({error: "Kërkesa nuk u gjet."}); 
    }else if(inspection.status == 'pending'){
        return res.status(200).json({error: "Ju lutemi përfundoni pagesën për të gjeneruar raportin."}); 
    }else if(inspection.status == 'paid'){
        return res.status(200).json({error: "Raporti është në pritje, ju lutemi prisni."}); 

    }else{
        const checkCarVinData = await getCheckCarVinInspectionByInspectionId(inspection.id)
        res.status(200).json(checkCarVinData.report_data);
    }    

  } catch (error) {
    console.error('Error inspection:', error.response?.data || error.message);
    res.status(500).json({ error : 'Invalid request.'});
  }
});



async function sendInspectionKoreaReport({ vin, email, short_link}) {
  if (!email) throw new Error("Email is required");
  if (!vin) throw new Error("vin is required");
  if (!short_link) throw new Error("short_link is required");


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
            Open Full Report ${vin}
          </a>
        </p>
        <p>If the button doesn't work, you can also click or paste this link:</p>
        <p><a href="${short_link}">${short_link}</a></p>
        <p>– 24ABA Team</p>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log("📧 Inspection link email sent to", email);


  return true;
}



app.listen(PORT, '0.0.0.0', () => {
  console.log(`✅ Backend proxy server is running on port ${PORT}`);
});

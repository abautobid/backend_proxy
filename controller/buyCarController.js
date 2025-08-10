// Removed incorrect import of req
const {vinCheck} = require('../utility/cebiaUtility');
const {getCarBrands,getModelsByBrand,getAllBuyCars,saveRecord} = require('../utility/supabaseUtility');
const crypto = require('crypto');
const nodemailer = require('nodemailer');


const getCarBrandsModels = async (req, res) => {
  try {
  
  const carBrands = await getCarBrands();
  const modelsByBrand = await getModelsByBrand();
    return res.status(200).json({ car_brands : carBrands , car_models : modelsByBrand});
  } catch (error) {
    console.error("Error fetching car brands models:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const getAllCars = async (req, res) => {
  try {
  
    const cars = await getAllBuyCars();
    return res.status(200).json(cars);
  } catch (error) {
    console.error("Error fetching car brands models:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const createBuyCarRequest = async (req, res) => {
    const { brand, model, year, budget, fullName, phone, details } = req.body;

    // Validate required fields
    if (!brand || !model || !year || !budget || !fullName || !phone) {
        return res.status(400).json({ error: "Missing required fields" });
    }

    try {
        const requestObj = {
            brand,
            model,
            year,
            budget,
            full_name: fullName,
            phone,
            details: details || null,
        };

        // Save to Supabase
        const insertedRequest = await saveRecord('buy_car_requests', requestObj);

        await sendBuyCarRequestEmail({
          brand,
          model,
          year,
          budget,
          fullName,
          phone,
          details,
          requestId: insertedRequest.id
      });

        return res.status(200).json({
            success: true,
            message: "Buy car request saved successfully.",
            request_id: insertedRequest.id
        });

    } catch (error) {
        console.error("Error saving buy car request:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};




async function sendBuyCarRequestEmail({
  brand,
  model,
  year,
  budget,
  fullName,
  phone,
  details,
  requestId
}) {
  if (!brand || !model || !year || !budget || !fullName || !phone) {
    throw new Error("Missing required Buy Car Request fields");
  }

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
    from: `"24ABA Buy Car Requests" <${process.env.EMAIL_USER}>`,
    to: `${process.env.SUPPORT_EMAIL}`,
    subject: "📋 New Buy Car Request Received!",
    html: `
      <p>Hello,</p>
      <p>A new Buy Car Request has been submitted.</p>
      <p>Details are as follows:</p>
      <p>
        Request ID: ${requestId || 'N/A'}<br>
        Brand: ${brand}<br>
        Model: ${model}<br>
        Year: ${year}<br>
        Budget: ${budget}<br>
        Full Name: ${fullName}<br>
        Phone: ${phone}<br>
        Additional Details: ${details || 'None'}<br>
      </p>
      <p>– 24ABA Team</p>
    `
  };

  await transporter.sendMail(mailOptions);
  console.log("📧 Buy Car Request email sent to support");

  return true;
};

module.exports = {
    getCarBrandsModels,
    getAllCars,
    createBuyCarRequest
};

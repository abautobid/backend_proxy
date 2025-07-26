const nodemailer = require('nodemailer');
const fs = require('fs');



async function sendEmailReport(email, short_link) {
   

    try{
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

    return true;
  } catch (error) {
    console.error('❌ Short link error:', error.response?.data || error.message);
    return false;
  }

    return false;
}

async function isValidPdf(filePath) {
  if (!fs.existsSync(filePath)) return false;
  const buffer = fs.readFileSync(filePath);
  return buffer.slice(0, 4).toString() === '%PDF';
}

module.exports = {
    sendEmailReport,
    isValidPdf
};
const nodemailer = require('nodemailer');
const fs = require('fs');
const i18n  = require("./i18n");

async function sendEmailReport(email, short_link, lang = "en") {
  try {
    // set user language
    i18n.setLocale(lang);

    const transporter = nodemailer.createTransport({
      service: "gmail",
      host: process.env.SMTP_HOST,
      port: parseInt(process.env.SMTP_PORT),
      secure: true,
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
      },
      tls: { rejectUnauthorized: false }
    });

    const mailOptions = {
      from: `"24ABA Inspections" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: i18n.__("email_report.subject"),
      html: `
        <p>${i18n.__("email_report.greeting")}</p>
        <p>${i18n.__("email_report.thanks")}</p>
        <p>${i18n.__("email_report.ready")}</p>
        <p style="text-align:center;">
          <a href="${short_link}" style="display:inline-block;padding:12px 24px;background-color:#e60023;color:#ffffff;text-decoration:none;border-radius:6px;font-weight:bold;">
            ${i18n.__("email_report.button")}
          </a>
        </p>
        <p>${i18n.__("email_report.alt_text")}</p>
        <p><a href="${short_link}">${short_link}</a></p>
        <p>${i18n.__("email_report.team")}</p>
      `
    };

    await transporter.sendMail(mailOptions);
    console.log("📧 Inspection link email sent to", email);
    return true;
  } catch (error) {
    console.error("❌ Email error:", error.message);
    return false;
  }
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
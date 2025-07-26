const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');

const PDFCO_API_KEY = process.env.PDFCO_API_KEY;
const PDFCO_BASE_URL = 'https://api.pdf.co/v1';

// Upload PDF file to PDF.co temporary cloud storage
async function uploadPdfToPdfCo(filePath) {
  const form = new FormData();
  form.append('file', fs.createReadStream(filePath));

  try {
    const response = await axios.post(
      `${PDFCO_BASE_URL}/file/upload`,
      form,
      {
        headers: {
          ...form.getHeaders(),
          'x-api-key': PDFCO_API_KEY
        }
      }
    );

    if (response.data.error) {
      console.error('❌ Upload Error:', response.data.message);
      return null;
    }

    console.log('✅ Uploaded file URL:', response.data.url);
    return response.data.url;
  } catch (error) {
    console.error('❌ Upload Exception:', error.response?.data || error.message);
    return null;
  }
}

// Async JSON conversion with job polling
async function convertPdfToJsonAsync(pdfUrl) {
  try {
    const createJobRes = await axios.post(
      `${PDFCO_BASE_URL}/ai-invoice-parser`,
      {
        url: pdfUrl,
        async: true
      },
      {
        headers: {
          'x-api-key': PDFCO_API_KEY,
          'Content-Type': 'application/json'
        }
      }
    );

    if (createJobRes.data.error) {
      console.error('❌ Convert Error:', createJobRes.data.message);
      return null;
    }

    const jobId = createJobRes.data.jobId;
    

    console.log(`📥 Job created: ${jobId}`);
    const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

    for (let i = 0; i < 20; i++) {
      await delay(3 * 60 * 1000); 
      const jobStatusRes = await axios.get(`${PDFCO_BASE_URL}/job/check?jobid=${jobId}`, {
        headers: { 'x-api-key': PDFCO_API_KEY }
      });

      const { status } = jobStatusRes.data;

      console.log(jobStatusRes.data)
      console.log(`⌛ Job status: ${status}`);

      if (status === 'success') {
        const resultUrl = jobStatusRes.data.url;
        const resultData = await axios.get(resultUrl);
        console.log('✅ JSON result ready.');
        return jobStatusRes.data.body;
      } else if (status === 'failed' || status === 'aborted') {
        console.error('❌ Job failed or aborted');
        return null;
      }
    }

    console.warn('⚠️ Job timeout: Result not ready after waiting.');
    return null;

  } catch (error) {
    console.error('❌ Async Convert Exception:', error.response?.data || error.message);
    return null;
  }
}

function normalizeKeys(obj) {
  if (Array.isArray(obj)) {
    return obj.map(normalizeKeys); // Recursively normalize array items
  } else if (typeof obj === 'object' && obj !== null) {
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [
        key.toLowerCase().replace(/\s+/g, '_'), // Lowercase + replace spaces with _
        normalizeKeys(value) // Recursive call
      ])
    );
  } else {
    return obj; // Return primitive values as-is
  }
}

function cleanValues(obj) {
  if (Array.isArray(obj)) {
    return obj.map(cleanValues);
  } else if (typeof obj === 'object' && obj !== null) {
    return Object.fromEntries(
      Object.entries(obj).map(([key, value]) => [key, cleanValues(value)])
    );
  } else if (typeof obj === 'string') {
    return obj
      .replace(/no recordsfound/gi, 'No records found')
      .replace(/yes/gi, 'Yes')
      .replace(/not available/gi, 'Not available')
      .replace(/not installed/gi, 'Not installed')
      .replace(/\s+/g, ' ') // normalize spaces
      .replace(/대한민국/g, 'KR') // Country mapping
      .trim();
  } else {
    return obj;
  }
}




module.exports = {
  uploadPdfToPdfCo,
  convertPdfToJsonAsync,
  normalizeKeys,
  cleanValues
};

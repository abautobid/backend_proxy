const axios = require('axios');
const qs = require('qs');
const puppeteer = require('puppeteer');
const { supabase } = require('../lib/supabaseClient.js');
const { logCheckCarVinRequest, getAppSettings} = require('./supabaseUtility');
const fs = require('fs');
const path = require('path');




async function getCheckCarVinToken() {
    const token = await getAppSettings('check_car_vin_token');

    return token.prop_value;
}

async function getCheckCarVinReportToken() {
    const token = await getAppSettings('check_car_vin_report_token');
    return token.prop_value;
}

async function getCheckCarVinXSRFToken() {
    const token = await getAppSettings('check_car_vin_xsrf_token');
    return token.prop_value;
}


async function getStoreCheckedVinRaw(vin) {
    const auth_token = await getCheckCarVinToken('check_car_vin_token');
    const token = `Bearer ${auth_token}`;

    const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        executablePath: puppeteer.executablePath(),
    });

    const page = await browser.newPage();

    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');

    console.log('[*] Navigating to checkcar.vin...');

    await page.goto('https://api.checkcar.vin', {
        waitUntil: 'networkidle2',
        timeout: 60000,
    });

    console.log('[*] Waiting for Cloudflare challenge to pass...');

    // Wait for cookies or JS challenges to resolve
    await new Promise(resolve => setTimeout(resolve, 15000));


    //const xToken = 'eyJpdiI6Ilp1Uzl5Z0RzUTltbXk0SnhRZks3QkE9PSIsInZhbHVlIjoicWZqT2hPKzdDZUtOazRCSjV1empXYk5QU2R3RWpndWRzRjBTZ2JXOStuL2dIMTBsbjFuZFNQc1N3UE13RFc3Wjl2UGxVYnFBbFdMY283QnMzeUh3OElFRXp3VFRodVVzekNOMk9KS2dCQ2hRZ05kWStlcjk3Y2hSbnpNanJVSnciLCJtYWMiOiI4OGU1NTZmNzJlZTNjMTU5ODc1ZjE2OWU2MzdiYzM4YjcwNzI5MDk3NTFjMjNiZjQ0NTEwYThmMmJlNmQ1ZDZjIiwidGFnIjoiIn0%3D';
    const xToken = await getCheckCarVinXSRFToken();
    const xsrfToken = decodeURIComponent(xToken);
    

    console.log('[*] Sending API request from within browser...');

    const responseData = await page.evaluate(async ({xsrfToken, vin, token }) => {
        const res = await fetch('/api/v1/dashboard/store-checked-vin', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': token,
                'Accept': 'application/json',
                'x-xsrf-token': xsrfToken,
            },
            body: JSON.stringify({ vin }),
        });

        const data = await res.json();
        
        return data;
    }, { xsrfToken, vin, token });

    await browser.close();


    return responseData;
}



async function getStoreCheckedVin(vin) {
  
    let resp = await getStoreCheckedVinRaw(vin);

    // Check if it's a stringified JSON object and parse it
    if (typeof resp === 'string') {
      try {
        resp = JSON.parse(resp);
      } catch (e) {
        console.error('Failed to parse top-level response:', e.message);
        return res.status(500).json({ error: 'Response is not valid JSON' });
      }
    }

    // Parse meta if it's a string
    if (resp.meta && typeof resp.meta === 'string') {
      try {
        resp.meta = JSON.parse(resp.meta);
      } catch (e) {
        console.warn("Failed to parse 'meta':", e.message);
        resp.meta = null;
      }
    }


    const { error } = await supabase
        .from('checkcarvin_logs')
        .insert([{
            request_data: { vin },
            response_data: resp,
            url : 'api/v1/dashboard/store-checked-vin'
        }]);

    if (error) {
        console.error('[Supabase] Failed to insert log:', error.message);
    }

    return resp;
}



async function payFromBalanceRaw(vin, email) {
    const auth_token = await getCheckCarVinToken('check_car_vin_token');
    const token = `Bearer ${auth_token}`;

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
     executablePath: puppeteer.executablePath(),
  });

  const page = await browser.newPage();

  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');

  console.log('[*] Navigating to checkcar.vin...');
  await page.goto('https://api.checkcar.vin', {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });

  console.log('[*] Waiting for Cloudflare challenge to pass...');
  await new Promise(resolve => setTimeout(resolve, 7000));

  const payload = {
    vin,
    email,
    paymentMethodSelected: {
      slug: "subscription",
      name: "Subscription",
      reportsAvailable: ["Report Available: 100"],
      tpr_ids: [5],
      available: true
    },
    selectedUserReport: {
      type_report_id: 5,
      type_report_slug: "checkcar",
      type_report_title: "Checkcar.vin",
      price: 9.99,
      sign: "EUR",
      discount: 0,
      retail_price: 9.99,
      desc: "A trusted source with an extensive database of US vehicles protecting the car market from unsafe vehicles",
      tpr_ids: [5],
      original_price: 9.99,
      buy_price: 9.99,
      currency_code: "EUR",
      name: "1 report",
      type: "retail"
    }
  };

  const xToken = await getCheckCarVinXSRFToken();
  const xsrfToken = decodeURIComponent(xToken);

  console.log('[*] Sending payment request...');
  const response = await page.evaluate(async ({ xsrfToken, token, payload }) => {
    try {
      const res = await fetch('https://api.checkcar.vin/api/v1/dashboard/pay-from-balance', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token,
          'Accept': 'application/json',
          'x-xsrf-token': xsrfToken,
        },
        body: JSON.stringify(payload)
      });
      return await res.json();
    } catch (err) {
      return { error: 'Request failed', message: err.message };
    }
  }, { xsrfToken, token, payload });

  await browser.close();

  await logCheckCarVinRequest({
    url: 'api/v1/dashboard/pay-from-balance',
    request: payload,
    response
  });

  return response;
}


async function checkReportStatusRaw({ vin, user_id, reports, intent = "", cnt = 1 }) {
  const auth_token_report = await getCheckCarVinReportToken();
  const token = `Bearer ${auth_token_report}`;
  console.log(auth_token_report);

  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
     executablePath: puppeteer.executablePath(),
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');

  console.log('[*] Navigating to checkcar.vin...');
  await page.goto('https://api.checkcar.vin', {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });

  console.log('[*] Waiting for Cloudflare challenge to pass...');
  await new Promise(resolve => setTimeout(resolve, 7000));

  const payload = {
    vin,
    user_id,
    reports,
    intent,
    cnt,
  };

  console.log('[*] Sending status check request...');
	const xToken = await getCheckCarVinXSRFToken();
  const xsrfToken = decodeURIComponent(xToken);

  const response = await page.evaluate(async ({ xsrfToken, token, payload }) => {
    try {
      const res = await fetch('https://api.checkcar.vin/api/v1/report/stripe-check-status-report', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token,
          'Accept': 'application/json',
          'x-xsrf-token': xsrfToken,
        },
        body: JSON.stringify(payload)
      });

      return await res.json();
    } catch (err) {
      return { error: 'Request failed', message: err.message };
    }
  }, {xsrfToken,  token, payload });

  await browser.close();

  
  await logCheckCarVinRequest({
    url: 'api/v1/report/stripe-check-status-report',
    request: payload,
    response
  });


  return response;
}

async function loginCheckCarVin(email, password) {
  const auth_token_report = await getCheckCarVinReportToken();
  const token = `Bearer ${auth_token_report}`;


  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
    executablePath: puppeteer.executablePath(),
  });

  const page = await browser.newPage();

  await page.setUserAgent(
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36'
  );

  // Go to site to trigger Cloudflare challenge
  await page.goto('https://api.checkcar.vin', {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });

  
  await new Promise(resolve => setTimeout(resolve, 15000));

  const xToken = await getCheckCarVinXSRFToken();
  const xsrfToken = decodeURIComponent(xToken);

  const response = await page.evaluate(async ({xsrfToken, token, email, password }) => {
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': token,
          'Accept': 'application/json',
            'x-xsrf-token': xsrfToken,

        },
        body: JSON.stringify({
          email,
          password,
          device_name: 'Mozilla/5.0 Chrome/114.0.0.0',
        }),
      });

      const data = await res.json();
      return { ok: true, data };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }, { xsrfToken, token, email, password });

  await browser.close();

  if (!response.ok) {
    console.error('Login failed:', response.error);
    return { error: response.error };
  }

  // Optional logging
  await logCheckCarVinRequest({
    url: 'auth/login',
    request: { email, password },
    response: response.data,
  });

  return response.data;
}




async function downloadCheckCarVinPdf(reportIdRaw) {
  const auth_token_report = await getCheckCarVinReportToken();
  const token = `Bearer ${auth_token_report}`;
  const reportId = reportIdRaw.replace(/-/g, '');
  const pdfUrl = `https://api.checkcar.vin/api/v1/report/pdf/${reportId}?path=%2Freport%2F${reportId}`;

  console.log('[*] Launching browser...');
  const browser = await puppeteer.launch({
    headless: 'new',
    args: ['--no-sandbox', '--disable-setuid-sandbox'],
     executablePath: puppeteer.executablePath(),
  });

  const page = await browser.newPage();
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/114.0.0.0 Safari/537.36');

  console.log('[*] Navigating to checkcar.vin...');
  await page.goto('https://api.checkcar.vin', {
    waitUntil: 'networkidle2',
    timeout: 60000,
  });

  console.log('[*] Waiting for Cloudflare challenge to pass...');
  await new Promise(resolve => setTimeout(resolve, 9000));


  console.log('[*] Downloading PDF inside browser context...');

  const xToken = await getCheckCarVinXSRFToken();
  const xsrfToken = decodeURIComponent(xToken);

  const base64Pdf = await page.evaluate(async ({xsrfToken, pdfUrl, token }) => {
  const res = await fetch(pdfUrl, {
    method: 'GET',
    headers: {
      'Authorization': token,
      'Accept': 'application/pdf',
      	'x-xsrf-token': xsrfToken,
    }
  });

  if (!res.ok) {
    return { error: true, status: res.status, statusText: res.statusText };
  }

  const blob = await res.blob();

  // Use FileReader to convert Blob to base64 safely
  return await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve({ error: false, base64: reader.result.split(',')[1] }); // Remove the prefix
    reader.onerror = () => reject({ error: true, message: 'Failed to read blob as base64' });
    reader.readAsDataURL(blob);
  });
}, { xsrfToken, pdfUrl, token });

  if (base64Pdf.error) {
    await browser.close();
    throw new Error(`Download failed with status: ${base64Pdf.status} ${base64Pdf.statusText}`);
  }

  // Convert base64 back to Buffer and save
  const filePath = path.resolve('var/data/uploads', `${reportId}.pdf`);
  const pdfBuffer = Buffer.from(base64Pdf.base64, 'base64');
  fs.writeFileSync(filePath, pdfBuffer);

  console.log(`[*] PDF saved at: ${filePath}`);
  await browser.close();
}


function removeNullChars(obj) {
  if (typeof obj === 'string') {
    return obj.replace(/\u0000/g, '');
  } else if (Array.isArray(obj)) {
    return obj.map(removeNullChars);
  } else if (typeof obj === 'object' && obj !== null) {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [k, removeNullChars(v)])
    );
  }
  return obj;
}



module.exports = {
    getCheckCarVinToken,
    getStoreCheckedVin,
    payFromBalanceRaw,
    checkReportStatusRaw,
    loginCheckCarVin,
    downloadCheckCarVinPdf,
    removeNullChars
};
const axios = require('axios');
const qs = require('qs');
const puppeteer = require('puppeteer');
const { supabase } = require('../lib/supabaseClient.js');
const { logCheckCarVinRequest, getAppSettings} = require('./supabaseUtility');
const { isValidPdf } = require('./helper.js');

const fs = require('fs');
const path = require('path');

const DAILY_LIMIT = parseInt(process.env.CHECKCARVIN_DAILY_LIMIT || '15', 10);





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


async function getStoreCheckedVinRaw(vin, account) {
    const auth_token = account.token;
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
    await new Promise(resolve => setTimeout(resolve, 30000));


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



async function getStoreCheckedVin(vin, account) {
  
    let resp = await getStoreCheckedVinRaw(vin, account);

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



async function payFromBalanceRaw(vin, account) {

  
  const token = `Bearer ${account.token}`;
  const email = account.email;

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
  await new Promise(resolve => setTimeout(resolve, 30000));

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

  const xsrfToken = decodeURIComponent(account.xsrf_token);

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
  await new Promise(resolve => setTimeout(resolve, 30000));

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
  await new Promise(resolve => setTimeout(resolve, 30000));


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
  const filePath = path.resolve(__dirname, `../uploads/${reportId}.pdf`);
  const pdfBuffer = Buffer.from(base64Pdf.base64, 'base64');
  fs.writeFileSync(filePath, pdfBuffer);

  console.log(`[*] PDF saved at: ${filePath}`);

  const isValid = await isValidPdf(filePath)
  if (!isValid) {
     console.log('❌ Skipped: Invalid PDF downloaded');
     return false;
  }

  await browser.close();
  return true;
}


function removeNullChars(obj) {
  if (typeof obj === 'string') {
    return obj.replace(/\u0000/g, '');
  } else if (Array.isArray(obj)) {
    return obj.map(removeNullChars);
  } else if (typeof obj === 'object' && obj !== null) {
    return Object.fromEntries(
      Object.entries(obj).map(([k, v]) => [
        typeof k === 'string' ? k.replace(/\u0000/g, '') : k,
        removeNullChars(v)
      ])
    );
  }
  return obj;
}




async function generateTokensForAllAccounts() {
  const { data: accounts, error } = await supabase
    .from('checkcarvin_accounts')
    .select('id, email, password');

  if (error || !accounts) {
    console.error('Failed to fetch accounts:', error?.message);
    return;
  }

  for (const account of accounts) {
    console.log(`[*] Logging in: ${account.email}`);

    let browser;
    try {
      // Configure browser for Render.com with proper args
      browser = await puppeteer.launch({
        headless: 'new',
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-web-security',
          '--disable-features=IsolateOrigins,site-per-process',
          '--disable-blink-features=AutomationControlled',
          '--user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36',
          '--window-size=1920,1080',
          '--lang=en-US,en;q=0.9'
        ],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      });

      const page = await browser.newPage();
      
      // Set viewport and user agent
      await page.setViewport({ width: 1920, height: 1080 });
      await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36');
      
      // Set extra headers to mimic real browser
      await page.setExtraHTTPHeaders({
        'accept-language': 'en-US,en;q=0.9',
        'sec-ch-ua': '"Not;A=Brand";v="99", "Google Chrome";v="139", "Chromium";v="139"',
        'sec-ch-ua-mobile': '?0',
        'sec-ch-ua-platform': '"Windows"',
      });

      // Block unnecessary resources to speed up loading
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        if (['image', 'stylesheet', 'font', 'media'].includes(req.resourceType())) {
          req.abort();
        } else {
          req.continue();
        }
      });

      console.log('Navigating to checkcar.vin...');
      
      // Navigate to the main site first
      await page.goto('https://checkcar.vin/', {
        waitUntil: 'networkidle0',
        timeout: 60000
      });

      // Wait for potential Cloudflare challenge
      await page.waitForTimeout(8000);

      // Check if we're on a Cloudflare challenge page
      const pageContent = await page.content();
      if (pageContent.includes('cloudflare') || pageContent.includes('challenge')) {
        console.log('Cloudflare challenge detected, waiting longer...');
        await page.waitForTimeout(15000);
        
        // Try to reload if still on challenge page
        if (await page.$('#challenge-form')) {
          await page.reload({ waitUntil: 'networkidle0', timeout: 60000 });
          await page.waitForTimeout(10000);
        }
      }

      console.log('Attempting login via API...');
      
      // Execute the login request directly in browser context
      const loginResult = await page.evaluate(async (accountData) => {
        try {
          const response = await fetch('https://api.checkcar.vin/api/v1/auth/login', {
            method: 'POST',
            headers: {
              'accept': 'application/json, text/plain, */*',
              'accept-language': 'en-US,en;q=0.9',
              'authorization': 'Bearer 46q2HXB30a0aVko7FHM8pIlKD4XjuyEL',
              'content-type': 'application/json',
              'priority': 'u=1, i',
              'sec-ch-ua': '"Not;A=Brand";v="99", "Google Chrome";v="139", "Chromium";v="139"',
              'sec-ch-ua-mobile': '?0',
              'sec-ch-ua-platform': '"Windows"',
              'sec-fetch-dest': 'empty',
              'sec-fetch-mode': 'cors',
              'sec-fetch-site': 'same-site',
              'x-client-system-locale': 'null',
              'x-forwarded-for': '2400:adc1:4bc:8000:ed9a:cdd3:95eb:3637',
              'x-request-country-code': 'eu',
              'x-request-locale': 'en',
              'referer': 'https://checkcar.vin/'
            },
            credentials: 'include',
            body: JSON.stringify({
              email: accountData.email,
              password: accountData.password,
              device_name: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/139.0.0.0 Safari/537.36'
            })
          });

          const data = await response.json();
          return { 
            success: response.ok, 
            data, 
            status: response.status,
            headers: Object.fromEntries([...response.headers.entries()])
          };
        } catch (error) {
          return { success: false, error: error.message };
        }
      }, account);

      console.log(`Login response status: ${loginResult.status}`);
      
      if (!loginResult.success || !loginResult.data?.token) {
        console.error(`[!] Login failed for ${account.email}:`, loginResult.error || loginResult.data);
        
        // Take screenshot for debugging
        await page.screenshot({ path: `debug-${account.email.replace('@', '-')}.png` });
        continue;
      }

      // Get cookies from the browser session
      const cookies = await page.cookies();
      const xsrfTokenCookie = cookies.find(c => c.name === 'XSRF-TOKEN');

      console.log(`Login successful for ${account.email}, updating database...`);

      // Update database
      const { error: updateError } = await supabase
        .from('checkcarvin_accounts')
        .update({
          token: loginResult.data.token,
          xsrf_token: xsrfTokenCookie ? xsrfTokenCookie.value : null,
          token_generated_at: new Date().toISOString(),
        })
        .eq('id', account.id);

      if (updateError) {
        console.error(`[!] Failed to update token for ${account.email}:`, updateError.message);
      } else {
        console.log(`[+] Token updated for ${account.email}`);
      }

      await logCheckCarVinRequest({
        url: 'auth/login',
        request: { email: account.email },
        response: loginResult.data,
      });

    } catch (error) {
      console.error(`[!] Error processing ${account.email}:`, error.message);
    } finally {
      if (browser) {
        await browser.close();
      }
      // Add delay between accounts to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
}

// accountUtility.js
async function getAvailableAccount() {
  const today = new Date().toISOString().slice(0, 10);

  const { data: accounts, error } = await supabase
    .from('checkcarvin_accounts')
    .select('*')
    .order('last_used_at', { ascending: true });

  if (error) throw new Error('Failed to fetch accounts: ' + error.message);

  for (const acc of accounts) {
    const lastUsedDate = acc.last_used_at?.toString().slice(0, 10);

    if (lastUsedDate !== today) {
      await supabase
        .from('checkcarvin_accounts')
        .update({
          daily_report_count: 0,
          last_used_at: new Date().toISOString()
        })
        .eq('id', acc.id);

      acc.daily_report_count = 0;
    }

    if (acc.daily_report_count < DAILY_LIMIT) {
      return acc;
    }
  }

  return null; 
}



async function incrementAccountUsage(accountId) {
  // First: Fetch current count
  const { data: accountData, error: fetchError } = await supabase
    .from('checkcarvin_accounts')
    .select('daily_report_count')
    .eq('id', accountId)
    .single();

  if (fetchError) {
    console.error('[SUPABASE] Failed to fetch account for increment:', fetchError.message);
    return null;
  }

  const currentCount = accountData.daily_report_count || 0;

  // Second: Update with incremented value
  const { data, error: updateError } = await supabase
    .from('checkcarvin_accounts')
    .update({
      daily_report_count: currentCount + 1,
      last_used_at: new Date().toISOString()
    })
    .eq('id', accountId);

  if (updateError) {
    console.error('[SUPABASE] Failed to increment account usage:', updateError.message);
    return null;
  }

  return data;
}


// accountUtility.js

async function getLatestTokenAccount() {
  const { data: accounts, error } = await supabase
    .from('checkcarvin_accounts')
    .select('*')
    .order('token_generated_at', { ascending: false }) // latest token first
    .limit(1);

  if (error) throw new Error('Failed to fetch latest token account: ' + error.message);

  if (!accounts || accounts.length === 0) {
    return null;
  }

  const account = accounts[0];

  // Optional: Validate token freshness (e.g., not older than 1 day)
  const generatedAt = new Date(account.token_generated_at);
  const now = new Date();
  const ageInHours = (now - generatedAt) / (1000 * 60 * 60);

  if (ageInHours > 24) {
    console.warn('[!] Latest token is older than 24 hours. Consider refreshing.');
  }

  return account;
}


module.exports = {
    getCheckCarVinToken,
    getStoreCheckedVin,
    payFromBalanceRaw,
    checkReportStatusRaw,
    loginCheckCarVin,
    downloadCheckCarVinPdf,
    removeNullChars,
    generateTokensForAllAccounts,
    getAvailableAccount,
    incrementAccountUsage,
    getLatestTokenAccount
};
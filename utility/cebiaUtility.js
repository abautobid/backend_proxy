const axios = require('axios');
const qs = require('qs');

const CEBIA_API_URL = process.env.CEBIA_API_URL;


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


async function createBaseInfoQuery(vin) {
    const cebiaToken = await getCebiaToken();
    console.log(vin)
    const response = await axios.get(
        `https://app.cebia.com/api/Autotracer_test/v1/CreateBaseInfoQuery/${vin}`,
        {
            headers: {
                Accept: "application/json",
                Authorization: `Bearer ${cebiaToken}`,
            },
        }
    );
    return response.data;
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


async function getPayedDataQuery(queueId, cebiaToken) {

  
  const maxRetries = 10;
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  try {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        console.log(`🔁 Poll attempt ${attempt} for VIN: ${queueId}`);

        const response = await axios.get(
          `${CEBIA_API_URL}GetPayedDataQuery/${queueId}`,
          {
            headers: {
              Accept: "application/json",
              Authorization: `Bearer ${cebiaToken}`,
            },
          }
        );
        console.log(response.data)
        const { couponNumber } = response.data;

        if (couponNumber) {
          console.log("Coupan Number "+couponNumber);
          return couponNumber; 
        }    
    }

    return false;
  } catch (err) {
    console.error("❌ Polling error:", err.response?.data || err.message);
    return false;
  }
};



module.exports = {
    getCebiaToken,
    createBaseInfoQuery,
    getPayedDataQuery,
    getCebiaBasicInfoQueueId
};
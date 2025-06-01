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

      const { queueStatus, baseInfoData, queue, status, message} = response.data;
      console.log(response.data);

      if(status == 400 && message === "Invalid test VIN."){
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


async function getPayedDataQuery(queueId, cebiaToken) {
  const maxRetries = 10;
  const delay = ms => new Promise(resolve => setTimeout(resolve, ms));

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    console.log(`🔁 Poll attempt ${attempt} for queue: ${queueId}`);

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
        console.log("🎉 Coupon Number: " + couponNumber);
        return couponNumber;
      }
    } catch (err) {
      console.error("❌ Polling error:", err.response?.data || err.message);
    }

    // Wait before retrying
    await delay(2000); // waits 2 seconds before next attempt
  }

  console.warn("⚠️ Max retries reached. No coupon number received.");
  return false;
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


module.exports = {
    getCebiaToken,
    createBaseInfoQuery,
    getPayedDataQuery,
    getCebiaBasicInfoQueueId,
    getCebiaBasicInfo
};
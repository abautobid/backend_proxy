// Removed incorrect import of req
const { getCebiaToken, getCebiaBasicInfoQueueId, getPayedDataQuery ,getCebiaBasicInfo} = require('../utility/cebiaUtility');
const { saveInspection, getInspectionList, getTotalInspectionsByReseller, getMonthlyInspections, getUserByEmail, getInspectionsByPlateAndEmail,getCommissionSummaryByPeriods, getUserById} = require('../utility/supabaseUtility');
const crypto = require('crypto');


const licensePlateLookup = async (req, res) => {
    const { vin, email } = req.body;
    if (!vin || !email) {
        return res.status(400).json({ error: "vin and email is required" });
    }
    try {
        const response = await createBaseInfoQuery(vin);
        if (!response) {
             return res.status(500).json({ error: "Failed to create BaseInfoQuery" });
        }
        console.log("Response from Cebia:", response);

        // todo: uncomment this when cebia starts giving the correct response.
        if (response?.status !== 200) {
            return res.status(response.status).json({ error: response.message });
        }
        
        const inspectionObj = {
            plate_number: vin,
            queue_id: response?.queue_id,
            status: response?.queueStatus,
            //user_id: userId
        };

        // const inspectionObj = {
        //     plate_number: vin,
        //     queue_id: crypto.randomBytes(48).toString('base64url'),
        //     status: 2,
        //     user_id: userId
        // };

        if (await saveInspection(inspectionObj)) {
             return res.status(200).json({ message: "Inspection submitted successfully" });
        }

        const inspections = await getInspectionsByPlateAndEmail(vin, email);
        if (!inspections || inspections.length === 0) {
            return res.status(404).json({ error: "No inspections found" });
        }
        console.log("Inspections:", inspections);
        return res.status(200).json({ inspections });
    } catch (error) {
        console.error("Error in inspection:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

const getInspection = async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const pageSize = parseInt(req.query.pageSize) || 5;
        const startIndex = (page - 1) * pageSize;

        const { inspections, count } = await getInspectionList(startIndex, pageSize);

        return res.status(200).json({
            data: inspections,
            metadata: {
                totalRecords: count,
                currentPage: page,
                pageSize: pageSize,
                totalPages: Math.ceil(count / pageSize)
            }
        });
    } catch (error) {
        console.error("Error fetching inspections:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

const getSummary = async (req, res) => {
    try {
        // Get current month's first and last date
        const now = new Date();
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

        // Get total count
        const user_id = req.user.id;
        const totalData = await getTotalInspectionsByReseller(user_id);
        const totalDataByPeriods = await getCommissionSummaryByPeriods(user_id);

        
        const monthlyData = await getMonthlyInspections(firstDay, lastDay);

        // Calculate status percentages
        const statusCounts = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0 };
       
        const totalCount = totalData.count;
        const statusPercentages = {};

        Object.keys(statusCounts).forEach(status => {
            const percentage = totalCount > 0
                ? ((statusCounts[status] / totalCount) * 100).toFixed(0)
                : 0;
            statusPercentages[status] = percentage;
        });


          const inspections = totalData.data.map(item => ({
            id: item.id,
            customer: item.email,
            vin: item.plate_number,
            date: new Date(item.created_at).toISOString().split("T")[0], // or formatted date
            status: item.status, // you define this mapping
            commission: item.commission || 0,
            cebia_coupon_number: item.cebia_coupon_number || 0,
           }));

        return res.status(200).json({
            total_inspections: totalCount,
            current_month_revenue: totalData.totalCommission,
            current_month_inspection_sold: totalData.count,
            inspection_data:inspections,
            status_distribution: statusPercentages,
            commission_summary_by_periods : totalDataByPeriods
            
        });

    } catch (error) {
        console.error("Error getting summary:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

const remainingCredits = async (req, res) => {
    const email = req.query.email;
    if (!email) {
        return res.status(400).json({ error: "email is required" });
    }
    try {
        const user = await getUserByEmail(email);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }
        const limit = user.inspection_limit || 0;
        const used = user.inspections_used || 0;
        const remainingCredits = (limit - used) > 0 ? (limit - used) : 0;
        return res.status(200).json({ remaining_credits: remainingCredits });
    } catch (error) {
        console.error("Error fetching remaining credits:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
}

const profileInfo = async (req, res) => {
    const userId = req.user.id;
    if (!userId) {
        return res.status(400).json({ error: "userId is required" });
    }
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    if (!uuidRegex.test(userId)) {
        return res.status(400).json({ error: "Invalid userId format. It should be a valid UUID." });
    }
    try {
        const user = await getUserById(userId);
        if (!user) {
            return res.status(404).json({ error: "User not found" });
        }
        return res.status(200).json({ ...user });
    } catch (error) {
        console.error("Error fetching user profile:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
}



const createInspect = async (req, res) => {
    const user = req.user
    console.log(user);
    const { vin, email } = req.body;
    if (!vin || !email) {
        return res.status(400).json({ error: "vin and email is required" });
    }
    try {
      
        const cebiaToken = await getCebiaToken();
    
        const cebiaQueue = await getCebiaBasicInfoQueueId(vin,cebiaToken);
        if(cebiaQueue.error){
            return res.status(400).json({ error: cebiaQueue.error });
        }

        const couponNumber = await getPayedDataQuery(cebiaQueue,cebiaToken);

        const inspectionObj = {
            plate_number: vin,
            email : email,
            queue_id: cebiaQueue,
            cebia_coupon_number : couponNumber,
            status: 'completed',
            user_id : null,
            inspection_case_id: null,
            reseller_id : user.id,
            commission : 5
        };
        
        await saveInspection(inspectionObj)

        return res.status(200).json({ succes : true, message : "Inspection completed succesfully." });
    } catch (error) {
        console.error("Error in inspection:", error);
        return res.status(500).json({ error: "Internal server error" });
    }
};

const reviewInspection = async (req, res) => {
    try {
        const { vin } = req.body;
        if (!vin) return res.status(400).json({ error: "VIN is required" });
  
        const cebiaToken = await getCebiaToken();

         
        const cebiaQueueNew = await getCebiaBasicInfoQueueId(vin,cebiaToken);
        const baseInfoDataNew = await getCebiaBasicInfo(cebiaQueueNew,cebiaToken);
        return res.status(200).json(baseInfoDataNew);
        
    } catch (err) {
        console.error("Stripe Error:", err.message);
        res.status(500).json({ error: "Could not create Stripe session" });
    }

};


module.exports = {
    licensePlateLookup,
    getInspection,
    getSummary,
    remainingCredits,
    profileInfo,
    createInspect,
    reviewInspection
};

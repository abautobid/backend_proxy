const { supabase } = require('../lib/supabaseClient.js');

async function saveInspection(inspectionObj) {
    // Check if the inspectionObj is valid
    if (!inspectionObj || typeof inspectionObj !== 'object') {
        throw new Error('Invalid inspection object');
    }
    // save into supabase inspection table
    const { data, error } = await supabase
        .from('inspections')
        .insert([
            {
                plate_number: inspectionObj.plate_number,
                email: inspectionObj.email,
                queue_id: inspectionObj.queue_id,
                status: inspectionObj.status,
                user_id: inspectionObj.user_id,
                reseller_id : inspectionObj.reseller_id,
                inspection_case_id: inspectionObj.inspection_case_id,
                cebia_coupon_number : inspectionObj.cebia_coupon_number,
                commission : inspectionObj.commission,
                model : inspectionObj.model,
                brand : inspectionObj.brand,
                vin_type : inspectionObj.vin_type,
                promo_code : inspectionObj.promo_code,
                discount :  inspectionObj.discount,
                inspection_fee : inspectionObj.inspection_fee
                
            }
        ]).select(); ;

       
    if (error) {
        console.error('Error inserting data:', error);   
        throw new Error('Error inserting data into Supabase');

    }
     return data[0].id;
    // const { data: tables, error } = await supabase
    //     .from('user').select('*');

    // console.log('Tables:', tables);
}


async function updateInspection(inspectionObj) {
    // Validate input
    if (!inspectionObj || typeof inspectionObj !== 'object' || !inspectionObj.id) {
        throw new Error('Invalid inspection object or missing ID');
    }

    // Destructure the ID from the object and keep the rest
    const { id, ...updateData } = inspectionObj;

    // Perform the update
    const { data, error } = await supabase
        .from('inspections')
        .update(updateData)
        .eq('id', id)
        .select(); // Optional: returns the updated row

    if (error) {
        console.error('Error updating data:', error);
        throw new Error('Error updating inspection in Supabase');
    }

    return data[0]; // or `data[0].id` if you only need the ID
}

async function getInspectionsByPlateAndEmail(plateNumber, email) {
    const { data, error } = await supabase
        .from('inspections')
        .select('*')
        .eq('plate_number', plateNumber)
        .eq('email', email);

    if (error) {
        console.error('Error fetching inspections:', error);
        return null;
    }

    return data;
};

async function getInspectionList(startIndex, pageSize) {
    const { data: inspections, count, error } = await supabase
        .from('inspections')
        .select('*', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range(startIndex, startIndex + pageSize - 1);
    if (error) {
        console.error('Error fetching inspections:', error);
        throw new Error('Error fetching inspections from Supabase');
    }
    return { inspections, count };
}

async function getTotalInspections() {
    // Get total count
    const { data: totalData, error: totalError } = await supabase
        .from('inspections')
        .select('id', { count: 'exact' });
    if (totalError) {
        console.error('Error fetching total inspections:', totalError);
        throw new Error('Error fetching total inspections from Supabase');
    }
    return totalData;
}

async function getTotalInspectionsByReseller(reseller_id) {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const startOfNextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();

    const { data, count, error } = await supabase
        .from('inspections')
        .select('*', { count: 'exact' })
        .eq('reseller_id', reseller_id)
        .gte('created_at', startOfMonth)
        .lt('created_at', startOfNextMonth); // created_at is assumed column

    if (error) {
        return { totalCommission: 0, count: 0, data: {} };
    } else {
        const totalCommission = data.reduce((sum, row) => sum + row.commission, 0);
        return { totalCommission, count, data };
    }
}


async function getCommissionSummaryByPeriods(reseller_id) {
  const { data, error } = await supabase
    .from('inspections')
    .select('commission, created_at')
    .eq('reseller_id', reseller_id);

  if (error) {
    return {
      day: { labels: ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"], values: [0, 0, 0, 0, 0, 0, 0] },
      week: { labels: ["Week 1", "Week 2", "Week 3", "Week 4"], values: [0, 0, 0, 0] },
      month: { labels: ["Jan", "Feb", "Mar", "Apr", "May"], values: [0, 0, 0, 0, 0] },
    };
  }

  const dailyLabels = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const weeklyLabels = ["Week 1", "Week 2", "Week 3", "Week 4"];
  const monthlyLabels = ["Jan", "Feb", "Mar", "Apr", "May"];

  const dailyValues = Array(7).fill(0);
  const weeklyValues = Array(4).fill(0);
  const monthlyValues = Array(5).fill(0);

  const now = new Date();

  const getWeekOfMonth = (date) => {
    const day = date.getDate();
    return Math.ceil(day / 7) - 1; // returns 0-based week index (0 = Week 1)
  };

  data.forEach(({ commission, created_at }) => {
    const date = new Date(created_at);
    const day = date.getDay(); // Sunday = 0
    const dayIndex = (day + 6) % 7; // Make Monday = 0, Sunday = 6
    dailyValues[dayIndex] += commission;

    if (date.getMonth() === now.getMonth() && date.getFullYear() === now.getFullYear()) {
      const weekIndex = getWeekOfMonth(date);
      if (weekIndex >= 0 && weekIndex < 4) {
        weeklyValues[weekIndex] += commission;
      }
    }

    const currentMonthIndex = now.getMonth(); // 0 = Jan
    const currentYear = now.getFullYear();
    const monthIndex = date.getMonth();
    if (date.getFullYear() === currentYear && monthIndex <= currentMonthIndex && monthIndex < 5) {
      monthlyValues[monthIndex] += commission;
    }
  });

  return {
    day: {
      labels: dailyLabels,
      values: dailyValues,
    },
    week: {
      labels: weeklyLabels,
      values: weeklyValues,
    },
    month: {
      labels: monthlyLabels,
      values: monthlyValues,
    },
  };
}



async function getMonthlyInspections(firstDay, lastDay) {
    // Get current month count
    const { data: monthlyData, error: monthlyError } = await supabase
        .from('inspections')
        .select('report_link')
        .gte('created_at', firstDay.toISOString())
        .lte('created_at', lastDay.toISOString());
    if (monthlyError) {
        console.error('Error fetching monthly inspections:', monthlyError);
        throw new Error('Error fetching monthly inspections from Supabase');
    }
    return monthlyData;
}

async function getUserByEmail(email) {
    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .single();
    console.log('User:', user);
    if (error) {
        console.error('Error fetching user by ID:', error);
        throw new Error('Error fetching user by ID from Supabase');
    }
    return user;
}

async function getUserById(id) {
    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('id', id)
        .single();
    console.log('User:', user);
    if (error) {
        console.error('Error fetching user by ID:', error);
        throw new Error('Error fetching user by ID from Supabase');
    }
    return user;
}

async function getResellerByReferralCode(referralCode) {
    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('referral_code', referralCode)
        .single();
    console.log('User:', user);
    if (error) {
        console.error('Error fetching user by ID:', error);
    }
    return user;
}



async function getInspectionsForInspectCar(plateNumber, email) {
    const { data, error } = await supabase
        .from('inspections')
        .select('*')
        .eq('plate_number', plateNumber)
        .eq('email', email)
        .eq('created_by', 'customer') 
        .gte('created_at', new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString());

    if (error) {
        console.error('Error fetching inspections:', error);
        return null;
    }

    return data;
};

async function getInspectionById(inspectionId) {
    const { data, error } = await supabase
        .from('inspections')
        .select('*')
        .eq('id', inspectionId);

    if (error) {
        console.error('Error fetching inspections:', error);
        return null;
    }

    return data[0];
};

async function getAllResellers() {
    const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('type', 'reseller')
        .order('created_at', { ascending: false });

    if (error) {
        console.error('Error fetching resellers:', error);
        throw new Error('Error fetching resellers from Supabase');
    }

    return data;
}


async function createResellerWithAuth(resellerData) {
    const {
        email,
        password,
        name,
        company,
        phone,
        location,
        commission_rate,
        status = 'active'
    } = resellerData;

    if (!email || !password || !name) {
        throw new Error('Missing required fields: email, password, name');
    }

    // 1. Create auth user
    const { data: authUser, error: authError } = await supabase.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
    });

    if (authError) {
        throw new Error(authError.message);
    }

    const userId = authUser.user.id;

    // 2. Insert into public.users
    const { data, error } = await supabase.from('users').insert([
        {
        id: userId,
        email,
        name,
        company,
        phone,
        location,
        commission_rate,
        type: 'reseller',
        status,
        }
    ]).select('*');

    if (error) {
        throw new Error('Failed to create new reseller. Please try again.');
    }

    return data[0];
}


async function updateResellerById(resellerId, updatedData) {
  const {
    email,
    name,
    company,
    phone,
    location,
    commission_rate,
    status,
  } = updatedData;

  if (!resellerId) {
    throw new Error('Missing reseller ID for update.');
  }

 
  if (email) {
    const { error: authUpdateError } = await supabase.auth.admin.updateUserById(resellerId, {
      email,
    });

    if (authUpdateError) {
      throw new Error(`Failed to update auth email: ${authUpdateError.message}`);
    }
  }


  // Update fields in public.users table
  const { data, error } = await supabase
    .from('users')
    .update({
      ...(email && { email }),
      ...(name && { name }),
      ...(company && { company }),
      ...(phone && { phone }),
      ...(location && { location }),
      ...(commission_rate !== undefined && { commission_rate }),
      ...(status && { status }),
    })
    .eq('id', resellerId)
    .select('*');

  if (error) {
    throw new Error(`Failed to update reseller: ${error.message}`);
  }

  return data[0];
}

async function getMonthlyInspectionStats() {
    const now = new Date();
    const inspectionsTrend = [];

    for (let i = 4; i >= 0; i--) {
        const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);

        const { count, error } = await supabase
            .from('inspections')
            .select('id', { count: 'exact', head: true })
            .in('status', ['completed', 'paid'])
            .gte('created_at', start.toISOString())
            .lt('created_at', end.toISOString());

        if (error) {
            console.error(`Error fetching inspections for ${start.toLocaleString('default', { month: 'short' })}:`, error);
            throw new Error('Error fetching inspections trend');
        }

        inspectionsTrend.push({
            month: start.toLocaleString('default', { month: 'short' }),
            count: count || 0,
        });
    }

    // Existing logic for current/previous stats...
    const currentMonthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1).toISOString();
    const previousMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();

    const { count: currentCount, error: currentError } = await supabase
        .from('inspections')
        .select('id', { count: 'exact', head: true })
        .in('status', ['completed', 'paid'])
        .gte('created_at', currentMonthStart)
        .lt('created_at', nextMonthStart);

    if (currentError) throw new Error('Error fetching current month inspections');

    const { count: previousCount, error: previousError } = await supabase
        .from('inspections')
        .select('id', { count: 'exact', head: true })
        .in('status', ['completed', 'paid'])
        .gte('created_at', previousMonthStart)
        .lt('created_at', currentMonthStart);

    if (previousError) throw new Error('Error fetching previous month inspections');

    const inspectionsGrowth =
        previousCount > 0
            ? ((currentCount - previousCount) / previousCount) * 100
            : currentCount > 0 ? 100 : 0;

    const { data: currentData, error: currentDataError } = await supabase
        .from('inspections')
        .select('inspection_fee, commission')
        .in('status', ['completed', 'paid'])
        .gte('created_at', currentMonthStart)
        .lt('created_at', nextMonthStart);

    if (currentDataError) throw new Error('Error fetching current month revenue/commission');

    const { data: prevData, error: prevDataError } = await supabase
        .from('inspections')
        .select('inspection_fee, commission')
        .in('status', ['completed', 'paid'])
        .gte('created_at', previousMonthStart)
        .lt('created_at', currentMonthStart);

    if (prevDataError) throw new Error('Error fetching previous month revenue/commission');

    const sum = (arr, key) => arr.reduce((acc, item) => acc + (item[key] || 0), 0);

    const currentMonthRevenue = sum(currentData, 'inspection_fee');
    const prevMonthRevenue = sum(prevData, 'inspection_fee');
    const currentMonthCommissions = sum(currentData, 'commission');
    const prevMonthCommissions = sum(prevData, 'commission');

    const revenueGrowth =
        prevMonthRevenue > 0
            ? parseFloat(((currentMonthRevenue - prevMonthRevenue) / prevMonthRevenue * 100).toFixed(2))
            : currentMonthRevenue > 0 ? 100 : 0;

    const commissionsGrowth =
        prevMonthCommissions > 0
            ? parseFloat(((currentMonthCommissions - prevMonthCommissions) / prevMonthCommissions * 100).toFixed(2))
            : currentMonthCommissions > 0 ? 100 : 0;

    return {
        inspections: {
            currentMonth: currentCount,
            previousMonth: previousCount,
            growth: inspectionsGrowth,
            trend: inspectionsTrend
        },
        revenue: {
            currentMonth: currentMonthRevenue,
            previousMonth: prevMonthRevenue,
            growth: revenueGrowth
        },
        commissions: {
            currentMonth: currentMonthCommissions,
            previousMonth: prevMonthCommissions,
            growth: commissionsGrowth
        }
    };
}

async function getTopResellers(limit = 5) {
  // Step 1: Count inspections grouped by reseller_id
  const { data: inspectionStats, error: statsError } = await supabase
    .from('inspections')
    .select('reseller_id, commission')
    .not('reseller_id', 'is', null); // skip nulls

  if (statsError) {
    console.error('Error fetching inspection stats:', statsError);
    throw new Error('Failed to fetch inspection stats');
  }

  // Group and aggregate by reseller_id
  const resellerMap = new Map();

  inspectionStats.forEach(({ reseller_id, commission }) => {
    if (!resellerMap.has(reseller_id)) {
      resellerMap.set(reseller_id, { id: reseller_id, count: 0, total: 0 });
    }
    const record = resellerMap.get(reseller_id);
    record.count += 1;
    record.total += parseFloat(commission || 0);
  });

  // Get top N by count
  const topResellersStats = Array.from(resellerMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit);

  const topResellerIds = topResellersStats.map(r => r.id);

  // Step 2: Get user/reseller details
  const { data: resellerDetails, error: resellerError } = await supabase
    .from('users') // or 'resellers' if that’s your table
    .select('id, name, company')
    .in('id', topResellerIds);

  if (resellerError) {
    console.error('Error fetching reseller details:', resellerError);
    throw new Error('Failed to fetch reseller details');
  }

  // Step 3: Merge stats with user info
  const result = topResellersStats.map(stat => {
    const user = resellerDetails.find(r => r.id === stat.id);
    return {
      id: stat.id,
      name: user?.name || 'Unknown',
      company: user?.company || '-',
      count: stat.count,
      total: parseFloat(stat.total.toFixed(2))
    };
  });

  return result;
}

async function getResellerAcquisitionTrends() {
  const now = new Date();
  const trends = [];

  for (let i = 4; i >= 0; i--) {
    const start = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const end = new Date(now.getFullYear(), now.getMonth() - i + 1, 1);

    const { count, error } = await supabase
    .from('users') 
    .select('id', { count: 'exact', head: true })
    .gte('created_at', start.toISOString())
    .lt('created_at', end.toISOString())
    .eq('type', 'reseller');

    if (error) {
      console.error(`Error fetching acquisition for ${start.toLocaleString('default', { month: 'short' })}:`, error);
      throw new Error('Failed to fetch reseller acquisition stats');
    }

    trends.push({
      month: start.toLocaleString('default', { month: 'short' }),
      count: count || 0
    });
  }

  return trends;
}

async function getResellerCountsByStatus() {
  const { data, error } = await supabase
    .from('users') // or 'resellers' if that's your table
    .select('id, status')
    .eq('type', 'reseller');

  if (error) {
    console.error('Error fetching resellers by status:', error);
    throw new Error('Failed to fetch resellers by status');
  }

  // Group and count by status
  const statusCounts = {};

  data.forEach(({ status }) => {
    if (!status) return;
    statusCounts[status] = (statusCounts[status] || 0) + 1;
  });

  return statusCounts;
}

async function logCheckCarVinRequest({ url, request, response }) {
  const { error } = await supabase
    .from('checkcarvin_logs')
    .insert([{
      request_data:request,
      response_data: response,
      url

    }]);

  if (error) {
    console.error('[!] Failed to log to Supabase:', error.message);
  }
}



async function saveCheckCarVinInspection(inspectionObj) {
    // Check if the inspectionObj is valid
    if (!inspectionObj || typeof inspectionObj !== 'object') {
        throw new Error('Invalid inspection object');
    }
    // save into supabase inspection table
    const { data, error } = await supabase
        .from('check_car_vin_inspection')
        .insert([
            {
                inspection_id: inspectionObj.inspection_id,
                vin: inspectionObj.vin,
                vin_data_available: true,
                stored_vin_data : inspectionObj.stored_vin_data,

            }
        ]).select(); ;

       
    if (error) {
        console.error('Error inserting data:', error);   
        throw new Error('Error inserting data into Supabase');

    }
     return data[0].id;
    // const { data: tables, error } = await supabase
    //     .from('user').select('*');

    // console.log('Tables:', tables);
}


async function getInspectKoreaByStatus(status = 'paid'){
  // Step 1: Fetch from check_car_vin_inspection
  const { data: vinRecords, error: vinError } = await supabase
    .from('check_car_vin_inspection')
    .select('*');

  if (vinError) {
    console.error('Error fetching VIN records:', vinError);
    return;
  }

  // Step 2: Get unique inspection_ids
  const inspectionIds = vinRecords.map(v => v.inspection_id);

  // Step 3: Fetch related inspections with status = 'paid'
  const { data: inspections, error: inspectionsError } = await supabase
    .from('inspections')
    .select('*')
    .in('id', inspectionIds)
    .eq('status', status);

  if (inspectionsError) {
    console.error('Error fetching inspections:', inspectionsError);
    return;
  }

  // Step 4: Merge only matching records
  const merged = vinRecords
    .map(vin => {
      const relatedInspection = inspections.find(ins => ins.id === vin.inspection_id);
      if (!relatedInspection) return null; // only include those with a matching 'paid' inspection

      return {
        ...vin, // return only check_car_vin_inspection fields
        // optionally add this if you need extra data from inspection
        plate_number: relatedInspection.plate_number,
        email: relatedInspection.email
      };
    })
    .filter(Boolean); // remove nulls

  console.log(merged);
  return merged[0];

}



async function updateCheckCarVinInspection(id, updates) {
  const { data, error } = await supabase
    .from('check_car_vin_inspection')
    .update(updates)
    .eq('id', id);

  if (error) {
    console.error(`Failed to update record ID ${id}:`, error);
    return null;
  }

  return data // or return `data` if expecting multiple
}



async function updateAppSettings(property, prop_value) {
  const { data, error } = await supabase
    .from('app_settings')
    .update({ prop_value : prop_value})
    .eq('property', property);

  if (error) {
    console.error(`Failed to update record ID ${property}:`, error);
    return null;
  }

  return data; // or return `data` if expecting multiple
}

async function getAppSettings(property) {
    const { data, error } = await supabase
        .from('app_settings')
        .select('*')
        .eq('property', property)
        .single();
    
    if (error) {
        console.error('Error fetching App settings value:', error);
        throw new Error('Error fetching app setting by property from Supabase');
    }
    return data;
}


async function getCheckCarVinInspectionByInspectionId(inspectionId) {
    const { data, error } = await supabase
        .from('check_car_vin_inspection')
        .select('*')
        .eq('inspection_id', inspectionId)
        .single();
    
    if (error) {
        console.error('Error fetching check_car_vin_inspection value:', error);
        throw new Error('Error fetching check_car_vin_inspection by property from Supabase');
    }
    return data;
}


async function getUserByPromoCode(promoCode) {
    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('promo_code', promoCode)
        .single();
    console.log('User:', user);
    console.log(promoCode)
    if (error) {
        console.error('Error fetching user by Promo:', error);
        return false;
    }
    return user;
}



module.exports = {
    saveInspection,
    getInspectionList,
    getTotalInspections,
    getMonthlyInspections,
    getUserByEmail,
    getInspectionsByPlateAndEmail,
    getInspectionsForInspectCar,
    getTotalInspectionsByReseller,
    getCommissionSummaryByPeriods,
    getResellerByReferralCode,
    getUserById,
    getInspectionById,
    updateInspection,
    getAllResellers,
    createResellerWithAuth,
    updateResellerById,
    getMonthlyInspectionStats,
    getTopResellers,
    getResellerAcquisitionTrends,
    getResellerCountsByStatus,
    logCheckCarVinRequest,
    saveCheckCarVinInspection,
    getInspectKoreaByStatus,
    updateCheckCarVinInspection,
    updateAppSettings,
    getAppSettings,
    getCheckCarVinInspectionByInspectionId,
    getUserByPromoCode
};
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
                vin_type : inspectionObj.vin_type
                
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
    const { data, count, error } = await supabase
    .from('inspections')
    .select('*', { count: 'exact' })
    .eq('reseller_id', reseller_id);

    const dataForSum = data;
    if (error) {
        return {totalCommission : 0,count: 0 , data : {} };
    } else {
        const totalCommission = dataForSum.reduce((sum, row) => sum + row.commission, 0);
        console.log('Count:', count);
        console.log('Sum of commission:', totalCommission);
        const totalData = {totalCommission,count , data}
        return totalData;
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
        .is('reseller_id', null)
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
    updateInspection
};
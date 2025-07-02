// Removed incorrect import of req
const {vinCheck} = require('../utility/cebiaUtility');
const {getAllResellers, getTotalInspectionsByReseller,createResellerWithAuth, updateResellerById, getMonthlyInspectionStats,getTopResellers,getResellerAcquisitionTrends,getResellerCountsByStatus} = require('../utility/supabaseUtility');
const crypto = require('crypto');


const getResellerList = async (req, res) => {
  try {
    const resellers = await getAllResellers();

    if (!resellers || resellers.length === 0) {
      return res.status(404).json({ error: "No resellers found" });
    }

    const formattedResellers = await Promise.all(
      resellers.map(async (reseller, index) => {
        const {
          id,
          name,
          company,
          email,
          phone,
          location,
          status,
          commission_rate,
          created_at
        } = reseller;

        // Fetch inspection summary
        const summary = await getTotalInspectionsByReseller(id);
        const totalCommission = summary.totalCommission || 0;
        const salesVolume = summary.count || 0;

        return {
          id: id,
          name: name || '—',
          company: company || '—',
          email: email || '—',
          phone: phone || '—',
          location: location || '—',
          status: status || 'active',
          salesVolume,
          commissionRate: parseFloat(commission_rate || 0).toFixed(2),
          totalCommission: parseFloat(totalCommission).toFixed(2),
          createdAt: new Date(created_at).toISOString().split('T')[0]
        };
      })
    );

    return res.status(200).json({ resellers: formattedResellers });
  } catch (error) {
    console.error("Error fetching reseller list:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const createReseller = async (req, res) => {
  try {
    const reseller = await createResellerWithAuth(req.body);
    res.status(201).json({ message: 'Reseller created', reseller });
  } catch (err) {
    console.error('Error creating reseller:', err.message);
    res.status(500).json({ error: err.message });
  }
};

const updateReseller = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: 'Missing reseller ID in params' });
    }

    const updatedReseller = await updateResellerById(id, req.body);

    res.status(200).json({
      message: 'Reseller updated successfully',
      reseller: updatedReseller,
    });
  } catch (err) {
    console.error('Error updating reseller:', err.message);
    res.status(500).json({ error: err.message });
  }
};


const getMonthlyInspectionStatsAnalytics = async (req, res) => {
  try {
    const stats = await getMonthlyInspectionStats();
    res.status(200).json({
      success: true,
      message: 'Analytics fetched successfully',
      data: stats
    });
  } catch (error) {
    console.error('Error fetching stats:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch Analytics',
      error: error.message
    });
  }
};

const getTopResellersAnalytics = async (req, res) => {
  try {
    const stats = await getTopResellers(5);
    res.status(200).json({
      success: true,
      message: 'Analytics fetched successfully',
      data: stats
    });
  } catch (error) {
    console.error('Error fetching stats:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch Analytics',
      error: error.message
    });
  }
};


const getResellerAcquisitionTrendsAnalytics = async (req, res) => {
  try {
    const stats = await getResellerAcquisitionTrends();
    res.status(200).json({
      success: true,
      message: 'Analytics fetched successfully',
      data: stats
    });
  } catch (error) {
    console.error('Error fetching stats:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch Analytics',
      error: error.message
    });
  }
};

const getResellerCountsByStatusAnalytics = async (req, res) => {
  try {
    const stats = await getResellerCountsByStatus();
    res.status(200).json({
      success: true,
      message: 'Analytics fetched successfully',
      data: stats
    });
  } catch (error) {
    console.error('Error fetching stats:', error.message);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch Analytics',
      error: error.message
    });
  }
};





module.exports = {
    getResellerList,
    createReseller,
    updateReseller,
    getMonthlyInspectionStatsAnalytics,
    getTopResellersAnalytics,
    getResellerAcquisitionTrendsAnalytics,
    getResellerCountsByStatusAnalytics
};

const express = require('express');
const router = express.Router();
const {
    getListingById,
    getAllListings,
    getFeaturedListings,
    createListing,
    updateListing,
    getListingImages,
    addListingImages,
    getListingFeatures,
    addListingFeatures,
    createExpertContact,
    createTestDriveRequest,
    getAvailableBrands,
    getAvailableModels
} = require('../utility/motorxSupabaseUtility');

// GET /api/motorx/listings - Get all listings with pagination and filters
router.get('/listings', async (req, res) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = parseInt(req.query.limit) || 10;
        
        const filters = {
            brand: req.query.brand,
            model: req.query.model,
            minPrice: req.query.minPrice ? parseFloat(req.query.minPrice) : null,
            maxPrice: req.query.maxPrice ? parseFloat(req.query.maxPrice) : null,
            year: req.query.year ? parseInt(req.query.year) : null
        };

        const result = await getAllListings(page, limit, filters);
        
        res.status(200).json({
            success: true,
            data: result.listings,
            pagination: {
                currentPage: page,
                totalPages: Math.ceil(result.totalCount / limit),
                totalItems: result.totalCount,
                itemsPerPage: limit
            }
        });
    } catch (error) {
        console.error('Error fetching listings:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch listings'
        });
    }
});

// GET /api/motorx/listings/featured - Get featured listings
router.get('/listings/featured', async (req, res) => {
    try {
        const limit = parseInt(req.query.limit) || 4;
        const listings = await getFeaturedListings(limit);
        
        res.status(200).json({
            success: true,
            data: listings
        });
    } catch (error) {
        console.error('Error fetching featured listings:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch featured listings'
        });
    }
});

// GET /api/motorx/listings/:id - Get single listing by ID
router.get('/listings/:id', async (req, res) => {
    try {
        const listingId = parseInt(req.params.id);
        const listing = await getListingById(listingId);
        
        if (!listing) {
            return res.status(404).json({
                success: false,
                error: 'Listing not found'
            });
        }

        // Get images and features for the listing
        const [images, features] = await Promise.all([
            getListingImages(listingId),
            getListingFeatures(listingId)
        ]);

        res.status(200).json({
            success: true,
            data: {
                ...listing,
                images,
                features
            }
        });
    } catch (error) {
        console.error('Error fetching listing:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch listing'
        });
    }
});

// GET /api/motorx/brands - Get available brands
router.get('/brands', async (req, res) => {
    try {
        const brands = await getAvailableBrands();
        
        res.status(200).json({
            success: true,
            data: brands
        });
    } catch (error) {
        console.error('Error fetching brands:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch brands'
        });
    }
});

// GET /api/motorx/models - Get models for a specific brand
router.get('/models', async (req, res) => {
    try {
        const { brand } = req.query;
        
        if (!brand) {
            return res.status(400).json({
                success: false,
                error: 'Brand parameter is required'
            });
        }

        const models = await getAvailableModels(brand);
        
        res.status(200).json({
            success: true,
            data: models
        });
    } catch (error) {
        console.error('Error fetching models:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch models'
        });
    }
});

// POST /api/motorx/contact-expert - Contact expert about a listing
router.post('/contact-expert', async (req, res) => {
    try {
        const { listing_id, name, email, phone, message } = req.body;

        // Validation
        if (!listing_id || !name || !email || !phone) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: listing_id, name, email, phone'
            });
        }

        const contactData = {
            listing_id: parseInt(listing_id),
            name,
            email,
            phone,
            message: message || ''
        };

        const result = await createExpertContact(contactData);
        
        res.status(201).json({
            success: true,
            message: 'Expert contact request submitted successfully',
            data: result
        });
    } catch (error) {
        console.error('Error creating expert contact:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to submit expert contact request'
        });
    }
});

// POST /api/motorx/test-drive - Request a test drive
router.post('/test-drive', async (req, res) => {
    try {
        const { listing_id, full_name, email, phone, preferred_date, message } = req.body;

        // Validation
        if (!listing_id || !full_name || !email || !phone) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: listing_id, full_name, email, phone'
            });
        }

        const testDriveData = {
            listing_id: parseInt(listing_id),
            full_name,
            email,
            phone,
            preferred_date: preferred_date ? new Date(preferred_date) : null,
            message: message || ''
        };

        const result = await createTestDriveRequest(testDriveData);
        
        res.status(201).json({
            success: true,
            message: 'Test drive request submitted successfully',
            data: result
        });
    } catch (error) {
        console.error('Error creating test drive request:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to submit test drive request'
        });
    }
});

// ADMIN ROUTES (protected - add authentication middleware as needed)

// POST /api/motorx/admin/listings - Create new listing
router.post('/admin/listings', async (req, res) => {
    try {
        const listingData = req.body;
        
        // Basic validation
        if (!listingData.title || !listingData.price || !listingData.brand || !listingData.model) {
            return res.status(400).json({
                success: false,
                error: 'Missing required fields: title, price, brand, model'
            });
        }

        const result = await createListing(listingData);
        
        res.status(201).json({
            success: true,
            message: 'Listing created successfully',
            data: result
        });
    } catch (error) {
        console.error('Error creating listing:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to create listing'
        });
    }
});

// PUT /api/motorx/admin/listings/:id - Update listing
router.put('/admin/listings/:id', async (req, res) => {
    try {
        const listingId = parseInt(req.params.id);
        const updateData = req.body;

        const result = await updateListing(listingId, updateData);
        
        res.status(200).json({
            success: true,
            message: 'Listing updated successfully',
            data: result
        });
    } catch (error) {
        console.error('Error updating listing:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to update listing'
        });
    }
});

// POST /api/motorx/admin/listings/:id/images - Add images to listing
router.post('/admin/listings/:id/images', async (req, res) => {
    try {
        const listingId = parseInt(req.params.id);
        const { images } = req.body;

        if (!images || !Array.isArray(images) || images.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Images array is required'
            });
        }

        const result = await addListingImages(listingId, images);
        
        res.status(201).json({
            success: true,
            message: 'Images added successfully',
            data: result
        });
    } catch (error) {
        console.error('Error adding listing images:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to add images'
        });
    }
});

// POST /api/motorx/admin/listings/:id/features - Add features to listing
router.post('/admin/listings/:id/features', async (req, res) => {
    try {
        const listingId = parseInt(req.params.id);
        const { features } = req.body;

        if (!features || !Array.isArray(features) || features.length === 0) {
            return res.status(400).json({
                success: false,
                error: 'Features array is required'
            });
        }

        const result = await addListingFeatures(listingId, features);
        
        res.status(201).json({
            success: true,
            message: 'Features added successfully',
            data: result
        });
    } catch (error) {
        console.error('Error adding listing features:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to add features'
        });
    }
});

module.exports = router;



const { supabase } = require('../lib/supabaseClient');

// LISTING METHODS
async function getListingById(listingId) {
    const { data, error } = await supabase
        .from('motorx_listings')
        .select('*')
        .eq('id', listingId)
        .single();

    if (error) {
        console.error('Error fetching listing:', error);
        return null;
    }

    return data;
}

async function getAllListings(page = 1, limit = 10, filters = {}) {
    const startIndex = (page - 1) * limit;
    
    let query = supabase
        .from('motorx_listings')
        .select('*', { count: 'exact' })
        .eq('is_active', true)
        .eq('status', 'published')
        .order('created_at', { ascending: false });

    // Apply filters
    if (filters.brand) {
        query = query.eq('brand', filters.brand);
    }
    if (filters.model) {
        query = query.eq('model', filters.model);
    }
    if (filters.minPrice) {
        query = query.gte('price', filters.minPrice);
    }
    if (filters.maxPrice) {
        query = query.lte('price', filters.maxPrice);
    }
    if (filters.year) {
        query = query.eq('year', filters.year);
    }

    const { data: listings, count, error } = await query
        .range(startIndex, startIndex + limit - 1);

    if (error) {
        console.error('Error fetching listings:', error);
        throw new Error('Error fetching listings from Supabase');
    }

    return { listings, totalCount: count };
}

async function getFeaturedListings(limit = 4) {
    const { data, error } = await supabase
        .from('motorx_listings')
        .select('*')
        .eq('is_active', true)
        .eq('status', 'published')
        .eq('is_featured', true)
        .order('created_at', { ascending: false })
        .limit(limit);

    if (error) {
        console.error('Error fetching featured listings:', error);
        throw new Error('Error fetching featured listings');
    }

    return data;
}

// IMAGE METHODS
async function getListingImages(listingId) {
    const { data, error } = await supabase
        .from('motorx_listing_images')
        .select('*')
        .eq('listing_id', listingId)
        .order('order_index', { ascending: true });

    if (error) {
        console.error('Error fetching listing images:', error);
        return [];
    }

    return data;
}

// FEATURE METHODS
async function getListingFeatures(listingId) {
    const { data, error } = await supabase
        .from('motorx_listing_features')
        .select('*')
        .eq('listing_id', listingId)
        .order('feature_type', { ascending: true });

    if (error) {
        console.error('Error fetching listing features:', error);
        return [];
    }

    return data;
}

// CONTACT METHODS
async function createExpertContact(contactData) {
    const { data, error } = await supabase
        .from('motorx_expert_contacts')
        .insert([contactData])
        .select();

    if (error) {
        console.error('Error creating expert contact:', error);
        throw new Error('Error creating expert contact');
    }

    return data[0];
}

async function createTestDriveRequest(testDriveData) {
    const { data, error } = await supabase
        .from('motorx_test_drives')
        .insert([testDriveData])
        .select();

    if (error) {
        console.error('Error creating test drive request:', error);
        throw new Error('Error creating test drive request');
    }

    return data[0];
}

// SEARCH AND FILTER METHODS
async function getAvailableBrands() {
    const { data, error } = await supabase
        .from('motorx_listings')
        .select('brand')
        .eq('is_active', true)
        .eq('status', 'published')
        .order('brand', { ascending: true });

    if (error) {
        console.error('Error fetching brands:', error);
        return [];
    }

    // Get unique brands
    const uniqueBrands = [...new Set(data.map(item => item.brand))];
    return uniqueBrands;
}

async function getAvailableModels(brand) {
    const { data, error } = await supabase
        .from('motorx_listings')
        .select('model')
        .eq('brand', brand)
        .eq('is_active', true)
        .eq('status', 'published')
        .order('model', { ascending: true });

    if (error) {
        console.error('Error fetching models:', error);
        return [];
    }

    // Get unique models
    const uniqueModels = [...new Set(data.map(item => item.model))];
    return uniqueModels;
}

// ADMIN METHODS
async function createListing(listingData) {
    const { data, error } = await supabase
        .from('motorx_listings')
        .insert([listingData])
        .select();

    if (error) {
        console.error('Error creating listing:', error);
        throw new Error('Error creating listing');
    }

    return data[0];
}

async function updateListing(listingId, updateData) {
    const { data, error } = await supabase
        .from('motorx_listings')
        .update(updateData)
        .eq('id', listingId)
        .select();

    if (error) {
        console.error('Error updating listing:', error);
        throw new Error('Error updating listing');
    }

    return data[0];
}

async function addListingImages(listingId, images) {
    const imageRecords = images.map((image, index) => ({
        listing_id: listingId,
        image_url: image.url,
        alt_text: image.altText || '',
        order_index: index,
        is_primary: index === 0
    }));

    const { data, error } = await supabase
        .from('motorx_listing_images')
        .insert(imageRecords)
        .select();

    if (error) {
        console.error('Error adding listing images:', error);
        throw new Error('Error adding listing images');
    }

    return data;
}

async function addListingFeatures(listingId, features) {
    const featureRecords = features.map(feature => ({
        listing_id: listingId,
        feature_type: feature.type,
        feature_name: feature.name
    }));

    const { data, error } = await supabase
        .from('motorx_listing_features')
        .insert(featureRecords)
        .select();

    if (error) {
        console.error('Error adding listing features:', error);
        throw new Error('Error adding listing features');
    }

    return data;
}

module.exports = {
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
};
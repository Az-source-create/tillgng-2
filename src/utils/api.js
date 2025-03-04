/**
 * Utility functions for interacting with the NocoDB API
 */

/**
 * Fetches products from NocoDB with pagination and search capability
 * @param {Object} options - Options for fetching products
 * @param {number} [options.limit=30] - Number of products to fetch per page
 * @param {number} [options.page=1] - Page number to fetch
 * @param {string} [options.search=''] - Search term to filter products
 * @returns {Promise<Object>} - Object with products array and pagination metadata
 */
export async function fetchProducts({ limit = 25, page = 1, search = '' } = {}) {
  // Calculate offset from page number
  const offset = (page - 1) * limit;
  
  // Build URL with search parameter if provided
  let url = `${import.meta.env.PRODUCTS_TABLE_URL}?offset=${offset}&limit=${limit}`;
  
  // Add search parameter to filter by product name
  if (search && search.trim() !== '') {
    // Let's add some debug logging to see what's happening
    console.log("Search term:", search);
    
    // Use the field name that contains product names - using wildcards before and after
    // Try basic pattern matching with wildcards
    url += `&where=(Produkt,like,%25${search}%25)`;
    
    // Log the final URL for debugging
    console.log("API URL:", url);
  }
  
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'xc-token': import.meta.env.NOCODB_API_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`NocoDB API error: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    
    // Return both the list of products and pagination metadata
    return {
      products: data.list || [],
      pageInfo: {
        currentPage: page,
        pageSize: limit,
        totalItems: data.pageInfo?.totalRows || 0,
        totalPages: Math.ceil((data.pageInfo?.totalRows || 0) / limit),
        hasNextPage: Boolean(data.pageInfo?.isLastPage === false),
        hasPreviousPage: page > 1,
        searchTerm: search
      }
    };
  } catch (error) {
    console.error('Error fetching products:', error);
    return { 
      products: [], 
      pageInfo: { 
        currentPage: page, 
        pageSize: limit, 
        totalItems: 0, 
        totalPages: 0,
        searchTerm: search 
      } 
    };
  }
}

/**
 * Booking management functions
 */
export function initBookingSystem() {
  // Initialize booking from localStorage or create empty booking
  const storedBooking = localStorage.getItem('booking');
  return storedBooking ? JSON.parse(storedBooking) : { items: [], totalCount: 0 };
}

export function saveBooking(booking) {
  localStorage.setItem('booking', JSON.stringify(booking));
}

/**
 * Submits a booking to our secure API endpoint, which then communicates with NocoDB
 * @param {Object} bookingData - The booking data to submit
 * @returns {Promise<Object>} - The response from the API
 */
export async function submitBooking(bookingData) {
  try {
    // Validate that there are items in the booking
    if (!bookingData.bookingItems || bookingData.bookingItems.length === 0) {
      throw new Error('No items in booking');
    }
    
    // Validate date format before submitting
    if (!bookingData.pickupDateTimeFormatted || !bookingData.returnDateTimeFormatted) {
      console.error('Missing date/time fields:', {
        pickup: bookingData.pickupDateTimeFormatted,
        return: bookingData.returnDateTimeFormatted
      });
      throw new Error('Please select both pickup and return dates');
    }
    
    // Log date formats for debugging
    console.log('Client-side date formats being submitted:', {
      pickup: bookingData.pickupDateTimeFormatted,
      return: bookingData.returnDateTimeFormatted
    });
    
    // Call our own API endpoint instead of NocoDB directly
    // This keeps sensitive API tokens on the server side
    const response = await fetch('/api/submit-booking', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(bookingData)
    });
    
    // Get response as text first
    const responseText = await response.text();
    
    // Log raw response for debugging
    console.log('Raw API response:', responseText);
    
    // Parse JSON response if possible
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      console.error('Error parsing JSON response:', e);
      // If not valid JSON, create a basic response object
      data = {
        success: response.ok,
        message: responseText
      };
    }
    
    // Handle error response
    if (!response.ok) {
      const errorMessage = data.error || data.message || 'Unknown error';
      if (data.timestamp) {
        console.error('Server error timestamp:', data.timestamp);
      }
      throw new Error(`Booking submission failed: ${errorMessage}`);
    }
    
    return data;
  } catch (error) {
    console.error('Error submitting booking:', error);
    throw error;
  }
}

/**
 * Utility functions for interacting with the NocoDB API
 */

/**
 * Fetches products from NocoDB with pagination
 * @param {Object} options - Options for fetching products
 * @param {number} [options.limit=35] - Number of products to fetch per page
 * @param {number} [options.page=1] - Page number to fetch
 * @returns {Promise<Object>} - Object with products array and pagination metadata
 */
export async function fetchProducts({ limit = 35, page = 1 } = {}) {
  // Calculate offset from page number
  const offset = (page - 1) * limit;
  
  // Add fields to sort by if needed
  const url = `${import.meta.env.PRODUCTS_TABLE_URL}?offset=${offset}&limit=${limit}`;
  
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
        hasPreviousPage: page > 1
      }
    };
  } catch (error) {
    console.error('Error fetching products:', error);
    return { products: [], pageInfo: { currentPage: page, pageSize: limit, totalItems: 0, totalPages: 0 } };
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
    
    // Parse JSON response if possible
    let data;
    try {
      data = JSON.parse(responseText);
    } catch (e) {
      // If not valid JSON, create a basic response object
      data = {
        success: response.ok,
        message: responseText
      };
    }
    
    // Handle error response
    if (!response.ok) {
      const errorMessage = data.error || data.message || 'Unknown error';
      throw new Error(`Booking submission failed: ${errorMessage}`);
    }
    
    return data;
  } catch (error) {
    console.error('Error submitting booking:', error);
    throw error;
  }
}

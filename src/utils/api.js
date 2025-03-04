/**
 * Utility functions for interacting with the NocoDB API
 */

/**
 * Fetches all bookings from the bookings table
 * @returns {Promise<Array>} - Array of booking details
 */
export async function fetchAllBookings() {
  try {
    // Build URL to fetch bookings
    // Use the bookings endpoint URL 
    const baseUrl = import.meta.env.BOOKING_TABLE_URL;
    
    // Get all bookings with limit
    const bookingsUrl = `${baseUrl}?limit=50`;
    
    const response = await fetch(bookingsUrl, {
      method: 'GET',
      headers: {
        'xc-token': import.meta.env.NOCODB_API_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      throw new Error(`NocoDB API error: ${response.status} ${response.statusText}`);
    }

    // Get response as text first
    const responseText = await response.text();
    
    // Parse JSON response
    const data = responseText ? JSON.parse(responseText) : { list: [] };

    console.log(data);
    
    // Log the Product field structure from each booking
    if (data.list && data.list.length > 0) {
      data.list.forEach((booking, index) => {
        if (booking.Product) {
          console.log(`Booking #${index} Product field:`, booking.Product);
          console.log(`  Type:`, typeof booking.Product);
          
          // If it's an object, show its properties
          if (typeof booking.Product === 'object') {
            console.log(`  Properties:`, Object.keys(booking.Product));
            
            // Show id value if present
            if (booking.Product.id) {
              console.log(`  ID:`, booking.Product.id);
            } else if (booking.Product.Id) {
              console.log(`  ID:`, booking.Product.Id);
            }
          }
        }
      });
    } else {
      console.log('No bookings found in response');
    }
    
    return data.list || [];
  } catch (error) {
    console.error('Error fetching bookings:', error);
    return [];
  }
}

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
  
  // Fetch all fields instead of specifying them to avoid field name issues
  url += '&fields=*';
  
  // Add search parameter to filter by product name
  if (search && search.trim() !== '') {
    // Use the field name that contains product names - using wildcards before and after
    // Try basic pattern matching with wildcards
    url += `&where=(Produkt,like,%25${search}%25)`;
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
    
    // Make processedProducts using Promise.all to handle async operations
    const processedProducts = await Promise.all((data.list || []).map(async product => {
      try {
        const processed = { ...product };
        
        // Get total quantity from Totalantal field
        const totalField = product['Totalantal'] || product['TotalAntal'] || product['Total'] || 0;
        const totalQty = parseInt(totalField || 0);
        
        // Get currently available quantity
        const availableField = product['Antal tillgängliga'] || product['Antal tillgangliga'] || 
                              product['Available'] || product['Quantity'] || 0;
        const availableQty = parseInt(availableField || 0);
        
        // Check if we need to fetch detailed booking information
        const bookingsField = product.Bokningar || product.Bookings || product.bookings;
        const hasBookings = bookingsField && 
                         ((Array.isArray(bookingsField) && bookingsField.length > 0) || 
                         (typeof bookingsField === 'object') ||
                         (typeof bookingsField === 'number' && bookingsField > 0));
        
        let activeBookings = [];
        const now = new Date();
        
        // If there are bookings, fetch detailed info from bookings table
        if (hasBookings) {
          const productId = product.Id || product.id;
          
          if (productId) {
            // Fetch all bookings
            const bookingsDetails = await fetchAllBookings();
            
            // If we got no bookings from the API but the product is unavailable,
            // we'll show it as booked without return date information
            // We don't add mock data - just show as booked without return info
            
            // Filter the bookings to only include those that match this product
            const matchingBookings = bookingsDetails.filter(booking => {
              // The product field might be an object with an id field, or just an id
              if (booking.Product) {
                if (typeof booking.Product === 'object') {
                  return booking.Product.id === productId || 
                         booking.Product.Id === productId || 
                         String(booking.Product) === String(productId);
                } else {
                  return String(booking.Product) === String(productId);
                }
              }
              return false;
            });
            
            // Process each booking to extract return date info
            matchingBookings.forEach((booking, index) => {
              try {
                // Try different possible field names for return date
                const returnDateField = 
                  booking['Return date-time'] || 
                  booking['ReturnDateTime'] || 
                  booking['returnDateTime'] || 
                  booking['Return datetime'] || 
                  booking['return_date'];
                
                // Get quantity field
                const quantityField = booking['Quantity'] || booking['quantity'] || booking['Antal'] || 1;
                const quantity = parseInt(quantityField) || 1;
                
                if (returnDateField) {
                  // Parse return date (format can vary depending on NocoDB setup)
                  let returnDate;
                  if (typeof returnDateField === 'string') {
                    returnDate = new Date(returnDateField);
                  } else if (returnDateField && returnDateField.value) {
                    returnDate = new Date(returnDateField.value);
                  }
                  
                  // If return date is in the future, this is an active booking
                  if (returnDate && returnDate > now) {
                    // Use the exact time from the database without timezone adjustment
                    const returnDateAdjusted = returnDate; // No adjustment needed
                    
                    // Format like "04 mars 2025 15:00" 
                    const formattedDate = returnDateAdjusted.toLocaleString('sv-SE', {
                      day: '2-digit',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                      timeZone: 'Europe/Stockholm'
                    });
                    
                    // Log the date adjustment
                    console.log(`Date adjustment: ${returnDate.toISOString()} → ${returnDateAdjusted.toISOString()} = ${formattedDate}`);
                    
                    activeBookings.push({
                      returnDate: returnDateAdjusted,
                      quantity,
                      returnDateFormatted: formattedDate
                    });
                  }
                }
              } catch (error) {
                console.error(`Error processing booking for product ${product.Produkt}:`, error);
              }
            });
          }
        }
      // We don't need this code anymore since we fetch from booking table directly now
      
      // We're now using the matched bookings from the API
      // Sort active bookings by return date (earliest first)
      activeBookings.sort((a, b) => a.returnDate - b.returnDate);
      
      // Calculate availability based on fetched bookings
      const bookedQty = activeBookings.reduce((total, booking) => total + (booking.quantity || 1), 0);
      const currentlyAvailable = availableQty;
      
      // Get the earliest return date and quantity
      let upcomingReturnQty = 0;
      let nextReturnDate = null;
      
      if (activeBookings.length > 0) {
        // Get the earliest return date
        nextReturnDate = activeBookings[0].returnDateFormatted;
        
        // Get quantity returning on that earliest date
        upcomingReturnQty = activeBookings[0].quantity || 1;
        
        }
      
      // Add this information to processed product with detailed logging
      processed.availability = {
        total: totalQty,                     // Total inventory (from Totalantal field)
        booked: bookedQty,                   // Number of active bookings
        available: currentlyAvailable,       // Currently available items
        nextAvailable: nextReturnDate,       // Next return date
        returningQuantity: upcomingReturnQty // Quantity returning on that date
      };
      
      
      return processed;
      } catch (error) {
        console.error(`Error processing product ${product.Produkt || 'unknown'}:`, error);
        // Return product with default availability
        return {
          ...product,
          availability: {
            total: 0,
            booked: 0,
            available: 0,
            nextAvailable: null
          }
        };
      }
    }));
    
    // Return both the list of products and pagination metadata
    return {
      products: processedProducts,
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
    console.error('Error fetching products:', error); // Keep error logging
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
      throw new Error('Please select both pickup and return dates');
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
      throw new Error(`Booking submission failed: ${errorMessage}`);
    }
    
    return data;
  } catch (error) {
    console.error('Error submitting booking:', error);
    throw error;
  }
}

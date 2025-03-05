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
    
    console.log("Fetching bookings from:", bookingsUrl);
    
    const response = await fetch(bookingsUrl, {
      method: 'GET',
      headers: {
        'xc-token': import.meta.env.NOCODB_API_TOKEN,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      if (response.status === 429) {
        throw new Error("Rate limit exceeded. Too many requests to the booking API.");
      } else {
        throw new Error(`NocoDB API error: ${response.status} ${response.statusText}`);
      }
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
    // First try to get the API token from env
    const apiToken = import.meta.env.NOCODB_API_TOKEN;
    
    // Debug logs
    console.log('Fetching products with URL:', url);
    console.log('API token exists:', !!apiToken);
    
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'xc-token': apiToken,
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      const errorMessage = `NocoDB API error: ${response.status} ${response.statusText}`;
      console.error(errorMessage);
      
      // For rate limit errors, provide a more helpful message
      const userMessage = response.status === 429 
        ? "Too many requests to the database. Please try again in a few minutes."
        : errorMessage;
      
      // Return error info to display to user
      return {
        products: [],
        pageInfo: {
          currentPage: page,
          totalPages: 1,
          totalItems: 0,
          hasNextPage: false,
          hasPreviousPage: false
        },
        error: userMessage
      };
    }

    const responseText = await response.text();
    console.log('Response received, length:', responseText.length);
    
    let data;
    try {
      data = responseText ? JSON.parse(responseText) : { list: [] };
    } catch (err) {
      console.error('Error parsing JSON:', err);
      return {
        products: [],
        pageInfo: {
          currentPage: page,
          totalPages: 1,
          totalItems: 0,
          hasNextPage: false,
          hasPreviousPage: false
        },
        error: `Error parsing response: ${err.message}`
      };
    }
    
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
            try {
              // Fetch all bookings
              const bookingsDetails = await fetchAllBookings();
              
              // If we got no bookings from the API but the product is unavailable,
              // we'll show it as booked without return date information
              // Add debugging for what this product ID is
              console.log(`Processing product: ${product.Produkt} (ID: ${productId})`);
              
              // Filter the bookings to only include those that match this product
              const matchingBookings = bookingsDetails.filter(booking => {
              // The product field might be an object with an id field, or just an id
              if (booking.Product) {
                // Log what we're comparing
                const bookingProductId = typeof booking.Product === 'object' 
                  ? (booking.Product.id || booking.Product.Id) 
                  : booking.Product;
                  
                console.log(`Checking booking with Product ID: ${JSON.stringify(bookingProductId)}`);
                
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
            
            // Log how many bookings we found for this product
            console.log(`Found ${matchingBookings.length} bookings for product ID ${productId}`);
            
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
                
                // Log the return date field for debugging
                console.log('Return date field for booking:', returnDateField);
                
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
                  
                  // Log the parsed return date for debugging
                  console.log('Parsed return date:', returnDate);
                  
                  if (returnDate) {
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
                    
                    // Log the date adjustment and whether this is a past date
                    const isPastDate = returnDate <= new Date();
                    console.log(`Date adjustment: ${returnDate.toISOString()} → ${returnDateAdjusted.toISOString()} = ${formattedDate} (Past date: ${isPastDate})`);
                    
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
            } catch (error) {
              // If fetching bookings fails, add error info to the product
              console.error(`Error fetching bookings for product ${product.Produkt}:`, error);
              processed.availability = {
                ...processed.availability,
                error: error.message || "Failed to load booking information",
                hasBookingError: true
              };
            }
          }
        }
      // We don't need this code anymore since we fetch from booking table directly now
      
      // Process active bookings to identify future and overdue returns
      let upcomingReturnQty = 0;
      let nextReturnDate = null;
      let nextReturnTimestamp = 0; // Store timestamp for earliest return date
      let overdueReturnQty = 0;
      let overdueReturnDate = null;
      let maxDaysOverdue = 0;
      let hasOverdueReturns = false;
      
      // Check if we have active bookings to process
      if (Array.isArray(activeBookings) && activeBookings.length > 0) {
        const currentDate = new Date();
        const futureReturns = [];
        const overdueReturns = [];
        
        // Separate into future and overdue returns
        activeBookings.forEach(booking => {
          if (booking && booking.returnDate) {
            if (booking.returnDate <= currentDate) {
              // This is an overdue return
              const daysOverdue = Math.floor((currentDate - booking.returnDate) / (1000 * 60 * 60 * 24));
              overdueReturns.push({
                ...booking,
                daysOverdue
              });
            } else {
              // This is a future return
              futureReturns.push(booking);
            }
          }
        });
        
        // Sort future returns by date (earliest first)
        if (futureReturns.length > 0) {
          futureReturns.sort((a, b) => a.returnDate - b.returnDate);
          nextReturnDate = futureReturns[0].returnDateFormatted;
          nextReturnTimestamp = futureReturns[0].returnDate.getTime(); // Store timestamp for future use
          upcomingReturnQty = futureReturns[0].quantity || 1;
        }
        
        // Process overdue returns
        if (overdueReturns.length > 0) {
          hasOverdueReturns = true;
          // Sort overdue returns by date (most overdue first)
          overdueReturns.sort((a, b) => a.returnDate - b.returnDate);
          overdueReturnQty = overdueReturns.reduce((total, b) => total + (b.quantity || 1), 0);
          overdueReturnDate = overdueReturns[0].returnDateFormatted;
          maxDaysOverdue = overdueReturns[0].daysOverdue;
        }
      }
      
      // Calculate availability based on product data
      const currentlyAvailable = availableQty;
      
      // Calculate booked quantity from our processing or from product data
      const bookedQty = Array.isArray(activeBookings) 
        ? activeBookings.reduce((total, booking) => total + (booking.quantity || 1), 0) 
        : (totalQty - currentlyAvailable);
      
      // Add this information to processed product with detailed logging
      processed.availability = {
        total: totalQty,                     // Total inventory (from Totalantal field)
        booked: bookedQty,                   // Number of active bookings
        available: currentlyAvailable,       // Currently available items
        nextAvailable: nextReturnDate,       // Next return date (formatted)
        nextReturnTimestamp: nextReturnTimestamp, // Timestamp for the next return date
        returningQuantity: upcomingReturnQty, // Quantity returning on that date
        hasOverdueReturns: hasOverdueReturns, // Flag for overdue returns
        overdueQuantity: overdueReturnQty,   // Total quantity that is overdue
        overdueDate: overdueReturnDate,      // Date of the most overdue item
        daysOverdue: maxDaysOverdue          // How many days the most overdue item is late
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
    console.error('Error fetching products:', error);
    return { 
      products: [], 
      pageInfo: { 
        currentPage: page, 
        pageSize: limit, 
        totalItems: 0, 
        totalPages: 0,
        hasNextPage: false,
        hasPreviousPage: page > 1,
        searchTerm: search 
      },
      error: error.message || "Failed to load products. Please try again."
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

/**
 * Utility functions for interacting with the NocoDB API
 */

// Cache for bookings data to avoid repeated API calls
let bookingsCache = null;
let bookingsCacheExpiry = 0;
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Cache for product-specific bookings to avoid duplicate processing
let productBookingsCache = {};
const PRODUCT_BOOKINGS_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Helper for delayed retry with exponential backoff
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Queue for batching product detail requests
let pendingProductDetailRequests = [];
let isProcessingBatch = false;
const BATCH_PROCESSING_INTERVAL = 300; // 300ms between batches
const MAX_BATCH_SIZE = 10; // Maximum number of products to process in one batch

/**
 * Adds a product to the batch processing queue and returns a promise
 * that will resolve when the product details are available
 * @param {string} productId - The ID of the product to process
 * @returns {Promise<Object>} - Promise that resolves with product booking details
 */
export function queueProductForProcessing(productId) {
  return new Promise((resolve, reject) => {
    // Add to the queue
    pendingProductDetailRequests.push({
      productId,
      resolve,
      reject,
      addedAt: Date.now()
    });
    
    // Start processing if not already running
    if (!isProcessingBatch) {
      processBatch();
    }
  });
}

/**
 * Process batches of product detail requests to reduce API load
 */
async function processBatch() {
  if (pendingProductDetailRequests.length === 0) {
    isProcessingBatch = false;
    return;
  }
  
  isProcessingBatch = true;
  
  try {
    // Take up to MAX_BATCH_SIZE items from the queue
    const batch = pendingProductDetailRequests.splice(0, MAX_BATCH_SIZE);
    console.log(`Processing batch of ${batch.length} products`);
    
    // First, make sure we have all bookings data loaded and cached
    await fetchAllBookings();
    
    // Process each product in the batch
    await Promise.all(batch.map(async (request) => {
      try {
        const bookings = await getBookingsForProduct(request.productId);
        request.resolve(bookings);
      } catch (error) {
        console.error(`Error processing product ${request.productId}:`, error);
        request.reject(error);
      }
    }));
    
    // If there are more items in the queue, wait a bit then process the next batch
    if (pendingProductDetailRequests.length > 0) {
      setTimeout(processBatch, BATCH_PROCESSING_INTERVAL);
    } else {
      isProcessingBatch = false;
    }
  } catch (error) {
    console.error('Error processing batch:', error);
    isProcessingBatch = false;
    // Continue with next batch despite error
    if (pendingProductDetailRequests.length > 0) {
      setTimeout(processBatch, BATCH_PROCESSING_INTERVAL);
    }
  }
}

/**
 * Fetches all bookings from the bookings table with caching and retry logic
 * @param {boolean} [forceRefresh=false] - Force a refresh of the cache
 * @returns {Promise<Array>} - Array of booking details
 */
export async function fetchAllBookings(forceRefresh = false) {
  // Return cached data if available and not expired
  const now = Date.now();
  if (bookingsCache && bookingsCacheExpiry > now && !forceRefresh) {
    console.log("Using cached bookings data");
    return bookingsCache;
  }

  // Retry logic with exponential backoff
  const maxRetries = 3;
  let retryCount = 0;
  let lastError = null;

  while (retryCount < maxRetries) {
    try {
      // Build URL to fetch bookings
      // Use the bookings endpoint URL 
      const baseUrl = import.meta.env.BOOKING_TABLE_URL;
      
      // Get all bookings with limit
      const bookingsUrl = `${baseUrl}?limit=200`; // Increased limit to reduce pagination needs
      
      console.log(`Fetching bookings from: ${bookingsUrl} (Attempt ${retryCount + 1}/${maxRetries})`);
      
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

      // Success - update cache and return data
      bookingsCache = data.list || [];
      bookingsCacheExpiry = Date.now() + CACHE_DURATION;
      
      console.log(`Successfully fetched ${bookingsCache.length} bookings`);
      
      // Clear product-specific booking cache when full bookings data is refreshed
      productBookingsCache = {};
      
      // Log product field structure in less verbose way
      if (data.list && data.list.length > 0) {
        // Just log the count and first example
        console.log(`Found ${data.list.length} bookings, sample product structure:`, 
          data.list[0].Product ? typeof data.list[0].Product : 'No Product field');
      } else {
        console.log('No bookings found in response');
      }
      
      return bookingsCache;
    } catch (error) {
      lastError = error;
      retryCount++;
      
      if (retryCount < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s, etc.
        const backoffMs = Math.pow(2, retryCount - 1) * 1000;
        console.log(`Retry ${retryCount}/${maxRetries} after ${backoffMs}ms: ${error.message}`);
        await sleep(backoffMs);
      }
    }
  }
  
  // If we reach here, all retries failed
  console.error(`All ${maxRetries} attempts to fetch bookings failed:`, lastError);
  
  // Return empty array or cached data if available (even if expired)
  if (bookingsCache) {
    console.log('Using expired cached data after failed refresh attempts');
    return bookingsCache;
  }
  
  return [];
}

/**
 * Get bookings for a specific product with caching to reduce API load
 * @param {string} productId - The product ID to fetch bookings for
 * @returns {Promise<Array>} - Array of booking details for the product
 */
export async function getBookingsForProduct(productId) {
  if (!productId) {
    console.error('No productId provided to getBookingsForProduct');
    return [];
  }
  
  // Check if we have this product's bookings in cache
  const now = Date.now();
  const cacheKey = `product_${productId}`;
  
  if (productBookingsCache[cacheKey] && productBookingsCache[cacheKey].expiry > now) {
    console.log(`Using cached bookings for product ${productId}`);
    return productBookingsCache[cacheKey].bookings;
  }
  
  try {
    // Fetch all bookings
    const allBookings = await fetchAllBookings();
    
    // Filter for this product
    const productBookings = allBookings.filter(booking => {
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
    
    console.log(`Found ${productBookings.length} bookings for product ID ${productId}`);
    
    // Cache the result for this product
    productBookingsCache[cacheKey] = {
      bookings: productBookings,
      expiry: now + PRODUCT_BOOKINGS_CACHE_DURATION
    };
    
    return productBookings;
  } catch (error) {
    console.error(`Error fetching bookings for product ${productId}:`, error);
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
// Cache for product data to avoid repeated API calls 
let productsCache = {};
let productsCacheExpiry = 0;
const PRODUCTS_CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

/**
 * Fetches products from NocoDB with pagination, search capability, and caching
 * @param {Object} options - Options for fetching products
 * @param {number} [options.limit=25] - Number of products to fetch per page
 * @param {number} [options.page=1] - Page number
 * @param {string} [options.search=''] - Search term
 * @param {boolean} [options.forceRefresh=false] - Force cache refresh
 * @returns {Promise<Object>} - Products and pagination info
 */
export async function fetchProducts({ 
  limit = 25, 
  page = 1, 
  search = '',
  forceRefresh = false 
} = {}) {
  // Create a cache key based on the query parameters
  const cacheKey = `products_${limit}_${page}_${search}`;
  const now = Date.now();
  
  // Return cached data if available and not expired
  if (productsCache[cacheKey] && productsCacheExpiry > now && !forceRefresh) {
    console.log(`Using cached products data for ${cacheKey}`);
    return productsCache[cacheKey];
  }
  
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
      const errorResult = {
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
      
      // Cache error state to prevent constant retries
      productsCache[cacheKey] = errorResult;
      productsCacheExpiry = Date.now() + (30 * 1000); // Only cache errors for 30 seconds
      
      return errorResult;
    }

    const responseText = await response.text();
    console.log('Response received, length:', responseText.length);
    
    let data;
    try {
      data = responseText ? JSON.parse(responseText) : { list: [] };
    } catch (err) {
      console.error('Error parsing JSON:', err);
      const errorResult = {
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
      
      // Cache the error briefly
      productsCache[cacheKey] = errorResult;
      productsCacheExpiry = Date.now() + (30 * 1000); // Only cache parsing errors for 30 seconds
      
      return errorResult;
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
        
        let activeBookings = [];
        const now = new Date();
        
        // Always try to fetch booking information for products that are not fully available
        // This fixes the problem where some products incorrectly show "no return date"
        const productId = product.Id || product.id;
        
        if (productId && availableQty < totalQty) {
          try {
            // Use the batching system to get bookings for this product
            // This will queue the request and process it efficiently
            console.log(`Queuing product for booking details: ${product.Produkt} (ID: ${productId})`);
            const matchingBookings = await queueProductForProcessing(productId);
            
            // Log how many bookings we found for this product
            console.log(`Received ${matchingBookings.length} bookings for product ${product.Produkt} (ID: ${productId})`);
            
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
                    console.log(`Date for ${product.Produkt}: ${formattedDate} (Past date: ${isPastDate})`);
                    
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
      // We don't need this code anymore since we fetch from booking table directly now
      
      // Process active bookings to identify future and overdue returns
      let upcomingReturnQty = 0;
      let nextReturnDate = null;
      let nextReturnTimestamp = 0; // Store timestamp for earliest return date
      let overdueReturnQty = 0;
      let overdueReturnDate = null;
      let maxDaysOverdue = 0;
      let hasOverdueReturns = false;
      
      // Check if we have active bookings to process - this includes both future and past bookings
      if (Array.isArray(activeBookings)) {
        // Always log the full list of bookings for debugging
        console.log(`Processing activeBookings for ${product.Produkt}:`, activeBookings.map(b => b.returnDateFormatted));
        
        // Even if we only have overdue returns, we still want to handle them
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
        
        // Log what we found for debugging
        console.log(`${product.Produkt}: Future returns: ${futureReturns.length}, Overdue returns: ${overdueReturns.length}`);
        
        // Sort future returns by date (earliest first)
        if (futureReturns.length > 0) {
          futureReturns.sort((a, b) => a.returnDate - b.returnDate);
          nextReturnDate = futureReturns[0].returnDateFormatted;
          nextReturnTimestamp = futureReturns[0].returnDate.getTime(); // Store timestamp for future use
          upcomingReturnQty = futureReturns[0].quantity || 1;
          console.log(`${product.Produkt}: Next return on ${nextReturnDate}, ${upcomingReturnQty} items`);
        }
        
        // Process overdue returns
        if (overdueReturns.length > 0) {
          hasOverdueReturns = true;
          // Sort overdue returns by date (most overdue first)
          overdueReturns.sort((a, b) => a.returnDate - b.returnDate);
          overdueReturnQty = overdueReturns.reduce((total, b) => total + (b.quantity || 1), 0);
          overdueReturnDate = overdueReturns[0].returnDateFormatted;
          maxDaysOverdue = overdueReturns[0].daysOverdue;
          console.log(`${product.Produkt}: Overdue returns: ${overdueReturnQty} items since ${overdueReturnDate}`);
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

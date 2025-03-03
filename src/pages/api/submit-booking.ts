import type { APIRoute } from 'astro';

/**
 * Server-side API endpoint for submitting bookings to NocoDB
 * This endpoint keeps sensitive information secure by handling API calls on the server
 */
export const POST: APIRoute = async ({ request }) => {
  try {
    // Get booking data from request body
    const bookingData = await request.json();
    
    // Validate booking data
    if (!bookingData || !bookingData.bookingItems || bookingData.bookingItems.length === 0) {
      return new Response(
        JSON.stringify({
          error: 'Invalid booking data. Please make sure you have items in your booking.'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Create an array of booking records - one for each product
    const bookingRecords = bookingData.bookingItems.map((item: { id: any; quantity: any; }) => ({
      Name: bookingData.fullName,
      Email: bookingData.email,
      Phone: bookingData.phone,
      Address: bookingData.address,
      "Pickup date-time": bookingData.pickupDateTimeFormatted,
      "Return date-time": bookingData.returnDateTimeFormatted,
      Notes: bookingData.notes || '',
      // For relational fields in NocoDB, we need to use the linked record ID
      Product: item.id, // Use the product ID for the relational field, not the name
      Quantity: item.quantity
    }));
    
    // Get the API URL and token from server-side environment variables
    const bookingTableUrl = import.meta.env.BOOKING_TABLE_URL;
    const apiToken = import.meta.env.NOCODB_API_TOKEN;
    
    if (!bookingTableUrl || !apiToken) {
      console.error('Missing required environment variables:', {
        BOOKING_TABLE_URL: bookingTableUrl ? 'Set' : 'Missing',
        NOCODB_API_TOKEN: apiToken ? 'Set' : 'Missing'
      });
      
      return new Response(
        JSON.stringify({ error: 'Server configuration error' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Clean URL by removing any query parameters
    const url = bookingTableUrl.split('?')[0];
    
    console.log('Submitting to NocoDB URL:', url);
    console.log('With payloads:', JSON.stringify(bookingRecords, null, 2));
    
    // Submit each booking record to NocoDB
    const results = [];
    const errors = [];
    
    // Log the number of records we're about to submit
    console.log(`Submitting ${bookingRecords.length} booking records to NocoDB`);
    
    // Process each booking record
    for (const bookingRecord of bookingRecords) {
      try {
        // Submit the current booking record
        const response = await fetch(url, {
          method: 'POST',
          headers: {
            'xc-token': apiToken,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(bookingRecord)
        });
        
        // Parse response
        const responseText = await response.text();
        let responseData;
        
        try {
          // Try to parse as JSON if possible
          responseData = JSON.parse(responseText);
        } catch (e) {
          // If not JSON, create a simple object with the response text
          responseData = { message: responseText, success: response.ok };
        }
        
        // Check if this specific submission was successful
        if (!response.ok) {
          errors.push({
            product: bookingRecord.Product,
            error: `Failed with status ${response.status}`,
            details: responseData
          });
        } else {
          results.push({
            product: bookingRecord.Product,
            success: true,
            data: responseData
          });
        }
      } catch (error) {
        // Handle any network/fetch errors for this specific record
        errors.push({
          product: bookingRecord.Product,
          error: error instanceof Error ? error.message : String(error)
        });
      }
    }
    
    // If we had any errors, return them
    if (errors.length > 0) {
      return new Response(
        JSON.stringify({
          error: `Failed to submit ${errors.length} of ${bookingRecords.length} booking records`,
          details: errors,
          partialSuccess: results.length > 0,
          successfulBookings: results
        }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // All bookings were successful
    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully submitted ${results.length} booking records`,
        count: results.length
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    console.error('Error in submit-booking API:', error);
    
    // Return error response
    return new Response(
      JSON.stringify({
        error: 'Server error processing booking',
        message: error instanceof Error ? error.message : String(error)
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
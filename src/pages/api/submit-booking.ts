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
    
    // Validate date formatting - must be in DD-MM-YYYY HH:MM format
    if (!bookingData.pickupDateTimeFormatted || !bookingData.returnDateTimeFormatted) {
      console.error('Missing date/time fields:', {
        pickup: bookingData.pickupDateTimeFormatted,
        return: bookingData.returnDateTimeFormatted
      });
      return new Response(
        JSON.stringify({
          error: 'Missing pickup or return date/time. Please select both dates.'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Validate date formats match expected pattern (DD-MM-YYYY HH:mm)
    const dateFormatRegex = /^\d{1,2}-\d{1,2}-\d{4}\s\d{1,2}:\d{2}$/;
    if (!dateFormatRegex.test(bookingData.pickupDateTimeFormatted) || 
        !dateFormatRegex.test(bookingData.returnDateTimeFormatted)) {
      console.error('Invalid date format:', {
        pickup: bookingData.pickupDateTimeFormatted,
        return: bookingData.returnDateTimeFormatted
      });
      return new Response(
        JSON.stringify({
          error: 'Date format is incorrect. Please use the date picker to select dates in DD-MM-YYYY HH:mm format.'
        }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }
    
    // Validate dates - parse date parts from DD-MM-YYYY HH:MM format
    try {
      const pickupParts = bookingData.pickupDateTimeFormatted.split(/[-\s:]/);
      const returnParts = bookingData.returnDateTimeFormatted.split(/[-\s:]/);
      
      if (pickupParts.length >= 5 && returnParts.length >= 5) {
        // Parse pickup date
        const pickupDay = parseInt(pickupParts[0]);
        const pickupMonth = parseInt(pickupParts[1]) - 1; // Months are 0-indexed in JS
        const pickupYear = parseInt(pickupParts[2]);
        const pickupHour = parseInt(pickupParts[3]);
        const pickupMinute = parseInt(pickupParts[4]);
        
        // Parse return date
        const returnDay = parseInt(returnParts[0]);
        const returnMonth = parseInt(returnParts[1]) - 1; // Months are 0-indexed in JS
        const returnYear = parseInt(returnParts[2]);
        const returnHour = parseInt(returnParts[3]);
        const returnMinute = parseInt(returnParts[4]);
        
        const pickupDate = new Date(pickupYear, pickupMonth, pickupDay, pickupHour, pickupMinute);
        const returnDate = new Date(returnYear, returnMonth, returnDay, returnHour, returnMinute);
        const now = new Date();
        
        // Check if pickup date is in the past
        if (pickupDate < now) {
          const minutesDiff = Math.round((now.getTime() - pickupDate.getTime()) / 60000);
          console.error('Pickup date is in the past:', {
            pickup: bookingData.pickupDateTimeFormatted,
            pickupDate: pickupDate.toString(),
            now: now.toString(),
            minutesBehind: minutesDiff
          });
          
          return new Response(
            JSON.stringify({
              error: 'Pickup date and time cannot be in the past. Please select a future date and time.',
              details: {
                requestedTime: pickupDate.toISOString(),
                currentTime: now.toISOString(),
                minutesBehind: minutesDiff
              }
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }
        
        // Check if return date is before pickup date
        if (returnDate <= pickupDate) {
          console.error('Return date is before or same as pickup date:', {
            pickup: bookingData.pickupDateTimeFormatted,
            return: bookingData.returnDateTimeFormatted
          });
          
          return new Response(
            JSON.stringify({
              error: 'Return date must be after pickup date. Please adjust your booking dates.'
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }
        
        // Check if rental period exceeds 7 days
        const rentalDurationMs = returnDate.getTime() - pickupDate.getTime();
        const rentalDurationDays = Math.round(rentalDurationMs / (1000 * 60 * 60 * 24));
        
        if (rentalDurationDays > 7) {
          console.error('Rental period exceeds maximum allowed:', {
            pickup: bookingData.pickupDateTimeFormatted,
            return: bookingData.returnDateTimeFormatted,
            durationDays: rentalDurationDays
          });
          
          return new Response(
            JSON.stringify({
              error: `Your rental period is ${rentalDurationDays} days. You can only borrow items for a maximum of 7 days (1 week) at a time.`,
              details: {
                durationDays: rentalDurationDays,
                maxAllowedDays: 7
              }
            }),
            { status: 400, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }
    } catch (error) {
      console.error('Error validating dates:', error);
    }
    
    // The issue appears to be a timezone difference between client and NocoDB
    // NocoDB might be interpreting our time as UTC and then displaying it in a different timezone
    
    // First, log the exact values from the picker
    console.log('Original datetime values from picker:', {
      pickup: bookingData.pickupDateTimeFormatted,
      return: bookingData.returnDateTimeFormatted
    });
    
    // Parse the dates to check for timezone issues
    try {
      // Parse the dates from DD-MM-YYYY HH:mm format
      const parseDateTime = (dateTimeStr) => {
        // Split into components: [day, month, year, hour, minute]
        const parts = dateTimeStr.split(/[-\s:]/);
        if (parts.length >= 5) {
          const day = parseInt(parts[0]);
          const month = parseInt(parts[1]) - 1; // JS months are 0-indexed
          const year = parseInt(parts[2]);
          const hour = parseInt(parts[3]);
          const minute = parseInt(parts[4]);
          
          // Create date in local timezone 
          return new Date(year, month, day, hour, minute);
        }
        return null;
      };
      
      const pickupDate = parseDateTime(bookingData.pickupDateTimeFormatted);
      const returnDate = parseDateTime(bookingData.returnDateTimeFormatted);
      
      if (pickupDate && returnDate) {
        console.log('Timezone diagnostic info:', {
          serverTimezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
          utcOffset: new Date().getTimezoneOffset()/-60,
          pickupLocal: pickupDate.toString(),
          pickupISO: pickupDate.toISOString(),
          pickupUTC: new Date(pickupDate.toUTCString()).toISOString(),
          returnLocal: returnDate.toString(),
          returnISO: returnDate.toISOString(),
          returnUTC: new Date(returnDate.toUTCString()).toISOString()
        });
      }
    } catch (error) {
      console.error('Error in timezone diagnostic:', error);
    }
    
    // Final approach: Format with SQL datetime format and timezone indicator
    // The format "YYYY-MM-DD HH:MM:SS+00:00" explicitly indicates timezone
    const formatForNocoDB = (dateTimeStr) => {
      // Parse from DD-MM-YYYY HH:mm format
      const parts = dateTimeStr.split(/[-\s:]/);
      if (parts.length >= 5) {
        const day = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1; // JS months are 0-indexed
        const year = parseInt(parts[2]);
        const hour = parseInt(parts[3]);
        const minute = parseInt(parts[4]);
        
        // Create a date object
        const date = new Date(year, month, day, hour, minute);
        
        // Format in SQL datetime format with explicit UTC+0 timezone
        // This forces NocoDB to interpret the time exactly as provided
        const pad = num => String(num).padStart(2, '0');
        
        // Add -1 hour compensation if needed based on your testing
        const adjustedHour = hour - 1;
        
        return `${year}-${pad(month + 1)}-${pad(day)} ${pad(adjustedHour)}:${pad(minute)}:00+00:00`;
      }
      return dateTimeStr;
    };
    
    const pickupDateISO = formatForNocoDB(bookingData.pickupDateTimeFormatted);
    const returnDateISO = formatForNocoDB(bookingData.returnDateTimeFormatted);
    
    console.log('Sending dates in SQL datetime format with -1 hour adjustment:', {
      pickup: pickupDateISO,
      return: returnDateISO,
      original: {
        pickup: bookingData.pickupDateTimeFormatted,
        return: bookingData.returnDateTimeFormatted
      }
    });
    
    // Create an array of booking records - one for each product
    const bookingRecords = bookingData.bookingItems.map((item: { id: any; quantity: any; }) => ({
      Name: bookingData.fullName,
      Email: bookingData.email,
      Phone: bookingData.phone,
      Address: bookingData.address,
      "Pickup date-time": pickupDateISO, // Using exact value from datetime picker
      "Return date-time": returnDateISO, // Using exact value from datetime picker
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
    
    // Log the date formats being submitted to NocoDB
    console.log('Date formats being submitted to NocoDB:', {
      pickup: pickupDateISO,
      return: returnDateISO,
      format: 'YYYY-MM-DD HH:mm:ss (SQL datetime format with +1 hour)',
      originalPickup: bookingData.pickupDateTimeFormatted,
      originalReturn: bookingData.returnDateTimeFormatted
    });
    
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
    
    // Determine if this might be a date format issue
    let errorMessage = 'Server error processing booking';
    if (error instanceof Error) {
      if (error.message.includes('date') || error.message.includes('time')) {
        errorMessage = 'Error with date/time format. Please ensure dates are in DD-MM-YYYY HH:MM format.';
      } else if (error.message.includes('validation')) {
        errorMessage = 'Validation error in booking data. Please check all fields are correctly filled.';
      }
    }
    
    // Return error response with more details
    return new Response(
      JSON.stringify({
        error: errorMessage,
        message: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString() // Add timestamp for debugging
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
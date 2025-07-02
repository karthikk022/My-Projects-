const BaseAgent = require('./BaseAgent');
const axios = require('axios');
const { logger } = require('../utils/logger');

class RideNowAgent extends BaseAgent {
  constructor(openai) {
    super(openai, 'RideNow AI', [
      'cab booking',
      'ride sharing',
      'transportation options',
      'fare estimation',
      'ride tracking'
    ]);
    
    this.rideStates = new Map(); // userId -> rideState
  }

  async processMessage(message, context, userProfile) {
    this.updateActivity();
    
    try {
      // Analyze the user's intent
      const analysis = await this.analyzeIntent(message, context);
      
      // Get current ride state for user
      const userId = context.userId || 'anonymous';
      let rideState = this.rideStates.get(userId) || {
        stage: 'initial',
        pickup: null,
        destination: null,
        selectedRide: null,
        preferences: {},
        bookingTime: null
      };

      // Process based on intent and current state
      switch (analysis.intent) {
        case 'book_ride':
          return await this.handleRideBooking(message, analysis, rideState, userProfile);
        
        case 'get_fare_estimate':
          return await this.handleFareEstimate(message, analysis, rideState, userProfile);
        
        case 'track_ride':
          return await this.handleRideTracking(message, analysis, userProfile);
        
        case 'cancel_ride':
          return await this.handleRideCancellation(message, analysis, userProfile);
        
        case 'ride_preferences':
          return await this.handleRidePreferences(message, analysis, userProfile);
        
        case 'find_nearby_cabs':
          return await this.handleNearbyCabs(message, analysis, userProfile);
        
        case 'scheduled_ride':
          return await this.handleScheduledRide(message, analysis, rideState, userProfile);
        
        default:
          return await this.handleGeneralRideQuery(message, analysis, userProfile);
      }
    } catch (error) {
      logger.error('Error in RideNowAgent:', error);
      return this.handleError(message, error);
    }
  }

  async handleRideBooking(message, analysis, rideState, userProfile) {
    const pickup = this.extractLocation(message) || userProfile?.addresses?.[0];
    const destination = analysis.entities.destination || this.extractDestination(message);
    const rideTime = this.extractTime(message);

    // Update ride state with extracted information
    if (pickup && typeof pickup === 'object') {
      rideState.pickup = pickup;
    } else if (pickup) {
      rideState.pickup = { name: pickup };
    }

    if (destination) {
      rideState.destination = { name: destination };
    }

    if (rideTime) {
      rideState.bookingTime = rideTime;
    }

    // Check if we have required information
    const missing = this.validateRideRequirements(rideState);
    
    if (missing.length > 0) {
      return this.askForMissingInfo(missing, rideState);
    }

    // Get available rides
    const availableRides = await this.getAvailableRides(
      rideState.pickup,
      rideState.destination,
      userProfile?.preferences?.ride
    );

    if (availableRides.length === 0) {
      return this.formatResponse(
        "I'm sorry, no rides are available for your route right now. Would you like me to check alternative options or try again later?",
        [],
        ["Try again", "Check alternative routes", "Schedule for later"]
      );
    }

    rideState.stage = 'ride_selection';
    rideState.availableRides = availableRides;
    this.rideStates.set(userId, rideState);

    const rideOptions = availableRides.map((ride, i) => 
      `${i + 1}. ${ride.type} - ₹${ride.fare} (${ride.estimatedTime} mins) - ${ride.provider}`
    ).join('\n');

    return this.formatResponse(
      `🚗 **Available rides from ${rideState.pickup.name} to ${rideState.destination.name}:**\n\n${rideOptions}\n\nWhich ride would you prefer?`,
      [
        { type: 'ride_selection', rides: availableRides },
        { type: 'fare_comparison', rides: availableRides }
      ],
      availableRides.slice(0, 3).map(r => `${r.type} - ₹${r.fare}`)
    );
  }

  async handleFareEstimate(message, analysis, rideState, userProfile) {
    const pickup = this.extractLocation(message) || rideState.pickup;
    const destination = analysis.entities.destination || this.extractDestination(message);

    if (!pickup || !destination) {
      return this.formatResponse(
        "To estimate the fare, I need both pickup and destination locations. Could you provide them?",
        [{ type: 'location_input', fields: ['pickup', 'destination'] }],
        ["Use current location", "Select saved address"]
      );
    }

    const fareEstimates = await this.calculateFareEstimates(pickup, destination);

    const estimateList = fareEstimates.map(estimate => 
      `🚗 **${estimate.type}** (${estimate.provider})\n₹${estimate.minFare} - ₹${estimate.maxFare} • ${estimate.estimatedTime} mins`
    ).join('\n\n');

    return this.formatResponse(
      `💰 **Fare estimates from ${pickup.name || pickup} to ${destination}:**\n\n${estimateList}\n\n*Fares may vary based on demand and traffic conditions`,
      [{ type: 'fare_estimates', estimates: fareEstimates }],
      ["Book now", "Compare options", "Schedule ride", "Get directions"]
    );
  }

  async handleRideTracking(message, analysis, userProfile) {
    // Mock ride tracking - integrate with actual APIs
    const rideStatus = {
      rideId: '#RD' + Math.random().toString(36).substr(2, 9).toUpperCase(),
      status: 'driver_assigned',
      driver: {
        name: 'Ramesh Kumar',
        rating: 4.8,
        vehicleNumber: 'DL 01 AB 1234',
        vehicleModel: 'Maruti Swift Dzire',
        phone: '+91 98765 43210'
      },
      estimatedArrival: '5 mins',
      currentLocation: 'Main Road, approaching pickup',
      fare: 285,
      timeline: [
        { status: 'booking_confirmed', time: '2:30 PM', completed: true },
        { status: 'driver_assigned', time: '2:32 PM', completed: true },
        { status: 'driver_arriving', time: '2:35 PM', completed: false },
        { status: 'trip_started', time: 'Pending', completed: false },
        { status: 'trip_completed', time: 'Pending', completed: false }
      ]
    };

    const trackingMessage = `
🚗 **Ride Status**: ${rideStatus.rideId}

👨‍✈️ **Driver Details**
${rideStatus.driver.name} ⭐ ${rideStatus.driver.rating}
📱 ${rideStatus.driver.phone}
🚙 ${rideStatus.driver.vehicleModel} (${rideStatus.driver.vehicleNumber})

📍 **Current Status**: ${rideStatus.status.replace('_', ' ').toUpperCase()}
⏰ **ETA**: ${rideStatus.estimatedArrival}
💰 **Estimated Fare**: ₹${rideStatus.fare}

📍 **Live Location**: ${rideStatus.currentLocation}

**Trip Timeline:**
${rideStatus.timeline.map(t => 
  `${t.completed ? '✅' : '⏳'} ${t.status.replace('_', ' ')} - ${t.time}`
).join('\n')}
    `;

    return this.formatResponse(
      trackingMessage,
      [
        { type: 'ride_tracking', rideDetails: rideStatus },
        { type: 'driver_contact', driver: rideStatus.driver }
      ],
      ["Call driver", "Cancel ride", "Share trip", "Report issue"]
    );
  }

  async handleScheduledRide(message, analysis, rideState, userProfile) {
    const scheduleTime = this.extractTime(message);
    const pickup = this.extractLocation(message) || rideState.pickup;
    const destination = analysis.entities.destination || rideState.destination;

    if (!scheduleTime) {
      return this.formatResponse(
        "When would you like to schedule your ride? Please specify the date and time.",
        [{ type: 'datetime_picker', purpose: 'schedule_ride' }],
        ["Tomorrow morning", "This evening", "In 2 hours", "Custom time"]
      );
    }

    if (!pickup || !destination) {
      return this.formatResponse(
        "Please provide both pickup and destination locations for your scheduled ride.",
        [{ type: 'location_input', fields: ['pickup', 'destination'] }],
        ["Use saved addresses", "Current location"]
      );
    }

    // Mock scheduling - integrate with actual APIs
    const scheduledRide = {
      scheduleId: '#SCH' + Math.random().toString(36).substr(2, 9).toUpperCase(),
      pickupTime: scheduleTime,
      pickup: pickup.name || pickup,
      destination: destination.name || destination,
      estimatedFare: '₹250 - ₹300',
      reminderSet: true
    };

    const confirmationMessage = `
📅 **Ride Scheduled Successfully!**

🆔 **Schedule ID**: ${scheduledRide.scheduleId}
⏰ **Pickup Time**: ${scheduledRide.pickupTime}
📍 **From**: ${scheduledRide.pickup}
📍 **To**: ${scheduledRide.destination}
💰 **Estimated Fare**: ${scheduledRide.estimatedFare}

🔔 You'll receive a reminder 15 minutes before your ride.
🚗 A driver will be assigned 10 minutes before pickup time.
    `;

    return this.formatResponse(
      confirmationMessage,
      [{ type: 'scheduled_ride_confirmation', rideDetails: scheduledRide }],
      ["Modify schedule", "Cancel schedule", "Set reminder", "View all schedules"]
    );
  }

  async handleNearbyCabs(message, analysis, userProfile) {
    const location = this.extractLocation(message) || userProfile?.addresses?.[0];

    if (!location) {
      return this.formatResponse(
        "To find nearby cabs, I need your location. Could you share it?",
        [{ type: 'location_input', required: true }],
        ["Use current location", "Enter manually"]
      );
    }

    // Mock nearby cabs data
    const nearbyCabs = [
      {
        driverId: 'DRV001',
        driverName: 'Rajesh Singh',
        vehicleType: 'Hatchback',
        rating: 4.6,
        distance: '2 mins away',
        vehicleNumber: 'DL 02 XY 5678'
      },
      {
        driverId: 'DRV002',
        driverName: 'Amit Sharma',
        vehicleType: 'Sedan',
        rating: 4.8,
        distance: '3 mins away',
        vehicleNumber: 'DL 03 AB 9012'
      },
      {
        driverId: 'DRV003',
        driverName: 'Vikash Kumar',
        vehicleType: 'SUV',
        rating: 4.5,
        distance: '5 mins away',
        vehicleNumber: 'DL 05 CD 3456'
      }
    ];

    const cabsList = nearbyCabs.map(cab => 
      `🚗 **${cab.driverName}** ⭐ ${cab.rating}\n${cab.vehicleType} (${cab.vehicleNumber}) • ${cab.distance}`
    ).join('\n\n');

    return this.formatResponse(
      `🗺️ **Nearby cabs at ${location.name || location}:**\n\n${cabsList}`,
      [{ type: 'nearby_cabs', cabs: nearbyCabs, location }],
      ["Book instantly", "Get fare estimate", "Filter by type", "Refresh"]
    );
  }

  async getAvailableRides(pickup, destination, userPreferences = {}) {
    // Mock ride data - integrate with Uber/Ola APIs
    const mockRides = [
      {
        id: 'ride_1',
        type: 'Economy',
        provider: 'Ola',
        fare: 185,
        estimatedTime: 25,
        capacity: 4,
        features: ['AC', 'GPS Tracking']
      },
      {
        id: 'ride_2',
        type: 'Premium',
        provider: 'Uber',
        fare: 285,
        estimatedTime: 22,
        capacity: 4,
        features: ['AC', 'Leather Seats', 'GPS Tracking']
      },
      {
        id: 'ride_3',
        type: 'Shared',
        provider: 'Ola',
        fare: 95,
        estimatedTime: 35,
        capacity: 2,
        features: ['AC', 'Shared Ride']
      },
      {
        id: 'ride_4',
        type: 'Auto',
        provider: 'Ola',
        fare: 65,
        estimatedTime: 30,
        capacity: 3,
        features: ['Open Air', 'Budget Friendly']
      }
    ];

    // Filter based on user preferences
    let filteredRides = mockRides;

    if (userPreferences.preferredRideType) {
      filteredRides = filteredRides.filter(ride => 
        ride.type.toLowerCase() === userPreferences.preferredRideType.toLowerCase()
      );
    }

    // Sort by fare if no preference
    if (!userPreferences.preferredRideType) {
      filteredRides.sort((a, b) => a.fare - b.fare);
    }

    return filteredRides;
  }

  async calculateFareEstimates(pickup, destination) {
    // Mock fare calculation - integrate with actual APIs
    const baseDistance = Math.random() * 15 + 5; // 5-20 km
    const baseFare = baseDistance * 12; // ₹12 per km

    return [
      {
        type: 'Auto',
        provider: 'Ola',
        minFare: Math.round(baseFare * 0.4),
        maxFare: Math.round(baseFare * 0.6),
        estimatedTime: Math.round(baseDistance * 3)
      },
      {
        type: 'Economy',
        provider: 'Multiple',
        minFare: Math.round(baseFare * 0.8),
        maxFare: Math.round(baseFare * 1.2),
        estimatedTime: Math.round(baseDistance * 2.5)
      },
      {
        type: 'Premium',
        provider: 'Uber',
        minFare: Math.round(baseFare * 1.5),
        maxFare: Math.round(baseFare * 2.0),
        estimatedTime: Math.round(baseDistance * 2)
      }
    ];
  }

  validateRideRequirements(rideState) {
    const missing = [];
    
    if (!rideState.pickup) {
      missing.push('pickup location');
    }
    
    if (!rideState.destination) {
      missing.push('destination');
    }
    
    return missing;
  }

  askForMissingInfo(missingFields, rideState) {
    const field = missingFields[0];
    
    if (field === 'pickup location') {
      return this.formatResponse(
        "Where would you like to be picked up from?",
        [{ type: 'location_input', field: 'pickup' }],
        ["Current location", "Home", "Work", "Enter manually"]
      );
    }
    
    if (field === 'destination') {
      return this.formatResponse(
        "Where would you like to go?",
        [{ type: 'location_input', field: 'destination' }],
        ["Popular destinations", "Airport", "Railway station", "Enter manually"]
      );
    }
    
    return this.formatResponse(
      `I need more information: ${missingFields.join(', ')}`,
      [],
      ["Start over", "Help"]
    );
  }

  extractDestination(message) {
    // Extract destination patterns
    const destinationPatterns = [
      /(?:to|going to|destination)\s+([A-Za-z\s]+?)(?:\s|$|,|\.|!|\?)/gi,
      /(?:drop me at|take me to)\s+([A-Za-z\s]+?)(?:\s|$|,|\.|!|\?)/gi
    ];

    for (const pattern of destinationPatterns) {
      const matches = message.match(pattern);
      if (matches) {
        return matches[0].replace(/^(to|going to|destination|drop me at|take me to)\s+/i, '').trim();
      }
    }
    return null;
  }

  async generateSuggestions(context, conversationContext) {
    const stage = context.stage || 'initial';
    
    const suggestionMap = {
      'initial': ["Book a ride", "Get fare estimate", "Nearby cabs", "Schedule ride"],
      'ride_selection': ["Book this ride", "Compare fares", "Check driver details", "Modify route"],
      'booking_confirmed': ["Track ride", "Call driver", "Share trip", "Cancel ride"],
      'ride_active': ["Track live", "Contact driver", "Report issue", "Share location"]
    };

    return suggestionMap[stage] || suggestionMap['initial'];
  }

  async canHandle(message, context) {
    const rideKeywords = [
      'cab', 'taxi', 'ride', 'book', 'uber', 'ola', 'auto', 'rickshaw',
      'transport', 'travel', 'pickup', 'drop', 'fare', 'driver',
      'airport', 'station', 'go to', 'take me to'
    ];

    return rideKeywords.some(keyword => 
      message.toLowerCase().includes(keyword.toLowerCase())
    );
  }

  async handleGeneralRideQuery(message, analysis, userProfile) {
    const response = await this.generateResponse(
      `You are RideNow AI, a helpful assistant for booking rides and transportation.
       The user asked: "${message}"
       Provide a helpful response related to ride booking, transportation options, or general travel assistance.`,
      { message },
      200
    );

    return this.formatResponse(
      response,
      [],
      ["Book a ride", "Get fare estimate", "Track ride", "Schedule ride"]
    );
  }
}

module.exports = RideNowAgent;
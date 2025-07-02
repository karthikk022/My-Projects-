const BaseAgent = require('./BaseAgent');
const axios = require('axios');
const { logger } = require('../utils/logger');

class FoodieAgent extends BaseAgent {
  constructor(openai) {
    super(openai, 'Foodie AI', [
      'food ordering',
      'restaurant recommendations', 
      'cuisine suggestions',
      'dietary preferences',
      'food delivery tracking'
    ]);
    
    this.orderStates = new Map(); // userId -> orderState
  }

  async processMessage(message, context, userProfile) {
    this.updateActivity();
    
    try {
      // Analyze the user's intent
      const analysis = await this.analyzeIntent(message, context);
      
      // Get current order state for user
      const userId = context.userId || 'anonymous';
      let orderState = this.orderStates.get(userId) || {
        stage: 'initial',
        preferences: {},
        selectedItems: [],
        restaurant: null,
        total: 0
      };

      // Process based on intent and current state
      switch (analysis.intent) {
        case 'order_food':
          return await this.handleFoodOrder(message, analysis, orderState, userProfile);
        
        case 'restaurant_search':
          return await this.handleRestaurantSearch(message, analysis, userProfile);
        
        case 'menu_browse':
          return await this.handleMenuBrowse(message, analysis, orderState);
        
        case 'add_to_cart':
          return await this.handleAddToCart(message, analysis, orderState);
        
        case 'modify_order':
          return await this.handleModifyOrder(message, analysis, orderState);
        
        case 'checkout':
          return await this.handleCheckout(message, analysis, orderState, userProfile);
        
        case 'track_order':
          return await this.handleOrderTracking(message, analysis, userProfile);
        
        case 'dietary_preferences':
          return await this.handleDietaryPreferences(message, analysis, userProfile);
        
        default:
          return await this.handleGeneralFoodQuery(message, analysis, userProfile);
      }
    } catch (error) {
      logger.error('Error in FoodieAgent:', error);
      return this.handleError(message, error);
    }
  }

  async handleFoodOrder(message, analysis, orderState, userProfile) {
    const location = this.extractLocation(message) || userProfile?.addresses?.[0]?.city;
    const cuisine = analysis.entities.cuisine;
    const item = analysis.entities.food_item;

    if (!location) {
      return this.formatResponse(
        "I'd love to help you order food! Could you please tell me your location or select from your saved addresses?",
        [{ type: 'location_input', required: true }],
        ["Use my current location", "Select saved address"]
      );
    }

    // Search for restaurants
    const restaurants = await this.searchRestaurants({
      location,
      cuisine,
      item,
      userPreferences: userProfile?.preferences?.dietary
    });

    if (restaurants.length === 0) {
      return this.formatResponse(
        `I couldn't find any restaurants serving ${item || cuisine || 'food'} in ${location}. Would you like me to suggest some popular options instead?`,
        [],
        ["Show popular restaurants", "Try different cuisine", "Change location"]
      );
    }

    orderState.stage = 'restaurant_selection';
    orderState.preferences = { location, cuisine, item };
    this.orderStates.set(orderState.userId || 'anonymous', orderState);

    const restaurantList = restaurants.slice(0, 5).map((r, i) => 
      `${i + 1}. ${r.name} - ${r.cuisine} (${r.rating}⭐) - ${r.deliveryTime} mins`
    ).join('\n');

    return this.formatResponse(
      `Here are some great restaurants for ${item || cuisine || 'food'} in ${location}:\n\n${restaurantList}\n\nWhich restaurant would you like to order from?`,
      [
        { type: 'restaurant_selection', restaurants: restaurants.slice(0, 5) }
      ],
      restaurants.slice(0, 3).map(r => r.name)
    );
  }

  async handleRestaurantSearch(message, analysis, userProfile) {
    const location = this.extractLocation(message) || userProfile?.addresses?.[0]?.city;
    const cuisine = analysis.entities.cuisine;
    const priceRange = analysis.entities.price_range;

    const restaurants = await this.searchRestaurants({
      location,
      cuisine,
      priceRange,
      userPreferences: userProfile?.preferences?.dietary
    });

    if (restaurants.length === 0) {
      return this.formatResponse(
        "I couldn't find any restaurants matching your criteria. Let me show you some popular options instead.",
        [],
        ["Show all restaurants", "Change location", "Different cuisine"]
      );
    }

    const restaurantList = restaurants.slice(0, 8).map(r => 
      `🍽️ **${r.name}**\n${r.cuisine} • ${r.rating}⭐ • ${r.deliveryTime} mins • ${r.priceRange}\n${r.specialties.join(', ')}\n`
    ).join('\n');

    return this.formatResponse(
      `Here are some great restaurants${cuisine ? ` for ${cuisine}` : ''} in ${location}:\n\n${restaurantList}`,
      [{ type: 'restaurant_list', restaurants: restaurants.slice(0, 8) }],
      ["View menu", "Order now", "Filter by rating", "Filter by price"]
    );
  }

  async handleMenuBrowse(message, analysis, orderState) {
    if (!orderState.restaurant) {
      return this.formatResponse(
        "Please select a restaurant first to view their menu.",
        [],
        ["Show restaurants", "Search restaurants"]
      );
    }

    const menu = await this.getRestaurantMenu(orderState.restaurant.id);
    const category = analysis.entities.category || 'all';

    const filteredMenu = category === 'all' 
      ? menu 
      : menu.filter(item => item.category.toLowerCase().includes(category.toLowerCase()));

    const menuDisplay = this.formatMenuItems(filteredMenu);

    return this.formatResponse(
      `Here's the menu from ${orderState.restaurant.name}:\n\n${menuDisplay}`,
      [
        { type: 'menu_display', menu: filteredMenu },
        { type: 'add_to_cart_buttons', items: filteredMenu }
      ],
      ["Add to cart", "View categories", "Filter by veg/non-veg"]
    );
  }

  async handleAddToCart(message, analysis, orderState) {
    const itemName = analysis.entities.item_name;
    const quantity = analysis.entities.quantity || 1;

    if (!itemName) {
      return this.formatResponse(
        "Which item would you like to add to your cart?",
        [],
        orderState.restaurant ? ["View menu", "Popular items"] : ["Select restaurant"]
      );
    }

    // Find item in menu
    const menu = await this.getRestaurantMenu(orderState.restaurant?.id);
    const item = menu.find(i => i.name.toLowerCase().includes(itemName.toLowerCase()));

    if (!item) {
      return this.formatResponse(
        `I couldn't find "${itemName}" on the menu. Would you like to see similar items or browse the full menu?`,
        [],
        ["View menu", "Search items", "Popular items"]
      );
    }

    // Add to cart
    const existingIndex = orderState.selectedItems.findIndex(i => i.id === item.id);
    if (existingIndex >= 0) {
      orderState.selectedItems[existingIndex].quantity += quantity;
    } else {
      orderState.selectedItems.push({ ...item, quantity });
    }

    orderState.total = orderState.selectedItems.reduce((sum, item) => 
      sum + (item.price * item.quantity), 0
    );

    this.orderStates.set(orderState.userId || 'anonymous', orderState);

    const cartSummary = this.formatCartSummary(orderState.selectedItems, orderState.total);

    return this.formatResponse(
      `Added ${quantity}x ${item.name} to your cart! 🛒\n\n${cartSummary}`,
      [
        { type: 'cart_update', items: orderState.selectedItems, total: orderState.total }
      ],
      ["Add more items", "Proceed to checkout", "View cart", "Remove items"]
    );
  }

  async handleCheckout(message, analysis, orderState, userProfile) {
    if (orderState.selectedItems.length === 0) {
      return this.formatResponse(
        "Your cart is empty. Would you like to browse restaurants and add some delicious items?",
        [],
        ["Browse restaurants", "Popular dishes", "Cuisines"]
      );
    }

    const deliveryAddress = userProfile?.getDefaultAddress();
    const paymentMethod = userProfile?.getDefaultPaymentMethod();

    if (!deliveryAddress) {
      return this.formatResponse(
        "I need a delivery address to complete your order. Please add your delivery address.",
        [{ type: 'address_input', required: true }],
        ["Use current location", "Add new address"]
      );
    }

    // Calculate charges
    const subtotal = orderState.total;
    const deliveryFee = subtotal > 200 ? 0 : 40;
    const gst = Math.round(subtotal * 0.05);
    const grandTotal = subtotal + deliveryFee + gst;

    const orderSummary = `
📋 **Order Summary**
${orderState.selectedItems.map(item => 
  `${item.quantity}x ${item.name} - ₹${item.price * item.quantity}`
).join('\n')}

💰 **Bill Details**
Subtotal: ₹${subtotal}
Delivery Fee: ₹${deliveryFee}
GST (5%): ₹${gst}
**Total: ₹${grandTotal}**

📍 **Delivery Address**
${deliveryAddress.street}, ${deliveryAddress.city}

🕐 **Estimated Delivery**: 35-45 mins
    `;

    return this.formatResponse(
      orderSummary + "\n\nEverything looks good? Shall I place your order?",
      [
        { 
          type: 'order_confirmation',
          orderDetails: {
            items: orderState.selectedItems,
            restaurant: orderState.restaurant,
            total: grandTotal,
            address: deliveryAddress
          }
        }
      ],
      ["Confirm Order", "Modify items", "Change address", "Apply coupon"]
    );
  }

  async handleOrderTracking(message, analysis, userProfile) {
    // Mock order tracking - integrate with actual APIs
    const orderStatus = {
      orderId: '#FD' + Math.random().toString(36).substr(2, 9).toUpperCase(),
      status: 'preparing',
      estimatedTime: '25 mins',
      restaurant: 'Sample Restaurant',
      items: ['Butter Chicken', 'Naan', 'Rice'],
      timeline: [
        { status: 'confirmed', time: '10:30 AM', completed: true },
        { status: 'preparing', time: '10:35 AM', completed: true },
        { status: 'packed', time: '10:50 AM', completed: false },
        { status: 'out_for_delivery', time: '11:00 AM', completed: false },
        { status: 'delivered', time: '11:15 AM', completed: false }
      ]
    };

    const trackingMessage = `
🔍 **Order Status**: ${orderStatus.orderId}

🏪 ${orderStatus.restaurant}
📦 Items: ${orderStatus.items.join(', ')}

⏱️ **Current Status**: ${orderStatus.status.replace('_', ' ').toUpperCase()}
🕐 **Estimated Delivery**: ${orderStatus.estimatedTime}

📍 **Tracking Timeline**:
${orderStatus.timeline.map(t => 
  `${t.completed ? '✅' : '⏳'} ${t.status.replace('_', ' ')} - ${t.time}`
).join('\n')}
    `;

    return this.formatResponse(
      trackingMessage,
      [{ type: 'order_tracking', orderDetails: orderStatus }],
      ["Call restaurant", "Cancel order", "Report issue", "Rate order"]
    );
  }

  async searchRestaurants({ location, cuisine, item, priceRange, userPreferences }) {
    // Mock restaurant data - integrate with Zomato/Swiggy APIs
    const mockRestaurants = [
      {
        id: 'rest_1',
        name: 'Spice Garden',
        cuisine: 'Indian',
        rating: 4.2,
        deliveryTime: 35,
        priceRange: '₹₹',
        specialties: ['Biryani', 'Curry', 'Tandoor'],
        isVeg: false,
        hasVegOptions: true
      },
      {
        id: 'rest_2', 
        name: 'Green Bowl',
        cuisine: 'Healthy',
        rating: 4.5,
        deliveryTime: 25,
        priceRange: '₹₹₹',
        specialties: ['Salads', 'Smoothies', 'Quinoa Bowl'],
        isVeg: true,
        hasVegOptions: true
      },
      {
        id: 'rest_3',
        name: 'Burger Hub',
        cuisine: 'American',
        rating: 4.0,
        deliveryTime: 30,
        priceRange: '₹₹',
        specialties: ['Burgers', 'Fries', 'Shakes'],
        isVeg: false,
        hasVegOptions: true
      }
    ];

    // Filter based on criteria
    let filtered = mockRestaurants;

    if (cuisine) {
      filtered = filtered.filter(r => 
        r.cuisine.toLowerCase().includes(cuisine.toLowerCase()) ||
        r.specialties.some(s => s.toLowerCase().includes(cuisine.toLowerCase()))
      );
    }

    if (userPreferences?.vegetarian) {
      filtered = filtered.filter(r => r.isVeg || r.hasVegOptions);
    }

    return filtered;
  }

  async getRestaurantMenu(restaurantId) {
    // Mock menu data - integrate with restaurant APIs
    const mockMenus = {
      'rest_1': [
        { id: 'item_1', name: 'Chicken Biryani', price: 280, category: 'Main Course', isVeg: false },
        { id: 'item_2', name: 'Paneer Butter Masala', price: 220, category: 'Main Course', isVeg: true },
        { id: 'item_3', name: 'Garlic Naan', price: 60, category: 'Bread', isVeg: true },
        { id: 'item_4', name: 'Raita', price: 80, category: 'Sides', isVeg: true }
      ],
      'rest_2': [
        { id: 'item_5', name: 'Quinoa Power Bowl', price: 320, category: 'Main Course', isVeg: true },
        { id: 'item_6', name: 'Green Smoothie', price: 180, category: 'Beverages', isVeg: true },
        { id: 'item_7', name: 'Avocado Toast', price: 250, category: 'Breakfast', isVeg: true }
      ]
    };

    return mockMenus[restaurantId] || [];
  }

  formatMenuItems(menuItems) {
    return menuItems.map(item => 
      `🍽️ **${item.name}** ${item.isVeg ? '🥬' : '🍖'}\n₹${item.price} • ${item.category}`
    ).join('\n\n');
  }

  formatCartSummary(items, total) {
    if (items.length === 0) return "Your cart is empty";
    
    const itemList = items.map(item => 
      `${item.quantity}x ${item.name} - ₹${item.price * item.quantity}`
    ).join('\n');
    
    return `**Your Cart:**\n${itemList}\n\n**Total: ₹${total}**`;
  }

  async generateSuggestions(context, conversationContext) {
    const stage = context.stage || 'initial';
    
    const suggestionMap = {
      'initial': ["Popular restaurants", "Order again", "Cuisine categories", "Deals & offers"],
      'restaurant_selection': ["View menu", "Check reviews", "Filter by rating", "Delivery time"],
      'menu_browse': ["Add to cart", "View categories", "Popular items", "Chef's special"],
      'cart': ["Proceed to checkout", "Add more items", "Apply coupon", "Modify quantity"],
      'checkout': ["Confirm order", "Change address", "Payment options", "Add instructions"]
    };

    return suggestionMap[stage] || suggestionMap['initial'];
  }

  async canHandle(message, context) {
    const foodKeywords = [
      'food', 'order', 'restaurant', 'eat', 'hungry', 'delivery', 'menu',
      'cuisine', 'dish', 'meal', 'breakfast', 'lunch', 'dinner', 'snack',
      'pizza', 'burger', 'biryani', 'curry', 'chinese', 'italian'
    ];

    return foodKeywords.some(keyword => 
      message.toLowerCase().includes(keyword.toLowerCase())
    );
  }
}

module.exports = FoodieAgent;
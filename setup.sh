#!/bin/bash

echo "🤖 AI Super App - Development Setup Script"
echo "=========================================="

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✓${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

print_error() {
    echo -e "${RED}✗${NC} $1"
}

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    print_error "Node.js is not installed. Please install Node.js 18+ first."
    exit 1
fi

NODE_VERSION=$(node -v | sed 's/v//')
REQUIRED_VERSION="18.0.0"

if ! node -pe "process.exit(require('semver').gte('$NODE_VERSION', '$REQUIRED_VERSION'))" 2>/dev/null; then
    print_error "Node.js version $NODE_VERSION is not supported. Please install Node.js 18+ first."
    exit 1
fi

print_status "Node.js version $NODE_VERSION detected"

# Check if MongoDB is running
if ! command -v mongod &> /dev/null; then
    print_warning "MongoDB is not installed. Please install MongoDB or ensure it's running."
fi

echo
echo "📦 Installing Dependencies..."
echo "=============================="

# Install root dependencies
print_status "Installing root dependencies..."
npm install

# Install server dependencies
print_status "Installing server dependencies..."
cd server && npm install && cd ..

# Install mobile dependencies
print_status "Installing mobile dependencies..."
cd mobile && npm install && cd ..

echo
echo "🔧 Setting up Environment..."
echo "============================"

# Create server .env file if it doesn't exist
if [ ! -f "server/.env" ]; then
    print_status "Creating server environment file..."
    cp server/.env.example server/.env
    print_warning "Please edit server/.env with your configuration:"
    echo "  - Add your OpenAI API key"
    echo "  - Configure MongoDB URI"
    echo "  - Set up payment gateway keys"
else
    print_warning "server/.env already exists. Please verify your configuration."
fi

# Create logs directory
mkdir -p server/logs
print_status "Created logs directory"

echo
echo "📱 Mobile App Setup..."
echo "====================="

# iOS setup (if on macOS)
if [[ "$OSTYPE" == "darwin"* ]]; then
    if command -v pod &> /dev/null; then
        print_status "Installing iOS dependencies..."
        cd mobile/ios && pod install && cd ../..
    else
        print_warning "CocoaPods not found. Install with: sudo gem install cocoapods"
    fi
else
    print_warning "iOS setup skipped (not on macOS)"
fi

echo
echo "🎉 Setup Complete!"
echo "=================="

echo
echo "Next Steps:"
echo "-----------"
echo "1. Configure your environment variables in server/.env"
echo "2. Start MongoDB service"
echo "3. Start the backend server:"
echo "   cd server && npm run dev"
echo ""
echo "4. In a new terminal, start the mobile app:"
echo "   cd mobile && npm start"
echo "   npm run ios    # For iOS"
echo "   npm run android # For Android"
echo ""

echo "🔗 Important URLs:"
echo "------------------"
echo "Backend API: http://localhost:3000"
echo "Health Check: http://localhost:3000/api/health"
echo "API Documentation: Check README.md for endpoints"
echo ""

echo "🆘 Need Help?"
echo "-------------"
echo "- Read the README.md for detailed documentation"
echo "- Check the .env.example for required environment variables"
echo "- Ensure MongoDB is running before starting the server"
echo ""

print_status "AI Super App setup completed successfully!"

echo
echo "Happy coding! 🚀"
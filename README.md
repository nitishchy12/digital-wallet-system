# Digital Wallet & Payment System

A complete, production-ready digital wallet application built with MERN stack, featuring real payment gateway integration, real-time transactions, and comprehensive security features.

## 🚀 Features

### User Features
- **Secure Authentication**: JWT-based auth with OTP verification
- **Add Money**: Integration with Razorpay/Stripe payment gateways
- **Send Money**: Instant transfers between wallet users
- **QR Payments**: Generate and scan QR codes for quick payments
- **Transaction History**: Complete transaction tracking with filters
- **Real-time Notifications**: Socket.io powered live updates
- **Profile Management**: User profile and security settings

### Admin Features
- **Dashboard Analytics**: User and transaction statistics
- **User Management**: View and manage all users
- **Transaction Monitoring**: Monitor all platform transactions
- **Security Controls**: Account management and fraud detection

### Technical Features
- **Real-time Updates**: WebSocket integration for live notifications
- **Responsive Design**: Mobile-first responsive UI
- **Security**: Rate limiting, input validation, HTTPS enforcement
- **Scalable Architecture**: Microservices-ready structure
- **Docker Support**: Complete containerization setup

## 🛠 Tech Stack

**Frontend:**
- React.js 18 with Hooks
- Tailwind CSS for styling
- Socket.io-client for real-time features
- React Router for navigation
- Axios for API calls
- QR code generation and scanning

**Backend:**
- Node.js with Express.js
- MongoDB with Mongoose ODM
- Socket.io for real-time communication
- JWT for authentication
- bcrypt for password hashing
- Razorpay/Stripe for payments
- Nodemailer for emails

**DevOps & Deployment:**
- Docker & Docker Compose
- Nginx reverse proxy
- MongoDB with replica set support
- Health checks and monitoring
- Environment-based configuration

## 📁 Project Structure

```
digital-wallet/
├── backend/
│   ├── controllers/          # Business logic
│   │   ├── authController.js
│   │   ├── walletController.js
│   │   └── paymentController.js
│   ├── models/              # Database schemas
│   │   ├── User.js
│   │   └── Transaction.js
│   ├── routes/              # API routes
│   ├── middleware/          # Auth, validation, etc.
│   ├── utils/               # Helper functions
│   └── server.js           # Main server file
├── frontend/
│   ├── src/
│   │   ├── components/      # Reusable components
│   │   ├── pages/          # Page components
│   │   ├── context/        # React context
│   │   └── utils/          # Helper functions
│   └── public/
├── docker-compose.yml       # Container orchestration
└── README.md
```

## 🔧 Installation & Setup

### Prerequisites
- Node.js 18+ and npm
- MongoDB 7.0+
- Git

### Quick Start

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd digital-wallet
   ```

2. **Backend Setup**
   ```bash
   cd backend
   npm install
   cp .env.example .env
   # Edit .env with your configuration
   npm run dev
   ```

3. **Frontend Setup**
   ```bash
   cd frontend
   npm install
   cp .env.example .env
   # Edit .env with your configuration
   npm start
   ```

4. **Database Setup**
   - Start MongoDB locally or use MongoDB Atlas
   - The application will create necessary collections automatically
   - Demo users will be created on first run

### Docker Setup (Recommended)

1. **Using Docker Compose**
   ```bash
   # Copy environment files
   cp backend/.env.example backend/.env
   cp frontend/.env.example frontend/.env
   
   # Start all services
   docker-compose up -d
   
   # View logs
   docker-compose logs -f
   ```

2. **Access the application**
   - Frontend: http://localhost:3000
   - Backend API: http://localhost:5000
   - MongoDB: localhost:27017

## ⚙️ Configuration

### Backend Environment Variables (.env)
```env
# Server
PORT=5000
NODE_ENV=development

# Database
MONGODB_URI=mongodb://localhost:27017/digital-wallet

# JWT
JWT_SECRET=your-super-secret-jwt-key
JWT_REFRESH_SECRET=your-refresh-token-secret
JWT_EXPIRE=15m
JWT_REFRESH_EXPIRE=7d

# Payment Gateway - Razorpay
RAZORPAY_KEY_ID=your-razorpay-key-id
RAZORPAY_KEY_SECRET=your-razorpay-key-secret

# Email
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your-email@gmail.com
EMAIL_PASS=your-app-password

# Frontend URL
FRONTEND_URL=http://localhost:3000
```

### Frontend Environment Variables (.env)
```env
REACT_APP_API_URL=http://localhost:5000/api
REACT_APP_SERVER_URL=http://localhost:5000
```

## 🔐 Security Features

- **Authentication**: JWT tokens with refresh token rotation
- **Password Security**: bcrypt hashing with salt rounds
- **Rate Limiting**: API endpoint protection
- **Input Validation**: Comprehensive request validation
- **CORS Protection**: Configured for specific origins
- **Helmet.js**: Security headers
- **MongoDB Injection Protection**: Mongoose sanitization
- **XSS Protection**: Input sanitization
- **HTTPS Enforcement**: SSL/TLS in production

## 💳 Payment Integration

### Razorpay Setup
1. Create account at https://razorpay.com
2. Get API keys from dashboard
3. Add keys to backend .env file
4. Configure webhook endpoints
5. Test with provided test cards

### Stripe Setup (Alternative)
1. Create account at https://stripe.com
2. Get API keys from dashboard
3. Add keys to backend .env file
4. Configure webhook endpoints

## 📱 API Documentation

### Authentication Endpoints
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/verify-otp` - OTP verification
- `POST /api/auth/refresh-token` - Token refresh
- `POST /api/auth/logout` - User logout

### Wallet Endpoints
- `GET /api/wallet/balance` - Get wallet balance
- `POST /api/wallet/transfer` - Transfer money
- `GET /api/wallet/transactions` - Transaction history
- `GET /api/wallet/stats` - Wallet statistics

### Payment Endpoints
- `POST /api/payment/create-order` - Create payment order
- `POST /api/payment/verify` - Verify payment
- `GET /api/payment/methods` - Available payment methods

## 🧪 Testing

### Demo Credentials
```
Admin User:
Email: admin@example.com
Password: password123

Demo User:
Email: demo@example.com
Password: password123
```

### Test Payment Cards (Razorpay)
```
Success: 4111 1111 1111 1111
Failure: 4000 0000 0000 0002
CVV: Any 3 digits
Expiry: Any future date
```

## 🚀 Deployment

### Production Deployment

1. **Environment Setup**
   ```bash
   # Set production environment variables
   NODE_ENV=production
   MONGODB_URI=your-production-mongodb-uri
   # Add all other production configs
   ```

2. **Build Frontend**
   ```bash
   cd frontend
   npm run build
   ```

3. **Deploy with Docker**
   ```bash
   docker-compose -f docker-compose.prod.yml up -d
   ```

### Deployment Platforms
- **AWS**: EC2, ECS, or Elastic Beanstalk
- **Google Cloud**: Compute Engine or Cloud Run
- **Azure**: Container Instances or App Service
- **DigitalOcean**: Droplets or App Platform
- **Heroku**: Web dynos with MongoDB Atlas

## 📊 Monitoring & Analytics

- **Health Checks**: Built-in health monitoring
- **Logging**: Winston logger with different levels
- **Error Tracking**: Comprehensive error handling
- **Performance**: Response time monitoring
- **Database**: MongoDB performance metrics

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

For support and questions:
- Create an issue in the repository
- Check the documentation
- Review the FAQ section

## 🎯 Roadmap

- [ ] Mobile app (React Native)
- [ ] Multi-currency support
- [ ] Merchant payment integration
- [ ] Advanced analytics dashboard
- [ ] AI-powered fraud detection
- [ ] Cryptocurrency support
- [ ] International transfers

---

**⚠️ Important Security Notice**: This is a demo application. For production use, ensure you:
- Use strong, unique secrets and passwords
- Enable HTTPS/SSL certificates
- Implement proper monitoring and logging
- Follow security best practices
- Regularly update dependencies
- Conduct security audits
**💡 Perfect for**: Learning MERN stack, Payment integration, Real-time applications, Portfolio projects, Startup MVPs, Interview demonstrations

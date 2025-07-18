# Ditto Quest Socket Server

A real-time game server powering **Ditto Quest**, an immersive idle RPG built as a Telegram Mini App (TMA) with centralized DITTO token economy. Players collect and battle with unique slimes, explore dungeons, craft equipment, and earn DITTO tokens through engaging gameplay mechanics.

## 🎮 Project Overview

Ditto Quest is a comprehensive idle game featuring:
- **Slime Collection & Breeding**: Mint slimes with randomized traits and stats
- **Real-time Combat System**: Battle monsters in domains and dungeons with idle mechanics
- **Crafting & Equipment**: Create weapons, armor, and shields
- **Centralized Token Economy**: Earn DITTO tokens through gameplay via centralized ledger
- **Mission System**: Complete daily missions for rewards
- **Telegram Integration**: Seamless TMA experience with Telegram authentication
- **Telegram Stars Payments**: Purchase items using Telegram Stars

### Key Features
- Memory-first architecture for optimal performance
- Real-time WebSocket communication
- Centralized DITTO token ledger integration
- Redis-based caching and session management
- PostgreSQL database with Prisma ORM
- AWS S3 integration for slime image storage
- Comprehensive game mechanics (idle progression, combat, crafting)
- Telegram Stars payment integration

## 🏗️ Architecture

The server implements a sophisticated **Memory-First Architecture** with the following components:

### Core Systems
- **Socket Manager**: Handles real-time client connections via Socket.IO
- **Idle Manager**: Manages offline progression and idle activities
- **Combat Manager**: Processes real-time and idle combat mechanics
- **Game Codex Manager**: In-memory cache for all static game data
- **User Memory Manager**: High-performance user data caching
- **Ditto Ledger Integration**: Centralized balance management for DITTO tokens

### Data Flow
1. **Game Codex Initialization**: Static data loaded into memory at startup
2. **User Session Management**: Real-time data cached in memory with periodic database flushes
3. **Combat Processing**: Real-time battle calculations with state persistence
4. **Token Integration**: Direct communication with Ditto Ledger for centralized balance updates

## 🚀 Installation & Setup

### Prerequisites
- Node.js 18+ 
- PostgreSQL database
- Redis server
- AWS S3 bucket (for slime images)

### Environment Variables
Create a `.env` file with the following variables:

```env
# Server Configuration
PORT=3000
SOCKET_ORIGIN=https://your-frontend-domain.com
SOCKET_PATH=/ditto-quest-socket-adapter

# Database
DATABASE_URL=postgresql://username:password@localhost:5432/ditto_quest

# Redis
REDIS_URL=redis://localhost:6379

# Ditto Ledger Integration
SOCKET_ORIGIN_DITTO_LEDGER=https://ledger-server.com
SOCKET_PATH_DITTO_LEDGER=/ledger-socket

# AWS S3 Configuration
AWS_S3_REGION=your-region
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key
SLIMES_TARGET_FOLDER=slimes

# Game Configuration
DEVELOPMENT_FUNDS_KEY=DEVELOPMENT_FUNDS
DITTO_DECIMALS=9
GACHA_PULL_ODDS=0.65 0.25 0.08 0.017 0.003
MAX_CONCURRENT_IDLE_ACTIVITIES=1
MAX_OFFLINE_IDLE_PROGRESS_S=86400

# Telegram Bot
BOT_TOKEN_DEV=your-dev-bot-token
BOT_TOKEN_PROD=your-prod-bot-token

# Referral System
REFERRAL_BOOST=0.1
REFERRAL_COMBAT_CUT=0.15
```

### Installation Steps

1. **Clone the repository**
   ```bash
   git clone https://github.com/ditto-dao/ditto-quest-socket-server.git
   cd ditto-quest-socket-server
   ```

2. **Install dependencies**
   ```bash
   yarn install
   ```

3. **Database setup**
   ```bash
   # Setup database
   yarn prisma:dev
   
   # Seed game data
   yarn seed-items
   yarn seed-equipment
   yarn seed-crafting-recipes
   yarn seed-slime-traits
   yarn seed-monsters
   yarn seed-domains
   yarn seed-dungeons
   yarn seed-beta-testers
   yarn seed-shop
   ```

4. **Start the server**
   ```bash
   yarn pm2
   ```

### Production Deployment

```bash
# Build the project
yarn build

# Production database setup
yarn prisma:prod

# Start with PM2
yarn pm2
```

## 📡 API Documentation

### Socket Events

#### Authentication
- `validate-login`: Authenticate user with Telegram data
- `logout-user`: End user session
- `disconnect-user`: Handle user disconnection

#### User Management
- `user-update`: User profile and stats updates
- `user-data-on-login`: Initial user data on login
- `first-login`: New user registration
- `store-user-fingerprint`: Store device fingerprint
- `pump-stats`: Upgrade character abilities

#### Combat System
- `start-combat-domain`: Begin idle combat in domains
- `start-combat-dungeon`: Begin idle combat in dungeons
- `stop-combat`: End current combat activity
- `combat-start`: Combat started event
- `combat-stop`: Combat stopped event
- `combat-update`: Real-time combat state updates
- `combat-hp-change`: Health point changes
- `combat-user-died`: Player death event
- `combat-exp-update`: Experience gain updates
- `get-dungeon-lb`: Get dungeon leaderboard
- `dungeon-lb-update`: Leaderboard updates

#### Slime Management
- `mint-gen-0-slime`: Create new slime with gold
- `burn-slime`: Remove slimes for gold rewards
- `breed-slimes`: Start slime breeding process
- `stop-breed-slimes`: Stop breeding process
- `equip-slime`: Equip slime for combat bonuses
- `unequip-slime`: Remove equipped slime
- `add-stickers-for-slime`: Add sticker variations to slimes
- `update-slime-inventory`: Slime inventory updates
- `slime-gacha-update`: Gacha pull results

#### Crafting & Equipment
- `craft-equipment`: Create equipment from materials
- `sell-equipment`: Sell equipment for gold
- `equip-item`: Equip weapons/armor
- `unequip-item`: Remove equipped items
- `mint-item`: Create items (dev/testing)
- `sell-item`: Sell items for gold

#### Economy & Shop
- `purchase-shop-item-gp`: Buy items with gold
- `create-stars-purchase`: Initiate Telegram Stars payment
- `stars-invoice-created`: Stars payment invoice created

#### Missions & Referrals
- `refresh-mission`: Get next available mission
- `mission-update`: Mission progress updates
- `read-user-referral-code`: Get user's referral code
- `read-user-referral-stats`: Get referral statistics
- `use-referral-code`: Apply referral code

#### Ditto Ledger Integration
- `ditto-ledger-init-user-socket`: Initialize user with ledger
- `ditto-ledger-update-balance`: Update DITTO balances
- `ditto-ledger-socket-balance-update`: Balance update response
- `ditto-ledger-revert-transaction`: Revert failed transactions
- `ditto-ledger-read-on-chain-price`: Get current DITTO price

#### System Events
- `efficiency-stats-update`: Efficiency statistics updates
- `beta-tester-login-event`: Beta tester authentication

### HTTP Endpoints

- `POST /tg-stars/payment`: Handle Telegram Stars payments
- `GET /tg-stars/payment/test`: Test endpoint for Stars integration

## 🗃️ Database Schema

The server uses PostgreSQL with Prisma ORM. Key entities include:

- **Users**: Player profiles, levels, and stats
- **Slimes**: Collectible creatures with traits and combat stats
- **Inventory**: Items, equipment, and materials
- **Combat**: Battle history and current states
- **Missions**: Daily objectives and progress
- **Referrals**: Player referral system
- **Shop**: Available items and prices

## 🔧 Game Mechanics

### Idle System
- Players can engage in idle activities (combat, resource gathering)
- Offline progression continues for up to 24 hours
- Real-time updates when connected

### Combat Mechanics
- Real-time combat based on attack speed stats
- Simultaneous combat progression with automatic calculations
- Domain exploration with multiple monsters
- Dungeon challenges with floor progression
- Equipment bonuses and trait synergies

### Centralized Token Economy
- DITTO tokens managed through centralized ledger
- Balance updates via socket communication with ledger server
- Development fund management for rewards distribution
- Referral bonuses for inviting friends

### Slime System
- Gacha system with rarity tiers
- Randomized trait combinations affecting combat stats
- Breeding mechanics for trait inheritance
- Visual generation and AWS S3 storage
- Slime sticker variations for personalization

### Payment Systems
- **Gold (GP)**: In-game currency for basic purchases
- **DITTO Tokens**: Premium currency via centralized ledger
- **Telegram Stars**: Real money purchases through Telegram

## 🧪 Development Scripts

```bash
# Database Management
yarn prisma:dev                # Full dev setup (generate + migrate)
yarn prisma:prod               # Full prod setup (generate + migrate)
yarn prisma:dev:studio         # Open Prisma Studio
yarn prisma:dev:push           # Push schema changes
yarn prisma:dev:migrate        # Run dev migrations
yarn prisma:prod:migrate       # Deploy prod migrations

# Data Generation from CSV
yarn generate-items-from-csv     # Process item data
yarn generate-equipment-from-csv # Process equipment data
yarn generate-traits-from-csv    # Process trait data
yarn generate-monsters-from-csv  # Process monster data
yarn generate-domains-from-csv   # Process domain data
yarn generate-dungeons-from-csv  # Process dungeon data
yarn assign-random-stats-to-traits # Assign stats to traits

# Data Seeding
yarn seed-items               # Seed items database
yarn seed-equipment           # Seed equipment database
yarn seed-crafting-recipes    # Seed crafting recipes
yarn seed-slime-traits        # Seed slime traits
yarn seed-monsters            # Seed monsters database
yarn seed-domains             # Seed domains database
yarn seed-dungeons            # Seed dungeons database
yarn seed-beta-testers        # Add beta tester accounts
yarn seed-shop                # Seed shop items

# Database Utilities
yarn purge-all-user-data      # Clear user data (dev only)
yarn purge-tables             # Clear all tables (dev only)
yarn trim-offline-activities  # Clean up Redis offline activities

# Game Utilities
yarn generate-referral-code   # Create referral codes
yarn count-referrals         # Analytics for referrals
yarn print-suspicious-users  # Print suspicious user fingerprints
yarn breed                   # Test breeding mechanics
yarn test-exp-system         # Test experience system
```

## 🏆 Hackathon Features

This project demonstrates advanced game development concepts:

1. **Real-time Multiplayer**: Socket.IO implementation with scalable architecture
2. **Centralized Token Economy**: DITTO token integration with secure balance management
3. **Advanced Game Mechanics**: Idle progression, combat systems, crafting
4. **Performance Optimization**: Memory-first architecture with intelligent caching
5. **Telegram Integration**: Native TMA development with authentication and Stars payments
6. **Data Management**: Complex database relationships with efficient queries
7. **AWS Integration**: Cloud storage for dynamic content generation
8. **Payment Integration**: Telegram Stars for real-money transactions

## 🔗 Links

- **Live Game**: [Ditto Quest TMA](https://t.me/ditto_quest_bot/dqgame)
- **Ditto DAO**: [Official Website](https://ditto-labs.super.site/)
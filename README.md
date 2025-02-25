# Nexus NFT Platform

A modern, user-friendly platform for deploying and managing NFT collections on the Nexus blockchain. Built with Next.js, TypeScript, and Ethers.js.

## Features

### Smart Contract
- ERC-721 compliant NFT implementation
- Customizable collection name and symbol
- Metadata freezing capability
- Owner-controlled base URI updates
- Batch metadata update support
- OpenSea-compatible metadata standard

### Frontend
- One-click NFT collection deployment
- Automatic collection symbol generation
- Dynamic NFT image generation
- Support for uploaded images
- Real-time blockchain data fetching
- Responsive and modern UI
- MetaMask integration

### API Endpoints
- OpenSea-compatible metadata endpoint
- Dynamic SVG image generation
- Image upload support
- Immutable caching for better performance

## Architecture

### Frontend Architecture
The frontend is built with Next.js 13+ and follows modern React patterns:
- App Router for improved routing and layouts
- Server Components for better performance
- Client Components for interactive features
- TypeScript for type safety
- Tailwind CSS for styling

### Smart Contract Architecture
The NFT contract is built on OpenZeppelin's battle-tested contracts:
- ERC721 base implementation
- Ownable for access control
- IERC4906 for metadata update notifications
- Upgradeable pattern ready

### Data Flow
1. Contract Deployment
   - User provides collection name and image
   - Symbol is auto-generated from name
   - Contract is deployed with metadata base URI

2. NFT Minting
   - Mint transaction is sent to blockchain
   - Metadata is generated with token ID
   - Image is either uploaded or generated
   - Frontend updates to show new NFT

3. Metadata Resolution
   - Token URI points to metadata API
   - API serves OpenSea-compatible JSON
   - Images are served from uploads or generated

## Prerequisites

- Node.js 16+
- npm or yarn
- MetaMask browser extension
- Nexus testnet NEXUS tokens for gas

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/nexus-nft.git
cd nexus-nft
```

2. Install dependencies:
```bash
# Install root dependencies
npm install

# Install frontend dependencies
cd frontend
npm install

# Install contract dependencies
cd ../contracts
npm install
```

3. Set up environment variables:
```bash
# In frontend/.env
NEXT_PUBLIC_API_URL=http://localhost:3000
NEXT_PUBLIC_WEBSITE_URL=http://localhost:3000
NEXT_PUBLIC_RPC_URL=https://rpc.nexus.xyz/http

# In contracts/.env
PRIVATE_KEY=your_private_key
NEXUS_RPC_URL=https://rpc.nexus.xyz/http
```

## Development

1. Start the frontend development server:
```bash
npm run dev
```

2. Compile and deploy contracts:
```bash
cd contracts
npm run compile
npm run deploy
```

## Testing

```bash
# Run contract tests
cd contracts
npm run test

# Run frontend tests
cd frontend
npm run test
```

## Deployment

1. Deploy smart contracts:
```bash
cd contracts
npm run deploy:production
```

2. Deploy frontend:
```bash
cd frontend
npm run build
npm run start
```

## Security Considerations

- All contract functions are properly access controlled
- Metadata can be frozen to ensure immutability
- No hardcoded API keys or sensitive data
- Proper input validation on all endpoints
- Secure file upload handling

## Contributing

1. Fork the repository
2. Create your feature branch
3. Commit your changes
4. Push to the branch
5. Create a new Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Acknowledgments

- OpenZeppelin for secure contract implementations
- Next.js team for the amazing framework
- Nexus team for the blockchain infrastructure

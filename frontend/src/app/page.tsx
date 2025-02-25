'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { ethers, Contract } from 'ethers'
import { useRouter } from 'next/navigation'
import { SimpleNFT__factory } from '../types/contracts/factories/contracts/SimpleNFT__factory'

const NEXUS_CHAIN_ID = '0x189' // Incorrect, let's fix this
const NEXUS_RPC_URL = 'https://rpc.nexus.xyz/http'
const NEXUS_EXPLORER_URL = 'https://explorer.nexus.xyz'

// Define Ethereum provider interface
interface EthereumProvider {
  request: (args: { method: string; params?: any[] }) => Promise<any>
  on: (event: string, callback: (...args: any[]) => void) => void
  removeListener: (event: string, callback: (...args: any[]) => void) => void
}

// Extend window interface with proper type merging
interface Window {
  ethereum?: EthereumProvider
}

// Convert decimal to hex for chain ID (393 = 0x189)
const CHAIN_ID_DECIMAL = 393
const NEXUS_CHAIN_ID_HEX = `0x${CHAIN_ID_DECIMAL.toString(16)}`

// Add a helper function to convert between hex and decimal chain IDs
const toHex = (num: number) => `0x${num.toString(16)}`

interface NFTMetadata {
  name: string;
  description: string;
  image: string;
  external_url: string;
  attributes: Array<{
    trait_type: string;
    value: string | number;
    display_type?: string;
  }>;
}

// Add this function after the imports
const generateNFTSymbol = (name: string): string => {
  // Remove special characters and split into words
  const words = name.replace(/[^\w\s]/gi, '').split(/\s+/)
  
  if (words.length === 0) return 'NFT'
  
  if (words.length === 1) {
    const word = words[0].toUpperCase()
    // If single word is 4 letters or less, use it as is
    if (word.length <= 4) return word
    // For longer words, use first 3-4 consonants or first 3-4 letters if not enough consonants
    const consonants = word.replace(/[aeiou]/gi, '')
    return consonants.length >= 3 ? consonants.slice(0, 4) : word.slice(0, 4)
  }
  
  // For multiple words, use first letter of each word (up to 4)
  const initials = words.map(word => word[0].toUpperCase()).join('')
  return initials.slice(0, 4)
}

export default function Home() {
  const router = useRouter()
  const [isConnected, setIsConnected] = useState(false)
  const [isCorrectNetwork, setIsCorrectNetwork] = useState(false)
  const [userAddress, setUserAddress] = useState('')
  const [nftName, setNftName] = useState('MyNFT')
  const [status, setStatus] = useState('')
  const [contractAddress, setContractAddress] = useState('')
  const [uploadedImage, setUploadedImage] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const [nftContract, setNftContract] = useState<Contract | null>(null)
  const [isMinting, setIsMinting] = useState(false)
  const [ownedNFTs, setOwnedNFTs] = useState<Array<{ tokenId: string; metadata: NFTMetadata | null }>>([])
  const [isLoadingNFTs, setIsLoadingNFTs] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [lastMintedTokenId, setLastMintedTokenId] = useState<string | null>(null)
  const [isAccountMenuOpen, setIsAccountMenuOpen] = useState(false)
  const [visitAddress, setVisitAddress] = useState('')

  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(true)
  }

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)
  }

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragging(false)

    const file = e.dataTransfer.files[0]
    if (file && file.type.startsWith('image/')) {
      await handleImageUpload(file)
    }
  }

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) {
      await handleImageUpload(file)
    }
  }

  const handleImageUpload = async (file: File, tokenId?: string) => {
    try {
      setStatus('Uploading image...')
      const formData = new FormData()
      formData.append('file', file)
      if (tokenId) {
        formData.append('tokenId', tokenId)
      }

      const response = await fetch('/api/upload', {
        method: 'POST',
        body: formData
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Upload failed')
      }

      if (data.success && data.filename) {
        setUploadedImage(file)
        setImagePreview(data.filename)
        setStatus('Image uploaded successfully')
      } else {
        throw new Error('Invalid response from server')
      }
    } catch (error: any) {
      console.error('Upload error:', error)
      setStatus(`Upload failed: ${error.message}`)
      setUploadedImage(null)
      setImagePreview(null)
    }
  }

  const checkNetwork = useCallback(async () => {
    if (!window.ethereum) return false
    const chainId = await window.ethereum.request({ method: 'eth_chainId' })
    const isNexus = chainId === NEXUS_CHAIN_ID_HEX
    setIsCorrectNetwork(isNexus)
    return isNexus
  }, [])

  const switchNetwork = async () => {
    if (!window.ethereum) return false
    try {
      await window.ethereum.request({
        method: 'wallet_switchEthereumChain',
        params: [{ chainId: NEXUS_CHAIN_ID_HEX }],
      })
      return await checkNetwork()
    } catch (switchError: any) {
      if (switchError.code === 4902) {
        try {
          await window.ethereum.request({
            method: 'wallet_addEthereumChain',
            params: [{
              chainId: NEXUS_CHAIN_ID_HEX,
              rpcUrls: [NEXUS_RPC_URL],
              chainName: 'Nexus Testnet',
              nativeCurrency: {
                name: 'NEXUS',
                symbol: 'NEXUS',
                decimals: 18
              },
            }],
          })
          return await checkNetwork()
        } catch (addError) {
          console.error('Error adding network:', addError)
          return false
        }
      }
      console.error('Error switching network:', switchError)
      return false
    }
  }

  const checkWalletConnection = useCallback(async () => {
    if (typeof window.ethereum !== 'undefined') {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum)
        const accounts = await provider.listAccounts()
        if (accounts.length > 0) {
          setIsConnected(true)
          setUserAddress(accounts[0].address)
          await checkNetwork()
        }
      } catch (error) {
        console.error('Error checking wallet connection:', error)
      }
    }
  }, [checkNetwork])

  useEffect(() => {
    checkWalletConnection()

    if (window.ethereum) {
      window.ethereum.on('chainChanged', checkNetwork)
      window.ethereum.on('accountsChanged', checkWalletConnection)
    }

    return () => {
      if (window.ethereum) {
        window.ethereum.removeListener('chainChanged', checkNetwork)
        window.ethereum.removeListener('accountsChanged', checkWalletConnection)
      }
    }
  }, [checkNetwork, checkWalletConnection])

  const connectWallet = async () => {
    if (typeof window.ethereum !== 'undefined') {
      try {
        const provider = new ethers.BrowserProvider(window.ethereum)
        await provider.send('eth_requestAccounts', [])
        const signer = await provider.getSigner()
        const address = await signer.getAddress()
        setUserAddress(address.toString())
        setIsConnected(true)
        await checkNetwork()
      } catch (error) {
        console.error('Error connecting wallet:', error)
      }
    }
  }

  const deployNFT = async () => {
    try {
      if (!uploadedImage) {
        throw new Error('Please upload an image first')
      }

      if (typeof window.ethereum === 'undefined') {
        throw new Error('Please install MetaMask to use this dApp')
      }

      if (!isCorrectNetwork) {
        throw new Error('Please switch to the Nexus network')
      }

      // Generate symbol from name
      const symbol = generateNFTSymbol(nftName)

      // Get and validate the API URL
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || window.location.origin
      if (!apiUrl) {
        throw new Error('NEXT_PUBLIC_API_URL environment variable is not set and window.location.origin is not available')
      }

      // Validate that the API URL is accessible
      try {
        const apiCheckResponse = await fetch(`${apiUrl}/api/metadata/1`)
        if (!apiCheckResponse.ok) {
          throw new Error(`API endpoint not accessible. Please ensure NEXT_PUBLIC_API_URL (${apiUrl}) is correct and the server is running.`)
        }
      } catch (error: any) {
        throw new Error(`Failed to validate API URL (${apiUrl}): ${error.message}. Please check your NEXT_PUBLIC_API_URL setting.`)
      }

      console.log('Initial API URL:', apiUrl) // Debug log

      setStatus('Connecting to MetaMask...')
      await window.ethereum.request({ method: 'eth_requestAccounts' })
      
      const provider = new ethers.BrowserProvider(window.ethereum, {
        // Configure the network properly with chainId
        chainId: CHAIN_ID_DECIMAL,
        name: 'Nexus',
        ensAddress: undefined
      })
      const signer = await provider.getSigner()
      
      setStatus('Preparing deployment...')
      
      const response = await fetch('/api/contract-artifact')
      if (!response.ok) {
        throw new Error('Failed to fetch contract artifact')
      }
      const SimpleNFTArtifact = await response.json()
      
      const factory = new ethers.ContractFactory(
        SimpleNFTArtifact.abi,
        SimpleNFTArtifact.bytecode,
        signer
      )

      // Ensure the base URI is properly formatted with http/https and trailing slash
      let baseUri = apiUrl
      if (!baseUri.startsWith('http://') && !baseUri.startsWith('https://')) {
        baseUri = `http://${baseUri}`
      }
      baseUri = `${baseUri.replace(/\/+$/, '')}/api/metadata/`

      // Additional validation for base URI format
      if (!baseUri || !baseUri.startsWith('http')) {
        throw new Error(`Invalid base URI format: ${baseUri}. Must start with http:// or https://`)
      }

      // Validate base URI length
      if (baseUri.length === 0) {
        throw new Error('Base URI cannot be empty')
      }

      console.log('Using base URI:', baseUri) // Debug log

      // Test the metadata endpoint before deployment
      try {
        const testResponse = await fetch(`${baseUri}1`)
        if (!testResponse.ok) {
          console.warn('Metadata endpoint test failed:', await testResponse.text())
        } else {
          console.log('Metadata endpoint test successful')
        }
      } catch (error) {
        console.warn('Metadata endpoint test error:', error)
      }

      setStatus('Deploying NFT contract...')

      try {
        // Log deployment parameters with generated symbol
        console.log('Deployment parameters:', {
          name: nftName,
          symbol,
          baseUri
        })

        // Use generated symbol in deployment
        const deployTx = await factory.getDeployTransaction(
          nftName,
          symbol,
          await signer.getAddress() // Use getAddress instead of address property
        )

        console.log('Deploy transaction data:', deployTx) // Debug log

        // Declare gasLimit outside try-catch
        let gasLimit: bigint;
        
        try {
          // Try gas estimation with detailed error handling
          const gasEstimate = await provider.estimateGas(deployTx)
          console.log('Estimated gas:', gasEstimate.toString())
          
          // Add 20% buffer to gas estimate
          gasLimit = (gasEstimate * BigInt(120)) / BigInt(100)
          console.log('Using gas limit:', gasLimit.toString())
        } catch (error: any) {
          console.log('Gas estimation failed:', error)
          // If gas estimation fails, use fixed gas limit
          console.log('Falling back to fixed gas limit')
          gasLimit = BigInt(3000000)
        }

        setStatus('Deploying NFT contract...')
        
        const nft = await factory.deploy(
          nftName,
          symbol,
          await signer.getAddress(), // Use getAddress instead of address property
          {
            gasLimit
          }
        )
        
        // Get the transaction hash and update status
        const deployTx2 = nft.deploymentTransaction()
        if (!deployTx2) throw new Error('No deployment transaction found')
        const txHash = deployTx2.hash
        setStatus(`Deploying NFT contract... Transaction: ${txHash}\nMonitoring transaction status...`)
        
        const deployedContract = await nft.waitForDeployment()
        const receipt = await deployTx2.wait()
        
        if (receipt && receipt.status === 1) {
          const address = await deployedContract.getAddress()

          // Set the base URI after deployment
          const baseUri = `${apiUrl.replace(/\/+$/, '')}/api/metadata/`
          console.log('Setting base URI:', baseUri)
          const simpleNFT = SimpleNFT__factory.connect(address, signer)
          await simpleNFT.setBaseURI(baseUri)
          
          setContractAddress(address)
          setNftContract(deployedContract as Contract)
          setStatus(`NFT contract deployed successfully!
            Transaction: ${txHash}
            Contract Address: ${address}
            View on Explorer: ${NEXUS_EXPLORER_URL}/tx/${txHash}`)
          
          // Navigate to the collection page
          router.push(`/collection/${address}`)
        } else {
          throw new Error('Transaction failed')
        }
      } catch (error: any) {
        console.error('Deployment error details:', error)
        if (error.code === 'INSUFFICIENT_FUNDS') {
          throw new Error('Insufficient funds for deployment')
        } else if (error.code === 'UNPREDICTABLE_GAS_LIMIT') {
          throw new Error('Unable to estimate gas. Please check the contract parameters.')
        } else if (error.data) {
          // Try to extract more detailed error information
          throw new Error(`Deployment failed: ${error.data.message || error.message || 'Unknown error'}`)
        } else {
          throw new Error(`Deployment failed: ${error.message || 'Unknown error'}`)
        }
      }
    } catch (error: any) {
      console.error('Deployment error:', error)
      setStatus(`Error: ${error.message || 'Unknown error occurred'}`)
      // Clear states on error
      setContractAddress('')
      setNftContract(null)
    }
  }

  // Add function to fetch metadata
  const fetchNFTMetadata = async (baseURI: string, tokenId: string): Promise<NFTMetadata | null> => {
    try {
      const response = await fetch(`${baseURI}${tokenId}`)
      if (!response.ok) throw new Error('Failed to fetch metadata')
      const metadata = await response.json()
      return metadata
    } catch (error) {
      console.error(`Error fetching metadata for token ${tokenId}:`, error)
      return null
    }
  }

  // Rename and update the fetch function to get all NFTs in collection
  const fetchCollectionNFTs = async () => {
    if (!nftContract) return;

    try {
      setIsLoadingNFTs(true);
      const totalSupply = await nftContract.totalSupply();
      const nfts: Array<{ tokenId: string; metadata: NFTMetadata | null }> = [];
      
      // Fetch all tokens in the collection
      for (let i = 1; i <= totalSupply.toString(); i++) {
        try {
          // Get the token URI and fetch metadata
          const tokenURI = await nftContract.tokenURI(i);
          const response = await fetch(tokenURI);
          const metadata = response.ok ? await response.json() : null;
          nfts.push({ tokenId: i.toString(), metadata });
        } catch (error) {
          console.error(`Error fetching NFT ${i}:`, error);
          // Add the NFT with null metadata if there's an error
          nfts.push({ tokenId: i.toString(), metadata: null });
        }
      }
      
      setOwnedNFTs(nfts);
    } catch (error) {
      console.error('Error fetching NFTs:', error);
    } finally {
      setIsLoadingNFTs(false);
    }
  };

  // Update mintNFT to use new function name
  const mintNFT = async () => {
    if (!nftContract || !contractAddress) {
      setStatus('No NFT contract available. Please deploy one first.');
      return;
    }

    try {
      setIsMinting(true);
      setStatus('Initiating NFT mint...');

      const tx = await nftContract.mint();
      setStatus(`Minting NFT... Transaction: ${tx.hash}\nMonitoring transaction status...`);

      const receipt = await tx.wait();
      
      if (receipt.status === 1) {
        const mintEvent = receipt.logs.find(
          (log: any) => log.fragment?.name === 'Transfer' && 
          log.args?.from === '0x0000000000000000000000000000000000000000'
        );
        
        const tokenId = mintEvent ? mintEvent.args.tokenId.toString() : 'unknown';
        setLastMintedTokenId(tokenId);

        // Upload the image with the token ID if we have one from deployment
        if (uploadedImage) {
          await handleImageUpload(uploadedImage, tokenId);
        }
        
        setStatus(`NFT minted successfully!
          Transaction: ${tx.hash}
          Token ID: ${tokenId}
          View on Explorer: ${NEXUS_EXPLORER_URL}/tx/${tx.hash}`);

        // Refresh the gallery
        await fetchCollectionNFTs();
      } else {
        throw new Error('Minting failed');
      }
    } catch (error: any) {
      console.error('Minting error:', error);
      setStatus(`Minting failed: ${error.message || 'Unknown error'}`);
    } finally {
      setIsMinting(false);
    }
  };

  // Update effect to use new function name
  useEffect(() => {
    if (nftContract) {
      fetchCollectionNFTs();
    }
  }, [nftContract]);

  // Add NFTCard component
  const NFTCard = ({ tokenId, metadata, userAddress, nftContract, onTransfer }: {
    tokenId: string;
    metadata: NFTMetadata | null;
    userAddress: string;
    nftContract: Contract | null;
    onTransfer: (tokenId: string, to: string) => Promise<void>;
  }) => {
    const [owner, setOwner] = useState<string | null>(null);
    const [isOwner, setIsOwner] = useState(false);
    const [transferAddress, setTransferAddress] = useState('');
    const [isTransferring, setIsTransferring] = useState(false);

    useEffect(() => {
      const fetchOwner = async () => {
        if (nftContract) {
          try {
            const ownerAddress = await nftContract.ownerOf(tokenId);
            setOwner(ownerAddress);
            setIsOwner(ownerAddress.toLowerCase() === userAddress?.toLowerCase());
          } catch (error) {
            console.error('Error fetching owner:', error);
          }
        }
      };
      fetchOwner();
    }, [nftContract, tokenId, userAddress]);

    const handleTransfer = async () => {
      if (!transferAddress) return;
      setIsTransferring(true);
      try {
        await onTransfer(tokenId, transferAddress);
        setTransferAddress('');
      } catch (error) {
        console.error('Transfer error:', error);
      } finally {
        setIsTransferring(false);
      }
    };

    return (
      <div className="bg-white rounded-2xl overflow-hidden hover:shadow-lg transition-shadow duration-300">
        {metadata ? (
          <>
            <div className="aspect-square w-full relative">
              <img
                src={metadata.image}
                alt={metadata.name}
                className="w-full h-full object-cover"
              />
              <div className="absolute top-3 right-3 px-2 py-1 bg-black/70 backdrop-blur-sm rounded-full">
                <span className="text-xs font-medium text-white">#{tokenId}</span>
              </div>
            </div>
            <div className="p-4 space-y-3">
              <h3 className="font-medium text-gray-900">
                {metadata.name}
              </h3>
              
              {owner && !isOwner && (
                <a
                  href={`${NEXUS_EXPLORER_URL}/address/${owner}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-gray-500 hover:text-gray-700 block"
                >
                  Owned by: {formatAddress(owner)}
                </a>
              )}
              
              {isOwner && (
                isTransferring ? (
                  <div className="flex gap-2">
                    <input
                      type="text"
                      placeholder="Recipient address"
                      value={transferAddress}
                      onChange={(e) => setTransferAddress(e.target.value)}
                      className="flex-1 px-3 py-2 text-sm bg-white rounded-lg border border-gray-200 
                               focus:ring-1 focus:ring-black focus:border-transparent
                               text-gray-900 placeholder-gray-400"
                    />
                    <button
                      onClick={handleTransfer}
                      className="px-3 py-2 text-sm font-medium text-white bg-black rounded-lg
                               hover:bg-gray-800 transition-colors"
                    >
                      Send
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setIsTransferring(true)}
                    className="w-full px-4 py-2 text-sm font-medium text-gray-600 bg-gray-50 rounded-lg
                             hover:bg-gray-100 transition-colors"
                  >
                    Transfer
                  </button>
                )
              )}
            </div>
          </>
        ) : (
          <div className="aspect-square w-full flex items-center justify-center bg-gray-50">
            <p className="text-sm text-gray-400">Loading #{tokenId}</p>
          </div>
        )}
      </div>
    );
  };

  // Update NFT Gallery component to use new function name
  const NFTGallery = () => {
    const handleTransfer = async (tokenId: string, to: string) => {
      if (!nftContract || !to) return;
      
      try {
        const tx = await nftContract.transferFrom(userAddress, to, tokenId);
        await tx.wait();
        await fetchCollectionNFTs();
      } catch (error) {
        console.error('Transfer error:', error);
      }
    };

    if (isLoadingNFTs) {
      return (
        <div className="w-full flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-2 border-black"></div>
        </div>
      );
    }

    if (ownedNFTs.length === 0) {
      return (
        <div className="w-full py-16">
          <p className="text-center text-gray-500">No NFTs in collection</p>
        </div>
      );
    }

    return (
      <div className="w-full py-8 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {ownedNFTs.map(({ tokenId, metadata }) => (
              <NFTCard
                key={tokenId}
                tokenId={tokenId}
                metadata={metadata}
                userAddress={userAddress}
                nftContract={nftContract}
                onTransfer={handleTransfer}
              />
            ))}
          </div>
        </div>
      </div>
    );
  };

  const formatAddress = (address: string | null | undefined) => {
    if (!address || typeof address !== 'string') return ''
    return `${address.slice(0, 6)}...${address.slice(-4)}`
  }

  // Add handleTransfer function
  const handleTransfer = async (tokenId: string, to: string) => {
    if (!nftContract || !to) return;
    
    try {
      const tx = await nftContract.transferFrom(userAddress, to, tokenId);
      await tx.wait();
      await fetchCollectionNFTs();
    } catch (error) {
      console.error('Transfer error:', error);
    }
  };

  // Update formatStatusDisplay function
  const formatStatusDisplay = (status: string) => {
    // For contract deployment success
    if (status.includes('NFT contract deployed successfully')) {
      return (
        <div className="flex flex-col items-center gap-2 py-2">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm text-gray-600">Contract deployed</span>
          </div>
          <a
            href={`${NEXUS_EXPLORER_URL}/tx/${status.match(/Transaction: (0x[a-fA-F0-9]+)/)?.[1]}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            View on Explorer
          </a>
        </div>
      )
    }
    
    // For minting success
    if (status.includes('NFT minted successfully')) {
      const txHash = status.match(/Transaction: (0x[a-fA-F0-9]+)/)?.[1]
      const tokenId = status.match(/Token ID: (\d+)/)?.[1]
      
      return (
        <div className="flex flex-col items-center gap-2 py-2">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span className="text-sm text-gray-600">NFT #{tokenId} minted</span>
          </div>
          <a
            href={`${NEXUS_EXPLORER_URL}/tx/${txHash}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            View on Explorer
          </a>
        </div>
      )
    }

    // For in-progress status
    if (status.includes('Deploying') || status.includes('Minting')) {
      return (
        <div className="flex items-center justify-center gap-2 py-2">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-black border-t-transparent"></div>
          <span className="text-sm text-gray-600">{status.split('\n')[0]}</span>
        </div>
      )
    }

    // For errors or other status messages
    return <p className="text-sm text-gray-600 text-center py-2">{status}</p>
  }

  // Add logout function
  const disconnectWallet = () => {
    setIsConnected(false)
    setUserAddress('')
    setIsCorrectNetwork(false)
    setContractAddress('')
    setNftContract(null)
    setOwnedNFTs([])
    setIsAccountMenuOpen(false)
  }

  return (
    <main className="min-h-screen bg-white">
      {/* Simplified Header */}
      <header className="fixed top-0 left-0 right-0 bg-white z-50 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <h1 className="text-sm font-medium text-gray-900">Nexus NFT</h1>
            
            {isConnected ? (
              <div className="relative">
                <button
                  onClick={() => setIsAccountMenuOpen(!isAccountMenuOpen)}
                  className="flex items-center gap-2 px-3 py-1.5 text-gray-600 hover:text-gray-900 transition-colors"
                >
                  <span className="text-xs font-mono">
                    {formatAddress(userAddress)}
                  </span>
                </button>

                {isAccountMenuOpen && (
                  <>
                    <div 
                      className="fixed inset-0 z-10"
                      onClick={() => setIsAccountMenuOpen(false)}
                    />
                    <div className="absolute right-0 mt-1 w-44 bg-white rounded-lg shadow-lg border border-gray-100 py-0.5 z-20">
                      <a
                        href={`${NEXUS_EXPLORER_URL}/address/${userAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-2 px-3 py-1.5 text-xs text-gray-700 hover:bg-gray-50"
                      >
                        View on Explorer
                      </a>
                      <button
                        onClick={disconnectWallet}
                        className="flex w-full items-center gap-2 px-3 py-1.5 text-xs text-red-600 hover:bg-gray-50"
                      >
                        Disconnect
                      </button>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <button
                onClick={connectWallet}
                className="px-3 py-1.5 text-xs font-medium text-black hover:text-gray-600 transition-colors"
              >
                Connect Wallet
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="pt-20 pb-8 px-4">
        <div className="max-w-lg mx-auto space-y-4">
          {/* Visit Collection Section */}
          <div className="bg-white rounded-lg border border-gray-200 p-5">
            <h2 className="text-sm font-medium text-gray-900 mb-3">Visit Collection</h2>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Contract address (0x...)"
                className="flex-1 px-3 py-2 bg-white rounded-lg border border-gray-200 
                         focus:ring-1 focus:ring-black focus:border-transparent
                         text-xs text-gray-900 placeholder-gray-400 font-mono"
                value={visitAddress}
                onChange={(e) => setVisitAddress(e.target.value)}
              />
              <button
                onClick={() => router.push(`/collection/${visitAddress}`)}
                disabled={!ethers.isAddress(visitAddress)}
                className={`px-4 py-2 rounded-lg text-xs font-medium transition-colors
                  ${ethers.isAddress(visitAddress)
                    ? 'bg-black text-white hover:bg-gray-800'
                    : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                  }`}
              >
                View
              </button>
            </div>
          </div>

          {/* Deploy New Collection Section */}
          {!isConnected ? (
            <div className="text-center py-10">
              <button
                onClick={connectWallet}
                className="px-5 py-2 text-xs font-medium text-white bg-black rounded-lg
                         hover:bg-gray-800 transition-colors"
              >
                Connect Wallet
              </button>
            </div>
          ) : !isCorrectNetwork ? (
            <div className="text-center py-10">
              <button
                onClick={switchNetwork}
                className="px-5 py-2 text-xs font-medium border border-black rounded-lg
                         hover:bg-gray-50 transition-colors"
              >
                Switch to Nexus Network
              </button>
            </div>
          ) : (
            <div className="bg-white rounded-lg border border-gray-200">
              {!contractAddress ? (
                <div className="p-5 space-y-4">
                  <div className="space-y-3">
                    <input
                      type="text"
                      value={nftName}
                      onChange={(e) => setNftName(e.target.value)}
                      className="w-full px-3 py-2 bg-white rounded-lg border border-gray-200 
                               focus:ring-1 focus:ring-black focus:border-transparent
                               text-xs text-gray-900 placeholder-gray-400"
                      placeholder="Collection name"
                    />
                    
                    <div
                      className={`w-full aspect-square border border-dashed rounded-lg 
                                flex flex-col items-center justify-center cursor-pointer
                                ${isDragging ? 'border-black bg-gray-50' : 'border-gray-200 hover:border-gray-300'}`}
                      onDragEnter={handleDragEnter}
                      onDragOver={handleDragEnter}
                      onDragLeave={handleDragLeave}
                      onDrop={handleDrop}
                      onClick={() => fileInputRef.current?.click()}
                    >
                      {imagePreview ? (
                        <img
                          src={imagePreview}
                          alt="Preview"
                          className="w-full h-full object-contain rounded-lg"
                        />
                      ) : (
                        <div className="text-center p-4">
                          <svg className="w-6 h-6 text-gray-400 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                          </svg>
                          <p className="text-xs text-gray-500">Upload image</p>
                        </div>
                      )}
                      <input
                        ref={fileInputRef}
                        type="file"
                        className="hidden"
                        accept="image/*"
                        onChange={handleFileSelect}
                      />
                    </div>
                    
                    <button
                      onClick={deployNFT}
                      disabled={!uploadedImage || !nftName.trim()}
                      className={`w-full py-2 px-4 rounded-lg text-xs font-medium transition-colors
                        ${uploadedImage && nftName.trim()
                          ? 'bg-black text-white hover:bg-gray-800'
                          : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                        }`}
                    >
                      Deploy NFT Collection
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-5">
                  {/* Collection Info */}
                  <div className="mb-4">
                    <div className="flex items-center gap-2 mb-1">
                      <h2 className="text-sm font-medium text-gray-900">{nftName}</h2>
                      <span className="text-xs text-gray-400">·</span>
                      <a
                        href={`${NEXUS_EXPLORER_URL}/address/${contractAddress}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs font-mono text-gray-500 hover:text-gray-700"
                      >
                        {formatAddress(contractAddress)}
                      </a>
                    </div>
                  </div>

                  <div className="flex flex-col items-center gap-3">
                    <button
                      onClick={mintNFT}
                      disabled={isMinting}
                      className="w-full py-2 px-4 rounded-lg text-xs font-medium text-white bg-black 
                               hover:bg-gray-800 transition-colors disabled:bg-gray-100 
                               disabled:text-gray-400 disabled:cursor-not-allowed"
                    >
                      {isMinting ? 'Minting...' : 'Mint NFT'}
                    </button>
                    
                    {status && (
                      <div className="w-full">
                        {formatStatusDisplay(status)}
                      </div>
                    )}

                    <button
                      onClick={() => {
                        setContractAddress('')
                        setNftContract(null)
                        setNftName('MyNFT')
                        setUploadedImage(null)
                        setImagePreview(null)
                        setStatus('')
                      }}
                      className="w-full py-2 px-4 rounded-lg text-xs font-medium text-gray-600 bg-gray-50
                               hover:bg-gray-100 transition-colors"
                    >
                      Deploy New Collection
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* NFT Gallery */}
      <div className="max-w-7xl mx-auto px-4 pb-8">
        {isLoadingNFTs ? (
          <div className="w-full flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-2 border-black"></div>
          </div>
        ) : ownedNFTs.length === 0 ? (
          <div className="w-full py-16">
            <p className="text-center text-gray-400">No NFTs in collection</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {ownedNFTs.map(({ tokenId, metadata }) => (
              <NFTCard
                key={tokenId}
                tokenId={tokenId}
                metadata={metadata}
                userAddress={userAddress}
                nftContract={nftContract}
                onTransfer={handleTransfer}
              />
            ))}
          </div>
        )}
      </div>
    </main>
  )
} 
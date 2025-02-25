'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { ethers } from 'ethers'
import { use } from 'react'
import { NFTCard } from '../../components/NFTCard'
import { NFTMetadata } from '../../types/nft'
import { NEXUS_EXPLORER_URL } from '../../config/constants'
import type { SimpleNFT } from '../../../types/contracts/contracts/SimpleNFT'
import { SimpleNFT__factory } from '../../../types/contracts/factories/contracts/SimpleNFT__factory'

export default function CollectionPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params)
  const router = useRouter()
  const [userAddress, setUserAddress] = useState('')
  const [nftContract, setNftContract] = useState<SimpleNFT | null>(null)
  const [collectionName, setCollectionName] = useState('')
  const [nfts, setNfts] = useState<Array<{ tokenId: string; metadata: NFTMetadata | null }>>([])
  const [isLoading, setIsLoading] = useState(true)
  const [isOwner, setIsOwner] = useState(false)
  const [isMinting, setIsMinting] = useState(false)
  const [status, setStatus] = useState('')

  useEffect(() => {
    const initializeContract = async () => {
      if (typeof window.ethereum !== 'undefined') {
        try {
          const provider = new ethers.BrowserProvider(window.ethereum)
          const accounts = await provider.listAccounts()
          if (accounts.length > 0) {
            setUserAddress(accounts[0].address)
          }

          // Create contract instance using the factory
          const contract = SimpleNFT__factory.connect(address, provider)
          setNftContract(contract)

          // Debug: Check tokenURI for token #1 if it exists
          try {
            const totalSupply = await contract.totalSupply()
            console.log('Initial total supply:', totalSupply.toString())
            if (totalSupply > 0) {
              const tokenURI = await contract.tokenURI(1)
              console.log('Debug - tokenURI for #1:', tokenURI)
            }
          } catch (error) {
            console.error('Debug - Error checking tokenURI:', error)
          }

          // Get collection name
          const name = await contract.name()
          setCollectionName(name)

          // Check if user is owner
          const owner = await contract.owner()
          setIsOwner(owner.toLowerCase() === accounts[0]?.address.toLowerCase())

          // Fetch NFTs
          await fetchCollectionNFTs(contract)
        } catch (error) {
          console.error('Error initializing contract:', error)
        } finally {
          setIsLoading(false)
        }
      }
    }

    initializeContract()
  }, [address])

  const fetchCollectionNFTs = async (contract: SimpleNFT) => {
    try {
      const totalSupply = await contract.totalSupply()
      console.log('Total supply from contract:', totalSupply.toString())
      
      if (totalSupply === BigInt(0)) {
        console.log('Collection is empty (totalSupply is 0)')
        setNfts([])
        return
      }

      const nfts: Array<{ tokenId: string; metadata: NFTMetadata | null }> = []
      
      for (let i = 1; i <= Number(totalSupply); i++) {
        try {
          const tokenURI = await contract.tokenURI(i)
          console.log(`Raw tokenURI from contract for token ${i}:`, tokenURI)

          // Skip if tokenURI is empty
          if (!tokenURI) {
            console.error(`Empty tokenURI for token ${i}`)
            nfts.push({ tokenId: i.toString(), metadata: null })
            continue
          }

          // Ensure the URL is properly formatted
          let metadataURL = tokenURI
          if (!tokenURI.startsWith('http')) {
            // First, get the base URL from environment or window location
            const baseURL = process.env.NEXT_PUBLIC_API_URL || window.location.origin
            console.log('Base URL:', baseURL)
            
            // If tokenURI already contains the full path, use it directly
            if (tokenURI.includes('api/metadata/')) {
              metadataURL = `${baseURL.replace(/\/+$/, '')}/${tokenURI.replace(/^\/+/, '')}`
            } else {
              // Otherwise, construct the full metadata URL
              metadataURL = `${baseURL.replace(/\/+$/, '')}/api/metadata/${i}`
            }
          }
          
          console.log(`Final metadata URL for token ${i}:`, metadataURL)

          const response = await fetch(metadataURL, {
            headers: {
              'Accept': 'application/json',
              'Cache-Control': 'no-cache'
            }
          })

          // Log the full response details for debugging
          console.log(`Response for token ${i}:`, {
            status: response.status,
            statusText: response.statusText,
            url: response.url,
            contentType: response.headers.get('content-type')
          })

          if (!response.ok) {
            const errorText = await response.text()
            console.error(`HTTP error for token ${i}:`, {
              status: response.status,
              statusText: response.statusText,
              url: response.url,
              responseText: errorText.substring(0, 200)
            })
            throw new Error(`HTTP error! status: ${response.status}`)
          }

          const contentType = response.headers.get('content-type')
          if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text()
            console.error(`Invalid content type for token ${i}:`, {
              contentType,
              responseText: text.substring(0, 200),
              url: response.url
            })
            throw new Error(`Invalid content type: ${contentType}`)
          }

          const metadata = await response.json()
          console.log(`Successfully fetched metadata for token ${i}:`, metadata)
          nfts.push({ tokenId: i.toString(), metadata })
        } catch (error) {
          console.error(`Error fetching NFT ${i}:`, error)
          nfts.push({ tokenId: i.toString(), metadata: null })
        }
      }
      
      setNfts(nfts)
    } catch (error) {
      console.error('Error fetching NFTs:', error)
    }
  }

  const handleTransfer = async (tokenId: string, to: string) => {
    if (!nftContract || !to) return
    
    try {
      const signer = await new ethers.BrowserProvider(window.ethereum).getSigner()
      const contractWithSigner = nftContract.connect(signer)
      const tx = await contractWithSigner.transferFrom(userAddress, to, tokenId)
      await tx.wait()
      await fetchCollectionNFTs(nftContract)
    } catch (error) {
      console.error('Transfer error:', error)
    }
  }

  const mintNFT = async () => {
    if (!nftContract) {
      setStatus('No NFT contract available')
      return
    }

    try {
      setIsMinting(true)
      setStatus('Initiating NFT mint...')

      const signer = await new ethers.BrowserProvider(window.ethereum).getSigner()
      const contractWithSigner = nftContract.connect(signer)
      
      const tx = await contractWithSigner.mint()
      setStatus(`Minting NFT... Transaction: ${tx.hash}\nMonitoring transaction status...`)

      const receipt = await tx.wait()
      
      if (receipt && receipt.status === 1) {
        const mintEvent = receipt.logs.find(
          (log) => {
            if ('fragment' in log && log.fragment?.name === 'Transfer' && 'args' in log) {
              return log.args[0] === '0x0000000000000000000000000000000000000000'
            }
            return false
          }
        )
        
        const tokenId = mintEvent && 'args' in mintEvent ? mintEvent.args[1].toString() : 'unknown'

        setStatus(`NFT minted successfully!
          Transaction: ${tx.hash}
          Token ID: ${tokenId}
          View on Explorer: ${NEXUS_EXPLORER_URL}/tx/${tx.hash}`)

        // Refresh the gallery
        await fetchCollectionNFTs(nftContract)
      } else {
        throw new Error('Minting failed')
      }
    } catch (error: any) {
      console.error('Minting error:', error)
      setStatus(`Minting failed: ${error.message || 'Unknown error'}`)
    } finally {
      setIsMinting(false)
    }
  }

  // Format status display for minting
  const formatStatusDisplay = (status: string) => {
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

    if (status.includes('Minting')) {
      return (
        <div className="flex items-center justify-center gap-2 py-2">
          <div className="animate-spin rounded-full h-4 w-4 border-2 border-black border-t-transparent"></div>
          <span className="text-sm text-gray-600">{status.split('\n')[0]}</span>
        </div>
      )
    }

    return status ? <p className="text-sm text-gray-600 text-center py-2">{status}</p> : null
  }

  return (
    <main className="min-h-screen bg-white">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 bg-white z-50 border-b border-gray-100">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex items-center justify-between h-14">
            <div className="flex items-center gap-2">
              <button
                onClick={() => router.push('/')}
                className="text-sm font-medium text-gray-600 hover:text-gray-900"
              >
                ← Back
              </button>
              <span className="text-sm text-gray-400">·</span>
              <h1 className="text-sm font-medium text-gray-900">Nexus NFT</h1>
            </div>
          </div>
        </div>
      </header>

      {/* Collection Info */}
      <div className="pt-20 pb-8">
        <div className="max-w-7xl mx-auto px-4">
          <div className="flex flex-col gap-6">
            {/* Collection Header */}
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-medium text-gray-900">{collectionName}</h2>
              <span className="text-sm text-gray-400">·</span>
              <a
                href={`${NEXUS_EXPLORER_URL}/address/${address}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-mono text-gray-500 hover:text-gray-700"
              >
                {address.slice(0, 6)}...{address.slice(-4)}
              </a>
            </div>

            {/* Mint Section (Only shown to owner) */}
            {isOwner && (
              <div className="bg-white rounded-lg border border-gray-200 p-5">
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
                </div>
              </div>
            )}

            {/* NFT Gallery */}
            {isLoading ? (
              <div className="w-full flex items-center justify-center py-12">
                <div className="animate-spin rounded-full h-8 w-8 border-2 border-black"></div>
              </div>
            ) : nfts.length === 0 ? (
              <div className="w-full py-16">
                <p className="text-center text-gray-400">No NFTs in collection</p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {nfts.map(({ tokenId, metadata }) => (
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
        </div>
      </div>
    </main>
  )
} 
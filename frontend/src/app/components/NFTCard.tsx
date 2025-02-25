/**
 * NFTCard Component
 * 
 * A reusable component that displays an individual NFT card with its metadata,
 * ownership information, and transfer functionality.
 * 
 * Features:
 * - Displays NFT image and metadata
 * - Shows collection name and token ID
 * - Displays ownership information
 * - Provides transfer functionality for owners
 * - Fetches collection name directly from the smart contract
 * 
 * The component uses a hybrid approach where static metadata (image, attributes)
 * comes from the API, but dynamic data (collection name, ownership) is fetched
 * directly from the blockchain for maximum accuracy.
 */

import { useState, useEffect } from 'react';
import { NFTMetadata } from '../types/nft';
import { NEXUS_EXPLORER_URL } from '../config/constants';
import type { SimpleNFT } from '../../types/contracts/contracts/SimpleNFT';

interface NFTCardProps {
  /** The token ID of the NFT */
  tokenId: string;
  /** Metadata containing the NFT's attributes, image URL, etc. */
  metadata: NFTMetadata | null;
  /** The current user's wallet address */
  userAddress: string;
  /** Instance of the NFT contract for blockchain interactions */
  nftContract: SimpleNFT | null;
  /** Callback function to handle NFT transfers */
  onTransfer: (tokenId: string, to: string) => Promise<void>;
}

/**
 * Formats an Ethereum address for display by showing only the first 6 and last 4 characters
 */
const formatAddress = (address: string | null | undefined) => {
  if (!address || typeof address !== 'string') return '';
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
};

export function NFTCard({ tokenId, metadata, userAddress, nftContract, onTransfer }: NFTCardProps) {
  // State for owner's address and ownership status
  const [owner, setOwner] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  // State for transfer functionality
  const [transferAddress, setTransferAddress] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);
  // State for collection name from blockchain
  const [collectionName, setCollectionName] = useState<string>('');

  // Fetch owner and collection name from blockchain
  useEffect(() => {
    const fetchOwnerAndName = async () => {
      if (nftContract) {
        try {
          // Fetch owner and name in parallel for better performance
          const [ownerAddress, name] = await Promise.all([
            nftContract.ownerOf(tokenId),
            nftContract.name()
          ]);
          setOwner(ownerAddress);
          setIsOwner(ownerAddress.toLowerCase() === userAddress?.toLowerCase());
          setCollectionName(name);
        } catch (error) {
          console.error('Error fetching owner or name:', error);
        }
      }
    };
    fetchOwnerAndName();
  }, [nftContract, tokenId, userAddress]);

  // Handle NFT transfer
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

  // Format NFT name using collection name from contract
  const formattedName = collectionName ? `${collectionName} #${tokenId}` : `#${tokenId}`;

  return (
    <div className="bg-white rounded-lg overflow-hidden hover:shadow-md transition-shadow duration-300 border border-gray-100">
      {metadata ? (
        <>
          {/* NFT Image Container */}
          <div className="aspect-square w-full relative bg-gray-50">
            <img
              src={metadata.image}
              alt={formattedName}
              className="w-full h-full object-contain"
              loading="lazy"
            />
            <div className="absolute top-2 right-2 px-1.5 py-0.5 bg-black/70 backdrop-blur-sm rounded-full">
              <span className="text-xs font-medium text-white">#{tokenId}</span>
            </div>
          </div>
          {/* NFT Information */}
          <div className="p-3 space-y-2">
            <h3 className="text-xs font-medium text-gray-900">
              {formattedName}
            </h3>
            
            {/* Owner Information (shown if not the current user) */}
            {owner && !isOwner && (
              <a
                href={`${NEXUS_EXPLORER_URL}/address/${owner}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs text-gray-500 hover:text-gray-700 block"
              >
                Owned by: {formatAddress(owner)}
              </a>
            )}
            
            {/* Transfer Controls (shown only to owner) */}
            {isOwner && (
              isTransferring ? (
                <div className="flex gap-1.5">
                  <input
                    type="text"
                    placeholder="Recipient address"
                    value={transferAddress}
                    onChange={(e) => setTransferAddress(e.target.value)}
                    className="flex-1 px-2 py-1.5 text-xs bg-white rounded-md border border-gray-200 
                             focus:ring-1 focus:ring-black focus:border-transparent
                             text-gray-900 placeholder-gray-400"
                  />
                  <button
                    onClick={handleTransfer}
                    className="px-2 py-1.5 text-xs font-medium text-white bg-black rounded-md
                             hover:bg-gray-800 transition-colors"
                  >
                    Send
                  </button>
                </div>
              ) : (
                <button
                  onClick={() => setIsTransferring(true)}
                  className="w-full px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 rounded-md
                           hover:bg-gray-100 transition-colors"
                >
                  Transfer
                </button>
              )
            )}
          </div>
        </>
      ) : (
        // Loading State
        <div className="aspect-square w-full flex items-center justify-center bg-gray-50">
          <p className="text-xs text-gray-400">Loading #{tokenId}</p>
        </div>
      )}
    </div>
  );
} 
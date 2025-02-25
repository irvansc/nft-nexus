/**
 * NFT Metadata API Endpoint
 * 
 * This endpoint generates and serves metadata for NFTs in OpenSea-compatible format.
 * It supports both uploaded images and dynamically generated SVG images.
 * 
 * Features:
 * - OpenSea-compatible metadata format
 * - Support for uploaded images with fallback to generated images
 * - Immutable caching for better performance
 * - Comprehensive metadata validation
 * 
 * The metadata follows the ERC-721 metadata standard and includes:
 * - Basic NFT information (name, description)
 * - Image URL (uploaded or generated)
 * - Attributes including token ID, image type, and creation date
 */

import { NextResponse } from 'next/server';
import { existsSync } from 'fs';
import { join } from 'path';

/**
 * Interface defining the structure of NFT metadata
 * following OpenSea's metadata standard
 */
interface NFTMetadata {
  /** The name of the NFT */
  name: string;
  /** A description of the NFT */
  description: string;
  /** URL to the NFT's image */
  image: string;
  /** URL to view the NFT on the marketplace */
  external_url: string;
  /** Array of attributes/traits for the NFT */
  attributes: Array<{
    /** Name of the trait */
    trait_type: string;
    /** Value of the trait */
    value: string | number;
    /** Optional display type for numerical traits */
    display_type?: string;
  }>;
}

/**
 * Validates the structure of NFT metadata to ensure it meets the required format
 * @param metadata The metadata object to validate
 * @returns boolean indicating if the metadata is valid
 */
function validateMetadata(metadata: NFTMetadata): boolean {
  return !!(
    metadata.name &&
    metadata.description &&
    metadata.image &&
    metadata.external_url &&
    Array.isArray(metadata.attributes) &&
    metadata.attributes.every(attr => 
      attr.trait_type && 
      (typeof attr.value === 'string' || typeof attr.value === 'number')
    )
  );
}

// Helper function to find the most recent uploaded image for a token
function findUploadedImage(tokenId: string): string | null {
  const uploadsDir = join(process.cwd(), 'public/uploads');
  if (!existsSync(uploadsDir)) return null;

  // Check for files matching the pattern token-{tokenId}-*
  const fs = require('fs');
  const files = fs.readdirSync(uploadsDir);
  const tokenFiles = files.filter((file: string) => file.startsWith(`token-${tokenId}-`));

  if (tokenFiles.length === 0) return null;

  // Sort by timestamp (which is part of the filename) to get the most recent
  const mostRecent = tokenFiles.sort().reverse()[0];
  return `/uploads/${mostRecent}`;
}

/**
 * GET handler for NFT metadata
 * Generates and returns metadata for a specific token ID
 */
export async function GET(
  request: Request,
  context: { params: { tokenId: string } }
) {
  console.log('Metadata request received for token:', context.params.tokenId);
  
  try {
    const tokenId = context.params.tokenId;
    const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';
    const websiteUrl = process.env.NEXT_PUBLIC_WEBSITE_URL || 'http://localhost:3000';

    // Check for uploaded image first
    const uploadedImage = findUploadedImage(tokenId);
    console.log('Uploaded image path:', uploadedImage);

    // Generate OpenSea-compatible metadata
    const metadata: NFTMetadata = {
      name: `MyNFT #${tokenId}`,
      description: `NFT #${tokenId} on the Nexus network.`,
      image: uploadedImage 
        ? `${apiUrl}${uploadedImage}` 
        : `${apiUrl}/api/image/${tokenId}`,
      external_url: `${websiteUrl}/nft/${tokenId}`,
      attributes: [
        {
          trait_type: "Token ID",
          value: tokenId
        },
        {
          trait_type: "Image Type",
          value: uploadedImage ? "Uploaded" : "Generated"
        },
        {
          display_type: "date", 
          trait_type: "Created", 
          value: Math.floor(Date.now() / 1000)
        }
      ]
    };

    // Validate metadata before sending
    if (!validateMetadata(metadata)) {
      console.error('Invalid metadata structure:', metadata);
      throw new Error('Invalid metadata structure');
    }
    
    console.log('Serving metadata with image:', metadata.image);
    
    // Return metadata with proper headers
    return NextResponse.json(metadata, {
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'public, max-age=31536000, immutable'
      }
    });
  } catch (error: any) {
    console.error('Error generating metadata:', error);
    return NextResponse.json(
      { error: error.message || 'Failed to generate metadata' },
      { 
        status: 500,
        headers: {
          'Content-Type': 'application/json'
        }
      }
    );
  }
} 
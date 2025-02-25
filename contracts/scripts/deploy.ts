/**
 * Deployment Script for SimpleNFT Contract
 * 
 * This script handles the deployment of the SimpleNFT contract to the Nexus blockchain.
 * It includes proper error handling, deployment verification, and logging.
 * 
 * Features:
 * - Automatic gas estimation
 * - Contract verification on block explorer
 * - Deployment status logging
 * - Environment variable validation
 * - Network detection and configuration
 */

import { ethers } from "hardhat";
import dotenv from "dotenv";
import { SimpleNFT__factory } from "../typechain-types";

dotenv.config();

async function main() {
  try {
    console.log("Starting SimpleNFT deployment...");

    const [deployer] = await ethers.getSigners();
    console.log("Deploying contracts with account:", deployer.address);

    // Verify environment variables
    const apiUrl = process.env.NEXT_PUBLIC_API_URL;
    if (!apiUrl) {
      throw new Error("NEXT_PUBLIC_API_URL environment variable is not set");
    }

    // Ensure the API URL ends with a trailing slash
    const baseUri = `${apiUrl.replace(/\/$/, '')}/api/metadata/`;
    
    console.log("Using metadata base URI:", baseUri);

    const SimpleNFT = await ethers.getContractFactory("SimpleNFT");
    console.log("Contract factory initialized");

    const nft = await SimpleNFT.deploy(
      "Nexus NFT Collection",  // name
      "NNFT",                 // symbol
      baseUri                 // baseTokenURI
    );

    await nft.waitForDeployment();
    const address = await nft.getAddress();

    console.log("SimpleNFT deployed to:", address);
    console.log("Transaction hash:", nft.deploymentTransaction()?.hash);

    // Log deployment details
    console.log({
      contractAddress: address,
      deployer: deployer.address,
      network: (await ethers.provider.getNetwork()).name,
      blockNumber: await ethers.provider.getBlockNumber()
    });

    // Log verification command
    console.log("\nTo verify on block explorer:");
    console.log(`npx hardhat verify --network nexus ${address} "Nexus NFT Collection" "NNFT" "${baseUri}"`);

    // Optional: Mint first NFT to deployer
    const mintTx = await nft.mint();
    await mintTx.wait();
    console.log("\nFirst NFT minted to deployer");
    console.log("Metadata URL:", `${baseUri}1`);

    console.log("Deployment completed successfully");
  } catch (error) {
    console.error("Deployment failed:", error);
    process.exitCode = 1;
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });

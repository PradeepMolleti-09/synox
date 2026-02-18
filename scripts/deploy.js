import hre from "hardhat";
import fs from "fs";
import path from "path";

async function main() {
    const [deployer] = await hre.ethers.getSigners();
    console.log("Deploying contracts with the account:", deployer.address);

    // Deploy NFT
    const SyNoxNFT = await hre.ethers.getContractFactory("SyNoxNFT");
    const nft = await SyNoxNFT.deploy();
    await nft.waitForDeployment();
    const nftAddress = await nft.getAddress();
    console.log("SyNoxNFT deployed to:", nftAddress);

    // Deploy Core
    const SyNox = await hre.ethers.getContractFactory("SyNox");
    const synox = await SyNox.deploy(nftAddress);
    await synox.waitForDeployment();
    const synoxAddress = await synox.getAddress();
    console.log("SyNox Core deployed to:", synoxAddress);

    // Set Factory
    const tx = await nft.setFactory(synoxAddress);
    await tx.wait();

    console.log("SyNox Core set as factory for NFT");

    // --- Post-Deployment Setup ---

    // --- Post-Deployment Setup ---
    try {
        console.log("Starting post-deployment setup...");
        const frontendDir = path.join(process.cwd(), "frontend");

        // 1. Update frontend .env
        const envPath = path.join(frontendDir, ".env");
        let envContent = "";
        if (fs.existsSync(envPath)) {
            envContent = fs.readFileSync(envPath, "utf8");
        } else {
            console.log("Creating new .env file at:", envPath);
        }

        // Replace or Append
        const updateEnv = (key, value) => {
            const regex = new RegExp(`^${key}=.*`, "m");
            if (regex.test(envContent)) {
                envContent = envContent.replace(regex, `${key}=${value}`);
            } else {
                envContent += `\n${key}=${value}`;
            }
        };

        updateEnv("VITE_SYNOX_ADDRESS", synoxAddress);
        updateEnv("VITE_NFT_ADDRESS", nftAddress);

        fs.writeFileSync(envPath, envContent);
        console.log("Updated frontend .env at:", envPath);

        // 2. Copy ABIs
        const artifactsDir = path.join(process.cwd(), "artifacts/contracts");
        const targetDir = path.join(frontendDir, "src/utils");

        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        const copyABI = (contractName, fileName) => {
            const srcPath = path.join(artifactsDir, `${fileName}.sol/${contractName}.json`);
            const destPath = path.join(targetDir, `${contractName}.json`);
            if (fs.existsSync(srcPath)) {
                const artifact = JSON.parse(fs.readFileSync(srcPath, "utf8"));
                fs.writeFileSync(destPath, JSON.stringify(artifact, null, 2));
                console.log(`Copied ABI: ${contractName}`);
            } else {
                console.error(`Artifact not found: ${srcPath}`);
            }
        };

        copyABI("SyNox", "SyNox");
        copyABI("SyNoxNFT", "SyNoxNFT");
    } catch (error) {
        console.error("Post-deployment setup failed:", error);
    }
}

main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
});

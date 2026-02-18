// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/extensions/ERC721URIStorage.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract SyNoxNFT is ERC721URIStorage, Ownable {
    uint256 private _nextTokenId;
    address public factoryAddress;
    mapping(address => uint256) public totalReputation;

    modifier onlyFactory() {
        require(msg.sender == factoryAddress || msg.sender == owner(), "Caller is not factory or owner");
        _;
    }

    constructor() ERC721("SyNox Attendance", "SYA") Ownable(msg.sender) {}

    function setFactory(address _factory) external onlyOwner {
        factoryAddress = _factory;
    }

    function mintAttendance(address recipient, string memory tokenURI) external onlyFactory returns (uint256) {
        uint256 tokenId = _nextTokenId++;
        _mint(recipient, tokenId);
        _setTokenURI(tokenId, tokenURI);
        // Award reputation points for attendance
        totalReputation[recipient] += 10;
        return tokenId;
    }
}

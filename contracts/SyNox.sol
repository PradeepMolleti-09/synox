// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "./SyNoxNFT.sol";
import "@openzeppelin/contracts/access/Ownable.sol";

contract SyNox is Ownable {
    // Structures
    struct Meeting {
        uint256 id;
        string title;
        string huddleId; 
        address host;
        uint256 createdTime;
        uint256 endTime;
        string recordingCID;
        bool isActive;
        address[] participants;
    }

    struct Proposal {
        uint256 id;
        string description;
        uint256 voteFor;
        uint256 voteAgainst;
        uint256 deadline;
        bool executed;
        address creator;
    }

    // State Variables
    SyNoxNFT public nftContract;
    uint256 public meetingCount;
    uint256 public proposalCount;
    
    mapping(uint256 => Meeting) public meetings;
    mapping(uint256 => Proposal) public proposals;
    mapping(uint256 => mapping(address => bool)) public hasVoted;
    mapping(uint256 => mapping(address => bool)) public isParticipant;
    
    // Addresses that have ever interacted (for leaderboard)
    address[] public allUsers;
    mapping(address => bool) public userExists;

    // Events
    event MeetingCreated(uint256 indexed id, string title, string huddleId, address indexed host);
    event UserJoined(uint256 indexed meetingId, address indexed user);
    event MeetingFinalized(uint256 indexed meetingId, string cid);
    event ProposalCreated(uint256 indexed id, string description, address indexed creator);
    event VoteCasted(uint256 indexed proposalId, address indexed voter, bool support);

    constructor(address _nftContract) Ownable(msg.sender) {
        nftContract = SyNoxNFT(_nftContract); 
    }

    function _addUser(address _user) internal {
        if (!userExists[_user]) {
            allUsers.push(_user);
            userExists[_user] = true;
        }
    }

    // Meeting Logic
    function createMeeting(string memory _title, string memory _huddleId) external {
        uint256 meetingId = meetingCount++;
        Meeting storage m = meetings[meetingId];
        m.id = meetingId;
        m.title = _title;
        m.huddleId = _huddleId;
        m.host = msg.sender;
        m.createdTime = block.timestamp;
        m.isActive = true;
        
        _addUser(msg.sender);
        emit MeetingCreated(meetingId, _title, _huddleId, msg.sender);
    }

    function joinMeeting(uint256 _meetingId) external {
        require(_meetingId < meetingCount, "Invalid meeting ID");
        Meeting storage m = meetings[_meetingId];
        require(m.isActive, "Meeting not active");
        require(!isParticipant[_meetingId][msg.sender], "Already joined");

        m.participants.push(msg.sender);
        isParticipant[_meetingId][msg.sender] = true;
        
        _addUser(msg.sender);
        emit UserJoined(_meetingId, msg.sender);
    }

    function finalizeMeeting(uint256 _meetingId, string memory _cid) external {
        require(_meetingId < meetingCount, "Invalid meeting ID");
        Meeting storage m = meetings[_meetingId];
        require(msg.sender == m.host, "Only host can finalize");
        require(m.isActive, "Already finalized");

        m.isActive = false;
        m.endTime = block.timestamp;
        m.recordingCID = _cid;

        for (uint i = 0; i < m.participants.length; i++) {
            address participant = m.participants[i];
            nftContract.mintAttendance(participant, string(abi.encodePacked("ipfs://", _cid)));
        }

        emit MeetingFinalized(_meetingId, _cid);
    }

    // Hash Verification Tool (Requirement)
    function verifyMeetingData(uint256 _meetingId, string memory _cid) external view returns (bool) {
        return (keccak256(abi.encodePacked(meetings[_meetingId].recordingCID)) == keccak256(abi.encodePacked(_cid)));
    }

    // DAO Logic
    function createProposal(string memory _description, uint256 _duration) external {
        require(nftContract.balanceOf(msg.sender) > 0, "Must hold NFT to propose");

        uint256 proposalId = proposalCount++;
        Proposal storage p = proposals[proposalId];
        p.id = proposalId;
        p.description = _description;
        p.voteFor = 0;
        p.voteAgainst = 0;
        p.deadline = block.timestamp + _duration;
        p.creator = msg.sender;
        p.executed = false;

        emit ProposalCreated(proposalId, _description, msg.sender);
    }

    function vote(uint256 _proposalId, bool _support) external {
        require(_proposalId < proposalCount, "Invalid proposal ID");
        Proposal storage p = proposals[_proposalId];
        require(block.timestamp < p.deadline, "Voting period ended");
        require(!hasVoted[_proposalId][msg.sender], "Already voted");
        require(nftContract.balanceOf(msg.sender) > 0, "Must hold NFT to vote");

        if (_support) {
            p.voteFor++;
        } else {
            p.voteAgainst++;
        }

        hasVoted[_proposalId][msg.sender] = true;
        emit VoteCasted(_proposalId, msg.sender, _support);
    }

    // Helper for specialized leaderboard fetching
    function getAllUsers() external view returns (address[] memory) {
        return allUsers;
    }
}

import { SYNOX_ADDRESS, SYNOX_ABI } from '../utils/contract';
import { ethers } from 'ethers';

/**
 * Hook to listen for contract events and trigger callbacks
 */
export const useContractEvents = (provider, callback) => {
    useEffect(() => {
        if (!provider || !SYNOX_ADDRESS || SYNOX_ADDRESS === ethers.ZeroAddress) return;

        const contract = new ethers.Contract(SYNOX_ADDRESS, SYNOX_ABI, provider);

        const onMeetingCreated = (id, title, huddleId, host) => {
            console.log("Event: MeetingCreated", { id, title });
            if (callback) callback('MeetingCreated', { id, title, huddleId, host });
        };

        const onProposalCreated = (id, desc, creator) => {
            console.log("Event: ProposalCreated", { id, desc });
            if (callback) callback('ProposalCreated', { id, desc, creator });
        };

        contract.on("MeetingCreated", onMeetingCreated);
        contract.on("ProposalCreated", onProposalCreated);

        return () => {
            contract.off("MeetingCreated", onMeetingCreated);
            contract.off("ProposalCreated", onProposalCreated);
        };
    }, [provider, callback]);
};

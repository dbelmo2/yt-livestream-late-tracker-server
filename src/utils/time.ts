
// Utility functions for time calculations, output is in seconds
export const calculateLateTime = (scheduled: string, actual?: string): number => {
    return actual ? Math.max(0, (new Date(actual).getTime() - new Date(scheduled).getTime()) / 1000) : 0;
};



export const formatSecondsToLargestUnit = (totalSeconds: number): string => {
    const units = [
        { label: 'day', seconds: 86400 },
        { label: 'hour', seconds: 3600 },
        { label: 'minute', seconds: 60 },
        { label: 'second', seconds: 1 },
    ];

    for (const unit of units) {
        if (totalSeconds >= unit.seconds) {
            const value = Math.floor(totalSeconds / unit.seconds);
            return `${value} ${unit.label}${value !== 1 ? 's' : ''}`;
        }
    }

    return '0 seconds';
};


export const formatSecondsToHumanReadable = (totalSeconds: number): string => {
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = Math.floor(totalSeconds % 60);
  
    const parts = [];
    if (minutes > 0) parts.push(`${minutes} minute${minutes !== 1 ? 's' : ''}`);
    if (seconds > 0 || minutes === 0) parts.push(`${seconds} second${seconds !== 1 ? 's' : ''}`);
  
    return parts.join(', ');
  };
  